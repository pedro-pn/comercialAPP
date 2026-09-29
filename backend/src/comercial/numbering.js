import { HttpError } from '../auth/service.js';

const singleton = 'singleton';
const maxInitialNumber = 2_147_483_646;

export async function numberingStatus(db) {
  const state = await db.proposalNumberingState.findUnique({ where: { id: singleton } });
  return {
    seeded: Boolean(state),
    seededAt: state?.seededAt ?? null,
    seedValue: state?.seedValue ?? null,
    nextNumber: state?.nextNumber ?? null
  };
}

export async function initializeNumbering(db, user, initialNumber) {
  if (typeof initialNumber !== 'number' || !Number.isInteger(initialNumber) ||
      initialNumber < 1 || initialNumber > maxInitialNumber) {
    throw new HttpError(400, 'O número inicial deve ser um inteiro positivo válido.');
  }
  try {
    const state = await db.proposalNumberingState.create({
      data: {
        id: singleton,
        seedValue: initialNumber,
        nextNumber: initialNumber,
        seededByUserId: user.id
      }
    });
    return {
      seeded: true,
      seededAt: state.seededAt,
      seedValue: state.seedValue,
      nextNumber: state.nextNumber
    };
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'A numeração já foi configurada. Não é possível reiniciá-la.');
    }
    throw error;
  }
}

export async function reserveNumber(db, user) {
  try {
    return await db.$transaction(async tx => {
      const state = await tx.proposalNumberingState.update({
        where: { id: singleton },
        data: { nextNumber: { increment: 1 } }
      });
      const number = state.nextNumber - 1;
      if (number > maxInitialNumber) throw new HttpError(409, 'A numeração atingiu o limite.');
      await tx.proposalNumberReservation.create({
        data: { number, reservedByUserId: user.id }
      });
      return number;
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new HttpError(503, 'Configure o número inicial antes de reservar propostas.');
    }
    throw error;
  }
}

export async function assertReservedCode(db, user, proposalCode, revisionNumber) {
  if (!/^[1-9]\d*$/.test(proposalCode)) {
    throw new HttpError(422, 'O código da proposta deve ser um número emitido pelo Comercial.');
  }
  const number = Number(proposalCode);
  if (!Number.isSafeInteger(number)) throw new HttpError(422, 'Código de proposta inválido.');
  const reservation = await db.proposalNumberReservation.findUnique({ where: { number } });
  if (!reservation) {
    throw new HttpError(422, 'Reserve o número no Comercial antes de salvar.');
  }
  if (user.role !== 'MANAGER' && reservation.reservedByUserId !== user.id) {
    throw new HttpError(403, 'Este número foi reservado por outro vendedor.');
  }
  if (revisionNumber > 0) {
    const previous = await db.proposal.findUnique({
      where: { proposalCode_revisionNumber: { proposalCode, revisionNumber: revisionNumber - 1 } }
    });
    if (!previous) throw new HttpError(409, 'A revisão anterior da proposta não existe.');
    if (user.role !== 'MANAGER' && previous.createdByUserId !== user.id) {
      throw new HttpError(403, 'A proposta pertence a outro vendedor.');
    }
  }
  return reservation;
}

export async function markNumberUsed(db, number) {
  await db.proposalNumberReservation.updateMany({
    where: { number, firstUsedAt: null },
    data: { firstUsedAt: new Date() }
  });
}
