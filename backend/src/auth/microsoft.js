import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { HttpError } from './service.js';

const scopes = ['openid', 'profile'];
const flowLifetimeMs = 10 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sealFlow(flow, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(flow), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function openFlow(value, key) {
  try {
    const bytes = Buffer.from(value ?? '', 'base64url');
    if (bytes.length < 29 || bytes.length > 4096) throw new Error('invalid flow');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
      .toString('utf8'));
  } catch {
    throw new HttpError(400, 'Tentativa de login Microsoft inválida ou expirada.');
  }
}

export function createMicrosoftAuth({ tenantId, clientId, redirectUri, privateKeyPath,
  certificateThumbprint, clientSecret, clientApplication } = {}) {
  if (!uuid.test(tenantId ?? '') || !uuid.test(clientId ?? '')) {
    throw new Error('Configure ENTRA_TENANT_ID e ENTRA_CLIENT_ID com UUIDs válidos.');
  }
  if (!redirectUri || new URL(redirectUri).pathname !== '/api/auth/microsoft/callback') {
    throw new Error('URI de retorno Microsoft inválida.');
  }
  const privateKey = privateKeyPath ? readFileSync(privateKeyPath, 'utf8') : null;
  if (Boolean(privateKey) === Boolean(clientSecret) ||
      privateKey && !/^[a-f0-9]{64}$/i.test(certificateThumbprint ?? '')) {
    throw new Error('Configure um certificado SHA-256 ou ENTRA_CLIENT_SECRET para o login Microsoft.');
  }
  const credential = privateKey
    ? { clientCertificate: { thumbprintSha256: certificateThumbprint, privateKey } }
    : { clientSecret };
  const client = clientApplication ?? new ConfidentialClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, ...credential }
  });
  const key = createHash('sha256').update('comercialapp-entra-flow-v1')
    .update(privateKey ?? clientSecret).digest();

  return {
    async start() {
      const flow = {
        state: randomBytes(32).toString('hex'),
        nonce: randomBytes(32).toString('hex'),
        verifier: randomBytes(32).toString('base64url'),
        expiresAt: Date.now() + flowLifetimeMs
      };
      const challenge = createHash('sha256').update(flow.verifier).digest('base64url');
      const url = await client.getAuthCodeUrl({
        scopes, redirectUri, state: flow.state, nonce: flow.nonce,
        codeChallenge: challenge, codeChallengeMethod: 'S256',
        prompt: 'select_account'
      });
      return { url, cookieValue: sealFlow(flow, key) };
    },
    async complete({ code, state, cookieValue }) {
      const flow = openFlow(cookieValue, key);
      const receivedState = typeof state === 'string' ? Buffer.from(state, 'utf8') : Buffer.alloc(0);
      const expectedState = Buffer.from(flow.state ?? '', 'utf8');
      if (flow.expiresAt <= Date.now() || receivedState.length !== expectedState.length ||
          !timingSafeEqual(receivedState, expectedState) || !/^[a-f0-9]{64}$/.test(flow.nonce ?? '') ||
          !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier ?? '') ||
          typeof code !== 'string' || !code || code.length > 4096) {
        throw new HttpError(400, 'Tentativa de login Microsoft inválida ou expirada.');
      }
      const result = await client.acquireTokenByCode({
        code, scopes, redirectUri, nonce: flow.nonce, codeVerifier: flow.verifier
      });
      const claims = result?.idTokenClaims;
      if (claims?.tid?.toLowerCase() !== tenantId.toLowerCase() ||
          claims?.aud?.toLowerCase() !== clientId.toLowerCase() ||
          claims?.nonce !== flow.nonce || !uuid.test(claims?.oid ?? '') ||
          claims?.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`) {
        throw new HttpError(401, 'Identidade Microsoft inválida.');
      }
      return { tenantId: claims.tid.toLowerCase(), objectId: claims.oid.toLowerCase() };
    }
  };
}

export function createMicrosoftAuthFromEnv(appOrigin) {
  if (process.env.ENTRA_LOGIN_ENABLED !== 'on') return null;
  if (!appOrigin) throw new Error('APP_ORIGIN é obrigatória para login Microsoft.');
  return createMicrosoftAuth({
    tenantId: process.env.ENTRA_TENANT_ID,
    clientId: process.env.ENTRA_CLIENT_ID,
    redirectUri: `${appOrigin}/api/auth/microsoft/callback`,
    privateKeyPath: process.env.ENTRA_PRIVATE_KEY_PATH,
    certificateThumbprint: process.env.ENTRA_CERT_SHA256_THUMBPRINT,
    clientSecret: process.env.ENTRA_CLIENT_SECRET
  });
}
