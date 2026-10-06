import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { reopenProposal, updateProposal } from '../src/comercial/proposals.js';

const seller = { id: 'autor', role: 'SELLER', name: 'Vendedor' };
const manager = { id: 'gestor', role: 'MANAGER', name: 'Gestor' };

function fixture(overrides = {}) {
  let proposal = {
    id: 'proposta', proposalCode: '9000', revisionNumber: 3,
    status: 'FINALIZADA', archivedAt: null, createdByUserId: seller.id,
    updatedAt: new Date('2026-10-06T10:00:00Z'), finalizedAt: new Date('2026-10-06T09:00:00Z'),
    payload: { title: 'Serviço salvo', prices: [{ value: 'R$ 100,00' }] },
    nectarOpportunityId: 'card', costEstimateId: 'levantamento',
    ...overrides
  };
  let writes = 0;
  const db = { proposal: {
    findUnique: async ({ where }) => where.id === proposal.id ? proposal : null,
    update: async ({ where, data }) => {
      if (Object.entries(where).some(([field, value]) =>
        value instanceof Date ? proposal[field]?.getTime() !== value.getTime() : proposal[field] !== value)) {
        throw Object.assign(new Error('Registro alterado'), { code: 'P2025' });
      }
      writes++;
      proposal = { ...proposal, ...data };
      return proposal;
    }
  } };
  return { db, current: () => proposal, writes: () => writes,
    input: () => ({ expectedUpdatedAt: proposal.updatedAt.toISOString() }) };
}

test('autor e gestor reabrem o mesmo registro com numeração, dados e vínculos preservados', async () => {
  for (const user of [seller, manager]) {
    const f = fixture();
    const original = f.current();
    const result = await reopenProposal(f.db, user, original.id, f.input());
    assert.deepEqual(result, { ...original, status: 'RASCUNHO', finalizedAt: null,
      updatedByUserId: user.id, updatedByLabel: user.name, updatedAt: result.updatedAt });
    assert.ok(result.updatedAt > original.updatedAt);
    assert.equal(f.writes(), 1);
  }
});

test('reabertura respeita perfil, autoria, arquivamento e estado', async () => {
  for (const [user, fields, status] of [
    [{ ...seller, id: 'outro' }, {}, 403],
    [{ ...seller, role: 'VIEWER' }, {}, 403],
    [seller, { archivedAt: new Date() }, 409],
    [seller, { status: 'FINALIZANDO' }, 409],
    [seller, { status: 'FALHA_INTEGRACAO' }, 409],
    [seller, { status: 'RASCUNHO' }, 409]
  ]) {
    const f = fixture(fields);
    await assert.rejects(reopenProposal(f.db, user, 'proposta', f.input()), { status });
    assert.equal(f.writes(), 0);
  }
  const f = fixture();
  await assert.rejects(reopenProposal(f.db, seller, 'ausente', f.input()), { status: 404 });
});

test('versão antiga e reaberturas concorrentes não substituem a proposta', async () => {
  const f = fixture();
  await assert.rejects(reopenProposal(f.db, seller, 'proposta', {
    expectedUpdatedAt: '2026-10-06T08:00:00Z'
  }), { code: 'COMERCIAL_CONCURRENT_WRITE', status: 409 });
  assert.equal(f.writes(), 0);
  const results = await Promise.allSettled([
    reopenProposal(f.db, seller, 'proposta', f.input()),
    reopenProposal(f.db, manager, 'proposta', f.input())
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'COMERCIAL_CONCURRENT_WRITE');
  assert.equal(f.writes(), 1);
});

test('PUT ainda exige reabertura explícita e preserva código e revisão', async () => {
  const f = fixture();
  await assert.rejects(updateProposal(f.db, seller, 'proposta', {
    ...f.input(), payload: { title: 'Correção' }
  }), { status: 409 });
  await reopenProposal(f.db, seller, 'proposta', f.input());
  for (const change of [{ proposalCode: '9001' }, { revisionNumber: 4 }]) {
    await assert.rejects(updateProposal(f.db, seller, 'proposta', {
      ...f.input(), ...change
    }), { status: 409 });
  }
  assert.equal(f.writes(), 1);
});

test('rota de reabertura exige sessão, versão e origem válidas', async t => {
  const f = fixture();
  const viewer = { id: 'consulta', role: 'VIEWER' };
  const colleague = { id: 'outro', role: 'SELLER' };
  const users = [seller, viewer, colleague];
  const server = createApp({ commercialDb: f.db,
    authService: { authenticate: token => users.find(user => user.id === token) } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/comercial/propostas/proposta/reabrir`;
  const request = (user, body = f.input(), csrf = true) => fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(user ? { Cookie: `comercial_session=${user.id}` } : {}),
      ...(csrf ? { 'X-Comercial-Request': '1' } : {}) },
    body: JSON.stringify(body)
  });
  assert.equal((await request(null)).status, 401);
  assert.equal((await request(viewer)).status, 403);
  assert.equal((await request(colleague)).status, 403);
  assert.equal((await request(seller, f.input(), false)).status, 403);
  for (const body of [{}, { expectedUpdatedAt: 'inválida' },
    { ...f.input(), revisionNumber: 4 }, { ...f.input(), forceOverwrite: true }]) {
    assert.equal((await request(seller, body)).status, 400);
  }
  assert.equal(f.writes(), 0);
  const response = await request(seller);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.id, 'proposta');
  assert.equal(result.proposalCode, '9000');
  assert.equal(result.revisionNumber, 3);
  assert.equal(result.status, 'RASCUNHO');
});
