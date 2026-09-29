import { createHash } from 'node:crypto';
import { HttpError } from '../auth/service.js';
import { assertCanRead, assertCanWrite, assertVersion, ConcurrentWriteError, ownerFilter } from './access.js';
import { assertReservedCode, markNumberUsed } from './numbering.js';
import {
  calculateEstimate, normalizeCostEstimatePayload, validateCostEstimate
} from '../../../shared/comercial/dist/cost-model.js';

export class EstimateValidationError extends HttpError {
  constructor(validation) {
    super(422, 'O levantamento tem pendências.');
    this.issues = (validation.errors ?? []).map(item => typeof item === 'string'
      ? { path: null, message: item, severity: 'error' }
      : { path: item.path ?? null, message: item.message ?? String(item), severity: 'error' });
  }
}

function totalsFromPayload(payload) {
  const normalized = normalizeCostEstimatePayload(payload);
  const result = calculateEstimate(normalized);
  const totalCost = Number(result.totalCost);
  const salePrice = Number(result.salePrice);
  const marginPercent = Number(result.margin) * 100;
  if (![totalCost, salePrice, marginPercent].every(Number.isFinite)) {
    throw new HttpError(422, 'Não foi possível calcular os valores do levantamento.');
  }
  return { normalized, totalCost, salePrice, marginPercent };
}

function assertSavedEstimateIsValid(status, payload) {
  if (status !== 'SALVO') return;
  const validation = validateCostEstimate(payload);
  if (!validation.valid) throw new EstimateValidationError(validation);
}

function payloadHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function pageOptions(input) {
  return { page: input.page, pageSize: input.pageSize };
}

export async function listCostEstimates(db, user, filters) {
  const { page, pageSize } = pageOptions(filters);
  const term = filters.busca;
  const where = {
    ...ownerFilter(user),
    archivedAt: filters.arquivados ? { not: null } : null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(term ? { OR: [
      { proposalCode: { contains: term, mode: 'insensitive' } },
      { title: { contains: term, mode: 'insensitive' } }
    ] } : {})
  };
  const [total, items] = await Promise.all([
    db.costEstimate.count({ where }),
    db.costEstimate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        proposals: {
          where: { archivedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, proposalCode: true, revisionNumber: true, updatedAt: true }
        }
      }
    })
  ]);
  return {
    items: items.map(({ payload: _payload, versions: _versions, proposals, ...item }) => ({
      ...item,
      propostaVinculada: proposals[0] ?? null
    })),
    total
  };
}

export async function getCostEstimate(db, user, id) {
  const estimate = await db.costEstimate.findUnique({ where: { id } });
  if (!estimate) throw new HttpError(404, 'Levantamento não encontrado.');
  assertCanRead(user, estimate);
  return estimate;
}

export async function createCostEstimate(db, user, data) {
  await assertReservedCode(db, user, data.proposalCode, data.revisionNumber);
  assertSavedEstimateIsValid(data.status, data.payload);
  const { normalized, totalCost, salePrice, marginPercent } = totalsFromPayload(data.payload);
  try {
    return await db.$transaction(async tx => {
      const estimate = await tx.costEstimate.create({
        data: {
          proposalCode: data.proposalCode,
          revisionNumber: data.revisionNumber,
          title: data.title,
          mode: data.mode,
          status: data.status,
          payload: normalized,
          totalCost,
          salePrice,
          marginPercent,
          createdByUserId: user.id
        }
      });
      if (data.status === 'SALVO') {
        await tx.costEstimateVersion.create({
          data: { costEstimateId: estimate.id, payloadHash: payloadHash(normalized), snapshot: normalized }
        });
      }
      await markNumberUsed(tx, Number(data.proposalCode));
      return estimate;
    });
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409, 'Já existe um levantamento para este código e revisão.');
    throw error;
  }
}

export async function updateCostEstimate(db, user, id, data) {
  const existing = await getCostEstimate(db, user, id);
  assertCanWrite(user, existing);
  if (existing.archivedAt) throw new HttpError(409, 'Desarquive o levantamento antes de editar.');
  if (data.proposalCode && data.proposalCode !== existing.proposalCode ||
      data.revisionNumber !== undefined && data.revisionNumber !== existing.revisionNumber ||
      data.mode && data.mode !== existing.mode) {
    throw new HttpError(409, 'Código, revisão e modo não podem ser alterados.');
  }
  const protectVersion = assertVersion(existing, data.expectedUpdatedAt, data.forceOverwrite);
  const payload = data.payload ?? existing.payload;
  const status = data.status ?? existing.status;
  assertSavedEstimateIsValid(status, payload);
  const { normalized, totalCost, salePrice, marginPercent } = totalsFromPayload(payload);
  const hash = payloadHash(normalized);

  try {
    return await db.$transaction(async tx => {
      const estimate = await tx.costEstimate.update({
        where: protectVersion ? { id, updatedAt: existing.updatedAt } : { id },
        data: {
          title: data.title ?? existing.title,
          status,
          payload: normalized,
          totalCost,
          salePrice,
          marginPercent,
          updatedByUserId: user.id,
          updatedByLabel: user.name,
          updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
        }
      });
      if (status === 'SALVO') {
        const last = await tx.costEstimateVersion.findFirst({
          where: { costEstimateId: id },
          orderBy: { createdAt: 'desc' },
          select: { payloadHash: true }
        });
        if (!last || last.payloadHash !== hash) {
          await tx.costEstimateVersion.create({
            data: { costEstimateId: id, payloadHash: hash, snapshot: normalized }
          });
        }
      }
      return estimate;
    });
  } catch (error) {
    if (protectVersion && error.code === 'P2025') {
      const current = await db.costEstimate.findUnique({ where: { id } });
      if (current) throw new ConcurrentWriteError(current);
    }
    throw error;
  }
}

export async function archiveCostEstimate(db, user, id, archive) {
  const existing = await getCostEstimate(db, user, id);
  assertCanWrite(user, existing);
  return db.costEstimate.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
}
