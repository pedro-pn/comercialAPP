import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { possuiSumario, separarSumarios } from '../src/lib/docx/sumario.js';
import { findFirstByText } from '../src/lib/docx/template.js';
import { convertDocxToPdf } from '../src/lib/report-pdf-from-docx.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
const texto = no => Array.from(no.getElementsByTagName('w:t')).map(n => n.textContent).join('');
const paragrafos = doc => Array.from(doc.getElementsByTagName('w:body').item(0).childNodes)
  .filter(no => no.nodeName === 'w:p');
const estilo = p => p.getElementsByTagName('w:pStyle').item(0)?.getAttribute('w:val');
const sumario = doc => Array.from(doc.getElementsByTagName('w:sdt')).find(possuiSumario);
const entradas = toc => Array.from(toc.getElementsByTagName('w:p')).filter(p => texto(p).trim());
const estiloPorId = (doc, id) => Array.from(doc.getElementsByTagName('w:style'))
  .find(n => n.getAttribute('w:styleId') === id);
const modelos = [
  ['Proposta Comercial.docx', 'commercial', 'padrao', 13],
  ['Proposta comercial hidrojateamento.docx', 'commercial', 'hidrojateamento', 13],
  ['Proposta técnica.docx', 'technical', 'padrao', 10],
  ['Proposta técnica hidrojateamento.docx', 'technical', 'hidrojateamento', 10]
];

for (const [arquivo, tipo, modelo, capitulos] of modelos) {
  test(`modelo ${tipo} ${modelo} mantém a hierarquia e lista somente os capítulos no sumário final`, async () => {
    const zip = new AdmZip(await readFile(new URL(`../models/comercial/${arquivo}`, import.meta.url)));
    const doc = parse(zip.readAsText('word/document.xml'));
    const styles = parse(zip.readAsText('word/styles.xml'));
    const titulos = paragrafos(doc).filter(p => /^Ttulo[123]$/.test(estilo(p)));
    assert.equal(titulos.filter(p => estilo(p) === 'Ttulo1').length, capitulos);
    assert.ok(titulos.some(p => estilo(p) === 'Ttulo2' && /Responsabilidade da Filtrovali/.test(texto(p))));
    if (tipo === 'commercial') assert.ok(titulos.some(p => estilo(p) === 'Ttulo3' && texto(p) === 'Stand-by de Equipe:'));
    for (const titulo of titulos) {
      const estiloTitulo = estiloPorId(styles, estilo(titulo));
      const propriedade = tag => titulo.getElementsByTagName(tag).item(0)?.getAttribute('w:val')
        ?? estiloTitulo.getElementsByTagName(tag).item(0)?.getAttribute('w:val');
      assert.equal(propriedade('w:numId'), '2');
      assert.equal(propriedade('w:ilvl') ?? '0',
        String(Number(estilo(titulo).slice(-1)) - 1));
    }
    const toc = sumario(doc);
    assert.ok(toc);
    assert.equal(entradas(toc).length, capitulos);
    assert.doesNotMatch(texto(toc), /Responsabilidade da Filtrovali|Stand-by de Equipe/);
    const codigo = Array.from(toc.getElementsByTagName('w:instrText')).map(n => n.textContent).join('');
    assert.match(codigo, /\\o\s+"1-1"/);
    const bookmarks = new Set(Array.from(doc.getElementsByTagName('w:bookmarkStart'))
      .map(n => n.getAttribute('w:name')));
    for (const link of Array.from(toc.getElementsByTagName('w:hyperlink'))) {
      assert.ok(bookmarks.has(link.getAttribute('w:anchor')), 'Cada entrada deve apontar para um título');
    }
    const estiloDoSumario = estiloPorId(styles, 'Sumrio1');
    assert.ok(estiloDoSumario.getElementsByTagName('w:b').length);
    assert.ok(!['0', 'false'].includes(estiloDoSumario.getElementsByTagName('w:b').item(0).getAttribute('w:val')));
    assert.equal(estiloDoSumario.getElementsByTagName('w:spacing').item(0).getAttribute('w:before'), '240');
    assert.equal(estiloDoSumario.getElementsByTagName('w:spacing').item(0).getAttribute('w:after'), '120');
    const primeiraEntrada = entradas(toc)[0];
    assert.equal(primeiraEntrada.getElementsByTagName('w:hyperlink').item(0)
      .getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
    assert.equal(primeiraEntrada.getElementsByTagName('w:tab').item(1).hasAttribute('w:leader'), false);
    for (let level = 1; level <= 3; level++) {
      const heading = estiloPorId(styles, `Ttulo${level}`);
      assert.equal(heading.getElementsByTagName('w:outlineLvl').item(0).getAttribute('w:val'), String(level - 1));
      assert.equal(heading.getElementsByTagName('w:rFonts').item(0).getAttribute('w:ascii'), 'Arial');
      assert.equal(heading.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
      assert.equal(heading.getElementsByTagName('w:spacing').item(0).getAttribute('w:line'), '360');
    }
  });

  test(`geração ${tipo} ${modelo} mantém a hierarquia do escopo e descarta o cache antigo`, async () => {
    const zip = new AdmZip(await preencherProposta({ modelo, scopeItems: [{ id: 'scope', topics: [{
      id: 'pai', text: 'Limpeza dos circuitos', children: [{
        id: 'filho', text: 'Preparação', children: [{ id: 'neto', text: 'Isolamento' }]
      }]
    }] }], prices: [], rows: [], workday: 'Jornada ajustada para esta obra.',
      technicalServices: [{ serviceId: 'limpeza_quimica', title: 'Limpeza química contratada', text: 'Descrição técnica editada.', usesTemplate: false }],
      scopeBlocks: [{ type: 'table', title: 'Medições do escopo', columns: ['Circuito', 'Volume'], rows: [['A', '100 L']] }]
    }, tipo));
    const doc = parse(zip.readAsText('word/document.xml'));
    for (const [text, style, level] of [
      ['Limpeza dos circuitos', 'Ttulo2', '1'], ['Preparação', 'Ttulo3', '2'], ['Isolamento', 'Ttulo3', '3']
    ]) {
      const p = paragrafos(doc).find(p => texto(p) === text);
      assert.ok(p, `Item de escopo ausente: ${text}`);
      assert.equal(estilo(p), style);
      assert.equal(p.getElementsByTagName('w:ilvl').item(0).getAttribute('w:val'), level);
      assert.equal(p.getElementsByTagName('w:outlineLvl').item(0).getAttribute('w:val'), level);
    }
    assert.equal(texto(sumario(doc)), 'Sumário', 'Resultados antigos não devem sair com marcadores ou páginas incorretas');
    assert.equal(sumario(doc).getElementsByTagName('w:t').item(0).parentNode
      .getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
    const jornada = paragrafos(doc).find(p => texto(p) === 'Jornada ajustada para esta obra.');
    assert.ok(jornada);
    assert.equal(jornada.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
    assert.equal(jornada.getElementsByTagName('w:spacing').item(0).getAttribute('w:line'), '360');
    if (tipo === 'technical') {
      const servico = paragrafos(doc).find(p => texto(p) === 'Limpeza química contratada');
      assert.ok(servico);
      assert.equal(estilo(servico), 'Ttulo2');
      assert.equal(servico.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
    }
    const tabela = Array.from(doc.getElementsByTagName('w:tbl')).find(t => /CircuitoVolumeA100 L/.test(texto(t)));
    assert.ok(tabela);
    assert.equal(tabela.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
    assert.equal(tabela.getElementsByTagName('w:spacing').item(0).getAttribute('w:line'), '360');
    assert.doesNotMatch(texto(doc), /\{\{/);
    assert.equal(parse(zip.readAsText('word/settings.xml')).getElementsByTagName('w:updateFields')
      .item(0).getAttribute('w:val'), 'true');
    assert.equal(sumario(doc).getElementsByTagName('w:fldChar').item(0).getAttribute('w:dirty'), 'true');
    const nomes = Array.from(doc.getElementsByTagName('w:bookmarkStart')).map(n => n.getAttribute('w:name'));
    assert.equal(new Set(nomes).size, nomes.length, 'Clones não devem duplicar bookmarks do modelo');
  });
}

test('marcadores e títulos no cache do sumário não participam das substituições do corpo', () => {
  const doc = parse(`<w:document xmlns:w="${WORD_NS}"><w:body>
    <w:sdt><w:sdtContent><w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText> TOC \\o "1-3" </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>{{servico}}</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>
    <w:p><w:r><w:t>{{servico}}</w:t></w:r></w:p>
  </w:body></w:document>`);
  const restaurar = separarSumarios(doc);
  assert.equal(findFirstByText(doc, 'w:p', '{{servico}}').parentNode.nodeName, 'w:body');
  restaurar();
  assert.ok(possuiSumario(doc));
  assert.equal(texto(sumario(doc)), 'Sumário');
});

test('emissão atualiza títulos, links e páginas no Word, inclusive quando o escopo cresce', {
  skip: process.env.TEST_DOCX_PDF !== '1'
}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'comercial-toc-test-'));
  try {
    for (const [arquivo, tipo, modelo, capitulos] of modelos) {
      const paginas = [];
      for (const count of [1, 35]) {
        const docxPath = path.join(directory, `${tipo}-${modelo}-${count}.docx`);
        const pdfPath = path.join(directory, `${tipo}-${modelo}-${count}.pdf`);
        await writeFile(docxPath, await preencherProposta({
          modelo,
          scopeItems: [{ id: 'scope', topics: Array.from({ length: count }, (_, i) => ({
            id: `topic-${i}`, text: `Circuito ${i + 1}: preparação, limpeza e inspeção das tubulações e válvulas industriais conforme o escopo contratado.`
          })) }], prices: [], rows: []
        }, tipo));
        await convertDocxToPdf(docxPath, pdfPath);
        const zip = new AdmZip(await readFile(docxPath));
        const doc = parse(zip.readAsText('word/document.xml'));
        const toc = sumario(doc);
        assert.match(texto(toc), /Matriz geral de responsabilidade/);
        assert.equal(entradas(toc).length, capitulos);
        assert.doesNotMatch(texto(toc), /\.{3,}/, 'O sumário final não usa pontilhados');
        assert.doesNotMatch(texto(toc), /Circuito \d+:|Responsabilidade da Filtrovali|Stand-by de Equipe/);
        assert.match(texto(doc), new RegExp(`Circuito ${count}:`));
        const styles = parse(zip.readAsText('word/styles.xml'));
        const estiloDoSumario = Array.from(styles.getElementsByTagName('w:style'))
          .find(n => n.getAttribute('w:styleId') === estilo(toc.getElementsByTagName('w:p').item(0)));
        assert.ok(estiloDoSumario.getElementsByTagName('w:b').length, 'O negrito deve permanecer após atualizar o sumário');
        assert.equal(estiloDoSumario.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '24');
        assert.doesNotMatch(texto(doc), /\{\{/);
        const final = entradas(toc).at(-1);
        paginas.push(Number(texto(final).match(/(\d+)$/)[1]));
        const anchors = new Set(Array.from(doc.getElementsByTagName('w:bookmarkStart')).map(n => n.getAttribute('w:name')));
        for (const link of Array.from(toc.getElementsByTagName('w:hyperlink'))) {
          assert.ok(anchors.has(link.getAttribute('w:anchor')));
        }
        assert.equal((await readFile(pdfPath)).subarray(0, 5).toString(), '%PDF-');
        assert.equal(parse(zip.readAsText('word/settings.xml')).getElementsByTagName('w:updateFields')
          .item(0).getAttribute('w:val'), 'true');
      }
      assert.ok(paginas[1] > paginas[0], `${arquivo}: o sumário deve recalcular páginas após aumentar o conteúdo`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
