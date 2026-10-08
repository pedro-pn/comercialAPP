import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { pendenciasDoDocumento } from '../../shared/comercial/dist/proposal-validation.js';
import { propostaCompleta } from './fixtures/proposta-completa.js';

for (const modelo of ['padrao', 'hidrojateamento']) {
  test(`proposta comercial ${modelo} na sede omite o bloco 9.2 e preserva os demais capítulos`, async () => {
    const payload = propostaCompleta({ modelo, workAtHeadquarters: true,
      observations: 'Observação comercial preservada.', taxes: 'Imposto preservado.' });
    const zip = new AdmZip(await preencherProposta(payload, 'commercial'));
    const doc = new DOMParser().parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
    const text = doc.documentElement.textContent;
    assert.doesNotMatch(text, /Condições de Stand by|Stand-by de Equipe|Stand-by de Equipamentos|Desmobilização e Remobilização:|O solicitante terá que formalizar/);
    assert.doesNotMatch(text, /2\.250,00|1\.000,00|500,00/);
    assert.match(text, /Os trabalhos em horas extras/);
    assert.match(text, /250,00/);
    assert.match(text, /Observação comercial preservada/);
    assert.match(text, /Imposto preservado/);
    assert.doesNotMatch(text, /\{\{/);
    const other = new AdmZip(await preencherProposta({ ...payload, workAtHeadquarters: false }, 'commercial'));
    const otherText = new DOMParser().parseFromString(other.readAsText('word/document.xml'), 'text/xml')
      .documentElement.textContent;
    assert.match(otherText, /Condições de Stand by e Mobilização Adicional:/);
    assert.match(otherText, /Stand-by de Equipe/);
  });
}

test('a finalização na sede dispensa os campos do bloco removido e continua exigindo a hora extra', () => {
  const payload = propostaCompleta({ workAtHeadquarters: true, standbyTeam: '',
    standbyTeamQuantity: '0', standbyEquipment: '', extraMobilization: '' });
  assert.deepEqual(pendenciasDoDocumento(payload), []);
  assert.ok(pendenciasDoDocumento({ ...payload, overtimeRate: '' })
    .some(issue => issue.campo === 'overtimeRate'));
  for (const workAtHeadquarters of [undefined, false, 'true']) {
    const fields = pendenciasDoDocumento({ ...payload, workAtHeadquarters }).map(issue => issue.campo);
    for (const field of ['standbyTeam', 'standbyTeamQuantity', 'standbyEquipment', 'extraMobilization']) {
      assert.ok(fields.includes(field));
    }
  }
});
