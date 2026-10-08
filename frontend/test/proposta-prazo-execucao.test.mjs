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
    const value = days === 1 ? '1 dia trabalhado' : `${days} dias trabalhados`;
    assert.equal(prazoDeExecucao(index + 1), value);
    assert.equal(prazoDeExecucao(`${index + 1} dias corridos`), value);
  });
  assert.equal(prazoDeExecucao('  12 DIAS CORRIDOS  '), '10 dias trabalhados');
  assert.equal(prazoDeExecucao('1 dia'), '1 dia trabalhado');
  assert.equal(prazoDeExecucao(365), '261 dias trabalhados');
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
  const step = PrazosStep({ form, editar: patch => { form = { ...form, ...patch }; }, erroDe: () => undefined });
  const fields = step.props.children[1].props.children;
  fields.find(field => field.key === 'permanence').props.onChange('8 dias corridos');
  assert.equal(form.permanence, '8 dias corridos');
  assert.equal(form.execution, '6 dias trabalhados');
  assert.equal(form.integration, '1 dia');

  const saved = dadosDaProposta({ form, codigo: '1001', modelo: 'padrao', orcamentista: 'Teste',
    itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [],
    incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' });
  assert.equal(saved.execution, '6 dias trabalhados');
  const reopened = atualizarPrazoDeExecucao(snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) }));
  assert.equal(reopened.execution, saved.execution);
  assert.equal(atualizarPrazoDeExecucao(reopened), reopened);
  assert.equal(atualizarPrazoDeExecucao({ ...reopened, permanence: '14 dias corridos' }).execution, '10 dias trabalhados');

  const markup = renderToStaticMarkup(createElement(PrazosStep, { form: reopened, editar() {}, erroDe() {} }));
  const label = markup.match(/<label for="([^"]+)">Prazo efetivo de execução/);
  const input = markup.match(new RegExp(`<input id="${label[1]}"[^>]*>`))[0];
  assert.match(input, /readonly=""/i);
  assert.match(input, /value="6 dias trabalhados"/);
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
    assert.equal(form.execution, calcularPrazo ? '10 dias trabalhados' : snapshot.execution);
    assert.equal(form.seller, snapshot.seller);
    assert.equal(form.integration, '1 dia');
    assert.equal(snapshot.execution, '20 dias trabalhados');
  }
});

test('proposta importa dias corridos e recalcula a execução quando o levantamento é alterado', () => {
  const levantamento = { payload: { laborContexts: [{ enabled: true, durationDays: 12,
    workingDays: 22, startOffsetDays: 0 }] } };
  const original = { permanence: '99 dias corridos', execution: '99 dias trabalhados', integration: '1 dia' };
  const imported = sincronizarPrazosDoLevantamento(original, levantamento);
  assert.equal(imported.permanence, '12 dias corridos');
  assert.equal(imported.execution, '10 dias trabalhados');
  assert.equal(imported.integration, '1 dia');
  assert.equal(original.permanence, '99 dias corridos');
  assert.equal(sincronizarPrazosDoLevantamento(imported, levantamento), imported);

  levantamento.payload.laborContexts[0].durationDays = 8;
  const updated = sincronizarPrazosDoLevantamento(imported, levantamento);
  assert.equal(updated.permanence, '8 dias corridos');
  assert.equal(updated.execution, '6 dias trabalhados');
  const markup = renderToStaticMarkup(createElement(PrazosStep, { form: updated, editar() {}, erroDe() {},
    permanenciaDoLevantamento: true }));
  for (const label of ['Permanência prevista em obra', 'Prazo efetivo de execução']) {
    const id = markup.match(new RegExp(`<label for="([^"]+)">${label}`))[1];
    assert.match(markup.match(new RegExp(`<input id="${id}"[^>]*>`))[0], /readonly=""/i);
  }
  assert.match(markup, /edite o levantamento vinculado/);
});

test('prazo de múltiplas fases respeita simultaneidade, intervalos e fases desativadas', () => {
  const prazo = laborContexts => prazosDoLevantamento({ payload: { laborContexts } });
  const fase = (startOffsetDays, durationDays, enabled = true) => ({ startOffsetDays, durationDays, enabled });
  assert.equal(prazo([fase(0, 7), fase(0, 8)]).permanence, '8 dias corridos');
  assert.equal(prazo([fase(0, 7), fase(7, 7)]).execution, '10 dias trabalhados');
  assert.equal(prazo([fase(10, 7), fase(17, 7)]).permanence, '14 dias corridos');
  assert.equal(prazo([fase(0, 5), fase(7, 5)]).permanence, '12 dias corridos');
  assert.equal(prazo([fase(0, 12), fase(100, 100, false)]).execution, '10 dias trabalhados');
  assert.equal(prazo([fase(0, 1)]).permanence, '1 dia corrido');
  assert.equal(prazo([fase(0, 1)]).execution, '1 dia trabalhado');
});

test('levantamento sem duração válida não inventa prazo nem bloqueia proposta avulsa', () => {
  for (const payload of [undefined, {}, { laborContexts: [] },
    { noLabor: true, laborContexts: [{ durationDays: 30 }] },
    { laborContexts: [{ durationDays: 30, enabled: false }] },
    { laborContexts: [null, {}, { durationDays: 0 }, { durationDays: -1 },
      { durationDays: 1.5 }, { durationDays: 12, startOffsetDays: NaN }] }]) {
    assert.equal(prazosDoLevantamento({ payload }), null);
    const form = sincronizarPrazosDoLevantamento({ permanence: '7 dias corridos', execution: '' }, { payload });
    assert.equal(form.permanence, '7 dias corridos');
    assert.equal(form.execution, '5 dias trabalhados');
  }
});
