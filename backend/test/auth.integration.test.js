import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('administração, tokens de API e revogação de sessão', { skip: !databaseUrl }, async t => {
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.pathname, '/comercialapp_test', 'Use um banco exclusivo para testes.');

  const db = createDatabase(databaseUrl);
  const auth = createAuthService(db);
  const app = createApp({ authService: auth, commercialDb: db, appOrigin: 'http://localhost:8086',
    additionalOrigins: ['http://localhost:5174'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
  });
  await db.crmProposalEvent.deleteMany();
  await db.proposal.deleteMany();
  await db.costEstimateVersion.deleteMany();
  await db.costEstimate.deleteMany();
  await db.proposalNumberReservation.deleteMany();
  await db.proposalNumberingState.deleteMany();
  await db.session.deleteMany();
  await db.apiCredential.deleteMany();
  await db.user.deleteMany();

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
    return { response, json: response.status === 204 ? null : await response.json() };
  };

  const admin = await auth.bootstrapAdmin({
    username: 'admin', name: 'Administrador Comercial', password: 'senha-segura-123'
  });
  assert.equal(admin.role, 'ADMIN');
  await assert.rejects(() => auth.bootstrapAdmin({
    username: 'outro', name: 'Outro Gestor', password: 'senha-segura-123'
  }), { status: 409 });

  assert.equal((await request('/api/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'errada' }
  })).response.status, 401);
  assert.equal((await fetch(base + '/api/auth/login', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Comercial-Request': '1',
      Origin: 'http://localhost:5174'
    },
    body: JSON.stringify({ username: 'admin', password: 'errada' })
  })).status, 401);
  assert.equal((await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'senha-segura-123' })
  })).status, 403);
  assert.equal((await fetch(base + '/api/auth/login', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Comercial-Request': '1',
      Origin: 'https://outra-origem.example'
    },
    body: JSON.stringify({ username: 'admin', password: 'senha-segura-123' })
  })).status, 403);

  const login = await request('/api/auth/login', {
    method: 'POST', body: { username: 'ADMIN', password: 'senha-segura-123' }
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.json.user.username, 'admin');
  assert.equal(login.json.user.passwordHash, undefined);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.response.headers.get('set-cookie'), /Max-Age=604800/);
  const adminCookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/auth/me', { cookie: adminCookie })).json.user.role, 'ADMIN');
  assert.equal((await request('/api/users')).response.status, 401);
  assert.equal((await request('/api/users', {
    method: 'POST', cookie: adminCookie,
    body: { username: 'sem-nome', name: 'X', role: 'SELLER', password: 'senha-segura-123' }
  })).response.status, 400);

  const created = await request('/api/users', {
    method: 'POST', cookie: adminCookie,
    body: { username: 'vendedor', name: 'Vendedor Teste', role: 'SELLER', password: 'senha-segura-456' }
  });
  assert.equal(created.response.status, 201);
  const sellerId = created.json.user.id;
  assert.equal((await request('/api/users', { cookie: adminCookie })).json.users.length, 2);

  const manager = await request('/api/users', {
    method: 'POST', cookie: adminCookie,
    body: { username: 'gestor', name: 'Gestor', role: 'MANAGER', password: 'senha-segura-789' }
  });
  assert.equal(manager.response.status, 201);
  const managerLogin = await request('/api/auth/login', {
    method: 'POST', body: { username: 'gestor', password: 'senha-segura-789' }
  });
  const managerCookie = managerLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/admin/api-credentials', { cookie: managerCookie })).response.status, 403);
  assert.equal((await request('/api/users', { method: 'POST', cookie: managerCookie,
    body: { username: 'outroadmin', name: 'Outro Admin', role: 'ADMIN', password: 'senha-segura-abc' }
  })).response.status, 403);
  assert.equal((await request(`/api/users/${admin.id}`, { method: 'PATCH', cookie: managerCookie,
    body: { role: 'SELLER' }
  })).response.status, 403);

  const issued = await request('/api/admin/api-credentials', {
    method: 'POST', cookie: adminCookie, body: { name: 'CRM Prisma', expiresInDays: 90 }
  });
  assert.equal(issued.response.status, 201);
  assert.match(issued.json.token, /^cma_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
  const credentialId = issued.json.credential.id;
  const listed = await request('/api/admin/api-credentials', { cookie: adminCookie });
  assert.equal(listed.json.items.length, 1);
  assert.equal(JSON.stringify(listed.json).includes(issued.json.token), false);
  assert.equal(JSON.stringify(listed.json).includes('tokenHash'), false);
  const proposal = await db.proposal.create({ data: {
    proposalCode: '999999', revisionNumber: 0, clientName: 'Cliente Teste',
    cnpj: '00000000000000', contact: 'Contato', email: 'teste@example.com',
    site: 'Unidade Teste', sellerUserId: admin.id, sellerName: admin.name,
    estimatorName: admin.name, payload: {}, totalValue: '1.00',
    status: 'FINALIZADA', createdByUserId: admin.id
  } });
  const event = { contractVersion: 1, eventId: randomUUID(), proposalCode: '999999',
    revisionNumber: 0, opportunityId: 'prisma-teste-123', approvalStatus: 'REJECTED',
    occurredAt: new Date().toISOString() };
  assert.equal((await request(`/api/admin/api-credentials/${credentialId}/preview`, {
    method: 'POST', cookie: managerCookie, body: event
  })).response.status, 403);
  const preview = await request(`/api/admin/api-credentials/${credentialId}/preview`, {
    method: 'POST', cookie: adminCookie, body: event
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.json.valid, true);
  assert.equal(await db.crmProposalEvent.count(), 0);
  const sendEvent = async body => {
    const response = await fetch(base + '/api/integrations/crm/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        Authorization: `Bearer ${issued.json.token}` }, body: JSON.stringify(body)
    });
    return response.status;
  };
  assert.equal(await sendEvent(event), 202);
  assert.equal((await db.proposal.findUnique({ where: { id: proposal.id } })).crmOpportunityId,
    'prisma-teste-123');
  assert.equal((await db.crmProposalEvent.findUnique({ where: { eventId: event.eventId } })).source,
    'PRISMA');
  assert.equal(await sendEvent(event), 200);
  assert.equal(await sendEvent({ ...event, approvalStatus: 'APPROVED' }), 409);
  assert.equal(await sendEvent({ ...event, eventId: randomUUID(),
    opportunityId: 'outro-id', occurredAt: new Date(Date.now() + 1000).toISOString() }), 409);
  assert.equal((await fetch(base + '/api/integrations/crm/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${issued.json.token}` }, body: '{}'
  })).status, 400);
  assert.equal((await request(`/api/admin/api-credentials/${credentialId}/revoke`, {
    method: 'POST', cookie: adminCookie
  })).response.status, 200);
  assert.equal((await fetch(base + '/api/integrations/crm/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${issued.json.token}` }, body: '{}'
  })).status, 401);

  const sellerLogin = await request('/api/auth/login', {
    method: 'POST', body: { username: 'vendedor', password: 'senha-segura-456' }
  });
  const sellerCookie = sellerLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/users', { cookie: sellerCookie })).response.status, 403);
  assert.equal((await request(`/api/users/${admin.id}`, {
    method: 'PATCH', cookie: adminCookie, body: { role: 'VIEWER' }
  })).response.status, 409);

  assert.equal((await request(`/api/users/${sellerId}`, {
    method: 'PATCH', cookie: adminCookie, body: { isActive: false }
  })).response.status, 200);
  assert.equal((await request('/api/auth/me', { cookie: sellerCookie })).response.status, 401);
  assert.equal((await request('/api/auth/logout', {
    method: 'POST', cookie: adminCookie
  })).response.status, 204);
  assert.equal((await request('/api/auth/me', { cookie: adminCookie })).response.status, 401);
});
