import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { arquivoDoModelo, preencherProposta } from '../src/lib/comercial/proposta-docx.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function lerParte(zip, caminho) {
  const entrada = zip.getEntry(caminho);
  assert.ok(entrada, `Parte ausente: ${caminho}`);
  return new DOMParser().parseFromString(entrada.getData().toString('utf8'), 'text/xml');
}

function parteRelacionada(zip, origem, id, tipo) {
  assert.ok(id, `Referência de ${tipo} ausente em ${origem}`);
  const rels = lerParte(zip, path.posix.join(
    path.posix.dirname(origem), '_rels', `${path.posix.basename(origem)}.rels`
  ));
  const relacao = Array.from(rels.getElementsByTagName('Relationship'))
    .find(item => item.getAttribute('Id') === id);
  assert.ok(relacao, `Relação ${id} ausente em ${origem}`);
  assert.equal(relacao.getAttribute('Type'), `${REL_NS}/${tipo}`);
  const destino = relacao.getAttribute('Target');
  const caminho = destino.startsWith('/') ? destino.slice(1)
    : path.posix.join(path.posix.dirname(origem), destino);
  assert.ok(zip.getEntry(caminho), `Parte relacionada ausente: ${caminho}`);
  return caminho;
}

function imagemDoCabecalho(zip, caminho) {
  const cabecalho = lerParte(zip, caminho);
  const ancora = cabecalho.getElementsByTagName('wp:anchor').item(0);
  assert.ok(ancora, 'O timbrado deve ser uma imagem atrás do conteúdo');
  assert.equal(ancora.getAttribute('behindDoc'), '1');
  const imagem = ancora.getElementsByTagName('a:blip').item(0);
  assert.ok(imagem, 'Imagem do timbrado ausente');
  return zip.getEntry(parteRelacionada(
    zip, caminho, imagem.getAttributeNS(REL_NS, 'embed'), 'image'
  )).getData();
}

function conferirTimbrado(zip) {
  const doc = lerParte(zip, 'word/document.xml');
  const secao = doc.getElementsByTagNameNS(WORD_NS, 'sectPr').item(0);
  assert.ok(secao, 'Seção do documento ausente');
  const referencia = tipo => Array.from(secao.getElementsByTagNameNS(WORD_NS, `${tipo}Reference`))
    .find(item => item.getAttributeNS(WORD_NS, 'type') === 'default');
  const cabecalho = parteRelacionada(
    zip, 'word/document.xml', referencia('header')?.getAttributeNS(REL_NS, 'id'), 'header'
  );
  const rodape = parteRelacionada(
    zip, 'word/document.xml', referencia('footer')?.getAttributeNS(REL_NS, 'id'), 'footer'
  );
  const camposDoRodape = Array.from(lerParte(zip, rodape).getElementsByTagNameNS(WORD_NS, 'instrText'))
    .map(item => item.textContent).join('');
  assert.match(camposDoRodape, /\bPAGE\b/, 'O rodapé deve manter a numeração de páginas');
  return { secao, cabecalho, imagem: imagemDoCabecalho(zip, cabecalho) };
}

function texto(no) {
  return Array.from(no.getElementsByTagName('w:t')).map(item => item.textContent).join('');
}

for (const modelo of ['padrao', 'hidrojateamento']) {
  for (const tipo of ['commercial', 'technical']) {
    test(`modelo e documento ${tipo} ${modelo} mantêm o timbrado da proposta técnica`, async () => {
      const carregarModelo = async tipoDoModelo => new AdmZip(await readFile(new URL(
        `../models/comercial/${arquivoDoModelo(tipoDoModelo, modelo)}`, import.meta.url
      )));
      const referencia = conferirTimbrado(await carregarModelo('technical')).imagem;
      const original = conferirTimbrado(await carregarModelo(tipo));
      assert.deepEqual(original.imagem, referencia);

      const zip = new AdmZip(await preencherProposta({
        modelo, date: '2026-10-01', prices: [], rows: [], scopeItems: []
      }, tipo));
      const gerado = conferirTimbrado(zip);
      assert.deepEqual(gerado.imagem, referencia);
      assert.match(texto(lerParte(zip, gerado.cabecalho)), /1 de outubro de 2026/);
      assert.ok(gerado.secao.getElementsByTagNameNS(WORD_NS, 'titlePg').length,
        'A capa deve usar um cabeçalho diferente, sem data');

      const primeiraPagina = Array.from(gerado.secao.getElementsByTagNameNS(WORD_NS, 'headerReference'))
        .find(item => item.getAttributeNS(WORD_NS, 'type') === 'first');
      if (primeiraPagina) {
        const capa = parteRelacionada(zip, 'word/document.xml',
          primeiraPagina.getAttributeNS(REL_NS, 'id'), 'header');
        assert.doesNotMatch(texto(lerParte(zip, capa)), /outubro|\{\{/);
        assert.deepEqual(imagemDoCabecalho(zip, capa), referencia);
      }
    });
  }

  test(`documento comercial ${modelo} imprime a diária total sem espaços vazios`, async () => {
    const bytes = await preencherProposta({
      modelo,
      standbyTeam: 'R$ 2.250,00',
      standbyTeamQuantity: '3',
      payment: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
      prices: [],
      rows: [],
      scopeItems: []
    }, 'commercial');
    const xml = new AdmZip(bytes).readAsText('word/document.xml');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const body = doc.getElementsByTagName('w:body').item(0);
    const paragraphs = Array.from(body.childNodes).filter(no => no.nodeName === 'w:p');
    const lines = paragraphs.map(texto);
    assert.match(texto(doc), /Stand-by de Equipe \(3 colaboradores\)/);
    assert.match(texto(doc), /R\$\s*6\.750,00/);
    assert.doesNotMatch(texto(doc), /R\$\s*R\$\s*6\.750,00/);
    const primeiro = lines.indexOf('Primeiro parágrafo.');
    assert.equal(lines[primeiro + 1], 'Segundo parágrafo.');
    const spacing = paragraphs[primeiro].getElementsByTagName('w:spacing').item(0);
    assert.equal(spacing.getAttribute('w:after'), '120');
  });

  for (const serviceId of [
    'flushing_primario',
    'flushing_secundario',
    'filtragem_hidraulico_lubrificante',
    'desidratacao_oleo'
  ]) {
    test(`documento comercial ${modelo} inclui cláusulas 7.1 e 7.2 para ${serviceId}`, async () => {
      const bytes = await preencherProposta({
        modelo,
        technicalServices: [{ serviceId }],
        prices: [],
        rows: [],
        scopeItems: []
      }, 'commercial');
      const doc = new DOMParser().parseFromString(
        new AdmZip(bytes).readAsText('word/document.xml'), 'text/xml'
      );
      assert.match(texto(doc), /Para a contratação do serviço de desidratação de óleo sobressalente/);
      assert.match(texto(doc), /Para a contratação do serviço de filtragem de óleo sobressalente/);
    });
  }

  test(`documento comercial ${modelo} omite cláusulas 7.1 e 7.2 sem serviço aplicável`, async () => {
    const bytes = await preencherProposta({
      modelo,
      technicalServices: [{ serviceId: 'limpeza_quimica' }],
      prices: [],
      rows: [],
      scopeItems: []
    }, 'commercial');
    const doc = new DOMParser().parseFromString(
      new AdmZip(bytes).readAsText('word/document.xml'), 'text/xml'
    );
    assert.doesNotMatch(texto(doc), /Para a contratação do serviço de desidratação de óleo sobressalente/);
    assert.doesNotMatch(texto(doc), /Para a contratação do serviço de filtragem de óleo sobressalente/);
  });
}
