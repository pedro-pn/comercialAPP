import { HttpError } from '../auth/service.js';

const activeConsultants = { isActive: true, role: { in: ['ADMIN', 'MANAGER', 'SELLER'] } };

export async function listConsultants(db) {
  return db.user.findMany({
    where: activeConsultants,
    orderBy: [{ name: 'asc' }, { username: 'asc' }],
    select: { id: true, name: true, username: true }
  });
}

export async function resolveSeller(db, sellerUserId) {
  const seller = await db.user.findFirst({
    where: { ...activeConsultants, id: sellerUserId },
    select: { id: true, name: true }
  });
  if (!seller) throw new HttpError(422, 'Selecione um consultor ativo do Comercial.');
  return { sellerUserId: seller.id, sellerName: seller.name };
}
