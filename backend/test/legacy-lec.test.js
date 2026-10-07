import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { parseLec, lecPreview } from '../src/comercial/lec-import.js';
import { readLecWorkbook } from '../src/comercial/lec-workbook.js';
import { complementLecWithPdf, extractLegacyPdf, parseLegacyProposalText } from '../src/comercial/legacy-proposal-pdf.js';
import { calculateEstimate, normalizeCostEstimatePayload, validateCostEstimate } from '../../shared/comercial/dist/cost-model.js';
import { scopeDescriptionParagraphs } from '../../shared/comercial/dist/scope-descriptions.js';
import { lecFixture, legacyProposalText } from './fixtures/legacy-lec.js';

test('LEC carrega identificação, custos, jornadas e condições sem executar fórmulas ou macros', () => {
  for (const sharedStrings of [false, true]) {
    const parsed = parseLec(lecFixture({ sharedStrings }), 'LEC.xlsm');
    assert.equal(parsed.proposalCode, '7310');
    assert.equal(parsed.sourceRevisionNumber, 1);
    assert.equal(parsed.suggestedRevisionNumber, 2);
    assert.equal(parsed.proposal.cnpj, '12345678000190');
    assert.equal(parsed.proposal.email, 'contato@example.com');
    assert.equal(parsed.payload.laborContexts[0].assignments.length, 2);
    assert.equal(parsed.payload.laborContexts[0].saturdayCount, 1);
    assert.equal(parsed.payload.laborContexts[0].weekdayExtra70HoursPerDay, 4);
    assert.equal(parsed.payload.laborContexts[0].expenses.find(item => item.id === 'lec-optional-39').unitValue, 19000);
    assert.equal(parsed.payload.filters.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), 12420);
    assert.equal(parsed.payload.logistics.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), 15540);
    assert.equal(parsed.payload.commercial.pricingMode, 'global');
    assert.equal(calculateEstimate(parsed.payload).salePrice, 195365.38);
    assert.ok(parsed.warnings.some(warning => warning.includes('serviços técnicos')));
    assert.match(parsed.proposal.payment, /35%/);
  }
});

test('PDF complementa escopo, matriz, jornada e óleo, respeitando a escolha dos conflitos', () => {
  const pdf = parseLegacyProposalText(legacyProposalText);
  const parsed = complementLecWithPdf(parseLec(lecFixture(), 'LEC.xlsm'), pdf, 'proposta.pdf', { standbyTeam: 'lec' });
  assert.equal(parsed.proposal.scopeItems.length, 2);
  const paragraphs = scopeDescriptionParagraphs(parsed.proposal.scopeItems);
  assert.equal(paragraphs.filter(item => item.level === 1).length, 2);
  assert.ok(paragraphs.some(item => item.level === 3 && item.text.includes('560 mm')));
  assert.match(parsed.proposal.scopeItems[0].description, /560 mm/);
  assert.equal(parsed.proposal.rows.length, 3);
  assert.match(parsed.proposal.rows[0].subitens[0], /Bomba de transferência/);
  assert.match(parsed.proposal.rows[0].subitens[1], /Container/);
  assert.equal(parsed.proposal.rows[1].owner, 'Contratante');
  assert.match(parsed.proposal.workday, /12 horas/);
  assert.match(parsed.proposal.payment, /integral/);
  assert.equal(parsed.proposal.standbyTeam.replace(/\s/g, ''), 'R$4.500,00');
  assert.match(parsed.proposal.observations, /Stand-by de Equipe\s+R\$\s*4\.500,00/);
  assert.equal(parsed.proposal.extraMobilization.replace(/\s/g, ''), 'R$19.800,00');
  assert.ok(parsed.conflicts.some(item => item.field === 'payment'));
  assert.equal(parsed.proposal.technicalServices.length, 2);
  assert.ok(!parsed.proposal.technicalServices.some(item => item.serviceId === 'desidratacao_oleo'));
  const oil = parsed.payload.volumeSystems.flatMap(item => item.manualVolumes).find(item => item.volumeLiters > 0);
  assert.equal(oil.volumeLiters, 32000);
  assert.equal(oil.oilBrandViscosity, 'MARCA EXEMPLO');
  const hoses = parsed.payload.volumeSystems.flatMap(item => item.pipeSegments).find(item => item.quantity === 6);
  assert.equal(hoses.lengthM, 26);
  assert.equal(hoses.internalDiameterMm, 200);
  assert.equal(calculateEstimate(parsed.payload).totalCost, 65816.88);
  assert.equal(lecPreview(parsed).scopeItems, 2);
  assert.ok(!validateCostEstimate(parsed.payload).errors.some(error => error.path.endsWith('requiredSlots')));
  parsed.payload.volumeSystems.flatMap(system => system.manualVolumes).forEach(item => { item.oilType = 'Óleo hidráulico'; });
  parsed.payload.scopeConfirmations.mobilizationCrewAlreadyOnSite = true;
  parsed.payload.scopeConfirmations.demobilizationCrewAlreadyOnSite = true;
  assert.equal(validateCostEstimate(parsed.payload).valid, true);
});

test('origem e conferências sobrevivem à normalização e aos recálculos de uma edição', () => {
  const parsed = complementLecWithPdf(parseLec(lecFixture(), 'LEC.xlsm'), parseLegacyProposalText(legacyProposalText), 'proposta.pdf');
  const normalized = normalizeCostEstimatePayload(parsed.payload);
  assert.deepEqual(normalized.legacyImport, parsed.payload.legacyImport);
  normalized.laborContexts[0].expenses.find(item => item.id === 'lec-optional-38').unitValue += 1000;
  assert.equal(calculateEstimate(normalized).totalCost, 66816.88);
  assert.equal(calculateEstimate(normalized).salePrice, 195365.38);
  assert.equal(normalized.legacyImport.sourceRevisionNumber, 1);
});

test('documentos da revisão preservam equipamentos, escopo e condições com espaços entre linhas', async () => {
  const parsed = complementLecWithPdf(parseLec(lecFixture(), 'LEC.xlsm'), parseLegacyProposalText(legacyProposalText), 'proposta.pdf');
  const payload = { ...parsed.proposal, proposalCode: '7310', revision: '2', modelo: 'padrao',
    date: '2026-10-07', sellerName: 'Consultor de Exemplo', estimator: 'Orçamentista de Exemplo',
    payment: 'Pagamento integral\n em 21 dias após conclusão ' };
  for (const type of ['commercial', 'technical']) {
    const bytes = await preencherProposta(payload, type);
    const xml = new AdmZip(bytes).readAsText('word/document.xml');
    const doc = new DOMParser({ onError: () => { throw new Error('Documento XML inválido'); } }).parseFromString(xml, 'text/xml');
    assert.match(doc.documentElement.textContent, /Empresa de Exemplo/);
    assert.match(doc.documentElement.textContent, /560 mm/);
    assert.match(doc.documentElement.textContent, /Container/);
    if (type === 'commercial') assert.match(doc.documentElement.textContent, /em 21 dias após conclusão/);
  }
});

test('PDF de outro número ou revisão é recusado antes de complementar os dados', () => {
  for (const changes of [{ proposalCode: '7311' }, { revisionNumber: 0 }]) {
    assert.throws(() => complementLecWithPdf(parseLec(lecFixture(), 'LEC.xlsm'),
      { ...parseLegacyProposalText(legacyProposalText), ...changes }, 'proposta.pdf'), /mesmo número.*mesma revisão/);
  }
});

test('arquivos incompatíveis, senha, abas ausentes e código inválido são recusados', () => {
  assert.throws(() => parseLec(Buffer.from('not excel'), 'LEC.xlsm'), /Não foi possível ler/);
  assert.throws(() => parseLec(lecFixture(), 'LEC.xls'), /xlsm ou .xlsx/);
  assert.throws(() => parseLec(lecFixture({ proposalCode: 0 }), 'LEC.xlsx'), /número da proposta/);
  assert.throws(() => parseLec(lecFixture({ changes: { 'CUSTO.Produtos': null } }), 'LEC.xlsx'), /aba CUSTO.Produtos/);
  assert.throws(() => parseLec(lecFixture({ changes: { 'GERAR PROPOSTA': { B5: 'Outro modelo' } } }), 'LEC.xlsx'), /incompatível/);
  assert.throws(() => parseLegacyProposalText('PDF de outro documento'), /identificar o número/);
});

test('fórmulas não salvas geram conferência e usam o resultado armazenado quando disponível', () => {
  const parsed = parseLec(lecFixture({ changes: { 'CUSTO.Frete': { H15: { formula: 'F15*N15' } } } }), 'LEC.xlsm');
  assert.ok(parsed.warnings.some(warning => warning.includes('H15') && warning.includes('fórmula')));
  const cached = parseLec(lecFixture({ changes: { 'CUSTO.Frete': { H15: { formula: 'F15*N15', value: 15540 } } } }), 'LEC.xlsm');
  assert.equal(cached.payload.logistics.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), 15540);
});

test('leitura de XML recusa entidades externas e arquivo excessivo', () => {
  const zip = new AdmZip(lecFixture());
  zip.updateFile('xl/workbook.xml', Buffer.from('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><workbook/>'));
  assert.throws(() => readLecWorkbook(zip.toBuffer(), 'LEC.xlsm'), /Não foi possível ler/);
  assert.throws(() => readLecWorkbook(Buffer.alloc(10 * 1024 * 1024 + 1), 'LEC.xlsm'), /até 10 MB/);
});

test('extração de PDF usa arquivo temporário e processo limitado, com erro explícito para digitalização', async () => {
  const bytes = Buffer.from('%PDF-1.7\nexample');
  const parsed = await extractLegacyPdf(bytes, 'proposal.pdf', { execute: async (_command, args, options) => {
    assert.deepEqual(args.slice(0, 5), ['-f', '1', '-l', '50', '-layout']);
    assert.equal(options.timeout, 20000);
    return { stdout: legacyProposalText };
  } });
  assert.equal(parsed.proposalCode, '7310');
  await assert.rejects(extractLegacyPdf(bytes, 'proposal.pdf', { execute: async () => ({ stdout: '' }) }), /não contém texto/);
  await assert.rejects(extractLegacyPdf(Buffer.from('file'), 'proposal.pdf'), /PDF válido/);
});
