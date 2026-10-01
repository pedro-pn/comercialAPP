import 'dotenv/config';
import { createApp } from './app.js';
import { createAuthService } from './auth/service.js';
import { createMicrosoftAuthFromEnv } from './auth/microsoft.js';
import { createDatabase } from './db.js';
import { retryPendingFiltro } from './comercial/crm-bridge.js';
import { readRuntimeConfig } from './runtime-config.js';

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? '127.0.0.1';
const config = readRuntimeConfig();
const db = createDatabase();
const app = createApp({ authService: createAuthService(db), commercialDb: db,
  ...config,
  microsoftAuth: config.staging ? null : createMicrosoftAuthFromEnv(config.appOrigin) });

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
