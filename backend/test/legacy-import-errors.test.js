import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { lecFixture } from './fixtures/legacy-lec.js';

test('upload de LEC informa a reserva do número antes de analisar o PDF', async t => {
  const seller = { id: 'seller', role: 'SELLER' };
  let reservation = { number: 4619, reservedByUserId: seller.id, legacyFirstRevision: null };
  const db = {
    proposalNumberReservation: {
      findUnique: async ({ where }) => where.number === 4619 ? reservation : null
    }
  };
  const server = createApp({ commercialDb: db,
    authService: { authenticate: async role => ({ ...seller, role }) }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const files = {
    lec: { fileName: 'LEC.xlsm', base64: lecFixture({ proposalCode: 4619 }).toString('base64') },
    pdf: { fileName: 'proposta.pdf', base64: Buffer.from('PDF inválido').toString('base64') }
  };
  const input = { ...files, proposalCode: '4619', revisionNumber: 2, modelo: 'padrao', resolutions: {} };
  async function request(action, body, role = 'SELLER') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/comercial/propostas/legado/lec/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Comercial-Request': '1',
        Cookie: `comercial_session=${role}` }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const reserved = {
    status: 409,
    body: { error: 'O número 4619 já está reservado no app. Confira o histórico antes de importar a proposta legada.' }
  };
  assert.deepEqual(await request('previa', { lec: files.lec }), reserved);
  assert.deepEqual(await request('previa', files), reserved);
  assert.deepEqual(await request('importar', input), reserved);

  reservation = null;
  const preview = await request('previa', { lec: files.lec });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.proposalCode, '4619');
  assert.deepEqual(await request('previa', files), {
    status: 422, body: { error: 'Selecione uma proposta em PDF válido.' }
  });
  assert.deepEqual(await request('importar', input), {
    status: 422, body: { error: 'Selecione uma proposta em PDF válido.' }
  });

  // Preview allows choosing a manually reserved legacy revision and retrying an import.
  reservation = { number: 4619, reservedByUserId: seller.id, legacyFirstRevision: 3 };
  assert.equal((await request('previa', { lec: files.lec })).status, 200);
  assert.deepEqual(await request('importar', input), reserved);
  assert.deepEqual(await request('importar', { ...input, revisionNumber: 3 }), {
    status: 422, body: { error: 'Selecione uma proposta em PDF válido.' }
  });
});
