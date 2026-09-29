import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProposalTotal } from '../src/comercial/proposals.js';
import { requireEstimator, requireManager } from '../src/comercial/access.js';
import { initializeNumbering, numberingStatus, reserveNumber } from '../src/comercial/numbering.js';

function fakeNumberingDatabase() {
  let state = null;
  const reservations = new Map();
  const db = {
    proposalNumberingState: {
      async findUnique() { return state; },
      async create({ data }) {
        if (state) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state = { ...data, seededAt: new Date() };
        return state;
      },
      async update() {
        if (!state) throw Object.assign(new Error('missing'), { code: 'P2025' });
        state = { ...state, nextNumber: state.nextNumber + 1 };
        return state;
      }
    },
    proposalNumberReservation: {
      async create({ data }) {
        if (reservations.has(data.number)) throw new Error('duplicate reservation');
        reservations.set(data.number, data);
        return data;
      }
    },
    async $transaction(action) { return action(db); }
  };
  return { db, reservations };
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

test('numeração exige configuração única e reservas sem repetição', async () => {
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
