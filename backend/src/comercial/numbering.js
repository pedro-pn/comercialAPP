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
      throw new HttpError(409, 'A numeração já foi configurada. Apenas o administrador pode alterá-la.');
    }
    throw error;
  }
}

export async function updateInitialNumber(db, user, initialNumber) {
  if (user.role !== 'ADMIN') {
    throw new HttpError(403, 'Acesso exclusivo do administrador.');
  }
  if (typeof initialNumber !== 'number' || !Number.isInteger(initialNumber) ||
      initialNumber < 1 || initialNumber > maxInitialNumber) {
    throw new HttpError(400, 'O número inicial deve ser um inteiro positivo válido.');
  }
  try {
    // A atualização atômica usa a mesma linha das reservas. Reservas anteriores
    // permanecem registradas e reserveNumber continua pulando esses números.
    const state = await db.proposalNumberingState.update({
      where: { id: singleton },
      data: {
        seedValue: initialNumber,
        nextNumber: initialNumber,
        seededAt: new Date(),
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
    if (error.code === 'P2025') {
      throw new HttpError(409, 'Configure o número inicial antes de alterar a numeração.');
    }
    throw error;
  }
}

export async function reserveNumber(db, user) {
  // Um número legado pode estar à frente da sequência atual. Pule reservas já
  // existentes; em uma corrida entre registro legado e reserva, repita a transação.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await db.$transaction(async tx => {
        while (true) {
          const state = await tx.proposalNumberingState.update({
            where: { id: singleton },
            data: { nextNumber: { increment: 1 } }
          });
          const number = state.nextNumber - 1;
          if (number > maxInitialNumber) throw new HttpError(409, 'A numeração atingiu o limite.');
          if (await tx.proposalNumberReservation.findUnique({ where: { number } })) continue;
          await tx.proposalNumberReservation.create({
            data: { number, reservedByUserId: user.id }
          });
          return number;
        }
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new HttpError(503, 'Configure o número inicial antes de reservar propostas.');
      }
      if (error.code !== 'P2002') throw error;
    }
  }
  throw new HttpError(409, 'A numeração foi alterada ao mesmo tempo. Tente novamente.');
}

export async function registerLegacyRevision(db, user, proposalCode, revisionNumber) {
  if (!/^[1-9]\d*$/.test(proposalCode) || Number(proposalCode) > maxInitialNumber) {
    throw new HttpError(422, 'Informe um número de proposta legado válido.');
  }
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1 || revisionNumber > maxInitialNumber) {
    throw new HttpError(422, 'A nova revisão deve ser um inteiro maior que zero.');
  }
  const number = Number(proposalCode);
  const existingProposal = await db.proposal.findFirst({ where: { proposalCode } });
  if (existingProposal) {
    throw new HttpError(409, 'Esta proposta já existe no Comercial. Use Revisar proposta.');
  }
  const existing = await db.proposalNumberReservation.findUnique({ where: { number } });
  if (existing) {
    if (existing.legacyFirstRevision === revisionNumber &&
        (existing.reservedByUserId === user.id || ['ADMIN', 'MANAGER'].includes(user.role))) {
      return { proposalCode, revisionNumber, alreadyRegistered: true };
    }
    throw new HttpError(409, 'Este número já está reservado no Comercial. Confira o histórico.');
  }
  try {
    await db.proposalNumberReservation.create({
      data: { number, reservedByUserId: user.id, legacyFirstRevision: revisionNumber }
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'Este número acabou de ser reservado. Confira o histórico.');
    }
    throw error;
  }
  return { proposalCode, revisionNumber, alreadyRegistered: false };
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
  if (!['ADMIN', 'MANAGER'].includes(user.role) && reservation.reservedByUserId !== user.id) {
    throw new HttpError(403, 'Este número foi reservado por outro vendedor.');
  }
  if (reservation.legacyFirstRevision != null && revisionNumber < reservation.legacyFirstRevision) {
    throw new HttpError(409, `A primeira revisão deste número no Comercial é ${reservation.legacyFirstRevision}.`);
  }
  if (revisionNumber > 0) {
    const previous = await db.proposal.findUnique({
      where: { proposalCode_revisionNumber: { proposalCode, revisionNumber: revisionNumber - 1 } }
    });
    if (!previous && reservation.legacyFirstRevision !== revisionNumber) {
      throw new HttpError(409, 'A revisão anterior da proposta não existe.');
    }
    if (previous && !['ADMIN', 'MANAGER'].includes(user.role) && previous.createdByUserId !== user.id) {
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
