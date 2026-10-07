import express from 'express';
import { ZodError } from 'zod';
import { HttpError, microsoftSessionHours, normalizeUsername, sessionDays } from './auth/service.js';
import { CRM_API_SCOPES, CRM_EVENTS_SCOPE, CRM_RELEASES_SCOPE,
  createApiCredential, listApiCredentials, requireActiveApiCredential,
  requireCrmApiCredential, revokeApiCredential } from './auth/api-credentials.js';
import { createCommercialRouter } from './comercial/routes.js';
import { requireCrmEventToken, recordCrmEvent, deliverToFiltro,
  syncNectarOpportunity, previewCrmEvent } from './comercial/crm-bridge.js';
import { recordCrmRelease } from './comercial/crm-releases.js';
import { crmEventSchema } from './comercial/crm-event-schema.js';
import { z } from 'zod';

const microsoftFlowCookieName = 'comercial_microsoft_flow';
const sessionMaxAge = sessionDays * 24 * 60 * 60 * 1000;

function readCookie(request, name) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1) ?? null;
}
function sessionCookieOptions(secureCookies) {
  return { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/api' };
}

function loginLimiter() {
  const attempts = new Map();
  return {
    check(key) {
      const entry = attempts.get(key);
      if (entry && entry.until > Date.now() && entry.count >= 10) {
        throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
      }
    },
    failed(key) {
      const entry = attempts.get(key);
      attempts.set(key, entry && entry.until > Date.now()
        ? { count: entry.count + 1, until: entry.until }
        : { count: 1, until: Date.now() + 15 * 60 * 1000 });
      if (attempts.size > 10_000) {
        for (const [name, value] of attempts) {
          if (value.until <= Date.now()) attempts.delete(name);
        }
        if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value);
      }
    },
    clear(key) { attempts.delete(key); }
  };
}

export function createApp({ authService, commercialDb, crm, appOrigin, additionalOrigins = [],
  production = false, secureCookies = production, sessionCookieName = 'comercial_session',
  microsoftAuth = null } = {}) {
  const app = express();
  const readSessionCookie = request => readCookie(request, sessionCookieName);
  const limiter = loginLimiter();
  const allowedOrigins = new Set([appOrigin, ...additionalOrigins].filter(Boolean));
  app.disable('x-powered-by');
  const jsonBody = express.json({ limit: '1mb' });
  app.use((request, response, next) => {
    // Anexos podem ser arquivos JSON; o parser global não deve consumir o binário.
    if (request.method === 'POST' && (
      request.path === '/api/comercial/escopo/fotos' ||
      /^\/api\/comercial\/propostas\/legado\/lec\/(previa|importar)$/.test(request.path) ||
      /^\/api\/comercial\/propostas\/[^/]+\/anexos$/.test(request.path)
    )) return next();
    return jsonBody(request, response, next);
  });

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'comercialapp' });
  });

  app.use('/api', (request, _response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (request.path === '/integrations/crm/events' || request.path === '/integrations/crm/releases' ||
          request.path === '/integrations/nectar/webhook') return next();
      if (request.get('x-comercial-request') !== '1' ||
          request.get('origin') && allowedOrigins.size && !allowedOrigins.has(request.get('origin'))) {
        return next(new HttpError(403, 'Origem da requisição não autorizada.'));
      }
    }
    next();
  });

  app.post('/api/integrations/crm/releases', requireCrmApiCredential(commercialDb, CRM_RELEASES_SCOPE),
    async (request, response) => {
      const result = await recordCrmRelease(commercialDb, request.body);
      response.status(result.duplicate ? 200 : 202).json(result);
    });
  app.post('/api/integrations/crm/events', requireCrmApiCredential(commercialDb), async (request, response) => {
    const event = crmEventSchema.parse(request.body);
    const recorded = await recordCrmEvent(commercialDb, event, 'PRISMA');
    let delivery = null;
    if (recorded.approvalStatus === 'APPROVED' && event.projectId && !recorded.duplicate) {
      delivery = await deliverToFiltro(commercialDb, recorded.proposalId)
        .catch(error => ({ status: 'PENDENTE', message: error.message }));
    }
    response.status(recorded.duplicate ? 200 : 202).json({ ...recorded, delivery });
  });
  app.post('/api/integrations/nectar/webhook', requireCrmEventToken, async (request, response) => {
    const id = request.body?.oportunidade?.id ?? request.body?.data?.oportunidade?.id ??
      request.body?.data?.id ?? request.body?.id;
    if (!/^\d+$/.test(String(id ?? ''))) throw new HttpError(400, 'Webhook sem ID da oportunidade.');
    const result = await syncNectarOpportunity(commercialDb, String(id));
    response.status(result.pending ? 200 : 202).json(result);
  });

  const requireAuth = async (request, _response, next) => {
    try {
      const user = await authService.authenticate(readSessionCookie(request));
      if (!user) throw new HttpError(401, 'Sessão inválida ou expirada.');
      request.authUser = user;
      next();
    } catch (error) { next(error); }
  };

  const requireManager = (request, _response, next) => {
    if (!['ADMIN', 'MANAGER'].includes(request.authUser.role)) {
      return next(new HttpError(403, 'Acesso exclusivo da gestão.'));
    }
    next();
  };

  const requireAdmin = (request, _response, next) => {
    if (request.authUser.role !== 'ADMIN') return next(new HttpError(403, 'Acesso exclusivo do administrador.'));
    next();
  };

  app.post('/api/auth/login', async (request, response) => {
    const { username, password } = request.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256) {
      throw new HttpError(400, 'Informe usuário e senha.');
    }
    let key;
    try { key = normalizeUsername(username); } catch { key = username.slice(0, 50).toLowerCase(); }
    limiter.check(key);
    try {
      const result = await authService.login(username, password);
      limiter.clear(key);
      response.cookie(sessionCookieName, result.token, {
        ...sessionCookieOptions(secureCookies), maxAge: sessionMaxAge
      });
      response.set('Cache-Control', 'no-store').json({ user: result.user });
    } catch (error) {
      if (error.status === 401) limiter.failed(key);
      throw error;
    }
  });

  app.get('/api/auth/providers', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ microsoft: Boolean(microsoftAuth) });
  });

  app.get('/api/auth/microsoft', async (_request, response) => {
    if (!microsoftAuth) throw new HttpError(404, 'Login Microsoft indisponível.');
    const flow = await microsoftAuth.start();
    response.cookie(microsoftFlowCookieName, flow.cookieValue, {
      httpOnly: true, secure: secureCookies, sameSite: 'lax',
      path: '/api/auth/microsoft/callback', maxAge: 10 * 60 * 1000
    });
    response.set('Cache-Control', 'no-store').redirect(302, flow.url);
  });

  app.get('/api/auth/microsoft/callback', async (request, response) => {
    if (!microsoftAuth) throw new HttpError(404, 'Login Microsoft indisponível.');
    const cookieValue = readCookie(request, microsoftFlowCookieName);
    response.clearCookie(microsoftFlowCookieName, {
      httpOnly: true, secure: secureCookies, sameSite: 'lax',
      path: '/api/auth/microsoft/callback'
    });
    try {
      if (request.query.error) throw new HttpError(401, 'Login Microsoft cancelado.');
      const identity = await microsoftAuth.complete({
        code: request.query.code, state: request.query.state, cookieValue
      });
      const result = await authService.loginMicrosoft(identity);
      response.cookie(sessionCookieName, result.token, {
        ...sessionCookieOptions(secureCookies),
        maxAge: microsoftSessionHours * 60 * 60 * 1000
      });
      response.set('Cache-Control', 'no-store').redirect(303, `${appOrigin}/`);
    } catch (error) {
      if (!Number.isInteger(error?.status)) console.error('Falha no login Microsoft:', error);
      response.set('Cache-Control', 'no-store')
        .redirect(303, `${appOrigin}/?auth_error=microsoft`);
    }
  });

  app.get('/api/auth/me', requireAuth, (request, response) => {
    response.set('Cache-Control', 'no-store').json({ user: request.authUser });
  });

  app.post('/api/auth/logout', async (request, response) => {
    await authService.logout(readSessionCookie(request));
    response.clearCookie(sessionCookieName, sessionCookieOptions(secureCookies));
    response.status(204).end();
  });

  app.get('/api/users', requireAuth, requireManager, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ users: await authService.listUsers() });
  });

  app.post('/api/users', requireAuth, requireManager, async (request, response) => {
    const user = await authService.createUser(request.body ?? {}, request.authUser);
    response.status(201).json({ user });
  });

  app.patch('/api/users/:id', requireAuth, requireManager, async (request, response) => {
    const user = await authService.updateUser(request.params.id, request.body, request.authUser);
    response.json({ user });
  });

  app.get('/api/admin/api-credentials', requireAuth, requireAdmin, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ items: await listApiCredentials(commercialDb) });
  });

  app.post('/api/admin/api-credentials', requireAuth, requireAdmin, async (request, response) => {
    const input = z.object({
      name: z.string().trim().min(3).max(100),
      expiresInDays: z.number().int().min(1).max(365).nullable(),
      scopeCode: z.enum(CRM_API_SCOPES).default(CRM_EVENTS_SCOPE)
    }).strict().parse(request.body);
    response.set('Cache-Control', 'no-store').status(201)
      .json(await createApiCredential(commercialDb, request.authUser, input));
  });

  app.post('/api/admin/api-credentials/:id/revoke', requireAuth, requireAdmin, async (request, response) => {
    response.set('Cache-Control', 'no-store')
      .json({ credential: await revokeApiCredential(commercialDb, request.authUser, request.params.id) });
  });

  app.post('/api/admin/api-credentials/:id/preview', requireAuth, requireAdmin, async (request, response) => {
    await requireActiveApiCredential(commercialDb, request.params.id, CRM_EVENTS_SCOPE);
    const event = crmEventSchema.parse(request.body);
    response.set('Cache-Control', 'no-store')
      .json(await previewCrmEvent(commercialDb, event, 'PRISMA'));
  });

  if (commercialDb) app.use('/api/comercial', requireAuth,
    createCommercialRouter(commercialDb, crm ? { crm } : undefined));

  app.use((error, _request, response, _next) => {
    if (error instanceof ZodError) {
      return response.status(400).json({
        error: 'Dados inválidos.',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
      });
    }
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
      return response.status(error.status).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.conflict ? { conflict: error.conflict } : {}),
        ...(error.issues ? { issues: error.issues } : {})
      });
    }
    console.error(error);
    response.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
