import test from 'node:test';
import assert from 'node:assert/strict';
import { fillScopeFromDimensioning, scopeTablesFromDimensioning } from '../dist/dimensioning-scope.js';
import { MAX_SCOPE_TABLES, MAX_SCOPE_TABLE_ROWS, normalizeScopeBlocks } from '../dist/scope-content.js';
import { SCOPE_LIMITS } from '../../schemas/comercial.js';

function fixture() {
  return { volumeSystems: [{
    id: 'circuito-a', name: 'Circuito A', enabled: true, servicesByItem: true, cycles: 2,
    pipeSegments: [
      { id: 'tubo-a', description: 'Linha principal', material: 'stainless_steel', quantity: 2,
        lengthM: 1.25, lengthUnit: 'cm', internalDiameterMm: 50.8, diameterUnit: 'in',
        fillPercent: 80, serviceIds: ['limpeza_quimica', 'teste_hidrostatico'] },
      { id: 'tubo-b', description: 'Retorno', material: 'carbon_steel', quantity: 1,
        lengthM: 4, internalDiameterMm: 25, fillPercent: 100, serviceIds: ['teste_hidrostatico'] }
    ],
    reservoirVolumes: [{ id: 'tanque', description: 'Tanque de alimentação', material: 'carbon_steel',
      quantity: 3, volumeLiters: 1000, serviceIds: ['limpeza_quimica'] }],
    manualVolumes: [{ id: 'oleo', description: 'Carga de óleo', quantity: 1, volumeLiters: 250.5,
      oilType: 'Óleo hidráulico', oilBrandViscosity: 'Marca & ISO VG 46', serviceIds: ['filtragem_hidraulico_lubrificante'] }],
    equipmentVolumes: [{ id: 'avulso', description: 'Equipamento avulso', material: 'other',
      quantity: 1, volumeLiters: 40, serviceIds: ['limpeza_quimica'] }]
  }] };
}

test('dimensionamento preenche tabelas por serviço, circuito e tipo com as unidades do levantamento', () => {
  const payload = fixture();
  const original = structuredClone(payload);
  const tables = scopeTablesFromDimensioning(payload);
  const chemical = tables.filter(table => table.scopeItemId === 'escopo-levantamento-limpeza_quimica');
  const pressure = tables.filter(table => table.scopeItemId === 'escopo-levantamento-teste_hidrostatico');
  assert.equal(chemical.length, 3);
  assert.equal(pressure.length, 1);
  assert.deepEqual(chemical[0].rows, [['Linha principal', 'Aço inox', '2', '125 cm', '2"', '80']]);
  assert.deepEqual(pressure[0].rows.map(row => row[0]), ['Linha principal', 'Retorno']);
  assert.match(chemical[0].title, /Circuito A.*Tubulações.*2 ciclos/);
  assert.deepEqual(chemical[1].rows[0], ['Tanque de alimentação', 'Aço carbono', '3', '1.000']);
  assert.deepEqual(chemical[2].rows[0], ['Equipamento avulso', 'Outro', '1', '40']);
  const oil = tables.find(table => table.scopeItemId === 'escopo-levantamento-filtragem_hidraulico_lubrificante');
  assert.deepEqual(oil.rows[0], ['Carga de óleo', 'Óleo hidráulico', 'Marca & ISO VG 46', '1', '250,5']);
  assert.equal(new Set(tables.map(table => table.id)).size, tables.length);
  chemical[0].rows[0][0] = 'Editado na proposta';
  assert.equal(pressure[0].rows[0][0], 'Linha principal');
  assert.deepEqual(payload, original);
});

test('tabelas ignoram circuitos desativados, itens excluídos e serviços inválidos ou incompatíveis', () => {
  const payload = fixture();
  const disabled = structuredClone(payload.volumeSystems[0]);
  disabled.id = 'desativado';
  disabled.enabled = false;
  payload.volumeSystems.push(disabled);
  payload.volumeSystems[0].reservoirVolumes[0].included = false;
  payload.volumeSystems[0].pipeSegments[0].serviceIds = ['desconhecido', 'filtragem_diesel', 'teste_hidrostatico', 'teste_hidrostatico'];
  const tables = scopeTablesFromDimensioning(payload);
  assert.ok(tables.every(table => !table.title.includes('Reservatórios')));
  assert.ok(tables.every(table => !table.id.includes('desativado')));
  assert.ok(tables.every(table => !table.scopeItemId.includes('desconhecido') && !table.scopeItemId.includes('filtragem_diesel')));
  assert.equal(tables.find(table => table.scopeItemId === 'escopo-levantamento-teste_hidrostatico').rows.length, 2);
});

test('levantamentos antigos importam serviços por circuito, materiais e mangueiras', () => {
  const tables = scopeTablesFromDimensioning({
    volumeSystems: [{ id: 'legado', name: 'Legado', material: 'carbon_steel',
      hoseSegments: [{ id: 'mangueira', description: 'Mangueira antiga', quantity: 1,
        lengthM: 2, internalDiameterMm: 10, fillPercent: 100 }] }],
    circuitServices: [{ id: 'servico', systemId: 'legado', serviceId: 'flushing_primario' }]
  });
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows[0], ['Mangueira antiga', 'Aço carbono', '1', '2 m', '10 mm', '100']);
});

test('tabelas extensas são divididas sem perder linhas e mais de oito tabelas continuam no documento', () => {
  const payload = fixture();
  const system = payload.volumeSystems[0];
  system.pipeSegments = Array.from({ length: MAX_SCOPE_TABLE_ROWS + 1 }, (_, index) => ({
    ...system.pipeSegments[0], id: `tubo-${index}`, description: `Tubo ${index}`, serviceIds: ['limpeza_quimica']
  }));
  payload.volumeSystems = Array.from({ length: 3 }, (_, index) => ({ ...system, id: `circuito-${index}` }));
  const tables = scopeTablesFromDimensioning(payload);
  const pipes = tables.filter(table => table.columns.includes('Comprimento'));
  assert.equal(pipes.length, 6);
  assert.equal(pipes.reduce((sum, table) => sum + table.rows.length, 0), 3 * (MAX_SCOPE_TABLE_ROWS + 1));
  assert.ok(tables.length > 8);
  assert.deepEqual(normalizeScopeBlocks(tables), tables);
  assert.equal(SCOPE_LIMITS.tables, MAX_SCOPE_TABLES);
});

test('o limite de tabelas gera erro explícito em vez de importar parte do levantamento', () => {
  const system = fixture().volumeSystems[0];
  system.pipeSegments = [system.pipeSegments[0]];
  system.reservoirVolumes = [];
  system.equipmentVolumes = [];
  system.manualVolumes = [];
  assert.throws(() => scopeTablesFromDimensioning({ volumeSystems: Array.from({ length: MAX_SCOPE_TABLES + 1 },
    (_, index) => ({ ...system, id: `circuito-${index}` })) }), /A proposta aceita até 80/);
});

test('importação preenche o escopo inicial e preserva texto, tabelas editadas e tabelas removidas', () => {
  const imported = { items: [{ id: 'escopo-levantamento-limpeza_quimica', title: 'Limpeza química', description: 'Texto importado' }],
    blocks: scopeTablesFromDimensioning(fixture()) };
  assert.equal(fillScopeFromDimensioning({ items: [], blocks: [] }, imported), imported);
  assert.equal(fillScopeFromDimensioning({ items: [{ id: 'inicial', title: 'Serviço 1', description: '' }], blocks: [] }, imported), imported);
  for (const current of [
    { ...imported, blocks: [] },
    { ...imported, blocks: structuredClone(imported.blocks).reverse() },
    { items: [{ id: 'manual', title: 'Serviço 1', description: '', topics: [{ id: 'topico', text: 'Texto editado' }] }], blocks: [] },
    { items: [], blocks: [{ id: 'tabela', type: 'table', title: 'Manual', columns: ['A', 'B'], rows: [['1', '2']] }] }
  ]) {
    assert.equal(fillScopeFromDimensioning(current, imported), current);
  }
  assert.deepEqual(scopeTablesFromDimensioning({}), []);
});
