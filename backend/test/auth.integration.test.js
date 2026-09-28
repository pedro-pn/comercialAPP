import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('login local, permissões do gestor e revogação de sessão', { skip: !databaseUrl }, async t => {
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.pathname, '/comercialapp_test', 'Use um banco exclusivo para testes.');

  const db = createDatabase(databaseUrl);
  const auth = createAuthService(db);
  const app = createApp({ authService: auth, appOrigin: 'http://localhost:5174' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
  });
  await db.session.deleteMany();
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

  const manager = await auth.bootstrapManager({
    username: 'gestor', name: 'Gestor Comercial', password: 'senha-segura-123'
  });
  assert.equal(manager.role, 'MANAGER');
  await assert.rejects(() => auth.bootstrapManager({
    username: 'outro', name: 'Outro Gestor', password: 'senha-segura-123'
  }), { status: 409 });

  assert.equal((await request('/api/auth/login', {
    method: 'POST', body: { username: 'gestor', password: 'errada' }
  })).response.status, 401);
  assert.equal((await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'gestor', password: 'senha-segura-123' })
  })).status, 403);
  assert.equal((await fetch(base + '/api/auth/login', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Comercial-Request': '1',
      Origin: 'https://outra-origem.example'
    },
    body: JSON.stringify({ username: 'gestor', password: 'senha-segura-123' })
  })).status, 403);

  const login = await request('/api/auth/login', {
    method: 'POST', body: { username: 'GESTOR', password: 'senha-segura-123' }
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.json.user.username, 'gestor');
  assert.equal(login.json.user.passwordHash, undefined);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
  const managerCookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/auth/me', { cookie: managerCookie })).json.user.role, 'MANAGER');
  assert.equal((await request('/api/users')).response.status, 401);
  assert.equal((await request('/api/users', {
    method: 'POST', cookie: managerCookie,
    body: { username: 'sem-nome', name: 'X', role: 'SELLER', password: 'senha-segura-123' }
  })).response.status, 400);

  const created = await request('/api/users', {
    method: 'POST', cookie: managerCookie,
    body: { username: 'vendedor', name: 'Vendedor Teste', role: 'SELLER', password: 'senha-segura-456' }
  });
  assert.equal(created.response.status, 201);
  const sellerId = created.json.user.id;
  assert.equal((await request('/api/users', { cookie: managerCookie })).json.users.length, 2);

  const sellerLogin = await request('/api/auth/login', {
    method: 'POST', body: { username: 'vendedor', password: 'senha-segura-456' }
  });
  const sellerCookie = sellerLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/users', { cookie: sellerCookie })).response.status, 403);
  assert.equal((await request(`/api/users/${manager.id}`, {
    method: 'PATCH', cookie: managerCookie, body: { role: 'VIEWER' }
  })).response.status, 409);

  assert.equal((await request(`/api/users/${sellerId}`, {
    method: 'PATCH', cookie: managerCookie, body: { isActive: false }
  })).response.status, 200);
  assert.equal((await request('/api/auth/me', { cookie: sellerCookie })).response.status, 401);
  assert.equal((await request('/api/auth/logout', {
    method: 'POST', cookie: managerCookie
  })).response.status, 204);
  assert.equal((await request('/api/auth/me', { cookie: managerCookie })).response.status, 401);
});
