import test from 'node:test';
import assert from 'node:assert/strict';
import { paragrafosDaJornada, textoJornada } from '../dist/modelo-documento.js';

test('jornada padrão mantém 6.1, 6.1.1 e 6.1.2 entre introdução e notas', () => {
  const itens = paragrafosDaJornada(textoJornada('padrao'));
  assert.deepEqual(itens.map(item => item.numero || null), [null, '6.1', '6.1.1', '6.1.2', null]);
  assert.match(itens[1].texto, /^Turno diurno:/);
  assert.match(itens.at(-1).texto, /^Notas:/);
});

test('hidrojateamento mantém numeração separada para os dois turnos', () => {
  const itens = paragrafosDaJornada(textoJornada('hidrojateamento'));
  assert.deepEqual(itens.filter(item => item.numero).map(item => item.numero),
    ['6.1', '6.1.1', '6.1.2', '6.2', '6.2.1']);
  assert.match(itens.find(item => item.numero === '6.2').texto, /OFFSHORE/);
});

test('jornada editada preserva texto e não duplica números já informados', () => {
  const itens = paragrafosDaJornada('Introdução editada.\n\n6.1 Turno noturno:\n6.1.1 Segunda a sexta – 8 horas\n\nNotas: Conforme a obra.');
  assert.deepEqual(itens, [
    { texto: 'Introdução editada.', nivel: 0 },
    { texto: 'Turno noturno:', nivel: 1, numero: '6.1' },
    { texto: 'Segunda a sexta – 8 horas', nivel: 2, numero: '6.1.1' },
    { texto: 'Notas: Conforme a obra.', nivel: 0 }
  ]);
  assert.deepEqual(paragrafosDaJornada('Jornada personalizada.\nConforme a contratante.'),
    [{ texto: 'Jornada personalizada.\nConforme a contratante.', nivel: 0 }]);
});
