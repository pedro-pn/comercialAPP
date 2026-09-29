import 'dotenv/config';
import { createApp } from './app.js';
import { createAuthService } from './auth/service.js';
import { createDatabase } from './db.js';

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? '127.0.0.1';
const production = process.env.NODE_ENV === 'production';
const appOrigin = process.env.APP_ORIGIN ?? (production ? null : 'http://localhost:5174');
if (appOrigin) {
  const parsedOrigin = new URL(appOrigin);
  if (parsedOrigin.origin !== appOrigin || production && parsedOrigin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN deve conter apenas a origem HTTPS pública em produção.');
  }
} else if (production) {
  throw new Error('APP_ORIGIN é obrigatória em produção.');
}
const db = createDatabase();
const app = createApp({ authService: createAuthService(db), commercialDb: db, appOrigin, production });

const server = app.listen(port, host, () => {
  process.stdout.write('Comercial API listening on ' + host + ':' + port + '\n');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => db.$disconnect().then(() => process.exit(0))));
}
