import test from 'node:test';
import assert from 'node:assert/strict';
import {
  businessDaysFromCalendar, calculateEstimate, createDefaultCostEstimatePayload,
  normalizeCostEstimatePayload, validateCostEstimate
} from '../dist/cost-model.js';

function estimate() {
  const payload = createDefaultCostEstimatePayload();
  const fase = payload.laborContexts[0];
  Object.assign(fase, { durationDays: 17, workingDays: 22, integrationDays: 5,
    hoursPerDay: 8, workCondition: 'headquarters', workConditionConfirmed: true, vehicleType: 'none' });
  fase.assignments.push({ ...fase.assignments[0], id: 'operador', role: 'OPERADOR' });
  return payload;
}

test('dias trabalhados contam segunda a sexta em vez de fixar 22 ou arredondar a proporção semanal', () => {
  for (let duration = 1; duration <= 60; duration++) {
    const weekdays = Array.from({ length: duration }, (_, day) => day % 7 < 5).filter(Boolean).length;
    assert.equal(businessDaysFromCalendar(duration), weekdays);
  }
  assert.equal(businessDaysFromCalendar(17), 13);
  assert.equal(businessDaysFromCalendar(11), 9);
});

test('17 dias corridos incluem 5 de integração e calculam 13 dias para cada cargo no custo', () => {
  const payload = estimate();
  const normalized = normalizeCostEstimatePayload(payload);
  assert.equal(normalized.laborContexts[0].workingDays, 13);
  assert.equal(normalized.laborContexts[0].integrationDays, 5);
  const result = calculateEstimate(normalized).contextResults[0];
  assert.equal(result.workingDays, 13);
  assert.deepEqual(result.assignments.map(item => item.normalHours), [104, 104]);
  assert.deepEqual(result.assignments.map(item => item.personDays), [13, 13]);
  const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(normalized)));
  assert.equal(reopened.laborContexts[0].workingDays, 13);
  assert.equal(reopened.laborContexts[0].integrationDays, 5);
  assert.equal(calculateEstimate(reopened).laborCost, calculateEstimate(payload).laborCost);
});

test('jornadas automáticas acompanham a fase e a exceção individual permanece salva e altera o custo', () => {
  const payload = estimate();
  const fase = payload.laborContexts[0];
  for (const [index, assignment] of fase.assignments.entries()) {
    assignment.workSchedule = { name: 'Jornada', targetType: 'role', days: [{
      dayType: 'weekday', days: index === 0 ? 22 : 9,
      daysMode: index === 0 ? 'automatic' : 'manual',
      normalHoursPerDay: 8, extraHoursPerDay: 0, overtimePercent: 70
    }] };
  }
  const initial = calculateEstimate(payload).contextResults[0];
  assert.deepEqual(initial.assignments.map(item => item.normalHours), [104, 72]);
  fase.durationDays = 20;
  const normalized = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(normalized.laborContexts[0].assignments.map(item => item.workSchedule.days[0].days), [15, 9]);
  const updated = calculateEstimate(normalized).contextResults[0];
  assert.deepEqual(updated.assignments.map(item => item.normalHours), [120, 72]);
  normalized.laborContexts[0].assignments[1].workSchedule.days[0].days = 0;
  assert.equal(calculateEstimate(normalized).contextResults[0].assignments[1].normalHours, 0);
});

test('valores de jornadas anteriores e períodos importados manualmente continuam preservados', () => {
  const payload = estimate();
  const fase = payload.laborContexts[0];
  fase.workingDaysMode = 'manual';
  fase.workingDays = 10;
  fase.assignments[0].workSchedule = { name: 'Exceção anterior', targetType: 'role', days: [{
    dayType: 'weekday', days: 3, normalHoursPerDay: 8, extraHoursPerDay: 0, overtimePercent: 70
  }] };
  const result = calculateEstimate(payload).contextResults[0];
  assert.equal(result.workingDays, 10);
  assert.deepEqual(result.assignments.map(item => item.normalHours), [24, 80]);
});

test('integração por fase recusa quantidades fracionadas, negativas ou maiores que o período útil', () => {
  for (const integrationDays of [-1, 1.5, 14, 'inválido']) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(validateCostEstimate(payload).errors.some(issue => issue.path === 'laborContexts[0].integrationDays'));
  }
  for (const integrationDays of [0, 5, 13]) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(!validateCostEstimate(payload).errors.some(issue => issue.path.endsWith('.integrationDays')));
  }
});
