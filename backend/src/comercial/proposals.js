import { HttpError } from '../auth/service.js';
import { lerDinheiro } from '../../../shared/comercial/dist/dinheiro.js';
import { assertCanRead, assertCanWrite, assertVersion, ConcurrentWriteError, ownerFilter } from './access.js';
import { assertReservedCode, markNumberUsed } from './numbering.js';

export function calculateProposalTotal(payload) {
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  if (!prices.length) return 0;
  const byScenario = new Map();
  for (const item of prices) {
    const scenario = item?.local || '';
    byScenario.set(scenario, (byScenario.get(scenario) ?? 0) + lerDinheiro(item?.value));
  }
  if (byScenario.size === 1) return [...byScenario.values()][0];
  const selected = String(payload?.priceScenario || '').trim().toUpperCase();
  if (selected && byScenario.has(selected)) return byScenario.get(selected);
  return Math.max(...byScenario.values());
}

async function resolveSeller(db, user, sellerUserId) {
  if (user.role !== 'MANAGER') {
    if (sellerUserId !== user.id) {
      throw new HttpError(403, 'Vendedor só pode emitir proposta em nome próprio.');
    }
    return { sellerUserId: user.id, sellerName: user.name };
  }
  const seller = await db.user.findFirst({
    where: { id: sellerUserId, isActive: true, role: { in: ['MANAGER', 'SELLER'] } }
  });
  if (!seller) throw new HttpError(422, 'Selecione um consultor ativo do Comercial.');
  return { sellerUserId: seller.id, sellerName: seller.name };
}

async function validateEstimateLink(db, user, id, proposalCode) {
  if (!id) return null;
  const estimate = await db.costEstimate.findUnique({ where: { id } });
  if (!estimate) throw new HttpError(422, 'O levantamento vinculado não foi encontrado.');
  assertCanRead(user, estimate);
  if (estimate.archivedAt || estimate.status !== 'SALVO') {
    throw new HttpError(422, 'Salve e desarquive o levantamento antes de vincular a proposta.');
  }
  if (estimate.proposalCode !== proposalCode) {
    throw new HttpError(422, 'O levantamento vinculado usa outro código de proposta.');
  }
  return estimate.id;
}

function historyItem(item, viewer) {
  const output = {
    id: item.id,
    proposalCode: item.proposalCode,
    revisionNumber: item.revisionNumber,
    status: item.status,
    clientName: item.clientName,
    contact: item.contact,
    email: item.email,
    site: item.site,
    sellerName: item.sellerName,
    estimatorName: item.estimatorName,
    title: typeof item.payload?.title === 'string' ? item.payload.title : '',
    finalizedAt: item.finalizedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
  if (viewer) return output;
  return {
    ...output,
    costEstimateId: item.costEstimateId,
    sellerUserId: item.sellerUserId,
    totalValue: item.totalValue,
    totalCost: item.costEstimate?.totalCost ?? null,
    marginPercent: item.costEstimate?.marginPercent ?? null,
    nectarStatus: item.nectarStatus,
    nectarOpportunityId: item.nectarOpportunityId,
    nectarPipelineId: item.nectarPipelineId,
    nectarPipelineName: item.nectarPipelineName,
    sharepointStatus: item.sharepointStatus,
    sharepointFolder: item.sharepointFolder,
    integrationError: item.integrationError
  };
}

export async function listProposals(db, user, filters) {
  const term = filters.busca;
  const where = {
    ...(user.role === 'VIEWER' ? {} : ownerFilter(user)),
    archivedAt: filters.arquivados ? { not: null } : null,
    ...(term ? { OR: [
      { proposalCode: { contains: term, mode: 'insensitive' } },
      { clientName: { contains: term, mode: 'insensitive' } },
      { contact: { contains: term, mode: 'insensitive' } },
      { site: { contains: term, mode: 'insensitive' } }
    ] } : {})
  };
  const [total, items] = await Promise.all([
    db.proposal.count({ where }),
    db.proposal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { revisionNumber: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { costEstimate: { select: { totalCost: true, marginPercent: true } } }
    })
  ]);
  return { items: items.map(item => historyItem(item, user.role === 'VIEWER')), total };
}

export async function getProposal(db, user, id) {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (user.role === 'VIEWER') throw new HttpError(403, 'Acesso restrito a gestores e vendedores.');
  assertCanRead(user, proposal);
  return proposal;
}

export async function prepareRevision(db, user, proposalCode) {
  const previous = await db.proposal.findMany({
    where: { proposalCode, ...ownerFilter(user) },
    orderBy: { revisionNumber: 'desc' }
  });
  if (!previous.length) throw new HttpError(404, 'Proposta não encontrada no histórico.');
  const latest = previous[0];
  const withSnapshot = previous.find(item => item.payload && Object.keys(item.payload).length);
  const withCrm = previous.find(item => item.nectarOpportunityId);
  return {
    base_number: Number(proposalCode),
    baseNumber: Number(proposalCode),
    proposalCode,
    nextRevision: latest.revisionNumber + 1,
    snapshot: withSnapshot?.payload ?? {},
    snapshotAvailable: Boolean(withSnapshot),
    message: withSnapshot ? 'Proposta anterior carregada por completo.' : 'Sem snapshot completo.',
    costEstimateId: latest.costEstimateId,
    sellerUserId: latest.sellerUserId,
    sellerName: latest.sellerName,
    crm: withCrm ? {
      opportunityId: withCrm.nectarOpportunityId,
      pipelineId: withCrm.nectarPipelineId ?? '',
      pipelineName: withCrm.nectarPipelineName ?? ''
    } : null
  };
}

export async function createProposal(db, user, data) {
  await assertReservedCode(db, user, data.proposalCode, data.revisionNumber);
  const previous = data.revisionNumber > 0
    ? await prepareRevision(db, user, data.proposalCode) : null;
  if (previous && previous.nextRevision !== data.revisionNumber) {
    throw new HttpError(409, `A próxima revisão é ${previous.nextRevision}.`);
  }
  const costEstimateId = await validateEstimateLink(db, user, data.costEstimateId, data.proposalCode);
  const seller = await resolveSeller(db, user, data.sellerUserId);
  const totalValue = calculateProposalTotal(data.payload);
  if (!Number.isFinite(totalValue)) throw new HttpError(422, 'Valor da proposta inválido.');
  try {
    return await db.$transaction(async tx => {
      const proposal = await tx.proposal.create({
        data: {
          proposalCode: data.proposalCode,
          revisionNumber: data.revisionNumber,
          costEstimateId,
          clientName: data.clientName,
          cnpj: data.cnpj,
          contact: data.contact,
          email: data.email,
          site: data.site,
          department: data.department ?? null,
          ...seller,
          estimatorName: user.name,
          payload: data.payload,
          totalValue,
          createdByUserId: user.id,
          nectarOpportunityId: previous?.crm?.opportunityId ?? null,
          nectarPipelineId: previous?.crm?.pipelineId ?? null,
          nectarPipelineName: previous?.crm?.pipelineName ?? null
        }
      });
      await markNumberUsed(tx, Number(data.proposalCode));
      return proposal;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'Já existe uma proposta com este código e revisão.');
    }
    throw error;
  }
}

export async function updateProposal(db, user, id, data) {
  const existing = await getProposal(db, user, id);
  assertCanWrite(user, existing);
  if (existing.archivedAt || existing.status !== 'RASCUNHO') {
    throw new HttpError(409, 'A proposta não aceita mais edições.');
  }
  if (data.proposalCode && data.proposalCode !== existing.proposalCode ||
      data.revisionNumber !== undefined && data.revisionNumber !== existing.revisionNumber) {
    throw new HttpError(409, 'Código e revisão não podem ser alterados.');
  }
  const protectVersion = assertVersion(existing, data.expectedUpdatedAt, data.forceOverwrite);
  const costEstimateId = data.costEstimateId === undefined ? existing.costEstimateId
    : await validateEstimateLink(db, user, data.costEstimateId, existing.proposalCode);
  const seller = data.sellerUserId === undefined
    ? { sellerUserId: existing.sellerUserId, sellerName: existing.sellerName }
    : await resolveSeller(db, user, data.sellerUserId);
  const payload = data.payload ?? existing.payload;
  const totalValue = calculateProposalTotal(payload);
  if (!Number.isFinite(totalValue)) throw new HttpError(422, 'Valor da proposta inválido.');
  try {
    return await db.proposal.update({
      where: protectVersion ? { id, updatedAt: existing.updatedAt } : { id },
      data: {
        costEstimateId,
        clientName: data.clientName ?? existing.clientName,
        cnpj: data.cnpj ?? existing.cnpj,
        contact: data.contact ?? existing.contact,
        email: data.email ?? existing.email,
        site: data.site ?? existing.site,
        department: data.department === undefined ? existing.department : data.department,
        ...seller,
        payload,
        totalValue,
        updatedByUserId: user.id,
        updatedByLabel: user.name,
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
      }
    });
  } catch (error) {
    if (protectVersion && error.code === 'P2025') {
      const current = await db.proposal.findUnique({ where: { id } });
      if (current) throw new ConcurrentWriteError(current);
    }
    throw error;
  }
}

export async function archiveProposal(db, user, id, archive) {
  const existing = await getProposal(db, user, id);
  assertCanWrite(user, existing);
  return db.proposal.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
}
