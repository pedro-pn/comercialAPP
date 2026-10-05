import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paragrafosComerciais, textoCondicoesPagamento, TEXTO_IMPOSTOS, TEXTO_OBSERVACOES_GERAIS
} from '../dist/modelo-documento.js';

test('pagamento preserva os três subitens, a lista de multa e juros e os parágrafos explicativos', () => {
  const itens = paragrafosComerciais(textoCondicoesPagamento({
    adiantamento: '35%', prazoPagamento: '21', formaPagamento: 'Depósito em conta'
  }), 8);
  assert.deepEqual(itens.map(item => item.numero || item.marcador || null),
    ['8.1', '8.2', '8.3', null, 'a)', 'b)', null]);
  assert.equal(itens[2].titulo, true);
  assert.match(itens[0].texto, /35%/);
  assert.match(itens[1].texto, /21 dias/);
  assert.match(itens[4].texto, /Multa moratória de 2%/);
});

test('observações editáveis continuam após os itens fixos de hora extra e stand-by', () => {
  const itens = paragrafosComerciais(TEXTO_OBSERVACOES_GERAIS, 9);
  assert.deepEqual(itens.map(item => item.numero),
    ['9.3', '9.4', '9.5', '9.6', '9.7', '9.8', '9.9']);
  assert.match(itens[0].texto, /prorrogação/);
  assert.match(itens.at(-1).texto, /pacote integral/);
});

test('impostos mantêm ISS como subitem e reequilíbrio com suas explicações sem numeração', () => {
  const itens = paragrafosComerciais(TEXTO_IMPOSTOS, 10);
  assert.deepEqual(itens.map(item => item.numero || null),
    ['10.1', '10.1.1', null, null, '10.2', null, null]);
  assert.equal(itens[1].nivel, 2);
  assert.equal(itens[4].titulo, true);
  assert.match(itens.at(-1).texto, /CONTRATANTE/);
});

test('textos personalizados mantêm quebras simples, recebem subitens e não duplicam números informados', () => {
  assert.deepEqual(paragrafosComerciais('8.1 Pagamento negociado.\nApós aceite.\n\n8.2 Segunda condição.', 8), [
    {texto:'Pagamento negociado.\nApós aceite.', nivel:1, numero:'8.1'},
    {texto:'Segunda condição.', nivel:1, numero:'8.2'}
  ]);
  assert.deepEqual(paragrafosComerciais('Observação negociada.', 9), [
    {texto:'Observação negociada.', nivel:1, numero:'9.3'}
  ]);
  assert.deepEqual(paragrafosComerciais('Imposto negociado.', 10), [
    {texto:'Imposto negociado.', nivel:1, numero:'10.1'}
  ]);
  assert.deepEqual(paragrafosComerciais('  ', 8), []);
});
