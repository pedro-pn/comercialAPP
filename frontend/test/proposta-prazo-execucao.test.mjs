import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(relativePath) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', define: { 'import.meta.env': '{}' }
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), Intl, URLSearchParams
  });
  return module.exports;
}

const { prazoDeExecucao, atualizarPrazoDeExecucao } = await load('../src/pages/comercial/proposta/prazoExecucao.ts');
const { PrazosStep } = await load('../src/pages/comercial/proposta/steps/PrazosStep.tsx');
const { dadosDaProposta, snapshotDaPropostaSalva } = await load('../src/pages/comercial/proposta/salvamento.ts');
const { usePropostaRevision } = await load('../src/pages/comercial/proposta/usePropostaRevision.ts');
const { prazosDoLevantamento, sincronizarPrazosDoLevantamento } = await load('../src/pages/comercial/proposta/levantamentoVinculado.ts');

test('prazo de execução conta dias úteis a partir de segunda, inclusive fins de semana sucessivos', () => {
  const expected = [1, 2, 3, 4, 5, 5, 5, 6, 7, 8, 9, 10, 10, 10, 11, 12, 13, 14, 15, 15, 15,
    16, 17, 18, 19, 20, 20, 20, 21, 22];
  expected.forEach((days, index) => {
    const value = String(days);
    assert.equal(prazoDeExecucao(index + 1), value);
    assert.equal(prazoDeExecucao(`${index + 1} dias corridos`), value);
  });
  assert.equal(prazoDeExecucao('  12 DIAS CORRIDOS  '), '10');
  assert.equal(prazoDeExecucao('1 dia'), '1');
  assert.equal(prazoDeExecucao(365), '261');
});

test('apagar a permanência ou informar um prazo sem quantidade limpa a execução anterior', () => {
  for (const permanence of ['', ' ', null, undefined, 0, -1, '1.5', '12 a 14 dias',
    'conforme parada', NaN, Infinity, '9007199254740992']) {
    assert.equal(prazoDeExecucao(permanence), '');
    assert.equal(atualizarPrazoDeExecucao({ permanence, execution: '10 dias trabalhados' }).execution, '');
  }
});

test('editar a permanência preenche o campo de execução e persiste o mesmo prazo para os documentos', () => {
  let form = { permanence: '12 dias corridos', execution: '99 dias trabalhados', integration: '1 dia' };
  form = atualizarPrazoDeExecucao(form);
  assert.equal(form.permanence, '12');
  assert.equal(form.execution, '10');
  const step = PrazosStep({ form, editar: patch => { form = { ...form, ...patch }; }, erroDe: () => undefined });
  const fields = step.props.children[1].props.children;
  fields.find(field => field.key === 'permanence').props.onChange('8 dias corridos');
  assert.equal(form.permanence, '8');
  assert.equal(form.execution, '6');
  assert.equal(form.integration, '1 dia');

  const saved = dadosDaProposta({ form, codigo: '1001', modelo: 'padrao', orcamentista: 'Teste',
    itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [],
    incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' });
  assert.equal(saved.permanence, '8');
  assert.equal(saved.execution, '6');
  const reopened = atualizarPrazoDeExecucao(snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) }));
  assert.equal(reopened.execution, saved.execution);
  assert.equal(atualizarPrazoDeExecucao(reopened), reopened);
  assert.equal(atualizarPrazoDeExecucao({ ...reopened, permanence: '14 dias corridos' }).execution, '10');

  const markup = renderToStaticMarkup(createElement(PrazosStep, { form: reopened, editar() {}, erroDe() {} }));
  const label = markup.match(/<label for="([^"]+)">Prazo efetivo de execução/);
  const input = markup.match(new RegExp(`<input id="${label[1]}"[^>]*>`))[0];
  assert.match(input, /readonly=""/i);
  assert.match(input, /value="6"/);
  assert.doesNotMatch(input, /disabled/);
  assert.match(markup, /considerando início na segunda-feira/);

  fields.find(field => field.key === 'permanence').props.onChange('');
  assert.equal(form.execution, '');
});

test('pendência de execução orienta o preenchimento da permanência, que continua editável', () => {
  const step = PrazosStep({ form: { permanence: 'conforme parada', execution: '' }, editar() {},
    erroDe: campo => campo === 'execution' ? 'Informe o prazo efetivo de execução.' : undefined });
  const fields = step.props.children[1].props.children;
  const permanence = fields.find(field => field.key === 'permanence');
  assert.match(permanence.props.error, /quantidade de dias corridos/);
  assert.equal(permanence.props.readOnly, false);
  assert.equal(fields.find(field => field.key === 'execution').props.error, undefined);
});

test('hidratação recalcula rascunhos e revisões e preserva o prazo dos documentos já emitidos', () => {
  const snapshot = { permanence: '12 dias corridos', execution: '20 dias trabalhados', seller: 'consultor' };
  for (const calcularPrazo of [true, false]) {
    let form;
    const noop = () => {};
    function Probe() {
      const { aplicarSnapshot } = usePropostaRevision({ modo: 'new', codigo: '1001', revisionNumber: 0,
        propostaId: 'proposta', params: new URLSearchParams(), setParams: noop,
        formularioInicial: () => ({ integration: '1 dia' }), setForm: value => { form = value; },
        setItensEscopo: noop, setBlocos: noop, setResponsabilidades: noop, setCategorias: noop,
        setServicosTecnicos: noop, setComplementoRelatorios: noop, setPrecos: noop,
        setIncluirUnitario: noop, setTentouAvancar: noop, setRecado: noop });
      aplicarSnapshot(snapshot, '', calcularPrazo);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    assert.equal(form.permanence, calcularPrazo ? '12' : snapshot.permanence);
    assert.equal(form.execution, calcularPrazo ? '10' : snapshot.execution);
    assert.equal(form.seller, snapshot.seller);
    assert.equal(form.integration, '1 dia');
    assert.equal(snapshot.execution, '20 dias trabalhados');
    const step = PrazosStep({ form, editar: noop, erroDe: noop });
    const fields = step.props.children[1].props.children;
    assert.equal(fields.find(field => field.key === 'permanence').props.value, '12');
    assert.equal(fields.find(field => field.key === 'execution').props.value, calcularPrazo ? '10' : '20');
    const saved = dadosDaProposta({ form, codigo: '1001', modelo: 'padrao', orcamentista: 'Teste',
      itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [],
      incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' });
    assert.equal(saved.permanence, '12');
    assert.equal(saved.execution, calcularPrazo ? '10' : '20');
  }
});

test('proposta importa dias corridos e recalcula a execução quando o levantamento é alterado', () => {
  const levantamento = { payload: { laborContexts: [{ enabled: true, durationDays: 12,
    workingDays: 22, startOffsetDays: 0 }] } };
  const original = { permanence: '99 dias corridos', execution: '99 dias trabalhados', integration: '1 dia' };
  const imported = sincronizarPrazosDoLevantamento(original, levantamento);
  assert.equal(imported.permanence, '12');
  assert.equal(imported.execution, '10');
  assert.equal(imported.integration, '1 dia');
  assert.equal(original.permanence, '99 dias corridos');
  assert.equal(sincronizarPrazosDoLevantamento(imported, levantamento), imported);

  levantamento.payload.laborContexts[0].durationDays = 8;
  const updated = sincronizarPrazosDoLevantamento(imported, levantamento);
  assert.equal(updated.permanence, '8');
  assert.equal(updated.execution, '6');
  const markup = renderToStaticMarkup(createElement(PrazosStep, { form: updated, editar() {}, erroDe() {},
    permanenciaDoLevantamento: true }));
  for (const [label, value] of [['Permanência prevista em obra', '8'], ['Prazo efetivo de execução', '6']]) {
    const id = markup.match(new RegExp(`<label for="([^"]+)">${label}`))[1];
    const input = markup.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    assert.match(input, /readonly=""/i);
    assert.match(input, new RegExp(`value="${value}"`));
    assert.match(input, /inputMode="numeric"/);
  }
  assert.match(markup, /edite o levantamento vinculado/);
});

test('prazo de múltiplas fases respeita simultaneidade, intervalos e fases desativadas', () => {
  const prazo = laborContexts => prazosDoLevantamento({ payload: { laborContexts } });
  const fase = (startOffsetDays, durationDays, enabled = true) => ({ startOffsetDays, durationDays, enabled });
  assert.equal(prazo([fase(0, 7), fase(0, 8)]).permanence, '8');
  assert.equal(prazo([fase(0, 7), fase(7, 7)]).execution, '10');
  assert.equal(prazo([fase(10, 7), fase(17, 7)]).permanence, '14');
  assert.equal(prazo([fase(0, 5), fase(7, 5)]).permanence, '12');
  assert.equal(prazo([fase(0, 12), fase(100, 100, false)]).execution, '10');
  assert.equal(prazo([fase(0, 1)]).permanence, '1');
  assert.equal(prazo([fase(0, 1)]).execution, '1');
});

test('levantamento sem duração válida não inventa prazo nem bloqueia proposta avulsa', () => {
  for (const payload of [undefined, {}, { laborContexts: [] },
    { noLabor: true, laborContexts: [{ durationDays: 30 }] },
    { laborContexts: [{ durationDays: 30, enabled: false }] },
    { laborContexts: [null, {}, { durationDays: 0 }, { durationDays: -1 },
      { durationDays: 1.5 }, { durationDays: 12, startOffsetDays: NaN }] }]) {
    assert.equal(prazosDoLevantamento({ payload }), null);
    const form = sincronizarPrazosDoLevantamento({ permanence: '7 dias corridos', execution: '' }, { payload });
    assert.equal(form.permanence, '7');
    assert.equal(form.execution, '5');
  }
});

test('integração não altera os dias corridos ou trabalhados da proposta', () => {
  for (const [permanence, integration, execution, total] of [
    ['10', '5', '8', '10'],
    ['10', '5 dias', '8', '10'],
    ['5', '1 dia', '5', '5'],
    ['10', '2', '8', '10'],
    ['10', '7', '8', '10'],
    ['10', '8', '8', '10'],
    ['7', '1', '5', '7'],
    ['17', '5', '13', '17'],
    ['10', '0', '8', '10'],
    ['10', '', '8', '10']
  ]) {
    const original = { permanence, integration };
    const form = atualizarPrazoDeExecucao(original);
    assert.equal(form.execution, execution);
    assert.equal(form.permanence, total);
    assert.equal(original.permanence, permanence);
    assert.equal(atualizarPrazoDeExecucao(form), form);
  }
});

test('alterar, zerar e apagar a integração preserva a permanência e a execução', () => {
  let form = atualizarPrazoDeExecucao({ permanence: '10', integration: '5' });
  for (const [integration, execution, permanence] of [
    ['2', '8', '10'], ['8', '8', '10'], ['0', '8', '10'], ['5', '8', '10'], ['', '8', '10']
  ]) {
    form = atualizarPrazoDeExecucao({ ...form, integration });
    assert.equal(form.execution, execution);
    assert.equal(form.permanence, permanence);
    assert.equal(atualizarPrazoDeExecucao(form), form);
  }
  for (const permanence of ['6', '7', '13', '14']) {
    const integrado = atualizarPrazoDeExecucao({ permanence, integration: '5' });
    const semIntegracao = atualizarPrazoDeExecucao({ ...integrado, integration: '0' });
    assert.equal(semIntegracao.permanence, permanence);
    assert.equal(semIntegracao.execution, prazoDeExecucao(permanence));
  }
});

test('integração acompanha o levantamento sem ser aplicada novamente a cada edição ou carregamento', () => {
  const levantamento = { payload: { laborContexts: [{ durationDays: 10 }] } };
  let form = sincronizarPrazosDoLevantamento({ integration: '0' }, levantamento);
  let step = PrazosStep({ form, permanenciaDoLevantamento: true, erroDe() {},
    editar: patch => { form = sincronizarPrazosDoLevantamento({ ...form, ...patch }, levantamento); } });
  step.props.children[1].props.children.find(field => field.key === 'integration').props.onChange('5');
  assert.equal(form.permanence, '10');
  assert.equal(form.execution, '8');
  assert.equal(sincronizarPrazosDoLevantamento(form, levantamento), form);
  form = sincronizarPrazosDoLevantamento({ ...form, attendance: 'Imediato' }, levantamento);
  assert.equal(form.permanence, '10');
  assert.equal(form.execution, '8');

  const saved = dadosDaProposta({ form, codigo: '1001', modelo: 'padrao', orcamentista: 'Teste',
    itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [],
    incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' });
  const snapshot = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) });
  const reopened = atualizarPrazoDeExecucao(snapshot);
  assert.equal(reopened.permanence, '10');
  assert.equal(reopened.execution, '8');
  assert.equal(sincronizarPrazosDoLevantamento(reopened, levantamento), reopened);
  levantamento.payload.laborContexts[0].durationDays = 12;
  form = sincronizarPrazosDoLevantamento(reopened, levantamento);
  assert.equal(form.permanence, '12');
  assert.equal(form.execution, '10');
  assert.equal(form.integration, '5');
});

test('permanência avulsa continua editável e preserva a integração nas próximas alterações', () => {
  let form = atualizarPrazoDeExecucao({ permanence: '10', integration: '5' });
  const step = PrazosStep({ form, erroDe() {},
    editar: patch => { form = atualizarPrazoDeExecucao({ ...form, ...patch }); } });
  step.props.children[1].props.children.find(field => field.key === 'permanence').props.onChange('18');
  assert.equal(form.permanence, '18');
  assert.equal(form.execution, '14');
  form = atualizarPrazoDeExecucao({ ...form, integration: '6' });
  assert.equal(form.permanence, '18');
  assert.equal(form.execution, '14');
  form = atualizarPrazoDeExecucao({ ...form, integration: '0' });
  assert.equal(form.permanence, '18');
  assert.equal(form.execution, '14');
});

test('integração inválida não modifica os prazos e pode ser corrigida sem duplicar dias', () => {
  const original = atualizarPrazoDeExecucao({ permanence: '10', integration: '5' });
  for (const integration of ['-1', '1.5', 'conforme liberação', NaN, Infinity, '9007199254740992']) {
    const invalid = atualizarPrazoDeExecucao({ ...original, integration });
    assert.equal(invalid.execution, '8');
    assert.equal(invalid.permanence, '10');
    const corrected = atualizarPrazoDeExecucao({ ...invalid, integration: '5' });
    assert.equal(corrected.execution, '8');
    assert.equal(corrected.permanence, '10');
  }
});

test('a proposta importa 17 dias corridos e 13 trabalhados sem somar ou descontar os 5 de integração', () => {
  const levantamento = { payload: { laborContexts: [{ durationDays: 17, integrationDays: 5 }] } };
  const form = sincronizarPrazosDoLevantamento({ permanence: '10', execution: '8', integration: '99' }, levantamento);
  assert.equal(form.permanence, '17');
  assert.equal(form.integration, '5');
  assert.equal(form.execution, '13');
  assert.equal(sincronizarPrazosDoLevantamento(form, levantamento), form);
  assert.equal(atualizarPrazoDeExecucao(form), form);
  const saved = dadosDaProposta({ form, codigo: '1001', modelo: 'padrao', orcamentista: 'Teste',
    itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [],
    incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' });
  const reopened = atualizarPrazoDeExecucao(snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) }));
  assert.equal(reopened.permanence, '17');
  assert.equal(reopened.integration, '5');
  assert.equal(reopened.execution, '13');
  const markup = renderToStaticMarkup(createElement(PrazosStep, { form: reopened, editar() {}, erroDe() {},
    permanenciaDoLevantamento: true, integracaoDoLevantamento: true }));
  const id = markup.match(/<label for="([^"]+)">Prazo previsto para integração/)[1];
  assert.match(markup.match(new RegExp(`<input id="${id}"[^>]*>`))[0], /readonly=""/i);
  assert.match(markup, /edite as fases de mão de obra/);
  levantamento.payload.laborContexts[0].durationDays = 20;
  levantamento.payload.laborContexts[0].integrationDays = 2;
  const updated = sincronizarPrazosDoLevantamento(reopened, levantamento);
  assert.equal(updated.permanence, '20');
  assert.equal(updated.integration, '2');
  assert.equal(updated.execution, '15');
});

test('a integração das fases é consolidada sem duplicar períodos simultâneos nem considerar fases desativadas', () => {
  const fase = (startOffsetDays, durationDays, integrationDays, enabled = true) => ({
    startOffsetDays, durationDays, integrationDays, enabled
  });
  const prazo = laborContexts => prazosDoLevantamento({ payload: { laborContexts } });
  assert.equal(prazo([fase(0, 10, 3), fase(0, 17, 5)]).integration, '5');
  assert.equal(prazo([fase(0, 5, 3), fase(0, 5, 3)]).integration, '3');
  assert.equal(prazo([fase(0, 5, 3), fase(1, 5, 3)]).integration, '4');
  assert.equal(prazo([fase(0, 10, 5), fase(10, 7, 2)]).integration, '7');
  assert.equal(prazo([fase(10, 10, 5), fase(20, 7, 2)]).integration, '7');
  assert.equal(prazo([fase(0, 17, 5), fase(17, 100, 30, false)]).integration, '5');
  assert.equal(prazo([fase(0, 17, 0)]).integration, '0');
  assert.equal(prazo([fase(0, 17, 11)]).integration, '11');
  assert.equal(prazo([fase(0, 17, 11)]).execution, '13');
  assert.equal(prazo([fase(0, 17, 13)]).integration, '13');
  assert.equal(prazo([fase(0, 17, 13)]).execution, '13');
  assert.equal(prazo([fase(0, 17, 14)]).integration, '14');
  assert.equal(prazo([fase(0, 17, 14)]).execution, '13');
  assert.equal(prazo([fase(0, 17, -1)]).integration, '');
  assert.equal(prazo([fase(0, 17, -1)]).execution, '13');
  assert.equal(prazosDoLevantamento({ payload: { scopeConfirmations: { noLabor: true },
    laborContexts: [fase(0, 17, 5)] } }), null);
});

test('rascunhos das PRs anteriores passam à nova fórmula e atualizam os prazos em qualquer ordem', () => {
  for (const patches of [
    [{ durationDays: 17 }, { integrationDays: 5 }],
    [{ integrationDays: 5 }, { durationDays: 17 }]
  ]) {
    const fase = { durationDays: 7, integrationDays: 0 };
    const levantamento = { payload: { laborContexts: [fase] } };
    let form = { permanence: '7', execution: '5', integration: '0',
      permanenceBase: '7', integrationDaysApplied: 0, integrationIncludedInPermanence: true };
    for (const patch of [...patches, { integrationDays: 0 }, { integrationDays: 5 }]) {
      Object.assign(fase, patch);
      form = sincronizarPrazosDoLevantamento(form, levantamento);
      const weekdays = Array.from({ length: fase.durationDays }, (_, day) => day % 7 < 5).filter(Boolean).length;
      const expected = weekdays;
      assert.equal(form.execution, String(expected));
      assert.equal(form.executionFromEstimate, true);
      assert.equal(form.integrationIncludedInPermanence, true);
      assert.equal(atualizarPrazoDeExecucao(form), form);
      assert.equal(sincronizarPrazosDoLevantamento(form, levantamento), form);
      const reopened = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(form)) });
      assert.equal(atualizarPrazoDeExecucao(reopened).execution, String(expected));
      form = reopened;
    }
    assert.equal(form.execution, '13');
  }
});

test('reabrir proposta salva com a fórmula anterior recalcula a execução sem alterar os dias corridos', () => {
  const previous = { permanence: '17', execution: '6', integration: '5',
    permanenceBase: '17', integrationDaysApplied: 0, integrationIncludedInPermanence: true,
    executionFromEstimate: true };
  const reopened = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(previous)) });
  const updated = atualizarPrazoDeExecucao(reopened);
  assert.equal(updated.permanence, '17');
  assert.equal(updated.integration, '5');
  assert.equal(updated.execution, '13');
  assert.equal(atualizarPrazoDeExecucao(updated), updated);
});
