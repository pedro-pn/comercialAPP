import test from 'node:test';
import assert from 'node:assert/strict';

import { totalStandbyEquipe, tabelaStandby } from '../dist/modelo-documento.js';

test('a diária de stand-by da equipe usa o efetivo e preserva centavos', () => {
  assert.equal(totalStandbyEquipe(2250.55, '3'), 6751.65);
  assert.deepEqual(tabelaStandby({
    horaExtra: 250,
    standbyEquipe: totalStandbyEquipe(2250.55, '3'),
    standbyEquipamento: 500,
    mobilizacaoExtra: 1000,
    quantidadeColaboradores: '3'
  })[0], ['Stand-by de Equipe (3 colaboradores)', 'R$ 6.751,65']);
  // Rascunhos anteriores não tinham a quantidade; sua diária permanece igual.
  assert.equal(totalStandbyEquipe(2250, undefined), 2250);
  assert.equal(totalStandbyEquipe(2250, ''), 0);
  assert.equal(totalStandbyEquipe(2250, '1,5'), 0);
});
