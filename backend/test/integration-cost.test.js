import test from 'node:test';
import assert from 'node:assert/strict';
import { linhasDaPlanilha } from '../src/lib/comercial/cost-csv.js';
import {
  createDefaultCostEstimatePayload, normalizeCostEstimatePayload, LEGACY_LABOR_PRICING_MODEL
} from '../../shared/comercial/dist/cost-model.js';

test('planilha separa a integração e reconcilia R$ 18.000 sem alterar os dias da fase', () => {
  const payload = createDefaultCostEstimatePayload();
  payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
  payload.assumptions.workdaysPerMonth = 22;
  Object.assign(payload.laborContexts[0], { durationDays: 17, integrationDays: 5,
    hoursPerDay: 8, workCondition: 'headquarters', vehicleType: 'none' });
  Object.assign(payload.laborContexts[0].assignments[0], { role: 'Equipe sintética',
    monthlySalary: 22000, adjustment: 0, quantity: 1, allocationPercent: 100, burdenRateOverride: 0 });
  const lines = linhasDaPlanilha({ payload: normalizeCostEstimatePayload(payload) });
  const header = lines.find(line => line[0] === 'CONTEXTO');
  const row = lines.find(line => line[header.indexOf('CARGO')] === 'Equipe sintética');
  assert.equal(row[header.indexOf('DURAÇÃO (DIAS)')], 17);
  assert.equal(row[header.indexOf('DIAS ÚTEIS TRABALHADOS')], 13);
  assert.equal(row[header.indexOf('DIAS DE INTEGRAÇÃO')], 5);
  assert.equal(row[header.indexOf('HH NORMAL')], 104);
  assert.equal(row[header.indexOf('CUSTO NORMAL')], 13000);
  assert.equal(row[header.indexOf('HH INTEGRAÇÃO')], 40);
  assert.equal(row[header.indexOf('CUSTO INTEGRAÇÃO')], 5000);
  assert.equal(row[header.indexOf('CUSTO TOTAL')], 18000);
  assert.equal(lines.find(line => line[0] === 'CUSTO MÃO DE OBRA')[1], 18000);
});
