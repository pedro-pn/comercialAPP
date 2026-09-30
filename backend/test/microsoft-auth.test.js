import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createMicrosoftAuth } from '../src/auth/microsoft.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';
const redirectUri = 'https://commercial.example/api/auth/microsoft/callback';

function setup(overrides = {}) {
  let request;
  let tokenRequest;
  const clientApplication = {
    async getAuthCodeUrl(input) {
      request = input;
      return 'https://login.microsoftonline.com/example';
    },
    async acquireTokenByCode(input) {
      tokenRequest = input;
      return { idTokenClaims: {
        tid: tenantId, aud: clientId, oid: objectId,
        iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        nonce: input.nonce, ...overrides
      } };
    }
  };
  return {
    auth: createMicrosoftAuth({ tenantId, clientId, redirectUri,
      clientSecret: 'test-only-not-a-real-credential', clientApplication }),
    request: () => request,
    tokenRequest: () => tokenRequest
  };
}

test('login Microsoft valida state, nonce, tenant, público e PKCE', async () => {
  const provider = setup();
  const flow = await provider.auth.start();
  assert.equal(provider.request().redirectUri, redirectUri);
  assert.deepEqual(provider.request().scopes, ['openid', 'profile']);
  assert.deepEqual(await provider.auth.complete({
    code: 'code', state: provider.request().state, cookieValue: flow.cookieValue
  }), { tenantId, objectId });
  assert.equal(provider.request().codeChallenge,
    createHash('sha256').update(provider.tokenRequest().codeVerifier).digest('base64url'));
  await assert.rejects(() => provider.auth.complete({
    code: 'code', state: 'wrong', cookieValue: flow.cookieValue
  }), { status: 400 });
  await assert.rejects(() => provider.auth.complete({
    code: 'code', state: provider.request().state, cookieValue: flow.cookieValue + 'x'
  }), { status: 400 });
});

test('login Microsoft rejeita identidade de outro tenant ou outro público', async () => {
  for (const claims of [
    { tid: '44444444-4444-4444-8444-444444444444' },
    { aud: '44444444-4444-4444-8444-444444444444' },
    { oid: undefined },
    { nonce: 'wrong' }
  ]) {
    const provider = setup(claims);
    const flow = await provider.auth.start();
    await assert.rejects(() => provider.auth.complete({
      code: 'code', state: provider.request().state, cookieValue: flow.cookieValue
    }), { status: 401 });
  }
});

test('retorno Microsoft emite sessão somente para conta vinculada', async t => {
  let seenIdentity;
  const app = createApp({
    appOrigin: 'https://commercial.example',
    production: true,
    authService: {
      async loginMicrosoft(identity) {
        seenIdentity = identity;
        return { token: 'a'.repeat(64), user: { role: 'ADMIN' } };
      }
    },
    microsoftAuth: {
      async start() { return { url: 'https://login.microsoftonline.com/example',
        cookieValue: 'sealed-flow' }; },
      async complete({ code, state, cookieValue }) {
        assert.equal(code, 'test-code');
        assert.equal(state, 'test-state');
        assert.equal(cookieValue, 'sealed-flow');
        return { tenantId, objectId };
      }
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const start = await fetch(`${base}/api/auth/microsoft`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  assert.match(start.headers.get('set-cookie'), /comercial_microsoft_flow=sealed-flow/);
  assert.match(start.headers.get('set-cookie'), /SameSite=Lax/);
  const flowCookie = start.headers.get('set-cookie').split(';')[0];
  const callback = await fetch(
    `${base}/api/auth/microsoft/callback?code=test-code&state=test-state`,
    { redirect: 'manual', headers: { Cookie: flowCookie } }
  );
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), 'https://commercial.example/');
  assert.deepEqual(seenIdentity, { tenantId, objectId });
  assert.match(callback.headers.get('set-cookie'), /comercial_session=/);
  assert.match(callback.headers.get('set-cookie'), /Max-Age=86400/);
  assert.match(callback.headers.get('set-cookie'), /Secure/);
});
