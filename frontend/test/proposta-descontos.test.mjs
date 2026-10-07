import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(relativePath) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url) });
  return module.exports;
}
const { dadosDaProposta, snapshotDaPropostaSalva } = await load('../src/pages/comercial/proposta/salvamento.ts');
const { DocumentoPrevia } = await load('../src/pages/comercial/proposta/DocumentoPrevia.tsx');
const { ComercialStep } = await load('../src/pages/comercial/proposta/steps/ComercialStep.tsx');
const form = { discounts: [{ description: 'Desconto negociado ', value: 'R$ 150,50' }] };
const conteudo = { form, codigo: '4619', orcamentista: 'Teste', modelo: 'padrao',
  itensEscopo: [], blocos: [], categorias: [], responsabilidades: [],
  precos: [{ description: 'Serviço', quantity: '2', unitValue: 'R$ 500,00', value: '' }],
  incluirUnitario: true, servicosTecnicos: [], complementoRelatorios: '' };

test('salvar e reabrir preserva descrição e valor sem transformar descontos em itens de preço', () => {
  const saved = dadosDaProposta(conteudo);
  const reopened = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) });
  assert.equal(reopened.discounts[0].description, 'Desconto negociado ');
  assert.equal(reopened.discounts[0].value, 'R$ 150,50');
  assert.equal(reopened.prices.length, 1);
  assert.equal(reopened.prices[0].value, 'R$ 1.000,00');
  assert.equal(dadosDaProposta({ ...conteudo, form: {} }).discounts.length, 0);
});

test('prévia comercial mostra o desconto e o total líquido; a técnica permanece sem preços', () => {
  const props = { ...conteudo, precos: dadosDaProposta(conteudo).prices, tipo: 'commercial' };
  const markup = renderToStaticMarkup(createElement(DocumentoPrevia, props));
  assert.match(markup, /Desconto: Desconto negociado/);
  assert.match(markup, /-R\$ 150,50/);
  assert.match(markup, /Total geral:<\/b> R\$ 849,50/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(DocumentoPrevia, { ...props, tipo: 'technical' })),
    /Desconto negociado|849,50/);
});

test('edição oferece descrição e valor junto ao botão de adicionar item e separa os cenários', () => {
  const locals = ['ONSHORE', 'OFFSHORE'];
  const markup = renderToStaticMarkup(createElement(ComercialStep, {
    form: { discounts: locals.map((local, i) => ({ description: `Acordo ${local}`,
      value: i ? 'R$ 200,00' : 'R$ 100,00', local })) }, editar() {},
    precos: locals.map(local => ({ ...conteudo.precos[0], local, value: 'R$ 1.000,00' })),
    onPrecos() {}, incluirUnitario: false, onIncluirUnitario() {}, erroDe() {},
    mostrarErros: false, modelo: 'hidrojateamento'
  }));
  assert.equal(markup.split('+ Adicionar desconto').length - 1, 2);
  for (const local of locals) {
    assert.match(markup, new RegExp(`Descrição do desconto 1 de ${local}`));
    assert.match(markup, new RegExp(`Valor do desconto 1 de ${local}`));
    assert.match(markup, new RegExp(`Remover desconto 1 de ${local}`));
  }
  assert.match(markup, /Total geral: R\$ 900,00/);
  assert.match(markup, /Total geral: R\$ 800,00/);
});
