import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEstimate, createDefaultCostEstimatePayload, normalizeCostEstimatePayload,
  LEGACY_LABOR_PRICING_MODEL
} from '../dist/cost-model.js';

const money = value => Math.round(value * 100) / 100;

function estimate() {
  const payload = createDefaultCostEstimatePayload();
  Object.assign(payload.laborContexts[0], { durationDays: 17, workingDaysMode: 'automatic',
    integrationDays: 0, hoursPerDay: 8, workCondition: 'headquarters',
    workConditionConfirmed: true, vehicleType: 'none', expenses: [] });
  return payload;
}

test('8 diárias de execução mais 5 de integração custam R$ 13.000 e preservam os 17 dias corridos', () => {
  const payload = estimate();
  payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
  payload.assumptions.workdaysPerMonth = 22;
  Object.assign(payload.laborContexts[0].assignments[0], {
    monthlySalary: 22000, adjustment: 0, quantity: 1, allocationPercent: 100, burdenRateOverride: 0
  });
  const original = calculateEstimate(payload);
  assert.equal(original.laborCost, 13000);
  payload.laborContexts[0].integrationDays = 5;
  const normalized = normalizeCostEstimatePayload(payload);
  const result = calculateEstimate(normalized);
  const phase = result.contextResults[0];
  assert.equal(normalized.laborContexts[0].durationDays, 17);
  assert.equal(normalized.laborContexts[0].workingDays, 8);
  assert.equal(phase.workingDays, 8);
  assert.equal(phase.normalHours, 64);
  assert.equal(phase.integrationCost, 5000);
  assert.equal(result.laborCost, 13000);
  assert.equal(phase.assignments[0].normalCost, 8000);
  assert.equal(phase.assignments[0].integrationHours, 40);
  const integration = result.proposalPrices.filter(line => line.id.endsWith(':integration'));
  assert.equal(integration.length, 1);
  assert.equal(integration[0].costValue, 5000);
  assert.equal(integration[0].quantity, 40);
  assert.equal(result.proposalPrices.filter(line => line.category === 'Mão de obra')
    .reduce((sum, line) => sum + line.costValue, 0), 13000);
  assert.equal(calculateEstimate(JSON.parse(JSON.stringify(normalized))).laborCost, 13000);
});

test('integração LEC respeita cargo, quantidade, alocação, jornada normal, turno e condição sem gerar extras', () => {
  for (const workCondition of ['headquarters', 'travel', 'offshore']) {
    for (const shift of ['day', 'night']) {
      const payload = estimate();
      const phase = payload.laborContexts[0];
      phase.workCondition = workCondition;
      const assignment = phase.assignments[0];
      Object.assign(assignment, { quantity: 3, allocationPercent: 50, shift,
        workSchedule: { name: 'Jornada individual', targetType: 'role', days: [{
          dayType: 'weekday', days: 9, daysMode: 'manual', normalHoursPerDay: 6,
          extraHoursPerDay: 2, overtimePercent: 70
        }] } });
      const original = calculateEstimate(payload);
      const originalAssignment = original.contextResults[0].assignments[0];
      phase.integrationDays = 5;
      const result = calculateEstimate(payload);
      const calculated = result.contextResults[0].assignments[0];
      const expected = money(3 * 0.5 * 5 * 6 * originalAssignment.normalHourlyCost);
      assert.equal(calculated.integrationHours, 45);
      assert.equal(calculated.integrationCost, expected);
      for (const field of ['normalHours', 'normalCost', 'personDays', 'employeeMonths',
        'extra70Hours', 'extra70Cost', 'extra100Hours', 'extra100Cost', 'customExtraCost']) {
        assert.equal(calculated[field], originalAssignment[field], field);
      }
      assert.equal(calculated.total, money(originalAssignment.total + expected));
      assert.equal(result.laborCost, money(original.laborCost + expected));
      const integration = result.proposalPrices.find(line => line.id.endsWith(':integration'));
      assert.equal(integration.costValue, expected);
      assert.equal(integration.quantity, 45);
      assert.equal(normalizeCostEstimatePayload(payload).laborContexts[0].assignments[0].workSchedule.days[0].days, 9);
    }
  }
});

test('integração preserva a cobrança das despesas do período e zerar restaura o cálculo original', () => {
  const payload = estimate();
  const phase = payload.laborContexts[0];
  phase.expenses = ['per_person_calendar_day', 'per_person_workday', 'per_person_month'].map(basis => ({
    id: basis, name: basis, basis, quantity: 1, unitValue: 100, included: true
  }));
  const original = calculateEstimate(payload);
  const originalPayload = JSON.stringify(payload);
  for (const integrationDays of [5, 2, 8, 0]) {
    phase.integrationDays = integrationDays;
    const result = calculateEstimate(payload);
    const calculated = result.contextResults[0];
    const byBasis = Object.fromEntries(calculated.expenses.map(expense => [expense.basis, expense]));
    assert.equal(byBasis.per_person_calendar_day.total, 1700);
    assert.equal(byBasis.per_person_workday.total, 1300);
    assert.equal(byBasis.per_person_month.total, money(13 / 22 * 100));
    assert.equal(result.totalCost, original.totalCost);
    assert.equal(result.salePrice, original.salePrice);
    assert.equal(result.contextResults[0].durationDays, 17);
    assert.equal(result.contextResults[0].workingDays, 13 - integrationDays);
    assert.equal(calculateEstimate(JSON.parse(JSON.stringify(payload))).laborCost, result.laborCost);
  }
  assert.equal(JSON.stringify(payload), originalPayload);
  assert.deepEqual(calculateEstimate(payload), original);
  phase.enabled = false;
  phase.integrationDays = 5;
  assert.equal(calculateEstimate(payload).laborCost, 0);
});

test('integração mensal inclui encargos e respeita alocações sem aumentar os meses da execução', () => {
  const payload = estimate();
  payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
  const phase = payload.laborContexts[0];
  Object.assign(phase, { workingDaysMode: 'manual', workingDays: 9 });
  Object.assign(phase.assignments[0], { monthlySalary: 22000, adjustment: 0,
    quantity: 2, allocationPercent: 50, burdenRateOverride: 0.5 });
  const original = calculateEstimate(payload);
  phase.integrationDays = 5;
  const result = calculateEstimate(payload);
  assert.equal(result.laborCost, 21000);
  assert.equal(result.contextResults[0].integrationCost, 7500);
  assert.equal(result.contextResults[0].employeeMonths, original.contextResults[0].employeeMonths);
  assert.equal(result.contextResults[0].workingDays, 9);
  phase.assignments[0].quantity = 0;
  assert.equal(calculateEstimate(payload).laborCost, 0);
});

test('a parcela da integração reconcilia centavos no total e no QQP do modelo mensal', () => {
  for (const integrationDays of [1, 2, 5, 8, 13]) {
    const payload = estimate();
    payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
    Object.assign(payload.laborContexts[0].assignments[0], { monthlySalary: 12345.67,
      adjustment: 56.78, quantity: 3, allocationPercent: 37, burdenRateOverride: 0.893 });
    const original = calculateEstimate(payload);
    payload.laborContexts[0].integrationDays = integrationDays;
    const result = calculateEstimate(payload);
    const phase = result.contextResults[0];
    assert.equal(result.laborCost, original.laborCost);
    assert.equal(phase.assignments[0].total, money(phase.assignments[0].normalCost + phase.integrationCost));
    assert.equal(money(result.proposalPrices.filter(line => line.category === 'Mão de obra')
      .reduce((sum, line) => sum + line.costValue, 0)), result.laborCost);
    assert.equal(result.proposalPrices.find(line => line.id.endsWith(':integration')).costValue, phase.integrationCost);
  }
});

test('integração pode ter custo mesmo com execução zerada e equipes paralelas são cobradas por fase', () => {
  const payload = estimate();
  Object.assign(payload.laborContexts[0], { workingDaysMode: 'manual', workingDays: 0, integrationDays: 5 });
  const single = calculateEstimate(payload);
  assert.equal(single.contextResults[0].normalHours, 0);
  assert.ok(single.laborCost > 0);
  assert.equal(single.laborCost, single.contextResults[0].integrationCost);
  payload.laborContexts.push({ ...payload.laborContexts[0], id: 'fase-paralela' });
  assert.equal(calculateEstimate(payload).laborCost, money(single.laborCost * 2));
  payload.scopeConfirmations.noLabor = true;
  assert.equal(calculateEstimate(payload).laborCost, 0);
});

test('jornadas automáticas LEC cobram execução e integração uma vez, inclusive quando toda a fase é integração', () => {
  for (const workCondition of ['headquarters', 'travel', 'offshore']) {
    for (const shift of ['day', 'night']) {
      const payload = estimate();
      const phase = payload.laborContexts[0];
      phase.workCondition = workCondition;
      Object.assign(phase.assignments[0], { quantity: 3, allocationPercent: 37, shift,
        workSchedule: { name: 'Automática', targetType: 'role', days: [{
          dayType: 'weekday', days: 999, daysMode: 'automatic', normalHoursPerDay: 6,
          extraHoursPerDay: 0, overtimePercent: 70
        }] } });
      const original = calculateEstimate(payload);
      for (const integrationDays of [2, 5, 13, 0]) {
        phase.integrationDays = integrationDays;
        const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(payload)));
        const result = calculateEstimate(reopened);
        const calculated = result.contextResults[0].assignments[0];
        assert.equal(reopened.laborContexts[0].workingDays, 13 - integrationDays);
        assert.equal(calculated.normalHours, money(1.11 * (13 - integrationDays) * 6));
        assert.equal(calculated.integrationHours ?? 0, money(1.11 * integrationDays * 6));
        assert.equal(calculated.extra70Cost + calculated.extra100Cost, 0);
        assert.equal(result.laborCost, original.laborCost);
        assert.equal(result.totalCost, original.totalCost);
        assert.equal(calculated.total, money(calculated.normalCost + (calculated.integrationCost ?? 0)));
        assert.equal(money(result.proposalPrices.filter(line => line.category === 'Mão de obra')
          .reduce((sum, line) => sum + line.costValue, 0)), result.laborCost);
      }
    }
  }
});

test('encargos mensais consideram a execução e a integração ao selecionar a faixa de meses', () => {
  const payload = estimate();
  payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
  const phase = payload.laborContexts[0];
  phase.durationDays = 45;
  const original = calculateEstimate(payload);
  assert.equal(original.contextResults[0].workingDays, 33);
  for (const integrationDays of [1, 15, 33, 0]) {
    phase.integrationDays = integrationDays;
    const result = calculateEstimate(payload);
    const calculated = result.contextResults[0].assignments[0];
    assert.equal(result.contextResults[0].workingDays, 33 - integrationDays);
    assert.equal(calculated.burdenRate, original.contextResults[0].assignments[0].burdenRate);
    assert.equal(result.laborCost, original.laborCost);
    assert.equal(calculateEstimate(JSON.parse(JSON.stringify(payload))).laborCost, original.laborCost);
  }
});

test('cenário da 4640 mantém combustível, despesas, custo total e venda com integração nas duas fases', () => {
  const payload = estimate();
  const manager = payload.laborContexts[0];
  Object.assign(manager, { durationDays: 70, hoursPerDay: 8.8, workCondition: 'travel',
    vehicleType: 'sedan', vehicleCountMode: 'manual', vehicleCount: 1 });
  manager.assignments[0].role = 'GERENTE DE ENGENHARIA';
  manager.expenses = [{ id: 'combustivel-gerente', code: 'hotel_site_commute',
    name: 'Deslocamento hotel ↔ obra (combustível)', basis: 'per_vehicle_staffed_day',
    quantity: 1, unitValue: 50, included: true }];
  const team = structuredClone(manager);
  team.id = 'execucao';
  team.vehicleCount = 3;
  team.assignments = [['OPERADOR', 3], ['AUXILIAR', 3], ['COORDENADOR', 1]].map(([role, quantity], index) => ({
    ...team.assignments[0], id: `cargo-${index}`, role, quantity,
    workSchedule: { name: 'Automática', targetType: 'role', days: [{ dayType: 'weekday', days: 50,
      daysMode: 'automatic', normalHoursPerDay: 8.8, extraHoursPerDay: 0, overtimePercent: 70 }] }
  }));
  team.expenses.push(...[200, 175, 30].map((unitValue, index) => ({ id: `permanencia-${index}`,
    name: `Despesa de permanência ${index}`, basis: 'per_person_calendar_day',
    quantity: 1, unitValue, included: true })));
  payload.laborContexts.push(team);
  const original = calculateEstimate(payload);
  const originalJson = JSON.stringify(payload);
  for (const integrationDays of [5, 10, 50, 0]) {
    const edited = structuredClone(payload);
    for (const phase of edited.laborContexts) phase.integrationDays = integrationDays;
    const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(edited)));
    const result = calculateEstimate(reopened);
    assert.deepEqual(result.contextResults.map(phase => phase.workingDays), [50 - integrationDays, 50 - integrationDays]);
    assert.equal(result.contextResults[0].expenses[0].total, 2500);
    assert.equal(result.contextResults[1].expenses[0].total, 7500);
    assert.deepEqual(result.contextResults.map(phase => phase.expenses), original.contextResults.map(phase => phase.expenses));
    for (const field of ['laborCost', 'indirectCost', 'totalCost', 'salePrice', 'profitValue']) {
      assert.equal(result[field], original[field], field);
    }
    assert.equal(money(result.qqp.reduce((sum, line) => sum + line.value, 0)), result.salePrice);
  }
  assert.equal(JSON.stringify(payload), originalJson);
});

test('todas as bases de despesas da fase e custos indiretos incluem a integração no período contratado', () => {
  const payload = estimate();
  const phase = payload.laborContexts[0];
  phase.workCondition = 'travel';
  phase.vehicleType = 'sedan';
  const bases = ['fixed', 'per_person', 'per_person_day', 'per_person_calendar_day',
    'per_person_workday', 'per_person_month', 'per_vehicle_calendar_day',
    'per_vehicle_workday', 'per_vehicle_staffed_day', 'per_context_day', 'per_context_month', 'percent_labor'];
  const expenses = bases.map(basis => ({ id: basis, name: basis, basis, quantity: 1,
    unitValue: basis === 'percent_labor' ? 2 : 123.45, included: true }));
  phase.expenses = [{ ...expenses[0], id: 'excluida', included: false }, ...expenses];
  payload.indirectCosts = expenses;
  const original = calculateEstimate(payload);
  for (const integrationDays of [1, 5, 13, 0]) {
    phase.integrationDays = integrationDays;
    const result = calculateEstimate(payload);
    assert.equal(result.contextResults[0].workingDays, 13 - integrationDays);
    assert.equal(result.totalPersonDays, 13 - integrationDays);
    assert.deepEqual(result.contextResults[0].expenses, original.contextResults[0].expenses);
    assert.deepEqual(result.indirectResults, original.indirectResults);
    assert.equal(result.totalCost, original.totalCost);
    assert.equal(result.salePrice, original.salePrice);
  }
});

test('jornada com extras mantém o valor contratado, descontando os horários de execução da integração', () => {
  for (const overtimePercent of [70, 100, 50]) {
    for (const individual of [false, true]) {
      const payload = estimate();
      const phase = payload.laborContexts[0];
      phase.weekdayExtra70HoursPerDay = 4;
      if (individual) phase.assignments[0].workSchedule = { name: 'Automática', targetType: 'role', days: [{
        dayType: 'weekday', days: 13, daysMode: 'automatic', normalHoursPerDay: 8,
        extraHoursPerDay: 4, overtimePercent
      }] };
      const original = calculateEstimate(payload);
      for (const integrationDays of [2, 5, 13, 0]) {
        phase.integrationDays = integrationDays;
        const result = calculateEstimate(payload);
        const calculated = result.contextResults[0].assignments[0];
        assert.equal(calculated.normalHours, (13 - integrationDays) * 8);
        assert.equal(calculated.extra70Hours + calculated.extra100Hours + (calculated.customExtraHours ?? 0),
          (13 - integrationDays) * 4);
        assert.equal(calculated.total, original.contextResults[0].assignments[0].total);
        assert.equal(calculated.total, money(calculated.normalCost + calculated.extra70Cost
          + calculated.extra100Cost + (calculated.customExtraCost ?? 0) + (calculated.integrationCost ?? 0)));
        assert.equal(result.totalCost, original.totalCost);
        assert.equal(result.salePrice, original.salePrice);
      }
    }
  }
});

test('logística por pessoa-dia e viagens da equipe mantêm a cobrança incluindo a integração', () => {
  const payload = estimate();
  payload.assumptions.laborPricingModel = LEGACY_LABOR_PRICING_MODEL;
  const phase = payload.laborContexts[0];
  phase.workCondition = 'travel';
  phase.assignments[0].workSchedule = { name: 'Automática', targetType: 'role', days: [
    { dayType: 'weekday', days: 13, daysMode: 'automatic', normalHoursPerDay: 8, extraHoursPerDay: 2, overtimePercent: 70 },
    { dayType: 'saturday', days: 2, daysMode: 'manual', normalHoursPerDay: 4, extraHoursPerDay: 0, overtimePercent: 70 }
  ] };
  phase.saturdayCount = 2;
  payload.logistics = [
    { ...payload.logistics[0], id: 'legada', requiredSlot: false, calculationMode: 'legacy',
      laborContextId: phase.id, basis: 'per_person_day', unitCost: 100, included: true },
    { ...payload.logistics[0], id: 'viagem', requiredSlot: false, calculationMode: 'company_vehicle',
      distanceKmPerVehicle: 320, included: true }
  ];
  const original = calculateEstimate(payload);
  for (const integrationDays of [5, 13, 0]) {
    phase.integrationDays = integrationDays;
    const result = calculateEstimate(payload);
    assert.deepEqual(result.logisticsResults, original.logisticsResults);
    assert.equal(result.totalCost, original.totalCost);
    assert.equal(result.salePrice, original.salePrice);
  }
});
