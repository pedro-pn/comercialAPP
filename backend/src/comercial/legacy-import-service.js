import { createHash } from 'node:crypto';
import { z } from 'zod';
import { makeComercialSchemas } from '../../../shared/schemas/comercial.js';
import { TEXTO_IMPOSTOS, TEXTO_OBSERVACOES_GERAIS, matrizDoModelo, textoJornada } from '../../../shared/comercial/dist/modelo-documento.js';
import { HttpError } from '../auth/service.js';
import { assertCanWrite } from './access.js';
import { registerLegacyRevision } from './numbering.js';
import { insertImportedCostEstimate, getCostEstimate } from './cost-estimates.js';
import { calculateProposalTotal } from './proposals.js';
import { listConsultants } from './consultants.js';
import { parseLec, lecPreview } from './lec-import.js';
import { LEC_MAX_BYTES } from './lec-workbook.js';
import { complementLecWithPdf, extractLegacyPdf, LEGACY_PDF_MAX_BYTES } from './legacy-proposal-pdf.js';

const encodedFile = z.object({ fileName: z.string().trim().min(1).max(255),
  base64: z.string().min(1).max(Math.ceil(LEC_MAX_BYTES / 3) * 4) }).strict();
const filesSchema = z.object({ lec: encodedFile, pdf: encodedFile.optional() }).strict();
const importSchema = filesSchema.extend({
  proposalCode: z.string().regex(/^[1-9]\d*$/).max(10),
  revisionNumber: z.number().int().min(1).max(2_147_483_646),
  modelo: z.enum(['padrao', 'hidrojateamento']).default('padrao'),
  resolutions: z.record(z.string().max(40), z.enum(['lec', 'pdf'])).default({})
});
const schemas = makeComercialSchemas(z);
const normalizedName = name => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

function decode(file, limit) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64) || file.base64.length % 4 !== 0) {
    throw new HttpError(422, 'Conteúdo do arquivo inválido. Selecione o arquivo novamente.');
  }
  const bytes = Buffer.from(file.base64, 'base64');
  if (bytes.length > limit) throw new HttpError(413, 'Cada arquivo deve ter até 10 MB.');
  return bytes;
}

async function parseFiles(input, resolutions = {}) {
  const lecBytes = decode(input.lec, LEC_MAX_BYTES);
  let parsed = parseLec(lecBytes, input.lec.fileName);
  let pdfBytes;
  if (input.pdf) {
    pdfBytes = decode(input.pdf, LEGACY_PDF_MAX_BYTES);
    const pdf = await extractLegacyPdf(pdfBytes, input.pdf.fileName);
    parsed = complementLecWithPdf(parsed, pdf, input.pdf.fileName, resolutions);
  }
  return { parsed, lecBytes, pdfBytes };
}

export async function previewLegacyImport(input) {
  const { parsed } = await parseFiles(filesSchema.parse(input));
  return { ...lecPreview(parsed), conflicts: parsed.conflicts ?? [] };
}

/** Reservation, costs and proposal are committed together, all as editable drafts. */
export async function importLegacyRevision(db, user, input) {
  const data = importSchema.parse(input);
  const { parsed, lecBytes, pdfBytes } = await parseFiles(data, data.resolutions);
  if ((parsed.conflicts ?? []).some(conflict => !data.resolutions[conflict.field])) {
    throw new HttpError(422, 'Escolha o conteúdo do LEC ou do PDF para cada diferença antes de importar.');
  }
  if (parsed.proposalCode !== data.proposalCode) throw new HttpError(422, 'O número da proposta deve corresponder ao número do LEC.');
  if (data.revisionNumber <= parsed.sourceRevisionNumber) {
    throw new HttpError(422, `Escolha uma revisão maior que a revisão ${parsed.sourceRevisionNumber} do LEC.`);
  }
  const fingerprint = createHash('sha256').update(lecBytes).update(pdfBytes ?? Buffer.alloc(0))
    .update(JSON.stringify({ revisionNumber: data.revisionNumber, modelo: data.modelo,
      resolutions: Object.fromEntries(Object.entries(data.resolutions).sort()) })).digest('hex');
  const where = { proposalCode_revisionNumber: { proposalCode: data.proposalCode, revisionNumber: data.revisionNumber } };
  async function previousImport() {
    const previous = await db.proposal.findUnique({ where });
    if (!previous || previous.payload?.legacyImportFingerprint !== fingerprint) return null;
    assertCanWrite(user, previous);
    if (previous.archivedAt) throw new HttpError(409, 'Esta importação foi arquivada. Desarquive os registros pelo histórico.');
    const estimate = await getCostEstimate(db, user, previous.costEstimateId);
    if (estimate.archivedAt) throw new HttpError(409, 'O levantamento desta importação foi arquivado. Desarquive-o pelo histórico.');
    return { estimate, proposal: previous, alreadyImported: true };
  }
  const duplicate = await previousImport();
  if (duplicate) return duplicate;
  const candidates = (await listConsultants(db)).filter(item =>
    normalizedName(item.name) === normalizedName(parsed.payload.legacyImport.sourceSeller));
  const seller = candidates.length === 1 ? candidates[0] : null;
  if (!seller) parsed.warnings.push('O consultor do LEC não corresponde a um único cadastro ativo. Selecione o consultor na etapa Cliente.');
  const payload = {
    observations: TEXTO_OBSERVACOES_GERAIS, taxes: TEXTO_IMPOSTOS, workday: textoJornada(data.modelo),
    rows: matrizDoModelo(data.modelo).map(row => ({ item: row.item, owner: row.responsavel,
      note: row.nota, categoria: row.categoria, ...(row.subitens ? { subitens: row.subitens } : {}) })),
    ...parsed.proposal, modelo: data.modelo, proposalCode: data.proposalCode, revision: String(data.revisionNumber),
    date: new Date().toISOString().slice(0, 10), estimator: user.name,
    seller: seller?.id ?? '', sellerName: seller?.name ?? '',
    sellerConsultantId: seller?.tipo === 'cadastro' ? seller.id : null,
    legacyImportFingerprint: fingerprint,
    legacyImportChoices: data.resolutions,
    legacyImport: { ...parsed.payload.legacyImport, warnings: parsed.warnings }
  };
  const proposalData = schemas.proposalCreate.parse({ proposalCode: data.proposalCode, revisionNumber: data.revisionNumber,
    clientName: payload.client, cnpj: payload.cnpj, contact: payload.contact, email: payload.email,
    site: payload.site, department: payload.department || null,
    sellerUserId: seller?.tipo === 'usuario' ? seller.id : null,
    sellerConsultantId: seller?.tipo === 'cadastro' ? seller.id : null, payload });
  parsed.payload.legacyImport.warnings = parsed.warnings;
  try {
    return await db.$transaction(async tx => {
      await registerLegacyRevision(tx, user, data.proposalCode, data.revisionNumber);
      const estimate = await insertImportedCostEstimate(tx, user, { proposalCode: data.proposalCode,
        revisionNumber: data.revisionNumber, title: parsed.payload.title, payload: parsed.payload });
      proposalData.payload.levantamentoPrecoImportado = { id: estimate.id, item: { ...payload.prices[0] } };
      // Linking a draft is exclusive to this import. Normal saves still require concluded costs.
      const proposal = await tx.proposal.create({ data: { ...proposalData, costEstimateId: estimate.id,
        sellerName: seller?.name ?? '', estimatorName: user.name, totalValue: calculateProposalTotal(payload),
        createdByUserId: user.id } });
      return { estimate: { ...estimate, propostaVinculada: { id: proposal.id, status: proposal.status,
        proposalCode: proposal.proposalCode, revisionNumber: proposal.revisionNumber } }, proposal, alreadyImported: false };
    });
  } catch (error) {
    if (error.code === 'P2002' || error.status === 409) {
      const retry = await previousImport();
      if (retry) return retry;
      if (error.code === 'P2002') throw new HttpError(409, 'Já existe um levantamento ou proposta com este número e revisão. Confira o histórico.');
    }
    throw error;
  }
}
