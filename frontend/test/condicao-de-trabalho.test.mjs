import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateEstimate, createDefaultCostEstimatePayload } from '../../shared/comercial/dist/cost-model.js';
import { trabalhoSomenteNaSede } from '../../shared/comercial/dist/work-location.js';

async function load(relativePath) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', define: { 'import.meta.env': '{}' }
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url), Intl });
  return module.exports;
}

const { ajustarLogisticaPelaCondicao } = await load('../src/pages/comercial/custos/condicaoDeTrabalho.ts');
const { DocumentoPrevia } = await load('../src/pages/comercial/proposta/DocumentoPrevia.tsx');
const { ComercialStep } = await load('../src/pages/comercial/proposta/steps/ComercialStep.tsx');
const { ConfirmacaoEscopo } = await load('../src/pages/comercial/custos/ConfirmacaoEscopo.tsx');
const { dadosDaProposta, snapshotDaPropostaSalva } = await load('../src/pages/comercial/proposta/salvamento.ts');

const fase = (workCondition, extra = {}) => ({ id: workCondition, workCondition,
  workConditionConfirmed: true, enabled: true, ...extra });

test('a sede só dispensa a logística quando todas as fases ativas foram confirmadas nesse local', () => {
  assert.equal(trabalhoSomenteNaSede({ laborContexts: [fase('headquarters')] }), true);
  assert.equal(trabalhoSomenteNaSede({ laborContexts: [fase('headquarters'), fase('travel', { enabled: false })] }), true);
  for (const laborContexts of [[], [fase('headquarters', { workConditionConfirmed: false })],
    [fase('headquarters'), fase('travel')], [fase('headquarters'), fase('offshore')],
    [fase('headquarters'), fase('', { workConditionConfirmed: false })]]) {
    assert.equal(trabalhoSomenteNaSede({ laborContexts }), false);
  }
  assert.equal(trabalhoSomenteNaSede({ laborContexts: [fase('headquarters')],
    scopeConfirmations: { noLabor: true } }), false);
});

test('selecionar sede zera a logística sem apagar itens e sair da sede restaura a cobrança', () => {
  const initial = createDefaultCostEstimatePayload();
  initial.scopeConfirmations.noLogistics = false;
  initial.logistics.push({ id: 'frete-teste', direction: 'mobilization', slotType: 'additional',
    description: 'Frete contratado', category: 'freight', calculationMode: 'legacy',
    calculationModeConfirmed: true, quantity: 1, unitCost: 1200, basis: 'fixed', included: true });
  const initialCost = calculateEstimate(initial).mobilizationCost;
  assert.ok(initialCost > 0);
  const atHeadquarters = ajustarLogisticaPelaCondicao(initial, {
    ...initial, laborContexts: initial.laborContexts.map(item => ({ ...item, ...fase('headquarters'), id: item.id }))
  });
  assert.equal(atHeadquarters.scopeConfirmations.noLogistics, true);
  assert.equal(atHeadquarters.logistics, initial.logistics);
  assert.equal(calculateEstimate(atHeadquarters).mobilizationCost, 0);
  assert.equal(calculateEstimate(atHeadquarters).demobilizationCost, 0);
  const traveling = ajustarLogisticaPelaCondicao(atHeadquarters, {
    ...atHeadquarters, laborContexts: atHeadquarters.laborContexts.map(item => ({ ...item, workCondition: 'travel' }))
  });
  assert.equal(traveling.scopeConfirmations.noLogistics, false);
  assert.equal(calculateEstimate(traveling).mobilizationCost, initialCost);
  const manual = { ...atHeadquarters, scopeConfirmations: { ...atHeadquarters.scopeConfirmations, noLogistics: false } };
  assert.equal(ajustarLogisticaPelaCondicao(atHeadquarters, manual), manual);
  assert.equal(ajustarLogisticaPelaCondicao(manual, { ...manual, title: 'Título editado' })
    .scopeConfirmations.noLogistics, false);
});

const content = { form: { workAtHeadquarters: true, overtimeRate: 'R$ 250,00' }, codigo: '99001',
  orcamentista: 'Teste', modelo: 'padrao', itensEscopo: [], blocos: [], categorias: [],
  responsabilidades: [], precos: [], incluirUnitario: false, servicosTecnicos: [], complementoRelatorios: '' };

test('salvamento e prévia preservam a condição da sede e renumeram as observações', () => {
  const saved = dadosDaProposta(content);
  const reopened = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) });
  assert.equal(reopened.workAtHeadquarters, true);
  const markup = renderToStaticMarkup(createElement(DocumentoPrevia, { ...content, form: reopened, tipo: 'commercial' }));
  assert.doesNotMatch(markup, /Condições de Stand by|Stand-by de Equipe|Desmobilização e Remobilização:/);
  assert.match(markup, /<b>9\.1<\/b>/);
  assert.match(markup, /<b>9\.2<\/b> No caso de prorrogação/);
  const pages = [...markup.matchAll(/aria-label="Página (\d+)"/g)].map(match => Number(match[1]));
  assert.ok(pages.every((number, i) => number === i + 2));
  const traveling = renderToStaticMarkup(createElement(DocumentoPrevia, {
    ...content, form: { ...reopened, workAtHeadquarters: false }, tipo: 'commercial'
  }));
  assert.match(traveling, /Condições de Stand by/);
  assert.match(traveling, /<b>9\.3<\/b> No caso de prorrogação/);
});

test('o formulário da proposta na sede mantém hora extra e omite campos de stand-by', () => {
  const markup = renderToStaticMarkup(createElement(ComercialStep, { form: content.form,
    editar() {}, precos: [], onPrecos() {}, incluirUnitario: false, onIncluirUnitario() {},
    erroDe() {}, mostrarErros: false, modelo: 'padrao' }));
  assert.match(markup, /Homem\/hora fora do horário previsto/);
  assert.doesNotMatch(markup, /Quantidade de colaboradores para stand-by|Stand-by de equipe \(diária|Stand-by de equipamentos \(diária|Mobilização extra \(por evento/);
});

test('a confirmação apresenta a escolha como campo acessível com descrição e erro associados', () => {
  const markup = renderToStaticMarkup(createElement(ConfirmacaoEscopo, {
    confirmado: false, rotulo: 'Não haverá mão de obra', descricao: 'Sem colaboradores.',
    descricaoConfirmada: 'Custo dispensado.', error: 'Preencha ou marque a dispensa.', onChange() {}
  }));
  assert.match(markup, /Não haverá mão de obra/);
  const inputId = markup.match(/<input id="([^"]+)"/)[1];
  assert.ok(markup.includes(`for="${inputId}"`));
  assert.match(markup, /aria-invalid="true"/);
  for (const id of markup.match(/aria-describedby="([^"]+)"/)[1].split(' ')) {
    assert.ok(markup.includes(`id="${id}"`));
  }
  assert.doesNotMatch(markup, /role="(?:alert|status)"|Revisão obrigatória|Confirmo que/);
});
