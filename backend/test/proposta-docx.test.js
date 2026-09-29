import test from 'node:test';
import assert from 'node:assert/strict';

import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';

function texto(no) {
  return Array.from(no.getElementsByTagName('w:t')).map(item => item.textContent).join('');
}

for (const modelo of ['padrao', 'hidrojateamento']) {
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
}
