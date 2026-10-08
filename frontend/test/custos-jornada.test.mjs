import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateEstimate, createDefaultCostEstimatePayload, normalizeCostEstimatePayload }
  from '../../shared/comercial/dist/cost-model.js';

async function load(relativePath) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), Intl
  });
  return module.exports;
}

const { jornadaDaAlocacao, atualizarDiaDaJornada, sincronizarDiasTrabalhadosDoLevantamento } =
  await load('../src/pages/comercial/custos/jornadas.ts');
const { JornadaCard } = await load('../src/pages/comercial/custos/sections/JornadaCard.tsx');
const { FaseCard } = await load('../src/pages/comercial/custos/sections/FaseCard.tsx');
const { AlocacoesTabela } = await load('../src/pages/comercial/custos/sections/AlocacoesTabela.tsx');

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node?.props) return [];
  return [node, ...elements(node.props.children)];
}

function estimate() {
  const draft = createDefaultCostEstimatePayload();
  Object.assign(draft.laborContexts[0], { durationDays: 17, workingDays: 22, integrationDays: 5, hoursPerDay: 8 });
  return draft;
}

test('o cargo novo recebe os dias calculados da fase e o campo individual continua editável', () => {
  let draft = sincronizarDiasTrabalhadosDoLevantamento(estimate());
  let fase = draft.laborContexts[0];
  const table = AlocacoesTabela({ fase, levantamento: {
    resultadoDaFase: () => ({}), erroDe() {}, erroSe() {},
    addNested: (_collection, _id, _nested, item) => { fase.assignments.push(item); }
  } });
  elements(table).find(node => node.type === 'button' && String(node.props.children).includes('Adicionar cargo'))
    .props.onClick();
  const alocacao = fase.assignments.at(-1);
  assert.equal(jornadaDaAlocacao(alocacao, fase).days[0].days, 8);
  const card = JornadaCard({ alocacao, fase, calculado: {}, erroSe() {}, erroDe() {},
    onEditar: patch => Object.assign(alocacao, patch), onAplicarATodaEquipe() {} });
  const field = elements(card).find(node => node.props.label === 'Dias trabalhados');
  assert.equal(field.props.value, 8);
  assert.ok(!field.props.disabled && !field.props.readOnly);
  field.props.onChange(9);
  assert.equal(alocacao.workSchedule.days[0].daysMode, 'manual');
  draft = sincronizarDiasTrabalhadosDoLevantamento({ ...draft,
    laborContexts: [{ ...fase, durationDays: 20 }] });
  fase = draft.laborContexts[0];
  assert.equal(jornadaDaAlocacao(fase.assignments[0], fase).days[0].days, 10);
  assert.equal(jornadaDaAlocacao(fase.assignments.at(-1), fase).days[0].days, 9);
  const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(draft)));
  assert.equal(jornadaDaAlocacao(reopened.laborContexts[0].assignments.at(-1), reopened.laborContexts[0]).days[0].days, 9);
  assert.equal(calculateEstimate(reopened).contextResults[0].assignments.at(-1).normalHours, 72);
});

test('editar horas não congela os dias automáticos e alterar dias preserva a exceção individual', () => {
  const draft = estimate();
  const fase = draft.laborContexts[0];
  const alocacao = fase.assignments[0];
  alocacao.workSchedule = atualizarDiaDaJornada(jornadaDaAlocacao(alocacao, fase), 'weekday', { normalHoursPerDay: 6 });
  const updated = sincronizarDiasTrabalhadosDoLevantamento({ ...draft, laborContexts: [{ ...fase, durationDays: 11 }] });
  assert.equal(updated.laborContexts[0].assignments[0].workSchedule.days[0].days, 4);
  assert.equal(updated.laborContexts[0].assignments[0].workSchedule.days[0].normalHoursPerDay, 6);
  assert.equal(sincronizarDiasTrabalhadosDoLevantamento(updated), updated);
});

test('a jornada da fase apresenta a integração junto aos dias corridos e aos cargos', () => {
  const draft = sincronizarDiasTrabalhadosDoLevantamento(estimate());
  const markup = renderToStaticMarkup(createElement(FaseCard, { fase: draft.laborContexts[0], indice: 0, total: 1,
    levantamento: { draft, resultadoDaFase: () => ({}), erroDe() {}, erroSe() {} } }));
  const id = markup.match(/<label for="([^"]+)">Dias de integração/)[1];
  assert.match(markup.match(new RegExp(`<input id="${id}"[^>]*>`))[0], /value="5"/);
  const worked = markup.match(/<label for="([^"]+)">Dias trabalhados/)[1];
  const input = markup.match(new RegExp(`<input id="${worked}"[^>]*>`))[0];
  assert.match(input, /value="8"/);
  assert.doesNotMatch(input, /readonly|disabled/i);
  assert.match(markup, /Prazo total da fase, incluindo a integração/);
});

test('fases antigas com 22 dias passam ao cálculo automático e jornadas individuais antigas são preservadas', () => {
  const draft = estimate();
  delete draft.laborContexts[0].workingDaysMode;
  delete draft.laborContexts[0].integrationDays;
  draft.laborContexts[0].assignments[0].workSchedule = { name: 'Jornada anterior', targetType: 'role', days: [{
    dayType: 'weekday', days: 8, normalHoursPerDay: 8, extraHoursPerDay: 0, overtimePercent: 70
  }] };
  const updated = sincronizarDiasTrabalhadosDoLevantamento(draft);
  assert.equal(updated.laborContexts[0].workingDays, 13);
  assert.equal(updated.laborContexts[0].integrationDays, 0);
  assert.equal(jornadaDaAlocacao(updated.laborContexts[0].assignments[0], updated.laborContexts[0]).days[0].days, 8);
  const imported = sincronizarDiasTrabalhadosDoLevantamento({ ...draft, legacyImport: { fileName: 'LEC.xlsm' } });
  assert.equal(imported.laborContexts[0].workingDays, 22);
  assert.equal(imported.laborContexts[0].workingDaysMode, 'manual');
});

test('dias corridos e integração recalculam a equipe em qualquer ordem de preenchimento', () => {
  for (const campos of [
    [{ durationDays: 17 }, { integrationDays: 5 }],
    [{ integrationDays: 5 }, { durationDays: 17 }]
  ]) {
    let draft = createDefaultCostEstimatePayload();
    let fase = draft.laborContexts[0];
    fase.hoursPerDay = 8;
    fase.assignments.push({ ...fase.assignments[0], id: 'auxiliar', quantity: 2 });
    fase.assignments[0].workSchedule = atualizarDiaDaJornada(jornadaDaAlocacao(fase.assignments[0], fase),
      'weekday', { normalHoursPerDay: 6 });
    for (const patch of [...campos, { integrationDays: 2 }, { durationDays: 7 },
      { integrationDays: 0 }, { integrationDays: 5 }, { integrationDays: '' }]) {
      const anterior = draft;
      const snapshot = JSON.stringify(anterior);
      draft = sincronizarDiasTrabalhadosDoLevantamento({ ...draft,
        laborContexts: [{ ...draft.laborContexts[0], ...patch }] });
      fase = draft.laborContexts[0];
      const weekdays = Array.from({ length: fase.durationDays }, (_, day) => day % 7 < 5).filter(Boolean).length;
      const expected = weekdays - Number(fase.integrationDays);
      assert.equal(fase.workingDays, expected);
      for (const alocacao of fase.assignments) {
        assert.equal(jornadaDaAlocacao(alocacao, fase).days[0].days, expected);
      }
      assert.equal(JSON.stringify(anterior), snapshot);
      assert.equal(sincronizarDiasTrabalhadosDoLevantamento(draft), draft);
      const reopened = normalizeCostEstimatePayload(JSON.parse(JSON.stringify(draft)));
      const result = calculateEstimate(reopened).contextResults[0];
      assert.equal(result.workingDays, expected);
      assert.deepEqual(result.assignments.map(item => item.normalHours), [expected * 6, expected * 16]);
    }
  }
});

test('dias manuais podem voltar ao cálculo da fase e passam a descontar a integração', () => {
  const draft = estimate();
  const fase = draft.laborContexts[0];
  const alocacao = fase.assignments[0];
  alocacao.workSchedule = atualizarDiaDaJornada(jornadaDaAlocacao(alocacao, fase), 'weekday', { days: 5 });
  const card = JornadaCard({ alocacao, fase, calculado: {}, erroSe() {}, erroDe() {},
    onEditar: patch => Object.assign(alocacao, patch), onAplicarATodaEquipe() {} });
  elements(card).find(node => node.type === 'button' && node.props.children === 'Usar dias calculados da fase')
    .props.onClick();
  assert.equal(alocacao.workSchedule.days[0].daysMode, 'automatic');
  const updated = sincronizarDiasTrabalhadosDoLevantamento(draft);
  assert.equal(updated.laborContexts[0].assignments[0].workSchedule.days[0].days, 8);
  const semIntegracao = sincronizarDiasTrabalhadosDoLevantamento({ ...updated,
    laborContexts: [{ ...updated.laborContexts[0], integrationDays: 0 }] });
  assert.equal(semIntegracao.laborContexts[0].assignments[0].workSchedule.days[0].days, 13);
});
