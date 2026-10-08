import { createHash } from 'node:crypto';
import { HttpError } from '../auth/service.js';
import { readLecWorkbook } from './lec-workbook.js';
import { calculateEstimate, createDefaultCostEstimatePayload, LEC_LABOR_ROLES,
  normalizeCostEstimatePayload } from '../../../shared/comercial/dist/cost-model.js';
import { textoCondicoesPagamento } from '../../../shared/comercial/dist/modelo-documento.js';

const proposalSheet = 'GERAR PROPOSTA';
const laborSheet = 'CUSTO.Colaboradores';
const productSheet = 'CUSTO.Produtos';
const freightSheet = 'CUSTO.Frete';
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const roles = ['COORDENADOR', 'SUPERVISOR', 'ENCARREGADO', 'OPERADOR', 'AUXILIAR', 'ADMINISTRATIVO'];
const presentText = text => text && text !== '0' ? text : '';
const percent = fraction => Math.round(fraction * 1_000_000) / 10_000;

/** Maps the LEC 1.2/1.3 layout into editable app fields, without importing its databases. */
export function parseLec(bytes, fileName) {
  const workbook = readLecWorkbook(bytes, fileName);
  const { number: n, text: t, warnings, key } = workbook;
  for (const name of [proposalSheet, laborSheet, productSheet, freightSheet, 'CUSTO.TOTAL', 'CUSTO.Impostos']) {
    workbook.sheet(name, true);
  }
  for (const [sheet, address, label] of [
    [proposalSheet, 'B5', 'Cód. Proposta'], [proposalSheet, 'F5', 'Rev'],
    [laborSheet, 'B12', 'Coordenadores'], [productSheet, 'I27', 'Produto'],
    [freightSheet, 'B10', 'Item']
  ]) {
    if (key(t(sheet, address)) !== key(label)) {
      throw new HttpError(422, `LEC incompatível: confira o modelo da aba ${sheet} (${address}).`);
    }
  }
  const proposalCode = String(n(proposalSheet, 'D5'));
  const sourceRevisionNumber = n(proposalSheet, 'H5');
  if (!/^[1-9]\d*$/.test(proposalCode) || Number(proposalCode) > 2_147_483_646 ||
      !Number.isInteger(sourceRevisionNumber) || sourceRevisionNumber < 0 || sourceRevisionNumber >= 2_147_483_646) {
    throw new HttpError(422, 'Confira o número da proposta e a revisão na aba GERAR PROPOSTA.');
  }
  const defaultPayload = createDefaultCostEstimatePayload();
  const site = presentText(t(proposalSheet, 'D11'));
  const title = presentText(t(proposalSheet, 'H7')) || `Revisão da proposta ${proposalCode}`;
  const totalCost = n('CUSTO.TOTAL', 'K11');
  const salePrice = n(proposalSheet, 'B50') || n(proposalSheet, 'E50') || n('CUSTO.TOTAL', 'T13') || n('CUSTO.TOTAL', 'K12');
  const durationDays = n(laborSheet, 'H9') || n(proposalSheet, 'F21');
  const workingDays = n(laborSheet, 'H10') || n(proposalSheet, 'H21');
  const condition = { 1: 'headquarters', 2: 'travel', 3: 'offshore' }[n(laborSheet, 'B6')] || '';
  const laborContexts = [];
  for (const [column, shift, name] of [['H', 'day', 'Execução diurna'], ['L', 'night', 'Execução noturna']]) {
    const assignments = roles.flatMap((role, index) => {
      const quantity = n(laborSheet, `${column}${12 + index}`);
      if (quantity <= 0) return [];
      const baseSalary = n('Calculo Colaboradores', `D${8 + Math.min(index, 4)}`);
      return [{ id: `lec-${shift}-${index}`, role, quantity,
        monthlySalary: baseSalary || LEC_LABOR_ROLES.find(item => item.role === role).salary,
        adjustment: 0, allocationPercent: 100, shift, nightPremiumPercent: 35 }];
    });
    if (!assignments.length) continue;
    laborContexts.push({ id: `lec-${shift}`, name, description: site, durationDays, workingDays, workingDaysMode: 'manual',
      integrationDays: n(proposalSheet, 'J21'),
      startOffsetDays: 0, hoursPerDay: 8.8, workCondition: condition,
      workConditionConfirmed: Boolean(condition), weekdayExtra70HoursPerDay: n(laborSheet, `${column}22`),
      saturdayCount: n(laborSheet, `${column}18`), saturdayHoursPerDay: n(laborSheet, `${column}19`),
      sundayCount: n(laborSheet, `${column}20`), sundayHoursPerDay: n(laborSheet, `${column}21`),
      vehicleType: 'none', assignments, expenses: [], enabled: true });
  }
  const expenses = [];
  function expense(description, value, id) {
    if (value > 0) expenses.push({ id, name: description, basis: 'fixed', quantity: 1, unitValue: value, included: true });
  }
  // Both invoice and debit-note expenses are actual costs. Keep each once, independently editable.
  for (let row = 28; row <= 33; row++) expense(t(laborSheet, `B${row}`), n(laborSheet, `H${row}`), `lec-expense-${row}`);
  for (let row = 38; row <= 41; row++) expense(t(laborSheet, `B${row}`), n(laborSheet, `H${row}`), `lec-optional-${row}`);
  expense('Treinamentos', n(laborSheet, 'S45'), 'lec-training');
  expense('EPI', n(laborSheet, 'S46'), 'lec-epi');
  for (let row = 36; row <= 44; row++) expense(t(laborSheet, `W${row}`), n(laborSheet, `AE${row}`), `lec-debit-${row}`);
  const materials = [];
  if (laborContexts.length) laborContexts[0].expenses = expenses;
  else expenses.forEach(item => materials.push({ id: item.id, category: 'input', description: item.name,
    unit: 'VB', quantity: 1, unitCost: item.unitValue, included: true }));
  for (let row = 66; row <= 77; row++) {
    const quantity = n(laborSheet, `D${row}`);
    const unitCost = n(laborSheet, `E${row}`);
    const total = n(laborSheet, `F${row}`);
    if (quantity > 0 || total > 0) materials.push({ id: `lec-additional-${row}`, category: 'input',
      description: t(laborSheet, `B${row}`) || `Despesa adicional ${row}`, unit: 'un',
      quantity: quantity || 1, unitCost: unitCost || total / (quantity || 1), included: true });
  }
  const products = [];
  for (const row of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23]) {
    const name = t(productSheet, `I${row}`);
    if (!name) continue;
    const quantity = n(productSheet, `R${row}`);
    products.push({ id: `lec-product-${row}`, productName: name, unit: t(productSheet, `M${row}`) || 'kg',
      doseMode: 'manual', manualQuantity: quantity, unitCost: n(productSheet, `N${row}`), included: quantity > 0 });
  }
  if (n(productSheet, 'T19') > 0) materials.push({ id: 'lec-effluent-transport', category: 'input',
    description: t(productSheet, 'I19'), unit: t(productSheet, 'M19') || 'km',
    quantity: n(productSheet, 'R19') || 1, unitCost: n(productSheet, 'N19'), included: true });
  const filters = [];
  for (let row = 28; row <= 37; row++) {
    const quantity = n(productSheet, `M${row}`);
    const name = t(productSheet, `I${row}`);
    if (!name) continue;
    const unitCost = n(productSheet, `O${row}`);
    if (row >= 36) {
      materials.push({ id: `lec-material-${row}`, category: 'input', description: name,
        unit: row === 36 ? 'L' : 'un', quantity, unitCost, included: quantity > 0 });
    } else filters.push({ id: `lec-filter-${row}`, filterName: name, unit: 'un', quantity, unitCost,
      micronRating: name.match(/(\d+)\s*micra/i)?.[1] || '', included: quantity > 0 });
  }
  const volumeSystems = [];
  for (const [material, first, last] of [['carbon_steel', 43, 95], ['stainless_steel', 101, 153]]) {
    const pipeSegments = [];
    for (let row = first; row <= last; row++) {
      const lengthM = n(productSheet, `G${row}`);
      if (lengthM > 0) pipeSegments.push({ id: `lec-pipe-${row}`, description: `Tubulação ${n(productSheet, `E${row}`)} mm`,
        quantity: 1, lengthM, internalDiameterMm: n(productSheet, `E${row}`), fillPercent: 100 });
    }
    if (pipeSegments.length) volumeSystems.push({ id: `lec-${material}`, name: material === 'carbon_steel' ? 'Tubulações de carbono' : 'Tubulações de inox',
      material, pipeSegments, enabled: true });
  }
  // The detailed tabs can explicitly identify services; do not infer them from costs or the file name.
  const circuitServices = [];
  const marked = value => /^(x|sim|1|true)$/i.test(value.trim());
  const technicalSheet = 'DETALHADO.Tratamento de óleo';
  const serviceColumns = { L: 'filtragem_hidraulico_lubrificante', N: 'limpeza_reservatorio',
    P: 'flushing_secundario', R: 'desidratacao_oleo' };
  for (let row = 16; row <= 30; row++) {
    const name = t(technicalSheet, `B${row}`);
    if (!name) continue;
    const quantity = n(technicalSheet, `F${row}`);
    const liters = n(technicalSheet, `H${row}`);
    const id = `lec-reservoir-${row}`;
    volumeSystems.push({ id, name, material: 'other', reservoirVolumes: [{ id: `${id}-item`,
      description: name, quantity: quantity || 1, volumeLiters: liters, included: true }], enabled: true });
    for (const [column, serviceId] of Object.entries(serviceColumns)) {
      if (marked(t(technicalSheet, `${column}${row}`))) circuitServices.push({ id: `${id}-${serviceId}`, systemId: id, serviceId });
    }
  }
  const pipeSheet = 'DETALHADO.Tubulações';
  for (let row = 14; row <= 60; row++) {
    const name = t(pipeSheet, `B${row}`);
    if (!name) continue;
    const length = n(pipeSheet, `Q${row}`) || ['G', 'I', 'K', 'M', 'O'].reduce((sum, col) => sum + n(pipeSheet, `${col}${row}`), 0);
    const id = `lec-detailed-pipe-${row}`;
    // Keep technical descriptions separate; the product tab already owns the cost dimensioning.
    for (const [column, serviceId] of Object.entries({ R: 'limpeza_quimica', S: 'flushing_primario', T: 'teste_hidrostatico', U: 'passagem_pig' })) {
      if (marked(t(pipeSheet, `${column}${row}`))) circuitServices.push({ id: `${id}-${serviceId}`, systemId: id, serviceId });
    }
    volumeSystems.push({ id, name, material: /inox/i.test(t(pipeSheet, `C${row}`)) ? 'stainless_steel' : 'carbon_steel',
      manualVolumes: [{ id: `${id}-description`, description: `${name}${length ? ` — ${length} m` : ''}`, quantity: 1, volumeLiters: 0 }], enabled: true });
  }
  const logistics = [];
  for (let row = 11; row <= 19; row++) {
    const total = n(freightSheet, `H${row}`);
    const quantity = n(freightSheet, `F${row}`);
    if (quantity <= 0 && total <= 0) continue;
    const description = t(freightSheet, `B${row}`) || `Frete ${row}`;
    // The LEC stores round trips together. Split their cost evenly; the user can edit each direction.
    const combined = /mob|folga|frete/i.test(description);
    for (const direction of combined ? ['mobilization', 'demobilization'] : ['mobilization']) {
      const divisor = combined ? 2 : 1;
      logistics.push({ id: `lec-freight-${row}-${direction}`, destinationId: 'lec-site', slotType: 'additional',
        requiredSlot: false, direction, category: row <= 13 ? 'personnel' : 'equipment', description,
        calculationMode: 'legacy', calculationModeConfirmed: true, basis: 'fixed', quantity: quantity / divisor || 1,
        unitCost: total / (quantity || divisor), trips: 1, included: true });
    }
  }
  // The current editor requires one crew and one equipment slot in each direction.
  // Reuse the primary imported transport for each slot, leaving absent transports pending.
  for (const slot of defaultPayload.logistics) {
    const imported = logistics.find(item => !item.requiredSlot && item.direction === slot.direction &&
      (slot.slotType === 'crew' ? item.category === 'personnel' : item.category === 'equipment'));
    if (imported) {
      imported.slotType = slot.slotType;
      imported.requiredSlot = true;
      imported.returnSetup = 'custom';
      imported.autoSyncedFromMobilization = false;
    } else logistics.push({ ...slot, id: `lec-${slot.id}`, destinationId: 'lec-site',
      contextId: slot.slotType === 'crew' ? laborContexts[0]?.id : undefined,
      returnSetup: 'custom', autoSyncedFromMobilization: false });
  }
  warnings.add('Confira todas as seções antes de concluir. Custos e margens são recalculados pelas regras do app.');
  warnings.add('Despesas de fase e fretes foram importados pelos valores salvos no LEC; confira as quantidades e a divisão entre mobilização e desmobilização.');
  warnings.add('Produtos químicos usam a quantidade original em modo manual. Revise a dosagem se alterar os circuitos.');
  if (!circuitServices.length) warnings.add('O LEC não traz serviços técnicos associados aos circuitos. Anexe a proposta em PDF para complementar o escopo ou selecione os serviços no app.');
  const legacyImport = { fileName, fileHash: createHash('sha256').update(bytes).digest('hex'), pdfFileName: '',
    sourceRevisionNumber, sourceDate: workbook.date(proposalSheet, 'D9'),
    sourceEstimator: presentText(t(proposalSheet, 'B18')), sourceSeller: presentText(t(proposalSheet, 'J18')),
    sourceTotalCost: totalCost, sourceSalePrice: salePrice, warnings: [] };
  const payload = normalizeCostEstimatePayload({
    ...defaultPayload, title, proposalCode, legacyImport, laborContexts, materials, products, filters,
    volumeSystems, circuitServices, indirectCosts: [],
    assumptions: { ...defaultPayload.assumptions,
      taxPercent: percent(n('CUSTO.Impostos', 'D6')), overheadPercent: percent(n('CUSTO.Impostos', 'D9')),
      desiredMarginPercent: percent(n('CUSTO.TOTAL', 'T11') || n(proposalSheet, 'B53')),
      commissionPercent: percent(n('CUSTO.TOTAL', 'K5') + n('CUSTO.TOTAL', 'K6')),
      commercialPercent: percent(n('CUSTO.Impostos', 'D10')) },
    logisticsStructureVersion: 1, logistics,
    logisticsDestinations: [{ id: 'lec-site', nameSource: 'custom', name: site || 'Obra', address: site,
      oneWayDistanceKm: n(freightSheet, 'G6') || n(proposalSheet, 'J25') }],
    // Unspecified scope confirmations deliberately remain pending for user review.
    scopeConfirmations: {},
    effluent: { multiplier: 4, unitCostPerM3: n(productSheet, 'N20'), includeDisposalCost: n(productSheet, 'T20') > 0,
      clientResponsible: false },
    commercial: { ...defaultPayload.commercial, pricingMode: salePrice > 0 ? 'global' : 'calculated', globalValue: salePrice }
  });
  const cnpj = t(proposalSheet, 'L5').replace(/\D/g, '').padStart(14, '0');
  const textDays = (address, suffix) => `${n(proposalSheet, address)} ${suffix}`;
  const proposal = {
    title, client: presentText(t(proposalSheet, 'I9')), cnpj: cnpj === '00000000000000' ? '' : cnpj,
    contact: presentText(t(proposalSheet, 'D13')), email: presentText(t(proposalSheet, 'D15')),
    department: presentText(t(proposalSheet, 'J13')), site,
    attendance: textDays('B21', 'dias'), mobilization: textDays('L21', 'dias'),
    permanence: String(n(proposalSheet, 'F21')), execution: String(n(proposalSheet, 'H21')),
    integration: textDays('J21', 'dias'), validity: String(n(proposalSheet, 'D21')),
    payment: presentText(t(proposalSheet, 'C32')) || textoCondicoesPagamento({
      adiantamento: `${n(proposalSheet, 'H34')}%`, prazoPagamento: String(n(proposalSheet, 'H32')),
      formaPagamento: presentText(t(proposalSheet, 'C34')) }),
    overtimeRate: money(n(proposalSheet, 'C36')), standbyTeam: money(n(proposalSheet, 'H36')),
    standbyTeamQuantity: '1', standbyEquipment: money(n(proposalSheet, 'H38')),
    extraMobilization: money(n(proposalSheet, 'C38')),
    prices: [{ description: title, unit: 'VB', quantity: '1', unitValue: money(salePrice), value: money(salePrice) }],
    includeUnitValue: true, legacyImport
  };
  const result = calculateEstimate(payload);
  if (Math.abs(result.totalCost - totalCost) > 0.02) {
    warnings.add(`Custo do LEC: ${money(totalCost)}. Custo importado recalculado: ${money(result.totalCost)}. Confira a composição antes de concluir.`);
  }
  const declaredCost = n(proposalSheet, 'J46');
  if (declaredCost > 0 && Math.abs(declaredCost - totalCost) > 0.02) {
    warnings.add('O custo informado em GERAR PROPOSTA difere do total em CUSTO.TOTAL. A composição importada usa as abas de custos.');
  }
  legacyImport.warnings = [...warnings].slice(0, 100);
  payload.legacyImport = legacyImport;
  return { proposalCode, sourceRevisionNumber, suggestedRevisionNumber: sourceRevisionNumber + 1,
    payload, proposal, warnings: legacyImport.warnings };
}

export function lecPreview(parsed) {
  const result = calculateEstimate(parsed.payload);
  return { proposalCode: parsed.proposalCode, sourceRevisionNumber: parsed.sourceRevisionNumber,
    suggestedRevisionNumber: parsed.suggestedRevisionNumber, clientName: parsed.proposal.client,
    title: parsed.proposal.title, site: parsed.proposal.site, sourceSalePrice: parsed.payload.legacyImport.sourceSalePrice,
    sourceTotalCost: parsed.payload.legacyImport.sourceTotalCost, importedTotalCost: result.totalCost,
    laborAssignments: parsed.payload.laborContexts.reduce((sum, context) => sum + context.assignments.length, 0),
    materials: parsed.payload.materials.filter(item => item.included).length,
    products: parsed.payload.products.filter(item => item.included).length,
    filters: parsed.payload.filters.filter(item => item.included).length,
    logistics: parsed.payload.logistics.filter(item => item.included && item.unitCost > 0).length,
    scopeItems: parsed.proposal.scopeItems?.length ?? 0, pdfFileName: parsed.payload.legacyImport.pdfFileName,
    warnings: parsed.warnings };
}
