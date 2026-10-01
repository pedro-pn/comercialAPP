import { calculateEstimate } from '../../../shared/comercial/dist/cost-model.js';

// A proposta aprovada deve continuar apontando para o levantamento que existia
// quando seus documentos foram finalizados, mesmo se o levantamento for editado.
export async function estimateForFinalizedProposal(db, proposal) {
  if (!proposal.costEstimateId) return null;
  const estimate = await db.costEstimate.findUnique({ where: { id: proposal.costEstimateId } });
  if (!estimate) return null;
  if (!proposal.finalizedAt) return estimate;
  const version = await db.costEstimateVersion.findFirst({
    where: { costEstimateId: estimate.id, createdAt: { lte: proposal.finalizedAt } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });
  if (!version) return estimate;
  const result = calculateEstimate(version.snapshot);
  return {
    ...estimate,
    payload: version.snapshot,
    totalCost: result.totalCost,
    salePrice: result.salePrice,
    marginPercent: result.margin * 100
  };
}
