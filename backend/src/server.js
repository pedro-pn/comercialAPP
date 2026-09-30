import 'dotenv/config';
import { createApp } from './app.js';
import { createAuthService } from './auth/service.js';
import { createMicrosoftAuthFromEnv } from './auth/microsoft.js';
import { createDatabase } from './db.js';
import { retryPendingFiltro } from './comercial/crm-bridge.js';

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? '127.0.0.1';
const production = process.env.NODE_ENV === 'production';
const appOrigin = process.env.APP_ORIGIN ?? (production ? null : 'http://localhost:5174');
const additionalOrigins = production ? [] : (process.env.APP_ADDITIONAL_ORIGINS ?? '')
  .split(',').map(value => value.trim()).filter(Boolean);
if (appOrigin) {
  const parsedOrigin = new URL(appOrigin);
  if (parsedOrigin.origin !== appOrigin || production && parsedOrigin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN deve conter apenas a origem HTTPS pública em produção.');
  }
} else if (production) {
  throw new Error('APP_ORIGIN é obrigatória em produção.');
}
for (const origin of additionalOrigins) {
  if (new URL(origin).origin !== origin) {
    throw new Error('APP_ADDITIONAL_ORIGINS deve conter apenas origens válidas.');
  }
}
const db = createDatabase();
const app = createApp({ authService: createAuthService(db), commercialDb: db,
  appOrigin, additionalOrigins, production,
  microsoftAuth: createMicrosoftAuthFromEnv(appOrigin) });

const server = app.listen(port, host, () => {
  process.stdout.write('Comercial API listening on ' + host + ':' + port + '\n');
});

const retryTimer = setInterval(() => {
  retryPendingFiltro(db).catch(error => console.error('Retentativa FiltroAPP:', error));
}, 60_000);
retryTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(retryTimer);
    server.close(() => db.$disconnect().then(() => process.exit(0)));
  });
}
