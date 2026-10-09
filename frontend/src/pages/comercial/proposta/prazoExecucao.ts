import { valorNumericoDoPrazo } from '../../../../../shared/comercial/dist/modelo-documento.js';
import { businessDaysFromCalendar } from '../../../../../shared/comercial/dist/cost-model.js';

type Formulario = Record<string, unknown>;

/** Conta segunda a sexta, sempre considerando início numa segunda-feira. */
export function prazoDeExecucao(permanencia: unknown): string {
  const diasInformados = String(permanencia ?? '').trim()
    .match(/^(\d+)\s*(?:dias?(?:\s+corridos?)?)?$/i);
  if (!diasInformados) return '';
  const diasCorridos = Number(diasInformados[1]);
  if (!Number.isSafeInteger(diasCorridos) || diasCorridos <= 0) return '';
  const diasTrabalhados = businessDaysFromCalendar(diasCorridos);
  return String(diasTrabalhados);
}

/**
 * A integração acrescenta custo no levantamento, sem ampliar ou reduzir os prazos.
 * A origem opcional é a permanência do levantamento vinculado.
 */
export function atualizarPrazoDeExecucao(form: Formulario, permanenciaDeOrigem?: unknown): Formulario {
  const permanence = valorNumericoDoPrazo(permanenciaDeOrigem ?? form.permanence);
  const execution = prazoDeExecucao(permanence);
  return form.permanence === permanence && form.execution === execution
    ? form : { ...form, permanence, execution };
}
