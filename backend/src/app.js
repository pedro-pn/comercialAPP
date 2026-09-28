import express from 'express';
import { HttpError, normalizeUsername, sessionDays } from './auth/service.js';

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

export function createApp({ authService, appOrigin, production = false } = {}) {
  const app = express();
  const limiter = loginLimiter();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'comercialapp' });
  });

  app.use('/api', (request, _response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (request.get('x-comercial-request') !== '1' ||
          request.get('origin') && appOrigin && request.get('origin') !== appOrigin) {
        return next(new HttpError(403, 'Origem da requisição não autorizada.'));
      }
    }
    next();
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

  app.use((error, _request, response, _next) => {
    if (error.status && error.status >= 400 && error.status < 500) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error(error);
    response.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
