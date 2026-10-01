import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { estimateSummaryForFiltro, payloadForFiltro } from '../src/comercial/crm-bridge.js';
import { estimateForFinalizedProposal } from '../src/comercial/finalized-estimate.js';

const golden = JSON.parse(readFileSync(new URL('../../shared/comercial/test/goldens/03-sede-he70-dentro-do-limite.golden.json', import.meta.url)));

test('resumo enviado ao FiltroAPP preserva horas e categorias calculadas do levantamento', () => {
  const summary = estimateSummaryForFiltro({ payload: golden.payload, totalCost: golden.result.totalCost });
  assert.equal(summary.schemaVersion, 1);
  assert.deepEqual(summary.hours, { normal: 193.6, overtime: 22, total: 215.6 });
  assert.equal(summary.workload.phases[0].workingDays, 22);
  assert.equal(summary.costs.total, 16258.85);
  assert.equal(summary.costs.labor, golden.result.laborCost);
  assert.equal(summary.costs.mobilization, golden.result.mobilizationCost);
  assert.equal(summary.costs.taxesAtEstimatePrice, golden.result.taxValue);
  assert.equal(summary.costs.commercialExpenseAtEstimatePrice, golden.result.commercialValue);
  assert.equal(estimateSummaryForFiltro(null), null);
});

test('resumo discrimina indicação e comissão de representante sem duplicar custo direto', () => {
  const scenario = JSON.parse(readFileSync(new URL('../../shared/comercial/test/goldens/15-comissao-representante-e-indicacao.golden.json', import.meta.url)));
  const summary = estimateSummaryForFiltro({ payload: scenario.payload, totalCost: scenario.result.totalCost });
  assert.equal(summary.costs.referralBonus, 2500);
  assert.equal(summary.costs.representativeCommissionAtEstimatePrice, 4564.17);
  assert.equal(summary.costs.direct, summary.costs.total);
});

test('envio inclui itens do escopo efetivamente salvos na proposta', () => {
  const scopeItems = [{ id: 'servico-1', title: 'Limpeza', description: 'Descrição' }];
  const payload = payloadForFiltro({
    id: 'proposal-1', proposalCode: '8700', revisionNumber: 0,
    crmProjectId: 'project-1', crmApprovalAt: new Date('2026-09-30T00:00:00Z'),
    clientName: 'Cliente', cnpj: '', contact: '', email: '', site: 'Obra',
    totalValue: 1500, payload: { title: 'Proposta', scopeItems, technicalServices: [{ id: 'outro' }] }
  }, null, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(payload.scope, scopeItems);
  assert.deepEqual(payload.proposalSnapshot.scopeItems, scopeItems);
});

test('entrega usa a versão do levantamento vigente na finalização da proposta', async () => {
  const finalizedAt = new Date('2026-09-29T12:00:00Z');
  const estimate = await estimateForFinalizedProposal({
    costEstimate: { findUnique: async () => ({ id: 'estimate-1', payload: {}, totalCost: 0 }) },
    costEstimateVersion: { findFirst: async query => {
      assert.equal(query.where.costEstimateId, 'estimate-1');
      assert.equal(query.where.createdAt.lte, finalizedAt);
      return { snapshot: golden.payload };
    } }
  }, { costEstimateId: 'estimate-1', finalizedAt });
  assert.equal(estimate.totalCost, golden.result.totalCost);
  assert.equal(estimateSummaryForFiltro(estimate).hours.total, 215.6);
});
