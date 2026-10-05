import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { calculateProposalTotal, createProposal, prepareRevision } from '../src/comercial/proposals.js';
import { requireAdmin, requireEstimator, requireManager } from '../src/comercial/access.js';
import { assertReservedCode, initializeNumbering, numberingStatus,
  registerLegacyRevision, reserveNumber, updateInitialNumber } from '../src/comercial/numbering.js';

function fakeNumberingDatabase() {
  let state = null;
  const reservations = new Map();
  const proposals = new Map();
  const db = {
    user: {
      async findFirst({ where }) {
        return where.id === 'seller'
          ? { id: 'seller', name: 'Vendedor', role: 'SELLER', isActive: true }
          : null;
      }
    },
    proposalNumberingState: {
      async findUnique() { return state; },
      async create({ data }) {
        if (state) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state = { ...data, seededAt: new Date() };
        return state;
      },
      async update({ data }) {
        if (!state) throw Object.assign(new Error('missing'), { code: 'P2025' });
        state = { ...state, ...data, nextNumber: typeof data.nextNumber === 'number'
          ? data.nextNumber : state.nextNumber + data.nextNumber.increment };
        return state;
      }
    },
    proposalNumberReservation: {
      async findUnique({ where }) { return reservations.get(where.number) ?? null; },
      async create({ data }) {
        if (reservations.has(data.number)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const saved = { ...data, firstUsedAt: null };
        reservations.set(data.number, saved);
        return saved;
      },
      async updateMany({ where, data }) {
        const saved = reservations.get(where.number);
        if (saved && saved.firstUsedAt === null) Object.assign(saved, data);
        return { count: saved ? 1 : 0 };
      }
    },
    proposal: {
      async findFirst({ where }) {
        return [...proposals.values()].find(item => item.proposalCode === where.proposalCode) ?? null;
      },
      async findUnique({ where }) {
        const key = where.proposalCode_revisionNumber;
        return key ? proposals.get(`${key.proposalCode}:${key.revisionNumber}`) ?? null : null;
      },
      async findMany({ where }) {
        return [...proposals.values()]
          .filter(item => item.proposalCode === where.proposalCode &&
            (!where.createdByUserId || item.createdByUserId === where.createdByUserId))
          .sort((a, b) => b.revisionNumber - a.revisionNumber);
      },
      async create({ data }) {
        const key = `${data.proposalCode}:${data.revisionNumber}`;
        if (proposals.has(key)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const saved = { id: key, ...data };
        proposals.set(key, saved);
        return saved;
      }
    },
    async $transaction(action) { return action(db); }
  };
  return { db, reservations, proposals };
}

test('somatório da proposta respeita o cenário escolhido', () => {
  const payload = {
    prices: [
      { local: 'ONSHORE', value: 'R$ 1.200,00' },
      { local: 'OFFSHORE', value: 'R$ 2.500,00' }
    ],
    priceScenario: 'ONSHORE'
  };
  assert.equal(calculateProposalTotal(payload), 1200);
  assert.equal(calculateProposalTotal({ ...payload, priceScenario: 'OFFSHORE' }), 2500);
});

test('revisão legada mantém número, começa na revisão informada e não colide com a sequência', async () => {
  const seller = { id: 'seller', name: 'Vendedor', role: 'SELLER' };
  const colleague = { id: 'colleague', name: 'Colega', role: 'SELLER' };
  const { db, reservations } = fakeNumberingDatabase();
  await initializeNumbering(db, seller, 8700);

  assert.deepEqual(await registerLegacyRevision(db, seller, '8701', 3), {
    proposalCode: '8701', revisionNumber: 3, alreadyRegistered: false
  });
  assert.equal((await registerLegacyRevision(db, seller, '8701', 3)).alreadyRegistered, true);
  await assert.rejects(() => registerLegacyRevision(db, seller, '8701', 4), { status: 409 });
  await assert.rejects(() => registerLegacyRevision(db, colleague, '8701', 3), { status: 409 });
  await assert.rejects(() => assertReservedCode(db, seller, '8701', 0), { status: 409 });
  await assert.rejects(() => assertReservedCode(db, seller, '8701', 4), { status: 409 });
  await assert.rejects(() => assertReservedCode(db, colleague, '8701', 3), { status: 403 });

  assert.equal(await reserveNumber(db, seller), 8700);
  assert.equal(await reserveNumber(db, seller), 8702);
  assert.equal(reservations.get(8701).legacyFirstRevision, 3);

  const body = {
    proposalCode: '8701', revisionNumber: 3, costEstimateId: null,
    clientName: 'Cliente', cnpj: '12345678000100', contact: 'Contato',
    email: 'cliente@example.com', site: 'Obra', sellerUserId: seller.id,
    payload: { title: 'Revisão legada', prices: [{ value: 'R$ 1.200,00' }] }
  };
  const saved = await createProposal(db, seller, body);
  assert.equal(saved.revisionNumber, 3);
  assert.equal(saved.totalValue, 1200);
  assert.equal((await prepareRevision(db, seller, '8701')).nextRevision, 4);
  await assert.rejects(() => createProposal(db, seller, body), { status: 409 });
  const next = await createProposal(db, seller, { ...body, revisionNumber: 4 });
  assert.equal(next.revisionNumber, 4);
});

test('inicialização não sobrescreve uma sequência existente e reservas não se repetem', async () => {
  const manager = { id: 'manager', name: 'Gestor', role: 'MANAGER' };
  const seller = { id: 'seller', name: 'Vendedor', role: 'SELLER' };
  const viewer = { id: 'viewer', name: 'Consulta', role: 'VIEWER' };
  const { db, reservations } = fakeNumberingDatabase();
  await assert.rejects(() => reserveNumber(db, seller), { status: 503 });
  await assert.rejects(() => initializeNumbering(db, manager, 0), { status: 400 });
  assert.equal((await numberingStatus(db)).seeded, false);
  assert.equal((await initializeNumbering(db, manager, 8700)).seedValue, 8700);
  await assert.rejects(() => initializeNumbering(db, manager, 9000), { status: 409 });
  assert.equal(await reserveNumber(db, seller), 8700);
  assert.equal(await reserveNumber(db, manager), 8701);
  assert.equal(reservations.get(8700).reservedByUserId, seller.id);
  assert.equal(reservations.get(8701).reservedByUserId, manager.id);

  let denied = null;
  requireEstimator({ authUser: viewer }, {}, error => { denied = error; });
  assert.equal(denied.status, 403);
  denied = null;
  requireManager({ authUser: seller }, {}, error => { denied = error; });
  assert.equal(denied.status, 403);
});

test('administrador altera a sequência sem reutilizar reservas ou números legados', async () => {
  const admin = { id: 'admin', role: 'ADMIN' };
  const seller = { id: 'seller', role: 'SELLER' };
  const { db, reservations } = fakeNumberingDatabase();
  await assert.rejects(() => updateInitialNumber(db, admin, 9000), { status: 409 });
  await initializeNumbering(db, admin, 8700);
  await reserveNumber(db, seller);
  await reserveNumber(db, seller);
  await registerLegacyRevision(db, seller, '8702', 3);

  const changed = await updateInitialNumber(db, admin, 9000);
  assert.equal(changed.seedValue, 9000);
  assert.equal(changed.nextNumber, 9000);
  assert.deepEqual(await numberingStatus(db), changed);
  assert.equal(await reserveNumber(db, seller), 9000);

  await updateInitialNumber(db, admin, 8700);
  assert.equal(await reserveNumber(db, seller), 8703);
  assert.equal(reservations.get(8700).reservedByUserId, seller.id);
  assert.equal(reservations.get(8701).reservedByUserId, seller.id);
  assert.equal(reservations.get(8702).legacyFirstRevision, 3);
  await assertReservedCode(db, seller, '8700', 0);
  await assertReservedCode(db, seller, '8702', 3);
});

test('alteração da numeração exige administrador e inteiro positivo dentro do limite', async () => {
  const admin = { id: 'admin', role: 'ADMIN' };
  const { db } = fakeNumberingDatabase();
  await initializeNumbering(db, admin, 8700);
  const previous = await numberingStatus(db);
  for (const role of ['MANAGER', 'SELLER', 'VIEWER']) {
    const user = { id: role, role };
    await assert.rejects(() => updateInitialNumber(db, user, 9000), { status: 403 });
    let denied;
    requireAdmin({ authUser: user }, {}, error => { denied = error; });
    assert.equal(denied.status, 403);
  }
  for (const number of [0, -1, 1.5, '9000', NaN, Infinity, 2_147_483_647]) {
    await assert.rejects(() => updateInitialNumber(db, admin, number), { status: 400 });
  }
  assert.deepEqual(await numberingStatus(db), previous);
  await updateInitialNumber(db, admin, 2_147_483_646);
  assert.equal(await reserveNumber(db, admin), 2_147_483_646);
  await assert.rejects(() => reserveNumber(db, admin), { status: 409 });
});

test('API restringe alteração ao administrador e aplica a nova sequência nas reservas', async t => {
  const { db } = fakeNumberingDatabase();
  const server = createApp({
    commercialDb: db,
    authService: { authenticate: async role => role ? { id: role, role } : null }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/comercial`;
  async function request(path, role, body, method = 'PUT') {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json', 'X-Comercial-Request': '1',
        ...(role ? { Cookie: `comercial_session=${role}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  }

  assert.equal((await request('/numeracao/inicial', null, { initialNumber: 9000 })).status, 401);
  for (const role of ['MANAGER', 'SELLER', 'VIEWER']) {
    assert.equal((await request('/numeracao/inicial', role, { initialNumber: 9000 })).status, 403);
  }
  assert.equal((await request('/numeracao/inicial', 'ADMIN', { initialNumber: 9000 })).status, 409);
  assert.equal((await request('/numeracao/inicializar', 'MANAGER', { initialNumber: 8700 }, 'POST')).status, 201);
  assert.equal((await request('/propostas/proximo-numero', 'SELLER', null, 'POST')).data.numero, 8700);
  for (const initialNumber of [0, -1, 1.5, '9000', 2_147_483_647]) {
    assert.equal((await request('/numeracao/inicial', 'ADMIN', { initialNumber })).status, 400);
  }
  const changed = await request('/numeracao/inicial', 'ADMIN', { initialNumber: 9000 });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.seedValue, 9000);
  assert.equal(changed.data.nextNumber, 9000);
  assert.equal((await request('/propostas/proximo-numero', 'SELLER', null, 'POST')).data.numero, 9000);
  await request('/numeracao/inicial', 'ADMIN', { initialNumber: 8700 });
  assert.equal((await request('/propostas/proximo-numero', 'SELLER', null, 'POST')).data.numero, 8701);
});
