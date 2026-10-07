import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { getCostEstimate, updateCostEstimate } from '../src/comercial/cost-estimates.js';
import { importLegacyRevision } from '../src/comercial/legacy-import-service.js';
import { lecFixture } from './fixtures/legacy-lec.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('upload legado cria custos e proposta atomicamente, respeita autoria e retoma sem sobrescrever edições', { skip: !databaseUrl }, async t => {
  assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
  const db = createDatabase(databaseUrl);
  const users = [];
  const codes = ['100000101', '100000102'];
  t.after(async () => {
    await db.proposal.deleteMany({ where: { proposalCode: { in: codes } } });
    await db.costEstimate.deleteMany({ where: { proposalCode: { in: codes } } });
    await db.proposalNumberReservation.deleteMany({ where: { number: { in: codes.map(Number) } } });
    await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await db.$disconnect();
  });
  for (const name of ['lec-vendedor', 'lec-colega', 'lec-consulta']) {
    users.push(await db.user.create({ data: { username: name, name,
      role: name.endsWith('consulta') ? 'VIEWER' : 'SELLER' } }));
  }
  const [seller, colleague, viewer] = users;
  const files = new Map(codes.map(code => [code, { fileName: 'LEC.xlsm',
    base64: lecFixture({ proposalCode: Number(code) }).toString('base64') }]));
  const body = code => ({ lec: files.get(code),
    proposalCode: code, revisionNumber: 2, modelo: 'padrao', resolutions: {} });
  const imported = await importLegacyRevision(db, seller, body(codes[0]));
  assert.equal(imported.estimate.status, 'RASCUNHO');
  assert.equal(imported.proposal.status, 'RASCUNHO');
  assert.equal(imported.proposal.costEstimateId, imported.estimate.id);
  assert.equal(imported.estimate.propostaVinculada.id, imported.proposal.id);
  assert.equal(imported.proposal.revisionNumber, 2);
  assert.equal(imported.proposal.payload.levantamentoPrecoImportado.id, imported.estimate.id);
  assert.equal((await db.proposalNumberReservation.findUnique({ where: { number: Number(codes[0]) } })).legacyFirstRevision, 2);
  await db.proposal.update({ where: { id: imported.proposal.id }, data: { contact: 'Contato editado pelo usuário' } });
  const cost = await getCostEstimate(db, seller, imported.estimate.id);
  await updateCostEstimate(db, seller, cost.id, { title: 'Custo revisado', payload: cost.payload, status: 'RASCUNHO',
    expectedUpdatedAt: cost.updatedAt.toISOString() });
  const resumed = await importLegacyRevision(db, seller, body(codes[0]));
  assert.equal(resumed.alreadyImported, true);
  assert.equal(resumed.proposal.contact, 'Contato editado pelo usuário');
  assert.equal(resumed.estimate.title, 'Custo revisado');
  await assert.rejects(importLegacyRevision(db, colleague, body(codes[0])), error => error.status === 403);
  await assert.rejects(importLegacyRevision(db, seller, { ...body(codes[0]), modelo: 'hidrojateamento' }), error => error.status === 409);
  await assert.rejects(importLegacyRevision(db, seller, { ...body(codes[1]), revisionNumber: 1 }), error => error.status === 422);
  assert.equal(await db.proposalNumberReservation.count({ where: { number: Number(codes[1]) } }), 0);

  const server = createApp({ commercialDb: db, authService: {
    authenticate: async cookie => cookie === 'viewer' ? viewer : seller
  } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (action, data, cookie = 'seller') => fetch(`http://127.0.0.1:${server.address().port}/api/comercial/propostas/legado/lec/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Comercial-Request': '1', Cookie: `comercial_session=${cookie}` },
    body: JSON.stringify(data)
  });
  const input = body(codes[1]);
  const preview = await request('previa', { lec: input.lec });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).proposalCode, codes[1]);
  assert.equal(await db.proposalNumberReservation.count({ where: { number: Number(codes[1]) } }), 0);
  assert.equal((await request('importar', input, 'viewer')).status, 403);
  // A failed proposal insert rolls back the estimate and the reservation too.
  const badDb = { proposal: db.proposal, costEstimate: db.costEstimate, user: db.user, salesConsultant: db.salesConsultant,
    proposalNumberReservation: db.proposalNumberReservation,
    $transaction: action => db.$transaction(tx => action({ ...tx,
      proposal: { ...tx.proposal, create: async () => { throw new Error('Simulated failure'); } }
    })) };
  await assert.rejects(importLegacyRevision(badDb, seller, input), /Simulated failure/);
  assert.equal(await db.costEstimate.count({ where: { proposalCode: codes[1] } }), 0);
  assert.equal(await db.proposalNumberReservation.count({ where: { number: Number(codes[1]) } }), 0);
  const created = await request('importar', input);
  assert.equal(created.status, 201);
  assert.equal((await request('importar', input)).status, 200);
});
