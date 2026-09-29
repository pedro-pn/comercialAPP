import { Router } from 'express';
import { z } from 'zod';
import { makeComercialSchemas } from '../../../shared/schemas/comercial.js';
import { requireEstimator, requireManager } from './access.js';
import {
  archiveCostEstimate, createCostEstimate, getCostEstimate,
  listCostEstimates, updateCostEstimate
} from './cost-estimates.js';
import { initializeNumbering, numberingStatus, reserveNumber } from './numbering.js';
import {
  archiveProposal, createProposal, getProposal, listProposals,
  prepareRevision, updateProposal
} from './proposals.js';

const schemas = makeComercialSchemas(z);
const initialNumberSchema = z.object({ initialNumber: z.number().int().min(1).max(2_147_483_646) });

export function createCommercialRouter(db) {
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

  router.get('/propostas/:codigo/revisao', requireEstimator, async (request, response) => {
    response.json(await prepareRevision(db, request.authUser, request.params.codigo));
  });

  router.get('/propostas/:id', requireEstimator, async (request, response) => {
    response.set('Cache-Control', 'no-store')
      .json(await getProposal(db, request.authUser, request.params.id));
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
