import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';

export const sessionDays = 7;
export const microsoftSessionHours = 24;
const roles = new Set(['ADMIN', 'MANAGER', 'SELLER', 'VIEWER']);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    microsoftEmail: user.microsoftEmail,
    hasLocalPassword: Boolean(user.passwordHash),
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Usuário inválido.');
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw new HttpError(400, 'O usuário deve ter 3 a 50 caracteres: letras, números, ponto, _ ou -.');
  }
  return username;
}

function validName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Nome inválido.');
  return name;
}

function validPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) {
    throw new HttpError(400, 'A senha deve ter entre 12 e 256 caracteres.');
  }
  return value;
}

function validRole(value) {
  if (!roles.has(value)) throw new HttpError(400, 'Papel inválido.');
  return value;
}

function microsoftEmail(identity) {
  for (const value of [identity.email, identity.preferredUsername]) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  }
  return null;
}

function microsoftName(identity, email) {
  const name = typeof identity.name === 'string' ? identity.name.trim() : '';
  if (name.length >= 2 && name.length <= 120) return name;
  const fallback = email.split('@')[0];
  return fallback.length >= 2 && fallback.length <= 120 ? fallback : `Usuário Microsoft ${identity.objectId.slice(0, 8)}`;
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createAuthService(db) {
  async function createSession(user, lifetimeMs) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + lifetimeMs);
    await db.session.create({ data: { tokenHash: tokenHash(token), userId: user.id, expiresAt } });
    return { token, expiresAt, user: publicUser(user) };
  }
  return {
    async bootstrapAdmin({ username, name, password }) {
      const data = {
        username: normalizeUsername(username),
        name: validName(name),
        passwordHash: await hashPassword(validPassword(password)),
        role: 'ADMIN'
      };
      return db.$transaction(async tx => {
        if (await tx.user.count() !== 0) throw new HttpError(409, 'A conta inicial já foi criada.');
        return publicUser(await tx.user.create({ data }));
      }, { isolationLevel: 'Serializable' });
    },

    async login(usernameInput, password) {
      let username;
      try { username = normalizeUsername(usernameInput); } catch { username = ''; }
      const user = username ? await db.user.findUnique({ where: { username } }) : null;
      const valid = await verifyPassword(String(password ?? ''), user?.passwordHash);
      if (!user || !user.isActive || !valid) throw new HttpError(401, 'Usuário ou senha inválidos.');
      return createSession(user, sessionDays * 24 * 60 * 60 * 1000);
    },

    async loginMicrosoft(identity) {
      const { tenantId, objectId } = identity;
      const where = { microsoftTenantId_microsoftObjectId: { microsoftTenantId: tenantId,
        microsoftObjectId: objectId } };
      const email = microsoftEmail(identity);
      let user = await db.user.findUnique({ where });
      if (!user) {
        if (await db.user.count() === 0) {
          throw new HttpError(409, 'Crie a conta inicial de administrador antes do primeiro login Microsoft.');
        }
        if (!email) throw new HttpError(403, 'A conta Microsoft não informou um e-mail válido.');
        try {
          user = await db.user.create({ data: {
            username: `ms-${objectId.replaceAll('-', '')}`,
            name: microsoftName(identity, email),
            microsoftEmail: email,
            microsoftTenantId: tenantId,
            microsoftObjectId: objectId,
            role: 'SELLER'
          } });
        } catch (error) {
          if (error.code !== 'P2002') throw error;
          user = await db.user.findUnique({ where });
          if (!user) throw new HttpError(409, 'Já existe uma conta com este identificador.');
        }
      }
      if (!user.isActive) throw new HttpError(403, 'Conta Microsoft sem acesso ao ComercialAPP.');
      if (email && email !== user.microsoftEmail) {
        user = await db.user.update({ where: { id: user.id }, data: { microsoftEmail: email } });
      }
      return createSession(user, microsoftSessionHours * 60 * 60 * 1000);
    },

    async authenticate(token) {
      if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return null;
      const session = await db.session.findUnique({
        where: { tokenHash: tokenHash(token) }, include: { user: true }
      });
      if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
      return publicUser(session.user);
    },

    async logout(token) {
      if (/^[a-f0-9]{64}$/i.test(token ?? '')) {
        await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      }
    },

    async listUsers() {
      return (await db.user.findMany({ orderBy: { name: 'asc' } })).map(publicUser);
    },

    async createUser(input, actor) {
      if (!actor || !['ADMIN', 'MANAGER'].includes(actor.role)) {
        throw new HttpError(403, 'Acesso restrito à administração.');
      }
      if (input.role === 'ADMIN' && actor.role !== 'ADMIN') {
        throw new HttpError(403, 'Somente um administrador pode criar outro administrador.');
      }
      const data = {
        username: normalizeUsername(input.username),
        name: validName(input.name),
        passwordHash: await hashPassword(validPassword(input.password)),
        role: validRole(input.role)
      };
      try {
        return publicUser(await db.user.create({ data }));
      } catch (error) {
        if (error.code === 'P2002') throw new HttpError(409, 'Usuário já cadastrado.');
        throw error;
      }
    },

    async updateUser(id, input, actor) {
      if (!actor || !['ADMIN', 'MANAGER'].includes(actor.role)) {
        throw new HttpError(403, 'Acesso restrito à administração.');
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpError(400, 'Dados inválidos.');
      }
      const allowed = new Set(['name', 'role', 'isActive', 'password']);
      if (!Object.keys(input).length || Object.keys(input).some(key => !allowed.has(key))) {
        throw new HttpError(400, 'Campos inválidos.');
      }
      const data = {};
      if ('name' in input) data.name = validName(input.name);
      if ('role' in input) data.role = validRole(input.role);
      if ('isActive' in input) {
        if (typeof input.isActive !== 'boolean') throw new HttpError(400, 'Estado inválido.');
        data.isActive = input.isActive;
      }
      if ('password' in input) data.passwordHash = await hashPassword(validPassword(input.password));

      return db.$transaction(async tx => {
        const existing = await tx.user.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, 'Usuário não encontrado.');
        if (data.passwordHash && !existing.passwordHash) {
          throw new HttpError(409, 'Contas criadas pela Microsoft não usam senha local.');
        }
        if (actor.role !== 'ADMIN' && (existing.role === 'ADMIN' || data.role === 'ADMIN')) {
          throw new HttpError(403, 'Somente um administrador pode alterar o perfil de administrador.');
        }
        if (id === actor.id && (data.role && data.role !== existing.role || data.isActive === false)) {
          throw new HttpError(409, 'Você não pode retirar o próprio acesso.');
        }
        if (existing.role === 'ADMIN' && existing.isActive &&
            (data.role && data.role !== 'ADMIN' || data.isActive === false) &&
            await tx.user.count({ where: { role: 'ADMIN', isActive: true } }) <= 1) {
          throw new HttpError(409, 'É necessário manter ao menos um administrador ativo.');
        }
        if (existing.role === 'MANAGER' && existing.isActive &&
            (data.role && !['ADMIN', 'MANAGER'].includes(data.role) || data.isActive === false) &&
            await tx.user.count({ where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true } }) <= 1) {
          throw new HttpError(409, 'É necessário manter ao menos um gestor ou administrador ativo.');
        }
        const updated = await tx.user.update({ where: { id }, data });
        if (data.passwordHash || data.isActive === false || data.role && data.role !== existing.role) {
          await tx.session.deleteMany({ where: { userId: id } });
        }
        return publicUser(updated);
      }, { isolationLevel: 'Serializable' });
    }
  };
}
