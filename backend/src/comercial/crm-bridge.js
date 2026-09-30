import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../auth/service.js';
import { assertCanRead } from './access.js';
import { createNectarClient } from './nectar.js';

const LEASE_MS = 2 * 60_000;

function equalToken(actual, expected) {
  if (!actual || !expected) return false;
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function requireCrmEventToken(request, _response, next) {
  const expectedToken = process.env.NECTAR_WEBHOOK_TOKEN || process.env.CRM_EVENT_TOKEN;
  if (!expectedToken) return next(new HttpError(503, 'NECTAR_WEBHOOK_TOKEN não configurado.'));
  const match = /^Bearer (\S+)$/.exec(request.get('authorization') || '');
  if (!equalToken(match?.[1], expectedToken)) {
    return next(new HttpError(401, 'Token do webhook Nectar inválido.'));
  }
  next();
}

export async function crmBridgeStatus(db, user, proposalId) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanRead(user, proposal);
  return {
    opportunityId: proposal.crmOpportunityId || proposal.nectarOpportunityId || '',
    approvalStatus: proposal.crmApprovalStatus,
    approvalSource: proposal.crmApprovalSource,
    approvalAt: proposal.crmApprovalAt,
    projectId: proposal.crmProjectId || '',
    deliveryStatus: proposal.filtroStatus,
    deliveredAt: proposal.filtroDeliveredAt,
    attempts: proposal.filtroAttempts,
    nextRetryAt: proposal.filtroNextRetryAt,
    message: proposal.filtroError || '',
    sending: Boolean(proposal.filtroAttemptId && proposal.filtroAttemptAt &&
      proposal.filtroAttemptAt.getTime() > Date.now() - LEASE_MS)
  };
}

function matchesStoredEvent(existing, event, source, proposalId) {
  return existing.proposalId === proposalId && existing.source === source &&
    existing.approvalStatus === event.approvalStatus &&
    existing.projectId === (event.projectId || null) &&
    (!existing.opportunityId || existing.opportunityId === (event.opportunityId || null)) &&
    existing.occurredAt.getTime() === new Date(event.occurredAt).getTime();
}

async function inspectCrmEvent(db, event, source) {
  const proposal = await db.proposal.findUnique({
    where: { proposalCode_revisionNumber: {
      proposalCode: event.proposalCode, revisionNumber: event.revisionNumber
    } }
  });
  if (!proposal) throw new HttpError(404, 'Código e revisão da proposta não encontrados.');
  if (proposal.status !== 'FINALIZADA') throw new HttpError(409, 'A proposta ainda não foi finalizada.');
  if (source === 'NECTAR' && (
    proposal.nectarStatus !== 'SUCESSO' ||
    String(proposal.nectarOpportunityId || '') !== event.opportunityId
  )) throw new HttpError(409, 'Oportunidade do Nectar não corresponde à proposta enviada.');
  if (source === 'PRISMA' && proposal.crmOpportunityId &&
      proposal.crmOpportunityId !== event.opportunityId) {
    throw new HttpError(409, 'Oportunidade do Prisma não corresponde à proposta.');
  }
  if (proposal.filtroStatus === 'SUCESSO' && (
    event.approvalStatus !== 'APPROVED' || event.projectId !== proposal.crmProjectId
  )) throw new HttpError(409, 'A proposta já foi entregue a outro estado ou projeto.');
  const existing = await db.crmProposalEvent.findUnique({ where: { eventId: event.eventId } });
  if (existing) {
    if (!matchesStoredEvent(existing, event, source, proposal.id)) {
      throw new HttpError(409, 'ID de evento reutilizado com conteúdo diferente.');
    }
    return { proposal, existing, occurredAt: new Date(event.occurredAt) };
  }
  const occurredAt = new Date(event.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) throw new HttpError(400, 'Data do evento inválida.');
  if (proposal.crmApprovalAt && occurredAt <= proposal.crmApprovalAt) {
    throw new HttpError(409, 'Evento CRM anterior ou igual ao estado já registrado.');
  }
  return { proposal, existing: null, occurredAt };
}

export async function previewCrmEvent(db, event, source = 'PRISMA') {
  const { proposal, existing } = await inspectCrmEvent(db, event, source);
  return {
    valid: true,
    duplicate: Boolean(existing),
    proposalCode: proposal.proposalCode,
    revisionNumber: proposal.revisionNumber,
    approvalStatus: event.approvalStatus,
    wouldAttemptDelivery: !existing && event.approvalStatus === 'APPROVED' && Boolean(event.projectId)
  };
}

export async function recordCrmEvent(db, event, source = 'NECTAR') {
  const { proposal, existing, occurredAt } = await inspectCrmEvent(db, event, source);
  if (existing) {
    return { duplicate: true, proposalId: proposal.id, approvalStatus: proposal.crmApprovalStatus,
      deliveryStatus: proposal.filtroStatus };
  }
  try {
    await db.$transaction(async tx => {
      await tx.crmProposalEvent.create({ data: {
        eventId: event.eventId, proposalId: proposal.id, source,
        opportunityId: event.opportunityId || null,
        approvalStatus: event.approvalStatus, projectId: event.projectId || null,
        occurredAt, reason: event.reason || null
      } });
      const result = await tx.proposal.updateMany({
        where: { id: proposal.id, AND: [
          { OR: [{ crmApprovalAt: null }, { crmApprovalAt: { lt: occurredAt } }] },
          ...(source === 'PRISMA' ? [{ OR: [
            { crmOpportunityId: null }, { crmOpportunityId: event.opportunityId }
          ] }] : [])
        ] },
        data: {
          ...(source === 'PRISMA' ? { crmOpportunityId: event.opportunityId } : {}),
          crmApprovalStatus: event.approvalStatus,
          crmApprovalSource: source,
          crmApprovalAt: occurredAt,
          crmProjectId: event.approvalStatus === 'APPROVED' ? event.projectId || null : null,
          ...(proposal.filtroStatus === 'SUCESSO' ? {} :
            { filtroStatus: 'PENDENTE', filtroError: null,
              filtroAttempts: 0, filtroNextRetryAt: null })
        }
      });
      if (result.count !== 1) throw new HttpError(409, 'Evento CRM fora de ordem.');
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const concurrent = await db.crmProposalEvent.findUnique({ where: { eventId: event.eventId } });
      if (!concurrent || !matchesStoredEvent(concurrent, event, source, proposal.id)) {
        throw new HttpError(409, 'ID de evento reutilizado com conteúdo diferente.');
      }
      return { duplicate: true, proposalId: proposal.id,
        approvalStatus: proposal.crmApprovalStatus, deliveryStatus: proposal.filtroStatus };
    }
    throw error;
  }
  return { duplicate: false, proposalId: proposal.id, approvalStatus: event.approvalStatus,
    deliveryStatus: proposal.filtroStatus === 'SUCESSO' ? 'SUCESSO' : 'PENDENTE' };
}

export async function recordManualSelection(db, user, proposalId, { projectId, reason }) {
  if (!['ADMIN', 'MANAGER'].includes(user.role)) throw new HttpError(403, 'Somente a gestão do Comercial pode selecionar manualmente.');
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (proposal.filtroStatus === 'SUCESSO') throw new HttpError(409, 'Proposta já entregue ao FiltroAPP.');
  const occurredAt = new Date(Math.max(Date.now(),
    (proposal.crmApprovalAt?.getTime() || 0) + 1));
  return recordCrmEvent(db, {
    eventId: randomUUID(), proposalCode: proposal.proposalCode,
    revisionNumber: proposal.revisionNumber, approvalStatus: 'APPROVED',
    projectId, reason: `${user.name} (${user.id}): ${reason}`,
    occurredAt: occurredAt.toISOString()
  }, 'MANUAL');
}

function stableEventId(value) {
  const hex = createHash('sha256').update(value).digest('hex');
  const variant = (8 + (parseInt(hex[16], 16) & 3)).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function customProjectId(opportunity) {
  const field = String(process.env.NECTAR_PROJECT_FIELD || '').trim();
  if (!field) return null;
  const raw = opportunity.camposPersonalizados?.[field];
  const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  return value || null;
}

export async function syncNectarOpportunity(db, opportunityId, crm = createNectarClient()) {
  if (crm.config.mode !== 'real') throw new HttpError(503, 'Sincronização requer NECTAR_MODE=real.');
  const proposal = await db.proposal.findFirst({
    where: { nectarOpportunityId: String(opportunityId), nectarStatus: 'SUCESSO' },
    orderBy: [{ revisionNumber: 'desc' }, { createdAt: 'desc' }]
  });
  if (!proposal) throw new HttpError(404, 'Oportunidade sem proposta enviada neste aplicativo.');
  const opportunity = await crm.opportunityDetails(String(opportunityId));
  const status = Number(opportunity.status);
  if (![2, 3, 4].includes(status)) return {
    pending: true, proposalId: proposal.id, nectarStatus: status,
    message: 'A oportunidade ainda não foi ganha, perdida ou cancelada.'
  };
  const projectId = status === 2 ? customProjectId(opportunity) : null;
  const occurredAt = new Date(opportunity.dataAtualizacao || opportunity.dataConclusao || '');
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new HttpError(502, 'O Nectar não informou uma data válida de atualização da oportunidade.');
  }
  const event = {
    eventId: stableEventId(`${opportunityId}|${status}|${occurredAt.toISOString()}|${projectId || ''}`),
    proposalCode: proposal.proposalCode, revisionNumber: proposal.revisionNumber,
    opportunityId: String(opportunityId),
    approvalStatus: status === 2 ? 'APPROVED' : 'REJECTED',
    projectId, occurredAt: occurredAt.toISOString()
  };
  const recorded = await recordCrmEvent(db, event);
  const delivery = event.approvalStatus === 'APPROVED' && projectId && !recorded.duplicate
    ? await deliverToFiltro(db, proposal.id).catch(error => ({ status: 'PENDENTE', message: error.message }))
    : null;
  return { ...recorded, projectId, delivery };
}

function payloadForFiltro(proposal, estimate, eventId) {
  const money = value => value == null ? null : Number(value);
  return {
    contractVersion: 1, eventId, source: 'COMERCIAL_APP',
    proposalId: proposal.id, proposalCode: proposal.proposalCode,
    revisionNumber: proposal.revisionNumber, projectId: proposal.crmProjectId,
    nectarOpportunityId: proposal.nectarOpportunityId || null,
    approvedAt: proposal.crmApprovalAt.toISOString(),
    client: { name: proposal.clientName, cnpj: proposal.cnpj,
      contact: proposal.contact, email: proposal.email },
    title: String(proposal.payload?.title || ''), site: proposal.site,
    scope: proposal.payload?.scope ?? proposal.payload?.technicalServices ?? [],
    salePrice: money(proposal.totalValue), plannedTotalCost: money(estimate?.totalCost),
    expectedMargin: money(estimate?.marginPercent),
    costBreakdown: estimate?.payload ?? null,
    proposalSnapshot: proposal.payload
  };
}

function filtroConnection() {
  const url = String(process.env.FILTROAPP_API_URL || '').replace(/\/$/, '');
  const token = String(process.env.FILTROAPP_API_TOKEN || '');
  if (!url || !token) throw new HttpError(503, 'Configure FILTROAPP_API_URL e FILTROAPP_API_TOKEN.');
  return { url, token };
}

export async function findFiltroProjects(term, transport = fetch) {
  const { url, token } = filtroConnection();
  const response = await transport(
    `${url}/api/acompanhamento/comercial/comercialapp/projetos?busca=${encodeURIComponent(term)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  ).catch(error => { throw new HttpError(502, `FiltroAPP indisponível: ${error.message}`); });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, `FiltroAPP respondeu ${response.status}: ${body.error || 'erro sem detalhe'}`);
  return { items: Array.isArray(body.items) ? body.items : [] };
}

export async function deliverToFiltro(db, proposalId, transport = fetch) {
  const { url, token } = filtroConnection();
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (proposal.crmApprovalStatus !== 'APPROVED' || !proposal.crmProjectId) {
    throw new HttpError(409, 'Aprovação e projeto são necessários para enviar ao FiltroAPP.');
  }
  if (proposal.filtroStatus === 'SUCESSO') return { status: 'SUCESSO', duplicate: true };
  const event = await db.crmProposalEvent.findFirst({
    where: { proposalId, approvalStatus: 'APPROVED', projectId: proposal.crmProjectId },
    orderBy: { occurredAt: 'desc' }
  });
  if (!event) throw new HttpError(409, 'Não há evento de aprovação para esta proposta.');
  const estimate = proposal.costEstimateId
    ? await db.costEstimate.findUnique({ where: { id: proposal.costEstimateId } }) : null;
  const payload = payloadForFiltro(proposal, estimate, event.eventId);
  const attemptId = randomUUID();
  const claimed = await db.proposal.updateMany({
    where: { id: proposalId, filtroStatus: { not: 'SUCESSO' }, OR: [
      { filtroAttemptId: null }, { filtroAttemptAt: { lt: new Date(Date.now() - LEASE_MS) } }
    ] },
    data: { filtroAttemptId: attemptId, filtroAttemptAt: new Date(),
      filtroStatus: 'ENVIANDO', filtroError: null, filtroNextRetryAt: null,
      filtroAttempts: { increment: 1 } }
  });
  if (claimed.count !== 1) throw new HttpError(409, 'Já existe um envio ao FiltroAPP em andamento.');
  try {
    const response = await transport(`${url}/api/acompanhamento/comercial/comercialapp/propostas`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`FiltroAPP respondeu ${response.status}: ${body.error || 'erro sem detalhe'}`);
    if (!['SELECTED', 'STAGED'].includes(body.budgetStatus)) {
      throw new Error('FiltroAPP respondeu sem o estado do orçamento.');
    }
    await db.proposal.updateMany({ where: { id: proposalId, filtroAttemptId: attemptId },
      data: { filtroStatus: body.budgetStatus === 'SELECTED' ? 'SUCESSO' : 'AGUARDANDO_SELECAO',
        filtroDeliveredAt: new Date(), filtroError: null, filtroAttempts: 0,
        filtroNextRetryAt: body.budgetStatus === 'SELECTED' ? null : new Date(Date.now() + 15 * 60_000),
        filtroAttemptId: null, filtroAttemptAt: null } });
    return { status: body.budgetStatus === 'SELECTED' ? 'SUCESSO' : 'AGUARDANDO_SELECAO',
      budgetStatus: body.budgetStatus, projectId: proposal.crmProjectId };
  } catch (error) {
    const attempt = (proposal.filtroAttempts || 0) + 1;
    const backoffMs = Math.min(60_000 * 2 ** Math.min(attempt - 1, 6), 60 * 60_000);
    await db.proposal.updateMany({ where: { id: proposalId, filtroAttemptId: attemptId },
      data: { filtroStatus: 'ERRO', filtroError: error.message,
        filtroNextRetryAt: attempt >= 10 ? null : new Date(Date.now() + backoffMs),
        filtroAttemptId: null, filtroAttemptAt: null } });
    return { status: 'ERRO', message: error.message };
  }
}

export async function retryPendingFiltro(db) {
  if (!process.env.FILTROAPP_API_URL || !process.env.FILTROAPP_API_TOKEN) return 0;
  const due = await db.proposal.findMany({
    where: { status: 'FINALIZADA', crmApprovalStatus: 'APPROVED',
      crmProjectId: { not: null }, filtroAttempts: { lt: 10 },
      filtroStatus: { in: ['PENDENTE', 'ERRO', 'AGUARDANDO_SELECAO'] },
      OR: [{ filtroNextRetryAt: null }, { filtroNextRetryAt: { lte: new Date() } }] },
    select: { id: true }, orderBy: { crmApprovalAt: 'asc' }, take: 20
  });
  for (const proposal of due) {
    await deliverToFiltro(db, proposal.id).catch(error => {
      if (error.status !== 409) console.error('Retentativa FiltroAPP:', proposal.id, error.message);
    });
  }
  return due.length;
}
