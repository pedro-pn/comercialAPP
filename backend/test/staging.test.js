import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { readRuntimeConfig } from '../src/runtime-config.js';

test('HTTP é permitido no staging e produção continua exigindo HTTPS', () => {
  const env = { NODE_ENV: 'production', APP_ORIGIN: 'http://192.0.2.1:8087' };
  assert.throws(() => readRuntimeConfig(env), /HTTPS pública em produção/);
  assert.throws(() => readRuntimeConfig({ ...env, APP_ENV: 'development' }), /HTTPS pública em produção/);
  assert.throws(() => readRuntimeConfig({ NODE_ENV: 'production', APP_ENV: 'staging' }), /obrigatória/);
  for (const origin of ['http://192.0.2.1:8087/', 'http://192.0.2.1:8087/comercial',
    'http://192.0.2.1:8087?teste=1', 'ftp://192.0.2.1']) {
    assert.throws(() => readRuntimeConfig({ ...env, APP_ENV: 'staging', APP_ORIGIN: origin }), /apenas uma origem/);
  }
  const staging = readRuntimeConfig({ ...env, APP_ENV: 'staging',
    APP_ADDITIONAL_ORIGINS: 'http://outra-origem.example' });
  assert.equal(staging.production, true);
  assert.equal(staging.secureCookies, false);
  assert.deepEqual(staging.additionalOrigins, []);
});

test('login local de staging usa sessão própria, valida origem e permite logout em HTTP', async t => {
  const config = readRuntimeConfig({ NODE_ENV: 'production', APP_ENV: 'staging',
    APP_ORIGIN: 'http://192.0.2.1:8087' });
  const user = { id: 'staging-admin', username: 'admin', role: 'ADMIN' };
  let sessionToken = null;
  const app = createApp({ ...config, authService: {
    async login() { sessionToken = 'staging-token'; return { token: sessionToken, user }; },
    async authenticate(token) { return token && token === sessionToken ? user : null; },
    async logout(token) { assert.equal(token, sessionToken); sessionToken = null; }
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const loginOptions = origin => ({ method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Comercial-Request': '1', Origin: origin
  }, body: JSON.stringify({ username: 'admin', password: 'staging-password' }) });

  assert.deepEqual(await (await fetch(`${base}/api/auth/providers`)).json(), { microsoft: false });
  assert.equal((await fetch(`${base}/api/auth/microsoft`, { redirect: 'manual' })).status, 404);
  assert.equal((await fetch(`${base}/api/auth/login`, loginOptions('http://192.0.2.1'))).status, 403);
  const login = await fetch(`${base}/api/auth/login`, loginOptions(config.appOrigin));
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /^comercial_staging_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api/);
  assert.doesNotMatch(setCookie, /; Secure/);
  const cookie = setCookie.split(';')[0];
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { user });
  assert.equal((await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: 'comercial_session=staging-token' }
  })).status, 401);

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST',
    headers: { 'X-Comercial-Request': '1', Origin: config.appOrigin, Cookie: cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /^comercial_staging_session=;/);
  assert.doesNotMatch(logout.headers.get('set-cookie'), /; Secure/);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
});

test('staging com HTTPS marca a sessão como Secure', async t => {
  const config = readRuntimeConfig({ NODE_ENV: 'production', APP_ENV: 'staging',
    APP_ORIGIN: 'https://comercial-staging.example' });
  const app = createApp({ ...config, authService: {
    async login() { return { token: 'staging-token', user: { role: 'ADMIN' } }; }
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const login = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Comercial-Request': '1',
      Origin: config.appOrigin }, body: JSON.stringify({ username: 'admin', password: 'test-password' })
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /; Secure/);
});
