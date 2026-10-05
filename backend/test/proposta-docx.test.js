import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { arquivoDoModelo, preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { textoCondicoesPagamento, TEXTO_IMPOSTOS, TEXTO_OBSERVACOES_GERAIS }
  from '../../shared/comercial/dist/modelo-documento.js';

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
