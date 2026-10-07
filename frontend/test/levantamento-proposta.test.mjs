import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/comercial/proposta/levantamentoVinculado.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external'
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, {
  module, exports: module.exports, require: createRequire(import.meta.url), URLSearchParams, Intl
});
const { parametrosDaPropostaComLevantamento, itemDePrecoDoLevantamento,
  sincronizarPrecosDoLevantamento } = module.exports;
const estimate = { id: 'custos-4634', proposalCode: '4634', revisionNumber: 0,
  title: 'Serviço', salePrice: '143146.07' };

test('retorno dos custos continua a proposta existente, inclusive revisão e falha de integração', () => {
  for (const revisionNumber of [0, 2]) {
    for (const status of ['RASCUNHO', 'FINALIZADA', 'FALHA_INTEGRACAO']) {
      const params = parametrosDaPropostaComLevantamento({ ...estimate, revisionNumber,
        propostaVinculada: { id: 'proposta-existente', proposalCode: '4634', revisionNumber, status } });
      assert.equal(params.get('id'), 'proposta-existente');
      assert.equal(params.get('proposta'), '4634');
      assert.equal(params.get('revisao'), String(revisionNumber));
      assert.equal(params.get('levantamento'), estimate.id);
      assert.equal(params.get('usarLevantamento'), '1');
      assert.equal(params.get('etapa'), status === 'FALHA_INTEGRACAO' ? 'revisao' : 'cliente');
    }
  }
});

test('novo levantamento e revisão diferente começam sem reaproveitar outra revisão', () => {
  assert.equal(parametrosDaPropostaComLevantamento(estimate).has('id'), false);
  assert.equal(parametrosDaPropostaComLevantamento({ ...estimate, revisionNumber: 1,
    propostaVinculada: { id: 'anterior', revisionNumber: 0 } }).has('id'), false);
});

test('verba importada acompanha o custo novo e mantém sua descrição comercial', () => {
  const anterior = itemDePrecoDoLevantamento({ ...estimate, salePrice: '192702.82' });
  const novo = itemDePrecoDoLevantamento(estimate);
  const prices = sincronizarPrecosDoLevantamento([{ ...anterior, description: 'Descrição ajustada' }],
    novo, { id: estimate.id, item: anterior }, estimate.id);
  assert.equal(prices.length, 1);
  assert.equal(prices[0].value, novo.value);
  assert.equal(prices[0].unitValue, novo.unitValue);
  assert.equal(prices[0].description, 'Descrição ajustada');
});

test('preço negociado, detalhamento e preços antigos exigem substituição explícita', () => {
  const anterior = itemDePrecoDoLevantamento({ ...estimate, salePrice: '192702.82' });
  const novo = itemDePrecoDoLevantamento(estimate);
  const origens = [{ id: estimate.id, item: anterior }, undefined];
  for (const origem of origens) {
    for (const prices of [[{ ...anterior, unitValue: 'R$ 180.000,00', value: 'R$ 180.000,00' }],
      [anterior, { ...anterior, description: 'Mobilização' }]]) {
      const synced = sincronizarPrecosDoLevantamento(prices, novo, origem, estimate.id);
      assert.equal(JSON.stringify(synced), JSON.stringify(prices));
    }
  }
  assert.equal(sincronizarPrecosDoLevantamento([anterior], novo, undefined, estimate.id)[0].value, anterior.value);
  assert.equal(sincronizarPrecosDoLevantamento([], novo, undefined, estimate.id)[0].value, novo.value);
});

test('atualizar a verba offshore preserva a tabela onshore', () => {
  const anterior = itemDePrecoDoLevantamento({ ...estimate, salePrice: '192702.82' }, { local: 'OFFSHORE' });
  const novo = itemDePrecoDoLevantamento(estimate, { local: 'OFFSHORE' });
  const onshore = { ...anterior, local: 'ONSHORE', description: 'Outro cenário' };
  const prices = sincronizarPrecosDoLevantamento([onshore, anterior], novo,
    { id: estimate.id, item: anterior }, estimate.id);
  assert.equal(prices[0], onshore);
  assert.equal(prices[1].value, novo.value);
});
