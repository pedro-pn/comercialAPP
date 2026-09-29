import { Router, raw } from 'express';
import { z } from 'zod';
import { makeComercialSchemas } from '../../../shared/schemas/comercial.js';
import { requireEstimator, requireManager } from './access.js';
import {
  archiveCostEstimate, createCostEstimate, getCostEstimate,
  listCostEstimates, updateCostEstimate
} from './cost-estimates.js';
import { initializeNumbering, numberingStatus, registerLegacyRevision, reserveNumber } from './numbering.js';
import {
  archiveProposal, createProposal, getProposal, listProposals,
  prepareRevision, updateProposal
} from './proposals.js';
import { addAttachment, downloadAttachment, listAttachments, removeAttachment } from './attachments.js';
import { downloadDocument, finalizeLocal, issueDocuments, listDocuments, previewPdf } from './documents.js';
import { readPhoto, uploadPhoto } from './photos.js';
import { ATTACHMENT_LIMITS, SCOPE_PHOTO_LIMITS } from '../../../shared/schemas/comercial.js';
import { HttpError } from '../auth/service.js';
import { crmStatus, sendProposalToCrm } from './crm-delivery.js';
import { createNectarClient } from './nectar.js';
import { distanciaDaSede, lerConfiguracao, salvarSede, conferirEndereco } from './configuracao.js';
import { sugerirEnderecos } from './distancias.js';
import { sharepointStatus, sendProposalToSharePoint } from './sharepoint-delivery.js';
import { crmBridgeStatus, recordManualSelection, deliverToFiltro,
  syncNectarOpportunity, findFiltroProjects } from './crm-bridge.js';

const schemas = makeComercialSchemas(z);
const initialNumberSchema = z.object({ initialNumber: z.number().int().min(1).max(2_147_483_646) });
const legacyRevisionSchema = z.object({
  proposalCode: z.string().regex(/^[1-9]\d*$/).max(10),
  revisionNumber: z.number().int().min(1).max(2_147_483_646)
});
const crmSendSchema = z.object({
  pipelineId: z.string().trim().min(1),
  companyId: z.string().trim().optional(),
  contactId: z.string().trim().optional()
});

function decodedFileName(request) {
  try { return decodeURIComponent(String(request.get('x-file-name') || '')); }
  catch { throw new HttpError(400, 'Nome do arquivo inválido.'); }
}

function sendFile(response, { bytes, contentType, fileName }) {
  response.set({
    'Content-Type': contentType,
    'Content-Length': String(bytes.length),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Cache-Control': 'no-store'
  }).end(bytes);
}

export function createCommercialRouter(db, { crm = createNectarClient() } = {}) {
  const router = Router();

  router.get('/status', (_request, response) => {
    response.json({ module: 'COMERCIAL', status: 'EM_EXTRACAO' });
  });

  router.get('/numeracao/status', requireEstimator, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json(await numberingStatus(db));
  });

  router.post('/numeracao/inicializar', requireManager, async (request, response) => {
    const { initialNumber } = initialNumberSchema.parse(request.body);
    response.status(201).json(await initializeNumbering(db, request.authUser, initialNumber));
  });

  router.post('/propostas/proximo-numero', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json({ numero: await reserveNumber(db, request.authUser) });
  });

  router.post('/propostas/legado/revisao', requireEstimator, async (request, response) => {
    const { proposalCode, revisionNumber } = legacyRevisionSchema.parse(request.body);
    const registered = await registerLegacyRevision(db, request.authUser, proposalCode, revisionNumber);
    response.status(registered.alreadyRegistered ? 200 : 201).json(registered);
  });

  router.get('/consultores', requireEstimator, async (request, response) => {
    const user = request.authUser;
    const users = user.role === 'MANAGER'
      ? await db.user.findMany({
        where: { isActive: true, role: { in: ['MANAGER', 'SELLER'] } },
        orderBy: [{ name: 'asc' }, { username: 'asc' }]
      })
      : [user];
    response.json({
      items: users.map(item => ({ id: item.id, nome: item.name, username: item.username })),
      podeEscolher: user.role === 'MANAGER'
    });
  });

  router.get('/nectar/funis', requireEstimator, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json(await crm.funnels());
  });

  router.get('/crm/empresas', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await crm.searchCompanies(String(request.query.busca || '')));
  });

  router.get('/crm/empresas/:id', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(await crm.companyDetails(request.params.id));
  });

  router.get('/distancia', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await distanciaDaSede(db, String(request.query.endereco || '')));
  });

  router.get('/enderecos/sugestoes', requireEstimator, async (request, response) => {
    const { termo } = schemas.enderecoSugestaoQuery.parse(request.query);
    response.set('Cache-Control', 'no-store').json(await sugerirEnderecos(termo));
  });

  router.get('/configuracao', requireEstimator, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json(await lerConfiguracao(db));
  });

  router.put('/configuracao/sede', requireManager, async (request, response) => {
    const data = schemas.comercialSedeUpdate.parse(request.body);
    response.json(await salvarSede(db, request.authUser, data));
  });

  router.post('/configuracao/sede/localizar', requireManager, async (request, response) => {
    const data = schemas.comercialSedeUpdate.parse(request.body);
    response.set('Cache-Control', 'no-store').json(await conferirEndereco(data.sedeEndereco));
  });

  router.get('/levantamentos', requireEstimator, async (request, response) => {
    const filters = schemas.listQuery.parse(request.query);
    response.set('Cache-Control', 'no-store')
      .json(await listCostEstimates(db, request.authUser, filters));
  });

  router.post('/levantamentos', requireEstimator, async (request, response) => {
    const data = schemas.costEstimateCreate.parse(request.body);
    response.status(201).json(await createCostEstimate(db, request.authUser, data));
  });

  router.get('/levantamentos/:id', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store')
      .json(await getCostEstimate(db, request.authUser, request.params.id));
  });

  router.put('/levantamentos/:id', requireEstimator, async (request, response) => {
    const data = schemas.costEstimateUpdate.parse(request.body);
    response.json(await updateCostEstimate(db, request.authUser, request.params.id, data));
  });

  router.post('/levantamentos/:id/arquivar', requireEstimator, async (request, response) => {
    response.json(await archiveCostEstimate(db, request.authUser, request.params.id, true));
  });

  router.post('/levantamentos/:id/desarquivar', requireEstimator, async (request, response) => {
    response.json(await archiveCostEstimate(db, request.authUser, request.params.id, false));
  });

  router.get('/propostas', async (request, response) => {
    const filters = schemas.proposalListQuery.parse(request.query);
    response.set('Cache-Control', 'no-store')
      .json(await listProposals(db, request.authUser, filters));
  });

  router.post('/propostas', requireEstimator, async (request, response) => {
    const data = schemas.proposalCreate.parse(request.body);
    response.status(201).json(await createProposal(db, request.authUser, data));
  });

  router.post('/propostas/previa.pdf', requireEstimator, async (request, response) => {
    const bytes = await previewPdf(db, request.authUser, request.body ?? {});
    response.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }).end(bytes);
  });

  router.post('/propostas/documentos', requireEstimator, async (request, response) => {
    const { proposalId } = schemas.proposalDocumentsRequest.parse(request.body);
    response.status(201).json(await issueDocuments(db, request.authUser, proposalId));
  });

  router.get('/documentos/:id', async (request, response) => {
    sendFile(response, await downloadDocument(db, request.authUser, request.params.id));
  });

  router.get('/anexos/:id', requireEstimator, async (request, response) => {
    const file = await downloadAttachment(db, request.authUser, request.params.id);
    sendFile(response, { ...file, contentType: 'application/octet-stream' });
  });

  router.post('/escopo/fotos', requireEstimator,
    raw({ type: () => true, limit: SCOPE_PHOTO_LIMITS.maxRequestBytes }),
    async (request, response) => {
      response.status(201).json(await uploadPhoto(db, request.authUser, {
        bytes: request.body, contentType: request.get('content-type'),
        fileName: decodedFileName(request)
      }));
    });

  router.get('/escopo/fotos/:id', requireEstimator, async (request, response) => {
    const photo = await readPhoto(db, request.authUser, request.params.id);
    response.set({ 'Content-Type': photo.contentType, 'Cache-Control': 'private, max-age=3600' })
      .end(photo.bytes);
  });

  router.get('/propostas/:codigo/revisao', requireEstimator, async (request, response) => {
    response.json(await prepareRevision(db, request.authUser, request.params.codigo));
  });

  router.get('/propostas/:id', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store')
      .json(await getProposal(db, request.authUser, request.params.id));
  });

  router.get('/propostas/:id/documentos', async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await listDocuments(db, request.authUser, request.params.id));
  });

  router.get('/propostas/:id/integracao-crm', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await crmStatus(db, request.authUser, request.params.id));
  });

  router.post('/propostas/:id/enviar-crm', requireEstimator, async (request, response) => {
    const input = crmSendSchema.parse(request.body);
    const result = await sendProposalToCrm(db, request.authUser, request.params.id, input, crm);
    response.status(result.status === 'ERRO' ? 502 : 200).json(result);
  });

  router.get('/propostas/:id/integracao-sharepoint', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await sharepointStatus(db, request.authUser, request.params.id));
  });

  router.post('/propostas/:id/enviar-sharepoint', requireEstimator, async (request, response) => {
    const input = z.object({ folder: z.string().trim().max(500).optional() }).parse(request.body);
    const result = await sendProposalToSharePoint(db, request.authUser, request.params.id, input);
    response.status(result.status === 'ERRO' ? 502 : 200).json(result);
  });

  router.get('/propostas/:id/integracao-filtroapp', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await crmBridgeStatus(db, request.authUser, request.params.id));
  });

  router.post('/propostas/:id/selecao-manual', requireManager, async (request, response) => {
    const input = z.object({ projectId: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(10).max(1000) }).parse(request.body);
    const recorded = await recordManualSelection(db, request.authUser, request.params.id, input);
    const delivery = await deliverToFiltro(db, request.params.id)
      .catch(error => ({ status: 'PENDENTE', message: error.message }));
    response.status(202).json({ ...recorded, delivery });
  });

  router.get('/filtroapp/projetos', requireManager, async (request, response) => {
    const { busca } = z.object({ busca: z.string().trim().min(2).max(100) }).parse(request.query);
    response.set('Cache-Control', 'no-store').json(await findFiltroProjects(busca));
  });

  router.post('/propostas/:id/enviar-filtroapp', requireManager, async (request, response) => {
    const result = await deliverToFiltro(db, request.params.id);
    response.status(result.status === 'ERRO' ? 502 : 200).json(result);
  });

  router.post('/propostas/:id/sincronizar-nectar', requireManager, async (request, response) => {
    const proposal = await db.proposal.findUnique({ where: { id: request.params.id } });
    if (!proposal?.nectarOpportunityId) throw new HttpError(409, 'Proposta sem card vinculado no Nectar.');
    response.json(await syncNectarOpportunity(db, proposal.nectarOpportunityId, crm));
  });

  router.post('/propostas/:id/finalizar-local', requireEstimator, async (request, response) => {
    response.json(await finalizeLocal(db, request.authUser, request.params.id));
  });

  router.get('/propostas/:id/anexos', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store').json(
      await listAttachments(db, request.authUser, request.params.id));
  });

  router.post('/propostas/:id/anexos', requireEstimator,
    raw({ type: () => true, limit: ATTACHMENT_LIMITS.maxRequestBytes }),
    async (request, response) => {
      response.status(201).json(await addAttachment(db, request.authUser, request.params.id, {
        bytes: request.body, fileName: decodedFileName(request)
      }));
    });

  router.delete('/propostas/:id/anexos/:attachmentId', requireEstimator, async (request, response) => {
    response.json(await removeAttachment(db, request.authUser,
      request.params.id, request.params.attachmentId));
  });

  router.put('/propostas/:id', requireEstimator, async (request, response) => {
    const data = schemas.proposalUpdate.parse(request.body);
    response.json(await updateProposal(db, request.authUser, request.params.id, data));
  });

  router.post('/propostas/:id/arquivar', requireEstimator, async (request, response) => {
    response.json(await archiveProposal(db, request.authUser, request.params.id, true));
  });

  router.post('/propostas/:id/desarquivar', requireEstimator, async (request, response) => {
    response.json(await archiveProposal(db, request.authUser, request.params.id, false));
  });

  return router;
}
