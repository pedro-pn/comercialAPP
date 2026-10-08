import test from 'node:test';
import assert from 'node:assert/strict';
import {
  businessDaysFromCalendar, workingDaysFromCalendar, calculateEstimate, createDefaultCostEstimatePayload,
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

test('calendário conta dias de segunda a sexta a partir de uma segunda-feira', () => {
  for (let duration = 1; duration <= 60; duration++) {
    const weekdays = Array.from({ length: duration }, (_, day) => day % 7 < 5).filter(Boolean).length;
    assert.equal(businessDaysFromCalendar(duration), weekdays);
  }
  assert.equal(businessDaysFromCalendar(17), 13);
  assert.equal(businessDaysFromCalendar(11), 9);
});

test('17 dias corridos menos 5 de integração calculam 8 dias para cada cargo no custo', () => {
  const payload = estimate();
  const normalized = normalizeCostEstimatePayload(payload);
  assert.equal(normalized.laborContexts[0].workingDays, 8);
  assert.equal(normalized.laborContexts[0].integrationDays, 5);
  const result = calculateEstimate(normalized).contextResults[0];
  assert.equal(result.workingDays, 8);
  assert.deepEqual(result.assignments.map(item => item.normalHours), [64, 64]);
  assert.deepEqual(result.assignments.map(item => item.personDays), [8, 8]);
  const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(normalized)));
  assert.equal(reopened.laborContexts[0].workingDays, 8);
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
  assert.deepEqual(initial.assignments.map(item => item.normalHours), [64, 72]);
  fase.durationDays = 20;
  const normalized = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(normalized.laborContexts[0].assignments.map(item => item.workSchedule.days[0].days), [10, 9]);
  const updated = calculateEstimate(normalized).contextResults[0];
  assert.deepEqual(updated.assignments.map(item => item.normalHours), [80, 72]);
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

test('integração por fase aceita somente dias inteiros contidos no período após descontar os fins de semana', () => {
  for (const integrationDays of [-1, 1.5, 14, 30, NaN, Infinity, 'inválido']) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(validateCostEstimate(payload).errors.some(issue => issue.path === 'laborContexts[0].integrationDays'));
  }
  for (const integrationDays of [0, 5, 11, 12, 13]) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(!validateCostEstimate(payload).errors.some(issue => issue.path.endsWith('.integrationDays')));
  }
});

test('dias trabalhados descontam a integração dos dias de segunda a sexta, inclusive nos fins de semana', () => {
  for (const [calendarDays, integrationDays, expected] of [
    [1, 0, 1], [4, 0, 4], [5, 0, 5], [5, 3, 2], [5, 5, 0], [6, 0, 5], [7, 0, 5], [7, 2, 3],
    [8, 0, 6], [9, 0, 7], [10, 0, 8], [11, 0, 9], [12, 0, 10], [13, 0, 10], [14, 0, 10],
    [15, 0, 11], [17, 5, 8], [17, 11, 2], [17, 13, 0], [20, 5, 10], [21, 5, 10], [30, 0, 22]
  ]) {
    assert.equal(workingDaysFromCalendar(calendarDays, integrationDays), expected);
    const payload = estimate();
    Object.assign(payload.laborContexts[0], { durationDays: calendarDays, integrationDays });
    const normalized = normalizeCostEstimatePayload(payload);
    assert.equal(normalized.laborContexts[0].workingDays, expected);
    assert.deepEqual(calculateEstimate(normalized).contextResults[0].assignments.map(item => item.personDays),
      [expected, expected]);
  }
  for (let calendarDays = 1; calendarDays <= 60; calendarDays++) {
    const weekdays = Array.from({ length: calendarDays }, (_, day) => day % 7 < 5).filter(Boolean).length;
    for (let integrationDays = 0; integrationDays <= weekdays; integrationDays++) {
      assert.equal(workingDaysFromCalendar(calendarDays, integrationDays), weekdays - integrationDays);
    }
  }
});

test('a integração já incluída não amplia a duração permitida para jornadas manuais', () => {
  const payload = estimate();
  Object.assign(payload.laborContexts[0], { durationDays: 2, integrationDays: 1,
    workingDaysMode: 'manual', workingDays: 3 });
  payload.laborContexts[0].assignments[0].workSchedule = { name: 'Jornada manual', targetType: 'role', days: [{
    dayType: 'weekday', days: 3, daysMode: 'manual',
    normalHoursPerDay: 8, extraHoursPerDay: 0, overtimePercent: 70
  }] };
  const warnings = validateCostEstimate(payload).warnings;
  for (const path of ['laborContexts[0].workingDays', 'laborContexts[0].saturdayCount',
    'laborContexts[0].assignments[0].workSchedule.days']) {
    assert.ok(warnings.some(issue => issue.path === path));
  }
});

test('alterar somente a integração desconta dias, horas e custos sem descontar novamente ao reabrir', () => {
  const payload = estimate();
  payload.laborContexts[0].integrationDays = 0;
  const original = calculateEstimate(payload);
  let previousLaborCost = original.laborCost;
  for (const [integrationDays, expectedDays, expectedHours] of [[0, 13, 104], [2, 11, 88], [5, 8, 64], [11, 2, 16], [13, 0, 0]]) {
    payload.laborContexts[0].integrationDays = integrationDays;
    const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(payload)));
    const result = calculateEstimate(reopened);
    assert.equal(reopened.laborContexts[0].integrationDays, integrationDays);
    assert.equal(result.contextResults[0].workingDays, expectedDays);
    assert.deepEqual(result.contextResults[0].assignments.map(item => item.normalHours), [expectedHours, expectedHours]);
    assert.ok(result.laborCost <= previousLaborCost);
    previousLaborCost = result.laborCost;
    assert.equal(calculateEstimate(JSON.parse(JSON.stringify(reopened))).totalCost, result.totalCost);
  }
});

test('integração maior que o período disponível gera erro e não produz dias nem custos de mão de obra negativos', () => {
  const payload = estimate();
  payload.laborContexts[0].integrationDays = 14;
  assert.ok(validateCostEstimate(payload).errors.some(issue => issue.path === 'laborContexts[0].integrationDays'));
  const result = calculateEstimate(payload);
  assert.equal(result.contextResults[0].workingDays, 0);
  assert.equal(result.laborCost, 0);
});
