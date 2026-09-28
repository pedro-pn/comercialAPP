type AnyRecord = Record<string, unknown>;

const DIA_EM_MS = 24 * 60 * 60 * 1000;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataUtc(valor: string): Date | null {
  if (!DATA_ISO.test(valor)) return null;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return data;
}

export function dataIsoValida(valor: unknown): valor is string {
  return typeof valor === 'string' && dataUtc(valor) !== null;
}

export function hojeIsoLocal(agora = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function somarDias(dataBase: string, dias: unknown): string {
  const base = dataUtc(dataBase);
  if (!base) return '';
  base.setUTCDate(base.getUTCDate() + Math.max(0, Number(dias) || 0));
  return base.toISOString().slice(0, 10);
}

export function diferencaEmDias(dataBase: string, data: string): number {
  const base = dataUtc(dataBase);
  const destino = dataUtc(data);
  if (!base || !destino) return 0;
  return Math.round((destino.getTime() - base.getTime()) / DIA_EM_MS);
}

/** Garante uma âncora real para converter os offsets legados em datas. */
export function comDataBaseDoCronograma(
  draft: AnyRecord,
  hoje = hojeIsoLocal()
): AnyRecord {
  if (dataIsoValida(draft.scheduleStartDate)) return draft;
  return { ...draft, scheduleStartDate: hoje };
}

export function dataDeInicioDaFase(draft: AnyRecord, fase: AnyRecord): string {
  const base = dataIsoValida(draft.scheduleStartDate)
    ? draft.scheduleStartDate
    : hojeIsoLocal();
  return somarDias(base, fase.startOffsetDays);
}

/**
 * Converte a data escolhida para o offset que o motor usa.
 *
 * Se a nova data vier antes da âncora, a âncora recua e todos os outros
 * offsets avançam na mesma quantidade. Assim as datas das demais fases não
 * mudam e o cálculo de simultaneidade continua correto.
 */
export function atualizarDataDeInicioDaFase(
  draft: AnyRecord,
  faseId: string,
  novaData: string
): AnyRecord {
  if (!dataIsoValida(novaData)) return draft;

  const comBase = comDataBaseDoCronograma(draft);
  const baseAtual = String(comBase.scheduleStartDate);
  const diferenca = diferencaEmDias(baseAtual, novaData);
  const recuo = Math.max(0, -diferenca);
  const novaBase = recuo > 0 ? novaData : baseAtual;
  const fases = Array.isArray(comBase.laborContexts)
    ? (comBase.laborContexts as AnyRecord[])
    : [];

  return {
    ...comBase,
    scheduleStartDate: novaBase,
    laborContexts: fases.map(fase => ({
      ...fase,
      startOffsetDays:
        String(fase.id) === faseId
          ? Math.max(0, diferenca)
          : Math.max(0, Number(fase.startOffsetDays) || 0) + recuo
    }))
  };
}
