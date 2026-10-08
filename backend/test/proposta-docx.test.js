import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { arquivoDoModelo, preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { scopeTablesFromDimensioning } from '../../shared/comercial/dist/dimensioning-scope.js';
import { createTechnicalServiceSelection } from '../../shared/comercial/dist/technical-services.js';
import { textoCondicoesPagamento, TEXTO_IMPOSTOS, TEXTO_OBSERVACOES_GERAIS }
  from '../../shared/comercial/dist/modelo-documento.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

test('tabelas importadas do dimensionamento mantêm as edições e a ordem nos dois documentos', async () => {
  const blocks = scopeTablesFromDimensioning({ volumeSystems: [{
    id: 'circuito', name: 'Circuito dimensionado', servicesByItem: true,
    pipeSegments: [
      { id: 'a', description: 'Tubulação de entrada', quantity: 2, lengthM: 30, internalDiameterMm: 50,
        serviceIds: ['limpeza_quimica', 'teste_hidrostatico'] },
      { id: 'b', description: 'Tubulação de retorno', quantity: 1, lengthM: 10, internalDiameterMm: 25,
        serviceIds: ['limpeza_quimica'] }
    ],
    reservoirVolumes: [{ id: 'reservatorio', description: 'Reservatório dimensionado', quantity: 1, volumeLiters: 200,
      serviceIds: ['limpeza_quimica'] }]
  }] });
  const chemical = blocks.filter(block => block.scopeItemId === 'escopo-levantamento-limpeza_quimica').reverse();
  const pipes = chemical.find(block => block.columns.includes('Comprimento'));
  pipes.rows.reverse();
  pipes.rows[0][0] = 'Retorno editado na proposta';
  for (const type of ['commercial', 'technical']) {
    const doc = lerParte(new AdmZip(await preencherProposta({
      scopeItems: [
        { id: 'escopo-levantamento-limpeza_quimica', title: 'Limpeza química', description: 'Escopo químico' },
        { id: 'escopo-levantamento-teste_hidrostatico', title: 'Teste hidrostático', description: 'Escopo do teste' }
      ],
      scopeBlocks: [...chemical, ...blocks.filter(block => block.scopeItemId === 'escopo-levantamento-teste_hidrostatico')]
    }, type)), 'word/document.xml');
    const content = texto(doc);
    assert.ok(content.indexOf('Reservatório dimensionado') < content.indexOf('Retorno editado na proposta'));
    assert.ok(content.indexOf('Retorno editado na proposta') < content.indexOf('Tubulação de entrada'));
    assert.match(content, /Escopo do teste/);
    assert.ok(content.lastIndexOf('Tubulação de entrada') > content.indexOf('Escopo do teste'));
    assert.equal(content.match(/Tubulação de entrada/g).length, 2);
    assert.match(content, /30 m/);
    assert.doesNotMatch(content, /\{\{/);
  }
});

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
  test(`prazos ${modelo} usam a unidade do modelo uma única vez, inclusive em propostas antigas`, async () => {
    for (const tipo of ['commercial', 'technical']) {
      for (const prazos of [
        { permanence: '10', execution: '8' },
        { permanence: '10 dias corridos', execution: '8 dias trabalhados' },
        { permanence: '1 dia corrido', execution: '1 dia trabalhado' }
      ]) {
        const doc = lerParte(new AdmZip(await preencherProposta({ modelo, ...prazos }, tipo)), 'word/document.xml');
        const linhas = Array.from(doc.getElementsByTagName('w:p')).map(texto);
        const permanencia = linhas.find(linha => linha.startsWith('Prazo previsto de permanência em obra'));
        const execucao = linhas.find(linha => linha.startsWith('Prazo previsto de execução dos serviços'));
        const singular = prazos.permanence.startsWith('1 dia ');
        assert.match(permanencia, new RegExp(`– ${singular ? '1' : '10'} dia\\(s\\);`));
        assert.match(execucao, new RegExp(`– ${singular ? '1' : '8'} dia\\(as\\)`));
        assert.doesNotMatch(permanencia, /\d+ dias? corridos?/);
        assert.doesNotMatch(execucao, /\d+ dias? trabalhados?/);
      }
    }
  });

  test(`a tabela opcional ${modelo} exibe equipamentos sem alterar os totais ou o documento técnico`, async () => {
    const dados = {
      modelo,
      includeInformationalPrices: true,
      prices: [{ local: 'ONSHORE', description: 'Serviço contratado', quantity: '1',
        unitValue: 'R$ 1.000,00', value: 'R$ 1.000,00' }],
      informationalPrices: [{ description: 'Bomba & acessórios <reserva>', quantity: '2,5',
        unitValue: 'R$ 120,50', value: 'R$ 999.999,99' }]
    };
    for (const includeUnitValue of [true, false]) {
      const doc = lerParte(new AdmZip(await preencherProposta({ ...dados, includeUnitValue }, 'commercial')), 'word/document.xml');
      const tables = Array.from(doc.getElementsByTagName('w:tbl'));
      const informativa = tables.find(table => texto(table).includes('Bomba & acessórios <reserva>'));
      const principal = tables.find(table => texto(table).includes('Serviço contratado'));
      assert.ok(informativa, 'A tabela opcional deve aparecer separada');
      assert.ok(principal);
      assert.notEqual(informativa, principal);
      const section = doc.getElementsByTagName('w:sectPr').item(0);
      const pageSize = section.getElementsByTagName('w:pgSz').item(0);
      const margins = section.getElementsByTagName('w:pgMar').item(0);
      const bodyWidth = Number(pageSize.getAttribute('w:w'))
        - Number(margins.getAttribute('w:left')) - Number(margins.getAttribute('w:right'));
      const tableProperties = informativa.getElementsByTagName('w:tblPr').item(0);
      const tableWidth = tableProperties.getElementsByTagName('w:tblW').item(0);
      assert.equal(tableWidth.getAttribute('w:type'), 'dxa');
      assert.equal(Number(tableWidth.getAttribute('w:w')), bodyWidth,
        'A tabela deve ocupar toda a área entre as margens do modelo');
      assert.equal(tableProperties.getElementsByTagName('w:jc').item(0).getAttribute('w:val'), 'left');
      const grid = [...informativa.getElementsByTagName('w:gridCol')]
        .map(column => Number(column.getAttribute('w:w')));
      assert.equal(grid.reduce((sum, width) => sum + width, 0), bodyWidth);
      assert.ok(grid[0] > grid[1] * 3, 'A descrição deve ter mais espaço que a quantidade');
      assert.ok(Math.abs(grid[2] - grid[3]) <= 3, 'Os valores devem ter colunas de mesma largura');
      for (const row of [...informativa.getElementsByTagName('w:tr')]) {
        const cellWidths = [...row.getElementsByTagName('w:tcW')].map(cell => Number(cell.getAttribute('w:w')));
        assert.deepEqual(cellWidths, grid, 'Cabeçalho e dados devem respeitar as mesmas colunas');
      }
      assert.match(texto(informativa), /VALOR UNIT\./);
      assert.match(texto(informativa), /2,5/);
      assert.match(texto(informativa), /R\$\s*301,25/);
      assert.doesNotMatch(texto(informativa), /999\.999|TOTAL GERAL/);
      assert.match(texto(principal), /R\$\s*1\.000,00/);
      assert.doesNotMatch(texto(principal), /301,25/);
      const content = texto(doc);
      assert.match(content, /Estes itens não compõem o valor total da proposta/);
      assert.ok(content.indexOf('Serviço contratado') < content.indexOf('Bomba & acessórios'));
      assert.ok(content.indexOf('Bomba & acessórios') < content.lastIndexOf('- Condições de pagamento:'));
      assert.doesNotMatch(content, /\{\{/);
      const header = informativa.getElementsByTagName('w:tr').item(0);
      assert.ok(header.getElementsByTagName('w:tblHeader').length, 'O cabeçalho se repete nas páginas seguintes');
    }
    for (const [tipo, includeInformationalPrices] of [
      ['technical', true], ['commercial', false], ['commercial', undefined]
    ]) {
      const doc = lerParte(new AdmZip(await preencherProposta({ ...dados, includeInformationalPrices }, tipo)), 'word/document.xml');
      assert.doesNotMatch(texto(doc), /Bomba & acessórios|Equipamentos e outras despesas|Valores informativos/);
    }
  });
}

function propriedadeDoTexto(run, styles, tag) {
  const propriedade = no => no?.getElementsByTagName('w:rPr').item(0)
    ?.getElementsByTagName(tag).item(0);
  const doEstilo = id => {
    const style = Array.from(styles.getElementsByTagName('w:style'))
      .find(no => no.getAttribute('w:styleId') === id);
    if (!style) return undefined;
    return propriedade(style) ?? doEstilo(style.getElementsByTagName('w:basedOn')
      .item(0)?.getAttribute('w:val'));
  };
  let paragraph = run.parentNode;
  while (paragraph && paragraph.nodeName !== 'w:p') paragraph = paragraph.parentNode;
  const id = paragraph?.getElementsByTagName('w:pStyle').item(0)?.getAttribute('w:val')
    ?? Array.from(styles.getElementsByTagName('w:style'))
      .find(no => no.getAttribute('w:type') === 'paragraph'
        && no.getAttribute('w:default') === '1')?.getAttribute('w:styleId');
  const prop = propriedade(run)
    ?? doEstilo(run.getElementsByTagName('w:rStyle').item(0)?.getAttribute('w:val'))
    ?? doEstilo(id)
    ?? propriedade(styles.getElementsByTagName('w:docDefaults').item(0));
  if (['w:b', 'w:bCs'].includes(tag)) {
    return prop ? !['0', 'false'].includes(prop.getAttribute('w:val')) : false;
  }
  return prop?.getAttribute('w:val');
}

for (const modelo of ['padrao', 'hidrojateamento']) {
  test(`escopo técnico ${modelo} mantém as 13 etapas do reservatório como itens de lista independentes`, async () => {
    const servico = createTechnicalServiceSelection('limpeza_reservatorio', 'reservatorio');
    const zip = new AdmZip(await preencherProposta({ modelo, technicalServices: [servico] }, 'technical'));
    const doc = lerParte(zip, 'word/document.xml');
    const etapas = servico.text.split('\n').filter(linha => linha.startsWith('• '))
      .map(linha => linha.slice(2));
    assert.equal(etapas.length, 13);
    const itens = Array.from(doc.getElementsByTagName('w:p')).filter(p => etapas.includes(texto(p)));
    assert.deepEqual(itens.map(texto), etapas);
    const numbering = lerParte(zip, 'word/numbering.xml');
    for (const item of itens) {
      assert.equal(item.getElementsByTagName('w:br').length, 0, 'Cada etapa deve ter seu próprio parágrafo');
      assert.equal(item.getElementsByTagName('w:jc').item(0)?.getAttribute('w:val'), 'left');
      const id = item.getElementsByTagName('w:numId').item(0)?.getAttribute('w:val');
      const numero = Array.from(numbering.getElementsByTagName('w:num')).find(n => n.getAttribute('w:numId') === id);
      assert.ok(numero, 'O marcador deve usar uma lista válida do Word');
      const abstractId = numero.getElementsByTagName('w:abstractNumId').item(0).getAttribute('w:val');
      const lista = Array.from(numbering.getElementsByTagName('w:abstractNum'))
        .find(n => n.getAttribute('w:abstractNumId') === abstractId);
      assert.equal(lista.getElementsByTagName('w:lvl').item(0).getElementsByTagName('w:numFmt')
        .item(0).getAttribute('w:val'), 'bullet');
    }
  });

  test(`escopo técnico ${modelo} preserva textos editados e continuações dentro dos itens`, async () => {
    const doc = lerParte(new AdmZip(await preencherProposta({ modelo, technicalServices: [{
      serviceId: 'limpeza_reservatorio', usesTemplate: false,
      text: 'Introdução personalizada com • no meio.\r\nContinuação da introdução.\r\n\r\n'
        + 'Etapas previstas:\r\n  • Abertura editada & inspeção <reservatório>;\r\nContinuação do primeiro item.\r\n'
        + ' • Organização personalizada.\r\n\r\nConclusão personalizada.'
    }] }, 'technical')), 'word/document.xml');
    const paragrafos = Array.from(doc.getElementsByTagName('w:p'));
    const introducao = paragrafos.find(p => texto(p).startsWith('Introdução personalizada'));
    assert.equal(texto(introducao), 'Introdução personalizada com • no meio.Continuação da introdução.');
    assert.equal(introducao.getElementsByTagName('w:br').length, 1);
    assert.equal(introducao.getElementsByTagName('w:numPr').length, 0);
    const primeiro = paragrafos.find(p => texto(p).startsWith('Abertura editada'));
    assert.equal(texto(primeiro), 'Abertura editada & inspeção <reservatório>;Continuação do primeiro item.');
    assert.equal(primeiro.getElementsByTagName('w:br').length, 1);
    assert.equal(primeiro.getElementsByTagName('w:jc').item(0).getAttribute('w:val'), 'left');
    assert.ok(primeiro.getElementsByTagName('w:numPr').length);
    const ultimo = paragrafos.find(p => texto(p) === 'Organização personalizada.');
    assert.ok(ultimo?.getElementsByTagName('w:numPr').length);
    assert.equal(paragrafos.find(p => texto(p) === 'Conclusão personalizada.')
      ?.getElementsByTagName('w:numPr').length, 0);
  });

  test(`documento comercial ${modelo} preenche a identificação conforme o modelo`, async () => {
    const zip = new AdmZip(await preencherProposta({
      modelo, title: 'Limpeza & inspeção <circuito A>', client: 'Cliente de teste',
      estimator: 'Orçamentista & responsável <A>', seller: 'Consultor & responsável <B>',
      proposalCode: '5007', revision: '2',
      scopeItems: [{id:'escopo', topics:[{id:'servico', text:'Serviço do escopo'}]}]
    }, 'commercial'));
    const doc = lerParte(zip, 'word/document.xml');
    const paragrafos = Array.from(doc.getElementsByTagName('w:body').item(0).childNodes)
      .filter(no => no.nodeName === 'w:p');
    const nome = paragrafos.findIndex(no => texto(no) === 'Limpeza & inspeção <circuito A>');
    const cliente = paragrafos.findIndex(no => texto(no) === 'CLIENTE: Cliente de teste');
    if (modelo === 'padrao') {
      const titulo = paragrafos.findIndex(no => texto(no) === 'Proposta Comercial');
      const orcamentista = paragrafos.findIndex((no, i) => i > titulo
        && texto(no) === 'Orçamentista: Orçamentista & responsável <A>');
      const codigo = paragrafos.findIndex(no => texto(no) === 'PROPOSTA N°: 5007 REV - 2');
      assert.ok(titulo >= 0);
      assert.equal(paragrafos[titulo].getElementsByTagName('w:jc').item(0)?.getAttribute('w:val'), 'center');
      assert.ok(orcamentista > titulo && orcamentista < codigo);
      assert.equal(codigo + 1, cliente);
      assert.equal(nome, -1);
    } else {
      assert.ok(nome >= 0);
      assert.equal(nome + 1, cliente);
    }
    const consultores = Array.from(doc.getElementsByTagName('w:p'))
      .map(texto).filter(paragrafo => paragrafo.startsWith('Consultor de Vendas:'));
    assert.deepEqual(consultores, Array(modelo === 'padrao' ? 2 : 1)
      .fill('Consultor de Vendas: Consultor & responsável <B>'));
    assert.match(texto(doc), /Serviço do escopo/);
    assert.doesNotMatch(texto(doc), /\{\{/);
  });

  test(`documento comercial ${modelo} mantém a hierarquia dos capítulos editáveis 8, 9 e 10`, async () => {
    const zip = new AdmZip(await preencherProposta({
      modelo,
      payment: textoCondicoesPagamento({adiantamento:'35%', prazoPagamento:'21', formaPagamento:'Depósito em conta'}),
      observations: TEXTO_OBSERVACOES_GERAIS, taxes: TEXTO_IMPOSTOS
    }, 'commercial'));
    const doc = lerParte(zip, 'word/document.xml');
    const paragrafos = Array.from(doc.getElementsByTagName('w:body').item(0).childNodes)
      .filter(no => no.nodeName === 'w:p');
    const encontrar = inicio => {
      const p = paragrafos.find(no => texto(no).startsWith(inicio));
      assert.ok(p, `Parágrafo ausente: ${inicio}`);
      return p;
    };
    for (const [inicio, lista, nivel] of [
      ['A título de mobilização', '2', '1'],
      ['Medição quinzenal', '2', '1'],
      ['Multa e juros por atraso:', '2', '1'],
      ['Multa moratória', '1', '0'], ['Juros de mora', '1', '0'],
      ['No caso de prorrogação', '2', '1'], ['Índice de reajuste', '2', '1'],
      ['A garantia mínima', '2', '1'], ['A Contratante reconhece', '2', '1'],
      ['A Filtrovali se enquadra', '2', '1'], ['ISS', '2', '2'],
      ['Reequilíbrio Tributário', '2', '1']
    ]) {
      const p = encontrar(inicio);
      assert.equal(p.getElementsByTagName('w:numId').item(0)?.getAttribute('w:val'), lista, inicio);
      assert.equal(p.getElementsByTagName('w:ilvl').item(0)?.getAttribute('w:val'), nivel, inicio);
    }
    for (const inicio of ['Em caso de atraso', 'Em conformidade', 'Caso a Contratante julgue',
      'Caso, após a data', 'O eventual acréscimo']) {
      assert.equal(encontrar(inicio).getElementsByTagName('w:numPr').length, 0, inicio);
    }
    for (const inicio of ['Multa e juros por atraso:', 'Reequilíbrio Tributário']) {
      assert.equal(encontrar(inicio).getElementsByTagName('w:pStyle').item(0)?.getAttribute('w:val'), 'Ttulo2');
    }
    const inicioObservacoes = paragrafos.findIndex(no => texto(no).startsWith('- Observações:'));
    const fimObservacoes = paragrafos.findIndex(no => texto(no).startsWith('- Impostos:'));
    assert.equal(paragrafos.slice(inicioObservacoes + 1, fimObservacoes)
      .filter(no => no.getElementsByTagName('w:ilvl').item(0)?.getAttribute('w:val') === '1').length, 8);
    assert.match(texto(doc), /Stand-by de Equipe:/);
    assert.match(texto(doc), /Desmobilização e Remobilização:/);
  });

  test(`documento comercial ${modelo} numera textos personalizados sem manter as cláusulas substituídas`, async () => {
    const doc = lerParte(new AdmZip(await preencherProposta({
      modelo, payment:'Pagamento negociado.\nApós aceite.\n\nSegunda condição.',
      observations:'Observação negociada.', taxes:'Imposto negociado.'
    }, 'commercial')), 'word/document.xml');
    for (const inicio of ['Pagamento negociado.', 'Segunda condição.', 'Observação negociada.', 'Imposto negociado.']) {
      const p = Array.from(doc.getElementsByTagName('w:p')).find(no => texto(no).startsWith(inicio));
      assert.ok(p);
      assert.equal(p.getElementsByTagName('w:numId').item(0)?.getAttribute('w:val'), '2');
      assert.equal(p.getElementsByTagName('w:ilvl').item(0)?.getAttribute('w:val'), '1');
    }
    assert.ok(doc.getElementsByTagName('w:br').length, 'Quebras simples devem continuar dentro do subitem');
    assert.doesNotMatch(texto(doc), /Multa e juros por atraso|No caso de prorrogação|Reequilíbrio Tributário/);
    assert.match(texto(doc), /Condições de Stand by e Mobilização Adicional:/);
  });

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

    test(`modelo e conteúdo gerado ${tipo} ${modelo} usam 10 pt e negrito só nos números dos subitens`, async () => {
      const original = new AdmZip(await readFile(new URL(
        `../models/comercial/${arquivoDoModelo(tipo, modelo)}`, import.meta.url
      )));
      const gerado = new AdmZip(await preencherProposta({
        modelo,
        scopeItems: [{ id: 'escopo', topics: [{ id: 'pai', text: 'Limpeza dos circuitos',
          children: [{ id: 'filho', text: 'Preparação', children: [{ id: 'neto', text: 'Isolamento' }] }]
        }] }],
        rows: [{ owner: 'Filtrovali', categoria: 'Equipe', item: 'Equipe de execução' }],
        prices: [{ local: 'ONSHORE', description: 'Serviço contratado', value: 'R$ 1.000,00' }],
        scopeBlocks: [
          { type: 'table', title: 'Medições', columns: ['Circuito', 'Volume'], rows: [['A', '100 L']] },
          { type: 'photo', id: 'foto', fileName: 'foto.png', caption: 'Legenda da foto', aspectRatio: 20 }
        ],
        lerFoto: async () => ({ bytes: await readFile(new URL('../../frontend/public/favicon.png', import.meta.url)),
          extensao: 'png', mime: 'image/png' }),
        technicalServices: [{ serviceId: 'limpeza_quimica', title: 'Limpeza química contratada',
          text: 'Texto técnico editado.', usesTemplate: false }],
        workday: 'Jornada editada.', payment: 'Pagamento editado.',
        observations: 'Observações editadas.', taxes: 'Impostos editados.',
        technicalReports: 'Relatório complementar.', technicalObservations: 'Observação técnica.'
      }, tipo));

      for (const zip of [original, gerado]) {
        const doc = lerParte(zip, 'word/document.xml');
        const styles = lerParte(zip, 'word/styles.xml');
        const body = doc.getElementsByTagName('w:body').item(0);
        const nodes = Array.from(body.childNodes).filter(no => no.nodeType === 1);
        const inicio = nodes.findIndex(no => no.nodeName === 'w:p'
          && texto(no) === 'Filtrovali é a escolha certa para a sua obra');
        assert.ok(inicio > 0, 'O conteúdo deve começar depois da capa e do índice');
        let subitens = 0;
        for (const node of nodes.slice(inicio)) {
          for (const run of Array.from(node.getElementsByTagName('w:r'))) {
            if (!run.getElementsByTagName('w:t').length) continue;
            for (const tag of ['w:sz', 'w:szCs']) {
              assert.equal(propriedadeDoTexto(run, styles, tag), '20',
                `${tag}: ${texto(run).slice(0, 80)}`);
            }
          }
          const paragraphs = (node.nodeName === 'w:p' ? [node] : [])
            .concat(Array.from(node.getElementsByTagName('w:p')));
          for (const paragraph of paragraphs) {
            const estilo = paragraph.getElementsByTagName('w:pStyle').item(0)?.getAttribute('w:val');
            if (!/^Ttulo[23]$/.test(estilo || '')) continue;
            subitens++;
            for (const run of Array.from(paragraph.getElementsByTagName('w:r'))) {
              if (!run.getElementsByTagName('w:t').length) continue;
              assert.equal(propriedadeDoTexto(run, styles, 'w:b'), false, texto(run));
              assert.equal(propriedadeDoTexto(run, styles, 'w:bCs'), false, texto(run));
            }
          }
        }
        assert.ok(subitens >= 5);
        const numbering = lerParte(zip, 'word/numbering.xml');
        const numero = Array.from(numbering.getElementsByTagName('w:num'))
          .find(no => no.getAttribute('w:numId') === '2');
        const abstractId = numero.getElementsByTagName('w:abstractNumId').item(0).getAttribute('w:val');
        const lista = Array.from(numbering.getElementsByTagName('w:abstractNum'))
          .find(no => no.getAttribute('w:abstractNumId') === abstractId);
        for (const level of Array.from(lista.getElementsByTagName('w:lvl'))) {
          const bold = level.getElementsByTagName('w:b').item(0);
          assert.ok(bold && !['0', 'false'].includes(bold.getAttribute('w:val')));
          assert.equal(level.getElementsByTagName('w:sz').item(0).getAttribute('w:val'), '20');
        }
        for (const part of zip.getEntries().filter(entry => /^word\/footer\d*\.xml$/.test(entry.entryName))) {
          const footer = lerParte(zip, part.entryName);
          for (const run of Array.from(footer.getElementsByTagName('w:r'))) {
            assert.equal(propriedadeDoTexto(run, styles, 'w:sz'), '20',
              'A numeração das páginas também deve usar 10 pt');
          }
        }
      }
      assert.match(texto(lerParte(gerado, 'word/document.xml')), /Legenda da foto/);
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

  for (const tipo of ['commercial', 'technical']) {
    test(`documento ${tipo} ${modelo} preserva os subitens da jornada`, async () => {
      const zip = new AdmZip(await preencherProposta({ modelo }, tipo));
      const doc = lerParte(zip, 'word/document.xml');
      const corpo = doc.getElementsByTagName('w:body').item(0);
      const paragrafos = Array.from(corpo.childNodes).filter(no => no.nodeName === 'w:p');
      const turnos = paragrafos.filter(no => /^Turno diurno/u.test(texto(no)));
      assert.equal(turnos.length, modelo === 'padrao' ? 1 : 2);
      for (const turno of turnos) {
        assert.equal(turno.getElementsByTagName('w:pStyle').item(0)?.getAttribute('w:val'), 'Ttulo2');
      }
      const horarios = paragrafos.filter(no => /^(?:Segunda|Sexta)/u.test(texto(no)));
      assert.equal(horarios.length, modelo === 'padrao' ? 2 : 3);
      for (const horario of horarios) {
        assert.equal(horario.getElementsByTagName('w:ilvl').item(0)?.getAttribute('w:val'), '2');
        assert.equal(horario.getElementsByTagName('w:numId').item(0)?.getAttribute('w:val'), '2');
        assert.equal(horario.getElementsByTagName('w:jc').item(0)?.getAttribute('w:val'), 'both');
      }
    });
  }

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
