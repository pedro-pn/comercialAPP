import 'dotenv/config';
import { createDatabase } from '../src/db.js';
import { normalizeUsername } from '../src/auth/service.js';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('Uso: npm run db:promote-admin -- usuario-do-gestor');
  process.exit(1);
}

const db = createDatabase();
try {
  const username = normalizeUsername(input);
  await db.$transaction(async tx => {
    if (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) {
      throw new Error('Já existe um administrador ativo. Use a página Acessos.');
    }
    const user = await tx.user.findUnique({ where: { username } });
    if (!user?.isActive || user.role !== 'MANAGER') {
      throw new Error('Informe um gestor ativo existente.');
    }
    await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  }, { isolationLevel: 'Serializable' });
  console.log(`Administrador ${username} configurado. Entre novamente no aplicativo.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
