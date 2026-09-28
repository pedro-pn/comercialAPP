import 'dotenv/config';
import { createAuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';

const [username, name] = process.argv.slice(2);
if (!username || !name || process.stdin.isTTY) {
  console.error('Uso: senha via stdin | npm run db:bootstrap-manager -- usuario "Nome do Gestor"');
  process.exit(1);
}

let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');

const db = createDatabase();
try {
  const user = await createAuthService(db).bootstrapManager({ username, name, password });
  console.log(`Gestor ${user.username} criado.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
