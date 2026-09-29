import express from 'express';
import { ZodError } from 'zod';
import { HttpError, normalizeUsername, sessionDays } from './auth/service.js';
import { createCommercialRouter } from './comercial/routes.js';
import { requireCrmEventToken, recordCrmEvent, deliverToFiltro,
  syncNectarOpportunity } from './comercial/crm-bridge.js';
import { z } from 'zod';

const cookieName = 'comercial_session';
const sessionMaxAge = sessionDays * 24 * 60 * 60 * 1000;

function readSessionCookie(request) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`));
  return cookie?.slice(cookieName.length + 1) ?? null;
}

function sessionCookieOptions(production) {
  return { httpOnly: true, secure: production, sameSite: 'strict', path: '/api' };
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

export function createApp({ authService, commercialDb, crm, appOrigin, additionalOrigins = [], production = false } = {}) {
  const app = express();
  const limiter = loginLimiter();
  const allowedOrigins = new Set([appOrigin, ...additionalOrigins].filter(Boolean));
  app.disable('x-powered-by');
  const jsonBody = express.json({ limit: '1mb' });
  app.use((request, response, next) => {
    // Anexos podem ser arquivos JSON; o parser global não deve consumir o binário.
    if (request.method === 'POST' && (
      request.path === '/api/comercial/escopo/fotos' ||
      /^\/api\/comercial\/propostas\/[^/]+\/anexos$/.test(request.path)
    )) return next();
    return jsonBody(request, response, next);
  });

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'comercialapp' });
  });

  app.use('/api', (request, _response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (request.path === '/integrations/crm/events' ||
          request.path === '/integrations/nectar/webhook') return next();
      if (request.get('x-comercial-request') !== '1' ||
          request.get('origin') && allowedOrigins.size && !allowedOrigins.has(request.get('origin'))) {
        return next(new HttpError(403, 'Origem da requisição não autorizada.'));
      }
    }
    next();
  });

  const crmEventSchema = z.object({
    contractVersion: z.literal(1),
    eventId: z.string().uuid(),
    proposalCode: z.string().trim().min(1).max(40),
    revisionNumber: z.number().int().min(0),
    opportunityId: z.string().trim().min(1),
    approvalStatus: z.enum(['APPROVED', 'REJECTED']),
    projectId: z.string().trim().min(1).max(200).nullable().optional(),
    occurredAt: z.iso.datetime(),
    reason: z.string().trim().max(1000).optional()
  });
  app.post('/api/integrations/crm/events', requireCrmEventToken, async (request, response) => {
    const event = crmEventSchema.parse(request.body);
    const recorded = await recordCrmEvent(commercialDb, event);
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
    if (request.authUser.role !== 'MANAGER') return next(new HttpError(403, 'Acesso exclusivo do gestor.'));
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
      response.cookie(cookieName, result.token, {
        ...sessionCookieOptions(production), maxAge: sessionMaxAge
      });
      response.set('Cache-Control', 'no-store').json({ user: result.user });
    } catch (error) {
      if (error.status === 401) limiter.failed(key);
      throw error;
    }
  });

  app.get('/api/auth/me', requireAuth, (request, response) => {
    response.set('Cache-Control', 'no-store').json({ user: request.authUser });
  });

  app.post('/api/auth/logout', async (request, response) => {
    await authService.logout(readSessionCookie(request));
    response.clearCookie(cookieName, sessionCookieOptions(production));
    response.status(204).end();
  });

  app.get('/api/users', requireAuth, requireManager, async (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ users: await authService.listUsers() });
  });

  app.post('/api/users', requireAuth, requireManager, async (request, response) => {
    const user = await authService.createUser(request.body ?? {});
    response.status(201).json({ user });
  });

  app.patch('/api/users/:id', requireAuth, requireManager, async (request, response) => {
    const user = await authService.updateUser(request.params.id, request.body, request.authUser.id);
    response.json({ user });
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
