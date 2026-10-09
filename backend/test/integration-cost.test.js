import test from 'node:test';
import assert from 'node:assert/strict';
import { linhasDaPlanilha } from '../src/lib/comercial/cost-csv.js';
import {
  createDefaultCostEstimatePayload, normalizeCostEstimatePayload, LEGACY_LABOR_PRICING_MODEL
} from '../../shared/comercial/dist/cost-model.js';

test('planilha separa 8 dias de execução e 5 de integração e reconcilia R$ 13.000', () => {
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
  assert.equal(row[header.indexOf('DIAS ÚTEIS TRABALHADOS')], 8);
  assert.equal(row[header.indexOf('DIAS DE INTEGRAÇÃO')], 5);
  assert.equal(row[header.indexOf('HH NORMAL')], 64);
  assert.equal(row[header.indexOf('CUSTO NORMAL')], 8000);
  assert.equal(row[header.indexOf('HH INTEGRAÇÃO')], 40);
  assert.equal(row[header.indexOf('CUSTO INTEGRAÇÃO')], 5000);
  assert.equal(row[header.indexOf('CUSTO TOTAL')], 13000);
  assert.equal(lines.find(line => line[0] === 'CUSTO MÃO DE OBRA')[1], 13000);
});

test('planilha inclui a integração no combustível e no trajeto total mantendo dias trabalhados descontados', () => {
  const payload = createDefaultCostEstimatePayload();
  Object.assign(payload.laborContexts[0], { durationDays: 70, integrationDays: 5,
    workCondition: 'travel', vehicleType: 'sedan', vehicleCountMode: 'manual', vehicleCount: 3,
    hotelSiteDistanceKmPerDay: 50, expenses: [{ id: 'combustivel', code: 'hotel_site_commute',
      name: 'Deslocamento hotel ↔ obra (combustível)', basis: 'per_vehicle_staffed_day',
      quantity: 1, unitValue: 50, included: true }] });
  const lines = linhasDaPlanilha({ payload: normalizeCostEstimatePayload(payload) });
  const header = lines.find(line => line[0] === 'CONTEXTO');
  const row = lines.find(line => line[header.indexOf('CARGO')] === 'COORDENADOR');
  assert.equal(row[header.indexOf('DIAS ÚTEIS TRABALHADOS')], 45);
  const expense = lines.find(line => String(line[11]).startsWith('DESPESA: Deslocamento hotel'));
  assert.equal(expense[17], 'BASE CALC.: 150');
  assert.equal(expense[27], 7500);
  const vehicle = lines.find(line => String(line[1]).startsWith('VEÍCULO:'));
  assert.match(vehicle[11], /7500 KM TOTAL/);
});
