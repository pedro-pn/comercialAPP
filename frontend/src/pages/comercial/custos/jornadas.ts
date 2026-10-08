import { workingDaysFromCalendar } from '../../../../../shared/comercial/dist/cost-model.js';

type AnyRecord = Record<string, unknown>;

export type TipoDeDiaDaJornada = 'weekday' | 'saturday' | 'sunday_holiday';

export type DiaDaJornada = {
  dayType: TipoDeDiaDaJornada;
  days: number;
  daysMode?: 'automatic' | 'manual';
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

function diasTrabalhadosDaFase(fase: AnyRecord): number {
  if (fase.workingDaysMode === 'manual' && fase.workingDays !== undefined) return numero(fase.workingDays);
  return workingDaysFromCalendar(numero(fase.durationDays), numero(fase.integrationDays));
}

function jornadaPadraoDaFase(fase: AnyRecord): JornadaDaEquipe {
  return {
    name: 'Jornada padrão da fase',
    targetType: 'role',
    days: [
      {
        dayType: 'weekday',
        days: diasTrabalhadosDaFase(fase),
        daysMode: 'automatic',
        normalHoursPerDay: numero(fase.hoursPerDay),
        extraHoursPerDay: numero(fase.weekdayExtra70HoursPerDay),
        overtimePercent: 70
      },
      {
        dayType: 'saturday',
        days: numero(fase.saturdayCount),
        daysMode: 'automatic',
        normalHoursPerDay: 0,
        extraHoursPerDay: numero(fase.saturdayHoursPerDay),
        overtimePercent: 70
      },
      {
        dayType: 'sunday_holiday',
        days: numero(fase.sundayCount),
        daysMode: 'automatic',
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
        days: item.daysMode === 'automatic'
          ? dayType === 'weekday' ? diasTrabalhadosDaFase(fase)
            : numero(dayType === 'saturday' ? fase.saturdayCount : fase.sundayCount)
          : numero(item.days),
        ...(item.daysMode === undefined ? {} : { daysMode: item.daysMode === 'automatic' ? 'automatic' : 'manual' }),
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
      item.dayType === dayType ? { ...item, ...patch, dayType,
        ...('days' in patch ? { daysMode: 'manual' as const } : {}) } : { ...item }
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

/** Atualiza os padrões da fase e mantém as exceções de dias por colaborador. */
export function sincronizarDiasTrabalhadosDoLevantamento(draft: AnyRecord): AnyRecord {
  if (!Array.isArray(draft.laborContexts)) return draft;
  let mudou = false;
  const laborContexts = (draft.laborContexts as AnyRecord[]).map(fase => {
    if (!fase || typeof fase !== 'object') return fase;
    const workingDaysMode = fase.workingDaysMode === 'manual'
      || (draft.legacyImport && fase.workingDaysMode !== 'automatic') ? 'manual' : 'automatic';
    const workingDays = workingDaysMode === 'automatic'
      ? workingDaysFromCalendar(numero(fase.durationDays), numero(fase.integrationDays)) : fase.workingDays;
    const integrationDays = fase.integrationDays ?? 0;
    let proxima = fase.workingDaysMode === workingDaysMode && fase.workingDays === workingDays
      && fase.integrationDays === integrationDays
      ? fase : { ...fase, workingDaysMode, workingDays, integrationDays };
    if (Array.isArray(fase.assignments)) {
      let mudouEquipe = false;
      const assignments = (fase.assignments as AnyRecord[]).map(alocacao => {
        const salva = alocacao.workSchedule as AnyRecord | undefined;
        if (!salva || !Array.isArray(salva.days)) return alocacao;
        const jornada = jornadaDaAlocacao(alocacao, proxima);
        if ((salva.days as AnyRecord[]).every(dia => dia.daysMode !== 'automatic'
          || dia.days === jornada.days.find(item => item.dayType === dia.dayType)?.days)) return alocacao;
        mudouEquipe = true;
        return { ...alocacao, workSchedule: jornada };
      });
      if (mudouEquipe) proxima = { ...proxima, assignments };
    }
    if (proxima !== fase) mudou = true;
    return proxima;
  });
  return mudou ? { ...draft, laborContexts } : draft;
}
