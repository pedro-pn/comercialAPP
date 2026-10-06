import { HttpError } from '../auth/service.js';

const activeConsultants = { isActive: true, role: { in: ['ADMIN', 'MANAGER', 'SELLER'] } };

export async function listConsultants(db) {
  const [users, registered] = await Promise.all([
    db.user.findMany({
      where: activeConsultants,
      orderBy: [{ name: 'asc' }, { username: 'asc' }],
      select: { id: true, name: true, username: true }
    }),
    db.salesConsultant.findMany({ where: { archivedAt: null }, select: { id: true, name: true } })
  ]);
  return [
    ...users.map(item => ({ ...item, tipo: 'usuario' })),
    ...registered.map(item => ({ ...item, username: '', tipo: 'cadastro' }))
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}

function requireManagement(user) {
  if (!['ADMIN', 'MANAGER'].includes(user.role)) {
    throw new HttpError(403, 'Acesso exclusivo do gestor.');
  }
}

function normalizeName(name) {
  const normalized = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalized.length > 200 || normalized.split(' ').length < 2) {
    throw new HttpError(422, 'Informe o nome completo do consultor, com até 200 caracteres.');
  }
  return normalized;
}

function consultantItem(consultant) {
  return { id: consultant.id, nome: consultant.name, username: '', tipo: 'cadastro' };
}

function consultantError(error) {
  if (error.code === 'P2002') throw new HttpError(409, 'Já existe um consultor cadastrado com esse nome.');
  if (error.code === 'P2025') throw new HttpError(404, 'Consultor não encontrado.');
  throw error;
}

export async function createConsultant(db, user, name) {
  requireManagement(user);
  const normalized = normalizeName(name);
  try {
    const consultant = await db.salesConsultant.create({ data: {
      name: normalized, normalizedName: normalized.toLocaleLowerCase('pt-BR'),
      createdByUserId: user.id
    } });
    return consultantItem(consultant);
  } catch (error) {
    consultantError(error);
  }
}

export async function updateConsultant(db, user, id, name) {
  requireManagement(user);
  const normalized = normalizeName(name);
  try {
    return consultantItem(await db.salesConsultant.update({ where: { id, archivedAt: null },
      data: { name: normalized, normalizedName: normalized.toLocaleLowerCase('pt-BR') } }));
  } catch (error) {
    consultantError(error);
  }
}

export async function removeConsultant(db, user, id) {
  requireManagement(user);
  try {
    await db.salesConsultant.update({ where: { id, archivedAt: null },
      data: { archivedAt: new Date(), normalizedName: null } });
  } catch (error) {
    consultantError(error);
  }
}

export async function resolveSeller(db, sellerUserId, sellerConsultantId,
  { previousSeller, allowArchived = false } = {}) {
  if (!sellerUserId && !sellerConsultantId) {
    throw new HttpError(422, 'Selecione um consultor de vendas.');
  }
  if (sellerUserId && sellerConsultantId) {
    throw new HttpError(422, 'Selecione apenas um consultor de vendas.');
  }
  if (sellerConsultantId) {
    const consultant = await db.salesConsultant.findUnique({ where: { id: sellerConsultantId } });
    if (!consultant) throw new HttpError(422, 'Selecione um consultor de vendas cadastrado.');
    const retained = previousSeller?.sellerConsultantId === consultant.id;
    if (consultant.archivedAt && !retained && !allowArchived) {
      throw new HttpError(422, 'Este consultor foi removido. Selecione outro consultor de vendas.');
    }
    return { sellerUserId: null, sellerConsultantId: consultant.id,
      sellerName: consultant.archivedAt && retained ? previousSeller.sellerName : consultant.name };
  }
  const seller = await db.user.findFirst({
    where: { ...activeConsultants, id: sellerUserId },
    select: { id: true, name: true }
  });
  if (!seller) throw new HttpError(422, 'Selecione um consultor ativo do Comercial.');
  return { sellerUserId: seller.id, sellerConsultantId: null, sellerName: seller.name };
}
