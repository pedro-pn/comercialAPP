import { diasDeIntegracao, valorNumericoDoPrazo } from '../../../../../shared/comercial/dist/modelo-documento.js';
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

/** Dias corridos até o último dia útil, começando numa segunda-feira. */
function diasCorridosParaExecucao(diasTrabalhados: number): number {
  return diasTrabalhados + Math.floor((diasTrabalhados - 1) / 5) * 2;
}

/**
 * Soma a integração uma única vez, inclusive após salvar e reabrir.
 * A origem opcional é a permanência sem integração do levantamento vinculado.
 */
export function atualizarPrazoDeExecucao(form: Formulario, permanenciaDeOrigem?: unknown): Formulario {
  let permanence = valorNumericoDoPrazo(permanenciaDeOrigem ?? form.permanence);
  const prazoAtual = prazoDeExecucao(permanence);
  const integracao = diasDeIntegracao(form.integration);
  if (form.integrationIncludedInPermanence === true) {
    const execution = integracao === null ? '' : prazoAtual;
    return form.permanence === permanence && form.execution === execution
      ? form : { ...form, permanence, execution };
  }
  const integracaoAnterior = permanenciaDeOrigem !== undefined
    ? 0 : diasDeIntegracao(form.integrationDaysApplied) ?? 0;
  let permanenceBase = valorNumericoDoPrazo(form.permanenceBase ?? permanence);
  if (integracaoAnterior === 0) {
    permanenceBase = permanence;
  } else if (prazoAtual && permanence !== String(diasCorridosParaExecucao(
    Number(prazoDeExecucao(permanenceBase)) + integracaoAnterior
  ))) {
    // A permanência editada manualmente já é o total que inclui a integração.
    const diasSemIntegracao = Number(prazoAtual) - integracaoAnterior;
    permanenceBase = diasSemIntegracao > 0 ? String(diasCorridosParaExecucao(diasSemIntegracao)) : '';
  }

  let execution = '';
  let integrationDaysApplied = integracaoAnterior;
  if (prazoAtual && integracao !== null) {
    const diasTrabalhados = Number(prazoAtual) + integracao - integracaoAnterior;
    const diasCorridos = diasCorridosParaExecucao(diasTrabalhados);
    if (Number.isSafeInteger(diasTrabalhados) && diasTrabalhados > 0 && Number.isSafeInteger(diasCorridos)) {
      execution = String(diasTrabalhados);
      if (integracao !== integracaoAnterior) {
        permanence = integracao === 0 && permanenceBase ? permanenceBase : String(diasCorridos);
      }
      integrationDaysApplied = integracao;
    }
  }

  return form.permanence === permanence && form.execution === execution
    && form.permanenceBase === permanenceBase && form.integrationDaysApplied === integrationDaysApplied
    ? form : { ...form, permanence, execution, permanenceBase, integrationDaysApplied };
}
