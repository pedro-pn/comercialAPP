type Registro = Record<string, unknown>;

/** A dispensa geral só se aplica quando todas as fases ativas foram escolhidas como sede. */
export function trabalhoSomenteNaSede(payload: Registro): boolean {
  const confirmacoes = payload.scopeConfirmations as Registro | undefined;
  if (confirmacoes?.noLabor === true) return false;
  const fases = Array.isArray(payload.laborContexts)
    ? (payload.laborContexts as Registro[]).filter(fase => fase.enabled !== false)
    : [];
  return fases.length > 0 && fases.every(fase =>
    fase.workCondition === 'headquarters' && fase.workConditionConfirmed === true
  );
}
