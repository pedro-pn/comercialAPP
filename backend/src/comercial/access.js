import { HttpError } from '../auth/service.js';

export function requireEstimator(request, _response, next) {
  if (request.authUser.role === 'VIEWER') {
    return next(new HttpError(403, 'Acesso restrito a gestores e vendedores.'));
  }
  next();
}

export function requireManager(request, _response, next) {
  if (!['ADMIN', 'MANAGER'].includes(request.authUser.role)) {
    return next(new HttpError(403, 'Acesso exclusivo do gestor.'));
  }
  next();
}

export function requireAdmin(request, _response, next) {
  if (request.authUser.role !== 'ADMIN') {
    return next(new HttpError(403, 'Acesso exclusivo do administrador.'));
  }
  next();
}

export function ownerFilter(user) {
  return ['ADMIN', 'MANAGER'].includes(user.role) ? {} : { createdByUserId: user.id };
}

export function assertCanWrite(user, record) {
  if (['ADMIN', 'MANAGER'].includes(user.role) || record.createdByUserId === user.id) return;
  throw new HttpError(403, 'Este registro pertence a outro vendedor.');
}

export function assertCanRead(user, record) {
  assertCanWrite(user, record);
}

export class ConcurrentWriteError extends HttpError {
  constructor(record) {
    super(409, 'Este registro foi alterado por outra pessoa. Recarregue antes de salvar.');
    this.code = 'COMERCIAL_CONCURRENT_WRITE';
    this.conflict = {
      updatedAt: record.updatedAt?.toISOString() ?? null,
      updatedByUserId: record.updatedByUserId ?? null,
      updatedByLabel: record.updatedByLabel ?? 'outro usuário'
    };
  }
}

export function assertVersion(record, expectedUpdatedAt, forceOverwrite) {
  if (forceOverwrite === true) return false;
  if (!expectedUpdatedAt || new Date(expectedUpdatedAt).getTime() !== record.updatedAt.getTime()) {
    throw new ConcurrentWriteError(record);
  }
  return true;
}
