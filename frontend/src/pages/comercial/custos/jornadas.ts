type AnyRecord = Record<string, unknown>;

export type TipoDeDiaDaJornada = 'weekday' | 'saturday' | 'sunday_holiday';

export type DiaDaJornada = {
  dayType: TipoDeDiaDaJornada;
  days: number;
  normalHoursPerDay: number;
  extraHoursPerDay: number;
  overtimePercent: number;
};

export type JornadaDaEquipe = {
  name: string;
  targetType: 'role' | 'collaborator';
  collaboratorName?: string;
  days: DiaDaJornada[];
};

const TIPOS: TipoDeDiaDaJornada[] = ['weekday', 'saturday', 'sunday_holiday'];

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) && convertido >= 0 ? convertido : 0;
}

function diaVazio(dayType: TipoDeDiaDaJornada): DiaDaJornada {
  return {
    dayType,
    days: 0,
    normalHoursPerDay: 0,
    extraHoursPerDay: 0,
    overtimePercent: dayType === 'sunday_holiday' ? 100 : 70
  };
}

function diasUteisDaFase(fase: AnyRecord): number {
  if (fase.workingDays !== undefined) return numero(fase.workingDays);
  const duracao = numero(fase.durationDays);
  return duracao <= 5 ? duracao : Math.ceil((duracao / 7) * 5);
}

function jornadaPadraoDaFase(fase: AnyRecord): JornadaDaEquipe {
  return {
    name: 'Jornada padrão da fase',
    targetType: 'role',
    days: [
      {
        dayType: 'weekday',
        days: diasUteisDaFase(fase),
        normalHoursPerDay: numero(fase.hoursPerDay),
        extraHoursPerDay: numero(fase.weekdayExtra70HoursPerDay),
        overtimePercent: 70
      },
      {
        dayType: 'saturday',
        days: numero(fase.saturdayCount),
        normalHoursPerDay: 0,
        extraHoursPerDay: numero(fase.saturdayHoursPerDay),
        overtimePercent: 70
      },
      {
        dayType: 'sunday_holiday',
        days: numero(fase.sundayCount),
        normalHoursPerDay: 0,
        extraHoursPerDay: numero(fase.sundayHoursPerDay),
        overtimePercent: 100
      }
    ]
  };
}

/**
 * Jornada efetiva mostrada no editor. Levantamentos antigos continuam
 * herdando a escala da fase até que o usuário personalize uma alocação.
 */
export function jornadaDaAlocacao(
  alocacao: AnyRecord,
  fase: AnyRecord
): JornadaDaEquipe {
  const salva = alocacao.workSchedule as AnyRecord | undefined;
  if (!salva || !Array.isArray(salva.days)) return jornadaPadraoDaFase(fase);

  const porTipo = new Map(
    (salva.days as AnyRecord[]).map((item) => [String(item.dayType), item])
  );
  return {
    name: String(salva.name || 'Jornada personalizada'),
    targetType: salva.targetType === 'collaborator' ? 'collaborator' : 'role',
    ...(salva.targetType === 'collaborator' &&
    String(salva.collaboratorName || '').trim()
      ? { collaboratorName: String(salva.collaboratorName).trim() }
      : {}),
    days: TIPOS.map((dayType) => {
      const item = porTipo.get(dayType);
      if (!item) return diaVazio(dayType);
      return {
        dayType,
        days: numero(item.days),
        normalHoursPerDay: numero(item.normalHoursPerDay),
        extraHoursPerDay: numero(item.extraHoursPerDay),
        overtimePercent: numero(item.overtimePercent)
      };
    })
  };
}

export function atualizarDiaDaJornada(
  jornada: JornadaDaEquipe,
  dayType: TipoDeDiaDaJornada,
  patch: Partial<DiaDaJornada>
): JornadaDaEquipe {
  return {
    ...jornada,
    days: jornada.days.map((item) =>
      item.dayType === dayType ? { ...item, ...patch, dayType } : { ...item }
    )
  };
}

/** Copia só o horário; alvo e nome pessoal nunca vazam para outros cargos. */
export function aplicarJornadaATodaEquipe(
  equipe: AnyRecord[],
  jornada: JornadaDaEquipe,
  turno: string
): AnyRecord[] {
  return equipe.map((alocacao) => ({
    ...alocacao,
    shift: turno === 'night' ? 'night' : 'day',
    workSchedule: {
      name: jornada.name,
      targetType: 'role',
      days: jornada.days.map((item) => ({ ...item }))
    }
  }));
}

export function resumoDaJornada(jornada: JornadaDaEquipe) {
  return jornada.days.reduce(
    (resumo, dia) => ({
      dias:
        resumo.dias +
        (dia.normalHoursPerDay > 0 || dia.extraHoursPerDay > 0 ? dia.days : 0),
      horasNormais: resumo.horasNormais + dia.days * dia.normalHoursPerDay,
      horasExtras: resumo.horasExtras + dia.days * dia.extraHoursPerDay
    }),
    { dias: 0, horasNormais: 0, horasExtras: 0 }
  );
}
