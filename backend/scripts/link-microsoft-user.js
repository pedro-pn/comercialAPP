import 'dotenv/config';
import { createDatabase } from '../src/db.js';
import { normalizeUsername } from '../src/auth/service.js';

const [usernameInput, objectIdInput, roleFlag] = process.argv.slice(2);
const tenantId = process.env.ENTRA_TENANT_ID?.toLowerCase();
const objectId = objectIdInput?.toLowerCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!usernameInput || !uuid.test(tenantId ?? '') || !uuid.test(objectId ?? '') ||
    roleFlag && roleFlag !== '--admin') {
  console.error('Uso: ENTRA_TENANT_ID=... npm run db:link-microsoft -- usuario OBJECT_ID [--admin]');
  process.exit(1);
}

const db = createDatabase();
try {
  const username = normalizeUsername(usernameInput);
  const result = await db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { username } });
    if (!user?.isActive) throw new Error('Usuário local não encontrado ou inativo.');
    if (user.microsoftObjectId && (user.microsoftObjectId !== objectId ||
        user.microsoftTenantId !== tenantId)) {
      throw new Error('Usuário já está vinculado a outra identidade Microsoft.');
    }
    const other = await tx.user.findUnique({ where: {
      microsoftTenantId_microsoftObjectId: { microsoftTenantId: tenantId, microsoftObjectId: objectId }
    } });
    if (other && other.id !== user.id) throw new Error('Identidade Microsoft já vinculada a outra conta.');
    const roleChanged = roleFlag === '--admin' && user.role !== 'ADMIN';
    await tx.user.update({ where: { id: user.id }, data: {
      microsoftTenantId: tenantId, microsoftObjectId: objectId,
      ...(roleChanged ? { role: 'ADMIN' } : {})
    } });
    if (roleChanged) await tx.session.deleteMany({ where: { userId: user.id } });
    return roleChanged;
  }, { isolationLevel: 'Serializable' });
  console.log(`Conta ${username} vinculada ao Entra${result ? ' e promovida a administrador' : ''}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
