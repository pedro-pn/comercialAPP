type Formulario = Record<string, unknown>;

/** Conta segunda a sexta, sempre considerando início numa segunda-feira. */
export function prazoDeExecucao(permanencia: unknown): string {
  const diasInformados = String(permanencia ?? '').trim()
    .match(/^(\d+)\s*(?:dias?(?:\s+corridos?)?)?$/i);
  if (!diasInformados) return '';
  const diasCorridos = Number(diasInformados[1]);
  if (!Number.isSafeInteger(diasCorridos) || diasCorridos <= 0) return '';
  const diasTrabalhados = Math.floor(diasCorridos / 7) * 5 + Math.min(diasCorridos % 7, 5);
  return diasTrabalhados === 1 ? '1 dia trabalhado' : `${diasTrabalhados} dias trabalhados`;
}

/** Mantém o prazo exibido, salvo e emitido a partir da mesma permanência. */
export function atualizarPrazoDeExecucao(form: Formulario): Formulario {
  const execution = prazoDeExecucao(form.permanence);
  return form.execution === execution ? form : { ...form, execution };
}
