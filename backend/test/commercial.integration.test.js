import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('rascunhos, autoria, valores e concorrência no banco próprio', { skip: !databaseUrl }, async t => {
  assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
  const db = createDatabase(databaseUrl);
  const auth = createAuthService(db);
  const server = createApp({ authService: auth, commercialDb: db,
    appOrigin: 'http://localhost:5174' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
  });

  await db.proposal.deleteMany();
  await db.costEstimateVersion.deleteMany();
  await db.costEstimate.deleteMany();
  await db.proposalNumberReservation.deleteMany();
  await db.proposalNumberingState.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  const manager = await auth.bootstrapManager({
    username: 'gestor', name: 'Gestor', password: 'senha-segura-123'
  });
  const seller = await auth.createUser({
    username: 'vendedor', name: 'Vendedor', role: 'SELLER', password: 'senha-segura-456'
  });
  await auth.createUser({
    username: 'colega', name: 'Outro Vendedor', role: 'SELLER', password: 'senha-segura-789'
  });
  await auth.createUser({
    username: 'consulta', name: 'Consulta', role: 'VIEWER', password: 'senha-segura-abc'
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Comercial-Request': '1',
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json(), response };
  };
  const login = async (username, password) => {
    const result = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  const managerCookie = await login('gestor', 'senha-segura-123');
  const sellerCookie = await login('vendedor', 'senha-segura-456');
  const colleagueCookie = await login('colega', 'senha-segura-789');
  const viewerCookie = await login('consulta', 'senha-segura-abc');

  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).status, 503);
  assert.equal((await request('/api/comercial/numeracao/inicializar', {
    method: 'POST', cookie: managerCookie, body: { initialNumber: 8700 }
  })).status, 201);
  assert.equal((await request('/api/comercial/numeracao/inicializar', {
    method: 'POST', cookie: managerCookie, body: { initialNumber: 9000 }
  })).status, 409);
  const reserved = await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  });
  assert.equal(reserved.data.numero, 8700);
  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).data.numero, 8701);

  const estimate = await request('/api/comercial/levantamentos', {
    method: 'POST', cookie: sellerCookie,
    body: {
      proposalCode: '8700', title: 'Levantamento de teste', mode: 'NOVA',
      status: 'SALVO', payload: {}
    }
  });
  assert.equal(estimate.status, 201);
  assert.equal(estimate.data.proposalCode, '8700');
  assert.equal(Number(estimate.data.totalCost), 0);

  const proposal = await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie,
    body: {
      proposalCode: '8700', costEstimateId: estimate.data.id,
      clientName: 'Cliente Teste', cnpj: '12345678000100',
      contact: 'Contato', email: 'cliente@example.com', site: 'Obra',
      sellerUserId: seller.id,
      payload: { title: 'Teste', prices: [{ local: 'ONSHORE', value: 'R$ 1.200,00' }] }
    }
  });
  assert.equal(proposal.status, 201);
  assert.equal(Number(proposal.data.totalValue), 1200);
  assert.equal(proposal.data.createdByUserId, seller.id);

  const listForViewer = await request('/api/comercial/propostas', { cookie: viewerCookie });
  assert.equal(listForViewer.status, 200);
  assert.equal(listForViewer.data.items.length, 1);
  assert.equal('totalValue' in listForViewer.data.items[0], false);
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}`, {
    cookie: viewerCookie
  })).status, 403);
  assert.equal((await request('/api/comercial/propostas', {
    cookie: colleagueCookie
  })).data.items.length, 0);
  assert.equal((await request(`/api/comercial/levantamentos/${estimate.data.id}`, {
    cookie: colleagueCookie
  })).status, 403);
  assert.equal((await request('/api/comercial/propostas', {
    method: 'POST', cookie: colleagueCookie,
    body: {
      proposalCode: '8700', clientName: 'Outro', cnpj: '12345678000100',
      contact: 'Contato', email: 'outro@example.com', site: 'Obra',
      sellerUserId: seller.id, payload: {}
    }
  })).status, 403);

  const updated = await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: proposal.data.updatedAt,
      payload: { prices: [{ local: 'ONSHORE', value: 'R$ 1.500,00' }] } }
  });
  assert.equal(updated.status, 200);
  assert.equal(Number(updated.data.totalValue), 1500);
  const stale = await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: proposal.data.updatedAt,
      payload: { prices: [{ local: 'ONSHORE', value: 'R$ 2.000,00' }] } }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'COMERCIAL_CONCURRENT_WRITE');
  assert.equal(manager.role, 'MANAGER');
});
