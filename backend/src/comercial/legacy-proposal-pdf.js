import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from '../auth/service.js';
import { lerDinheiro } from '../../../shared/comercial/dist/dinheiro.js';
import { createTechnicalServiceSelection } from '../../../shared/comercial/dist/technical-services.js';
import { calculateEstimate, normalizeCostEstimatePayload } from '../../../shared/comercial/dist/cost-model.js';

export const LEGACY_PDF_MAX_BYTES = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const key = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = value => String(value).replace(/\s+/g, ' ').trim();
const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function extractLegacyPdf(bytes, fileName, { execute = execFileAsync } = {}) {
  if (!/\.pdf$/i.test(fileName) || !Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new HttpError(422, 'Selecione uma proposta em PDF válido.');
  }
  if (bytes.length > LEGACY_PDF_MAX_BYTES) throw new HttpError(413, 'A proposta em PDF deve ter até 10 MB.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'comercialapp-legacy-pdf-'));
  try {
    const file = path.join(directory, 'proposal.pdf');
    await writeFile(file, bytes, { mode: 0o600 });
    const { stdout } = await execute(process.env.PDFTOTEXT_BIN || 'pdftotext',
      ['-f', '1', '-l', '50', '-layout', '-enc', 'UTF-8', file, '-'],
      { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 });
    if (clean(stdout).length < 100) {
      throw new HttpError(422, 'O PDF não contém texto legível. Use a proposta original exportada em PDF, sem digitalização.');
    }
    return parseLegacyProposalText(stdout);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ENOENT') throw new HttpError(503, 'A leitura de PDF requer o Poppler (pdftotext) instalado no servidor.');
    throw new HttpError(422, 'Não foi possível ler a proposta em PDF. Confira se o arquivo está íntegro, sem senha e possui texto selecionável.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function sectionsFromText(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(line =>
    !/^\s*\d{1,2}\s+de\s+\S+\s+de\s+\d{4}\s*$/i.test(line) && !/^\s*\d+\s*$/.test(line));
  const sections = new Map();
  let current;
  for (const line of lines) {
    const heading = line.match(/^\s*(\d{1,2})\s*[-–.]\s+([^\d].*)$/);
    if (heading) {
      current = { number: Number(heading[1]), title: key(heading[2]), lines: [] };
      // Later occurrences replace the table of contents entry.
      sections.set(current.number, current);
    } else if (current) current.lines.push(line.replace(/\f/g, ''));
  }
  return [...sections.values()];
}

const services = [
  [/flushing\s+primario/i, 'flushing_primario', 'Flushing primário'],
  [/flushing\s+secundario/i, 'flushing_secundario', 'Flushing secundário'],
  [/filtragem\s+(?:absoluta|de\s+oleo|hidraulic)/i, 'filtragem_hidraulico_lubrificante', 'Filtragem de óleo'],
  [/desidratacao\s+(?:de\s+)?oleo/i, 'desidratacao_oleo', 'Desidratação de óleo'],
  [/limpeza\s+quimica/i, 'limpeza_quimica', 'Limpeza química'],
  [/limpeza\s+(?:interna\s+)?(?:de\s+)?reservatorio/i, 'limpeza_reservatorio', 'Limpeza de reservatório'],
  [/teste\s+(?:hidrostatico|de\s+pressao)/i, 'teste_hidrostatico', 'Teste hidrostático'],
  [/hidrojateamento/i, 'hidrojateamento', 'Hidrojateamento'],
  [/boroscopia/i, 'boroscopia', 'Boroscopia'],
  [/passagem\s+de\s+pig/i, 'passagem_pig', 'Passagem de PIG']
];

function scopeTopics(id, lines) {
  const root = { id: `${id}-topic`, text: '', children: [] };
  let current = root, parent = root;
  for (const line of lines) {
    const bullet = line.match(/^\s*([•\uf0b7]|[-–]|o)\s+(.+)/);
    if (bullet) {
      const container = bullet[1] === 'o' ? parent : root;
      container.children ??= [];
      current = { id: `${id}-topic-${container.children.length}-${bullet[1] === 'o' ? parent.id : 'item'}`,
        text: clean(bullet[2]), children: [] };
      container.children.push(current);
      if (bullet[1] !== 'o') parent = current;
    } else current.text = clean(`${current.text} ${line}`);
  }
  return [root];
}

function scopeItems(section) {
  if (!section) return [];
  const chunks = [];
  let current;
  for (const line of section.lines) {
    const item = line.match(/^\s*(\d+\.\d+)\s+(.+)/);
    if (item && !/^\d+\.\d+\./.test(item[1])) {
      current = { id: `pdf-scope-${item[1]}`, text: [item[2]] };
      chunks.push(current);
    } else if (current && line.trim()) current.text.push(line.trim());
  }
  if (!chunks.length && section.lines.some(line => line.trim())) {
    chunks.push({ id: 'pdf-scope', text: section.lines.filter(line => line.trim()).map(line => line.trim()) });
  }
  return chunks.slice(0, 80).map(chunk => {
    const description = chunk.text.join('\n').trim();
    const detected = services.filter(([pattern]) => pattern.test(key(description)));
    return { id: chunk.id, title: detected.map(item => item[2]).join(' e ') || 'Serviço contratado',
      description, topics: scopeTopics(chunk.id, chunk.text), serviceIds: detected.map(item => item[1]) };
  });
}

/** Table row numbers may appear in the middle of a multiline description in pdftotext -layout. */
function responsibilityRows(section) {
  if (!section) return [];
  const rows = [];
  let owner = '', category = '', pending = [], pendingNotes = [], current;
  function flush() {
    if (current) {
      const main = [], subitens = [];
      for (const part of current.parts) {
        const bullet = part.match(/^(?:o|•|\uf0b7)\s+(.+)/);
        if (bullet) subitens.push(clean(bullet[1]));
        else if (subitens.length && part) subitens[subitens.length - 1] = clean(`${subitens.at(-1)} ${part}`);
        else main.push(part);
      }
      const item = clean(main.join(' ')).replace(/^[-–]\s*/, '');
      if (item) rows.push({ item, owner, categoria: category || 'RESPONSABILIDADES IMPORTADAS',
        note: clean(current.notes.join(' ')), ...(subitens.length ? { subitens } : {}) });
      current = null;
    }
  }
  for (const raw of section.lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Item\s+ESCOPO/i.test(line)) continue;
    if (/^NOTA$/i.test(line)) continue;
    if (/3\.1\s+Responsabilidade|3\.2\s+Responsabilidade/i.test(line)) {
      flush(); pending = []; pendingNotes = [];
      owner = /3\.1/.test(line) ? 'Filtrovali' : 'Contratante';
      continue;
    }
    if (!owner) continue;
    if (/^[A-ZÀ-Ü][A-ZÀ-Ü /,()-]{5,}$/.test(line)) {
      flush(); pending = []; pendingNotes = []; category = line;
      continue;
    }
    const rowNumber = line.match(/^3\.[12]\.\d+\s*/);
    // Column widths can vary between pages. A wide gap near the right side marks a note.
    const gap = [...raw.matchAll(/\S( {3,})(?=\S)/g)]
      .find(match => match.index + 1 + match[1].length > 70);
    const noteColumn = raw.search(/\S/) > 70 ? 0 : gap ? gap.index + 1 : raw.length;
    const content = raw.slice(0, noteColumn).trim().replace(/^3\.[12]\.\d+\s*/, '');
    const notes = raw.slice(noteColumn).trim();
    if (rowNumber) {
      flush();
      current = { parts: [...pending, content], notes: [...pendingNotes, ...(notes ? [notes] : [])] };
      pending = []; pendingNotes = [];
    } else if (current) {
      // A leading dash starts the next numbered row before its centered row number.
      if (/^[-–]\s/.test(content)) { flush(); pending = [content]; pendingNotes = notes ? [notes] : []; }
      else { current.parts.push(content); if (notes) current.notes.push(notes); }
    } else { pending.push(content); if (notes) pendingNotes.push(notes); }
  }
  flush();
  return rows;
}

export function parseLegacyProposalText(text) {
  const identity = text.match(/PROPOSTA\s*(?:N[°ºo.]*)?\s*[:\-]?\s*(\d+)\s*REV(?:IS[AÃ]O)?\s*[:\-]?\s*(\d+)/i);
  if (!identity) throw new HttpError(422, 'Não foi possível identificar o número e a revisão no PDF da proposta.');
  const sections = sectionsFromText(text);
  const findSection = pattern => sections.find(section => pattern.test(section.title));
  const fields = {};
  for (const [field, pattern] of Object.entries({
    client: /CLIENTE:\s*([^\n]+)/i, cnpj: /CNPJ:\s*([\d./-]+)/i,
    contact: /A\/C:\s*([^\n]+)/i, email: /E-mail do solicitante:\s*([^\n]+)/i,
    site: /Local da obra:\s*([^\n]+)/i, department: /Departamento:\s*([^\n]+)/i
  })) {
    const value = clean(text.match(pattern)?.[1] || '');
    if (value && value !== '0') fields[field] = value;
  }
  const scope = scopeItems(findSection(/descricao dos servicos/));
  const rows = responsibilityRows(findSection(/matriz.*responsabilidade/));
  for (const [field, pattern] of Object.entries({ workday: /jornada de trabalho/, payment: /condicoes de pagamento/,
    observations: /^observacoes/, taxes: /^impostos/ })) {
    const section = findSection(pattern);
    if (section) fields[field] = section.lines.map(line => line.trim()).join('\n').trim();
  }
  const attendanceSection = findSection(/previsao de atendimento/);
  if (attendanceSection) {
    const attendance = clean(attendanceSection.lines.join(' ')).match(/\d+\.1\s*[-–]?\s*(.*?)(?=\d+\.1\.1|$)/)?.[1];
    if (attendance) fields.attendance = attendance;
  }
  const priceSection = findSection(/descricao d[eo]s? valores/);
  const priceText = priceSection?.lines.join('\n') || '';
  const total = priceText.match(/Total\s+geral\s+R\$\s*([\d.]+,\d{2})/i);
  if (total) fields.salePrice = lerDinheiro(total[1]);
  const priceDescription = priceText.match(/\b\d+\.1\s+(.*?)R\$/s)?.[1];
  if (priceDescription) fields.priceDescription = clean(priceDescription);
  const observations = fields.observations || '';
  for (const [field, label] of [['standbyTeam', 'Stand-by de Equipe'], ['standbyEquipment', 'Stand-by de Equipamentos'],
    ['extraMobilization', 'Mobilização Extra']]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = observations.match(new RegExp(`${escaped}[^\\n]*?R\\$\\s*([\\d.]+,\\d{2})`, 'i'))?.[1];
    if (value) fields[field] = money(lerDinheiro(value));
  }
  const overtime = observations.match(/Valor homem\/hora[^\n]*?(?:\n\s*)?R\$\s*([\d.]+,\d{2})/i)?.[1];
  if (overtime) fields.overtimeRate = money(lerDinheiro(overtime));
  const extraPrices = priceText.match(/Total\s+geral[^\n]*\n([\s\S]*)/)?.[1]?.trim();
  if (extraPrices) fields.observations = `Condições adicionais de valores da proposta anterior:\n${extraPrices}\n\n${observations}`;
  return { proposalCode: String(Number(identity[1])), revisionNumber: Number(identity[2]), fields, scope, rows };
}

const labels = { client: 'Cliente', cnpj: 'CNPJ', contact: 'Contato', email: 'E-mail', site: 'Local da obra',
  department: 'Departamento', attendance: 'Previsão de atendimento', payment: 'Condições de pagamento',
  overtimeRate: 'Hora extra', standbyTeam: 'Stand-by de equipe', standbyEquipment: 'Stand-by de equipamentos',
  extraMobilization: 'Mobilização extra', salePrice: 'Preço global' };

export function complementLecWithPdf(parsed, pdf, fileName, resolutions = {}) {
  if (pdf.proposalCode !== parsed.proposalCode || pdf.revisionNumber !== parsed.sourceRevisionNumber) {
    throw new HttpError(422, 'O PDF deve corresponder ao mesmo número e à mesma revisão de origem do LEC.');
  }
  const conflicts = [];
  for (const [field, value] of Object.entries(pdf.fields)) {
    if (field === 'priceDescription') continue;
    const previous = field === 'salePrice' ? parsed.payload.legacyImport.sourceSalePrice : parsed.proposal[field];
    const compare = field === 'cnpj' ? x => String(x).replace(/\D/g, '')
      : ['salePrice', 'overtimeRate', 'standbyTeam', 'standbyEquipment', 'extraMobilization'].includes(field)
        ? x => typeof x === 'number' ? x : lerDinheiro(x) : x => clean(x);
    const differs = previous !== undefined && previous !== '' && compare(previous) !== compare(value);
    if (differs && labels[field]) conflicts.push({ field, label: labels[field], lecValue: String(previous), pdfValue: String(value) });
    if (differs && resolutions[field] === 'lec') continue;
    if (field === 'salePrice') {
      parsed.payload.commercial.pricingMode = 'global';
      parsed.payload.commercial.globalValue = Number(value);
      parsed.proposal.prices[0].unitValue = money(value);
      parsed.proposal.prices[0].value = money(value);
    } else parsed.proposal[field] = value;
  }
  // Values embedded in the imported prose must follow the same conflict choice as the fields.
  for (const [field, label] of [['standbyTeam', 'Stand-by de Equipe'],
    ['standbyEquipment', 'Stand-by de Equipamentos'], ['extraMobilization', 'Mobilização Extra']]) {
    if (resolutions[field] !== 'lec' || !parsed.proposal.observations) continue;
    parsed.proposal.observations = parsed.proposal.observations.replace(
      new RegExp(`(${label}[^\\n]*?)R\\$\\s*[\\d.]+,\\d{2}`, 'i'),
      (_match, prefix) => `${prefix}${parsed.proposal[field]}`
    );
  }
  if (resolutions.overtimeRate === 'lec' && parsed.proposal.observations) {
    parsed.proposal.observations = parsed.proposal.observations.replace(
      /(Valor homem\/hora[^\n]*?(?:\n\s*)?)R\$\s*[\d.]+,\d{2}/i,
      (_match, prefix) => `${prefix}${parsed.proposal.overtimeRate}`
    );
  }
  if (pdf.fields.priceDescription) parsed.proposal.prices[0].description = pdf.fields.priceDescription;
  if (pdf.scope.length) parsed.proposal.scopeItems = pdf.scope.map(({ serviceIds: _services, ...item }) => item);
  if (pdf.rows.length) {
    parsed.proposal.rows = pdf.rows;
    parsed.proposal.categorias = [...new Set(pdf.rows.map(row => row.categoria))];
  }
  const serviceIds = [...new Set(pdf.scope.flatMap(item => item.serviceIds))];
  parsed.proposal.technicalServices = serviceIds.map(serviceId => createTechnicalServiceSelection(serviceId));
  // Each contracted PDF scope item becomes a circuit to review. Explicit oil volume is preserved.
  if (!parsed.payload.circuitServices?.length) {
    for (const scope of pdf.scope) {
      if (!scope.serviceIds.length) continue;
      const oil = key(scope.description).match(/(?:aproximadamente\s+)?([\d.]+(?:,\d+)?)\s+litros\s+de\s+oleo/);
      const id = `${scope.id}-circuit`;
      const hose = scope.description.match(/(\d+)\s+mangueiras[\s\S]*?Comprimento:\s*([\d.,]+)\s*m[\s\S]*?Di[aâ]metro interno:\s*([\d.,]+)\s*mm/i);
      const cylinder = scope.description.match(/(\d+)\s+cilindros[\s\S]*?Di[aâ]metro interno:\s*([\d.,]+)\s*mm/i);
      parsed.payload.volumeSystems.push({ id, name: scope.title, material: 'other', enabled: true, servicesByItem: true,
        manualVolumes: oil ? [{ id: `${id}-oil`, description: clean(scope.description), quantity: 1,
          volumeLiters: Number(oil[1].replace(/\./g, '').replace(',', '.')), oilType: '',
          oilBrandViscosity: scope.description.match(/litros\s+de\s+[óo]leo\s+([^;\n]+)/i)?.[1] || '',
          serviceIds: scope.serviceIds }] : [],
        equipmentVolumes: oil ? [] : [{ id: `${id}-equipment`, description: clean(cylinder ? `Cilindros — diâmetro interno ${cylinder[2]} mm. ${scope.description}` : scope.description),
          quantity: cylinder ? Number(cylinder[1]) : 1,
          volumeLiters: 0, included: true, material: 'other', serviceIds: scope.serviceIds }],
        pipeSegments: hose ? [{ id: `${id}-hoses`, description: 'Mangueiras do escopo original', quantity: Number(hose[1]),
          lengthM: Number(hose[2].replace(',', '.')), internalDiameterMm: Number(hose[3].replace(',', '.')),
          fillPercent: 100, material: 'other', serviceIds: scope.serviceIds }] : [], hoseSegments: [], cycles: 1 });
      for (const serviceId of scope.serviceIds) parsed.payload.circuitServices.push({ id: `${id}-${serviceId}`, systemId: id, serviceId });
    }
  }
  parsed.payload = normalizeCostEstimatePayload(parsed.payload);
  const sourceCost = parsed.payload.legacyImport.sourceTotalCost;
  parsed.warnings = parsed.warnings.filter(warning => !warning.startsWith('O LEC não traz serviços') && !warning.startsWith('Custo do LEC:'));
  const result = calculateEstimate(parsed.payload);
  if (Math.abs(result.totalCost - sourceCost) > 0.02) {
    parsed.warnings.push(`Custo do LEC: ${money(sourceCost)}. Custo importado recalculado: ${money(result.totalCost)}. Confira a composição.`);
  }
  parsed.warnings.push('Conteúdo do PDF importado como texto editável. Confira as tabelas, notas e parâmetros técnicos; imagens e assinaturas não são importadas.');
  if (!pdf.scope.length) parsed.warnings.push('O escopo não foi identificado no PDF. Preencha os serviços manualmente no app.');
  if (!pdf.rows.length) parsed.warnings.push('A matriz de responsabilidades não foi identificada no PDF. Confira e preencha esta etapa.');
  if (conflicts.length) parsed.warnings.push('Existem diferenças entre LEC e PDF. Os valores escolhidos na importação foram aplicados; confira as condições comerciais.');
  parsed.payload.legacyImport.pdfFileName = fileName;
  parsed.payload.legacyImport.warnings = parsed.warnings;
  parsed.proposal.legacyImport = parsed.payload.legacyImport;
  parsed.conflicts = conflicts;
  return parsed;
}
