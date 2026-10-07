import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(relativePath) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', define: { 'import.meta.env': '{}' }
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url) });
  return module.exports;
}

const { dadosDaProposta, snapshotDaPropostaSalva } = await load('../src/pages/comercial/proposta/salvamento.ts');
const { DocumentoPrevia } = await load('../src/pages/comercial/proposta/DocumentoPrevia.tsx');
const { ComercialStep } = await load('../src/pages/comercial/proposta/steps/ComercialStep.tsx');
const form = {
  includeInformationalPrices: true,
  informationalPrices: [{ description: 'Locação de bomba ', quantity: '2,5', unitValue: 'R$ 120,50', value: 'R$ 999,00' }]
};
const conteudo = { form, codigo: '99001', orcamentista: 'Teste', modelo: 'padrao',
  itensEscopo: [], blocos: [], categorias: [], responsabilidades: [],
  precos: [{ description: 'Serviço', unit: 'VB', quantity: '1', unitValue: 'R$ 1.000,00', value: '' }],
  incluirUnitario: false, servicosTecnicos: [], complementoRelatorios: '' };

test('salvar e reabrir preserva a tabela separada e recalcula seus valores', () => {
  const saved = dadosDaProposta(conteudo);
  const reopened = snapshotDaPropostaSalva({ payload: JSON.parse(JSON.stringify(saved)) });
  assert.equal(reopened.includeInformationalPrices, true);
  assert.equal(reopened.informationalPrices[0].value, 'R$ 301,25');
  assert.equal(reopened.informationalPrices[0].description, 'Locação de bomba ');
  assert.equal(reopened.prices.length, 1);
  assert.equal(reopened.prices[0].value, 'R$ 1.000,00');
  const omitted = dadosDaProposta({ ...conteudo, form: { ...reopened, includeInformationalPrices: false } });
  assert.equal(omitted.includeInformationalPrices, false);
  assert.equal(omitted.informationalPrices.length, 1);
});

test('a prévia comercial exibe a tabela e o total contratado permanece isolado', () => {
  const props = { ...conteudo, precos: dadosDaProposta(conteudo).prices,
    tipo: 'commercial', codigo: conteudo.codigo };
  const markup = renderToStaticMarkup(createElement(DocumentoPrevia, props));
  assert.match(markup, /Equipamentos e outras despesas/);
  assert.match(markup, /Locação de bomba/);
  assert.match(markup, /301,25/);
  assert.match(markup, /Total geral:<\/b> R\$ 1\.000,00/);
  assert.match(markup, /VALOR UNIT\./, 'A tabela informativa sempre mostra o valor unitário');
  for (const patch of [{ tipo: 'technical' }, { form: { ...form, includeInformationalPrices: false } }]) {
    const omitted = renderToStaticMarkup(createElement(DocumentoPrevia, { ...props, ...patch }));
    assert.doesNotMatch(omitted, /Locação de bomba|Equipamentos e outras despesas/);
  }
});

test('a tabela opcional tem controles próprios e preserva espaços durante a digitação', () => {
  const markup = renderToStaticMarkup(createElement(ComercialStep, {
    form, editar() {}, precos: conteudo.precos, onPrecos() {}, incluirUnitario: false,
    onIncluirUnitario() {}, erroDe() {}, mostrarErros: false, modelo: 'padrao'
  }));
  assert.match(markup, /Descrição do item informativo 1/);
  assert.match(markup, /value="Locação de bomba "/);
  assert.match(markup, /Quantidade do item informativo 1/);
  assert.match(markup, /Valor unitário do item informativo 1/);
  assert.match(markup, /Adicionar equipamento ou despesa/);
});

test('tabelas extensas são paginadas sem repetir itens ou valores', () => {
  const props = { ...conteudo, tipo: 'commercial', precos: dadosDaProposta(conteudo).prices,
    form: { ...form, informationalPrices: Array.from({ length: 30 }, (_, i) => ({
      ...form.informationalPrices[0], description: `Equipamento-QA-${String(i + 1).padStart(2, '0')}`
    })) } };
  const markup = renderToStaticMarkup(createElement(DocumentoPrevia, props));
  for (const item of props.form.informationalPrices) {
    assert.equal(markup.split(item.description).length - 1, 1);
  }
  assert.ok(markup.split('Equipamentos e outras despesas').length > 2);
  const pages = [...markup.matchAll(/aria-label="Página (\d+)"/g)].map(match => Number(match[1]));
  assert.ok(pages.every((number, i) => number === i + 2), 'As páginas mantêm numeração contínua');

  const long = renderToStaticMarkup(createElement(DocumentoPrevia, { ...props, form: { ...form,
    informationalPrices: [{ ...form.informationalPrices[0],
      description: `InicioUnico ${'Descrição extensa do equipamento. '.repeat(40)} FimUnico` }]
  } }));
  assert.equal(long.split('InicioUnico').length - 1, 1);
  assert.equal(long.split('FimUnico').length - 1, 1);
  assert.equal([...long.matchAll(/R\$\s+301,25/g)].length, 1, 'O valor aparece somente na primeira parte da linha');
});
