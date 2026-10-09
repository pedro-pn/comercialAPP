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

test('17 dias corridos e 5 de integração mantêm 13 dias trabalhados e acrescentam diárias de cada cargo', () => {
  const payload = estimate();
  const normalized = normalizeCostEstimatePayload(payload);
  assert.equal(normalized.laborContexts[0].workingDays, 13);
  assert.equal(normalized.laborContexts[0].integrationDays, 5);
  const result = calculateEstimate(normalized).contextResults[0];
  assert.equal(result.workingDays, 13);
  assert.deepEqual(result.assignments.map(item => item.normalHours), [104, 104]);
  assert.deepEqual(result.assignments.map(item => item.personDays), [13, 13]);
  assert.deepEqual(result.assignments.map(item => item.integrationHours), [40, 40]);
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

test('integração aceita dias inteiros não negativos, independentes do prazo da fase', () => {
  for (const integrationDays of [-1, 1.5, NaN, Infinity, 'inválido', '9007199254740992']) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(validateCostEstimate(payload).errors.some(issue => issue.path === 'laborContexts[0].integrationDays'));
  }
  for (const integrationDays of [0, 5, 11, 12, 13, 14, 30]) {
    const payload = estimate();
    payload.laborContexts[0].integrationDays = integrationDays;
    assert.ok(!validateCostEstimate(payload).errors.some(issue => issue.path.endsWith('.integrationDays')));
  }
});

test('dias trabalhados continuam sendo os dias de segunda a sexta ao alterar a integração', () => {
  for (const [calendarDays, integrationDays, expected] of [
    [1, 0, 1], [4, 0, 4], [5, 0, 5], [5, 3, 5], [5, 5, 5], [6, 0, 5], [7, 0, 5], [7, 2, 5],
    [8, 0, 6], [9, 0, 7], [10, 0, 8], [11, 0, 9], [12, 0, 10], [13, 0, 10], [14, 0, 10],
    [15, 0, 11], [17, 5, 13], [17, 11, 13], [17, 13, 13], [20, 5, 15], [21, 5, 15], [30, 0, 22]
  ]) {
    assert.equal(workingDaysFromCalendar(calendarDays), expected);
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
      assert.equal(workingDaysFromCalendar(calendarDays), weekdays);
    }
  }
});

test('a integração não amplia a duração permitida para jornadas manuais', () => {
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

test('alterar somente a integração acrescenta custo sem mudar os dias, as horas de execução ou acumular ao reabrir', () => {
  const payload = estimate();
  payload.laborContexts[0].integrationDays = 0;
  const original = calculateEstimate(payload);
  for (const integrationDays of [0, 2, 5, 11, 13, 2, 0]) {
    payload.laborContexts[0].integrationDays = integrationDays;
    const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(payload)));
    const result = calculateEstimate(reopened);
    assert.equal(reopened.laborContexts[0].integrationDays, integrationDays);
    const phase = result.contextResults[0];
    assert.equal(phase.durationDays, 17);
    assert.equal(phase.workingDays, 13);
    assert.deepEqual(phase.assignments.map(item => item.normalHours), [104, 104]);
    assert.equal(result.laborCost, Math.round((original.laborCost + (phase.integrationCost ?? 0)) * 100) / 100);
    assert.equal(calculateEstimate(JSON.parse(JSON.stringify(reopened))).totalCost, result.totalCost);
  }
});

test('integração maior que o período acrescenta custo sem zerar a execução', () => {
  const payload = estimate();
  payload.laborContexts[0].integrationDays = 14;
  assert.ok(!validateCostEstimate(payload).errors.some(issue => issue.path === 'laborContexts[0].integrationDays'));
  const result = calculateEstimate(payload);
  assert.equal(result.contextResults[0].workingDays, 13);
  assert.ok(result.laborCost > result.contextResults[0].integrationCost);
});
