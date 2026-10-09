import { Area, Field } from '../../components/Field';
import { valorNumericoDoPrazo } from '../../../../../../shared/comercial/dist/modelo-documento.js';
import { atualizarPrazoDeExecucao } from '../prazoExecucao';

/**
 * Etapa 4 — Prazos e jornada (`PROP-CTL-043..048`).
 *
 * Porte de `app/page.tsx:1009-1017`.
 *
 * O prazo efetivo conta os dias úteis da permanência, descontando a integração.
 * Os dias de integração são cobrados pela jornada normal no levantamento.
 */

type AnyRecord = Record<string, unknown>;

const CAMPOS: Array<{ campo: string; label: string; placeholder: string }> = [
  {
    campo: 'attendance',
    label: 'Previsão de atendimento',
    placeholder: 'Ex.: 10 dias, de imediato ou após liberação'
  },
  {
    campo: 'mobilization',
    label: 'Mobilização após pedido',
    placeholder: 'Ex.: 7 dias'
  },
  {
    campo: 'permanence',
    label: 'Permanência prevista em obra',
    placeholder: 'Ex.: 12'
  },
  {
    campo: 'execution',
    label: 'Prazo efetivo de execução',
    placeholder: 'Calculado automaticamente'
  },
  // `dias_treinamento` no documento: "Prazo previsto para integração – N dia(s)".
  // A linha já saía impressa e não tinha campo de origem nenhum (T071c).
  {
    campo: 'integration',
    label: 'Prazo previsto para integração',
    placeholder: 'Ex.: 1 dia'
  }
];

export function PrazosStep({
  form,
  editar,
  erroDe,
  permanenciaDoLevantamento = false,
  integracaoDoLevantamento = false
}: {
  form: AnyRecord;
  editar: (patch: AnyRecord) => void;
  erroDe: (campo: string) => string | undefined;
  permanenciaDoLevantamento?: boolean;
  integracaoDoLevantamento?: boolean;
}) {
  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Prazos e jornada</h2>
          <p>{permanenciaDoLevantamento
            ? 'Os prazos são importados do período e da integração do levantamento vinculado.'
            : 'Informe a permanência para calcular o prazo de execução.'}</p>
        </div>
        <span className="com-obrigatorios">Campos com * são obrigatórios</span>
      </div>

      <div className="com-form-grid">
        {CAMPOS.map(({ campo, label, placeholder }) => (
          <Field
            key={campo}
            label={label}
            required
            value={campo === 'permanence' || campo === 'execution'
              ? valorNumericoDoPrazo(form[campo])
              : String(form[campo] ?? '')}
            inputMode={campo === 'permanence' || campo === 'execution' ? 'numeric' : undefined}
            placeholder={placeholder}
            readOnly={campo === 'execution' || (campo === 'permanence' && permanenciaDoLevantamento)
              || (campo === 'integration' && integracaoDoLevantamento)}
            hint={campo === 'permanence'
              ? permanenciaDoLevantamento
                ? 'Período em dias corridos do levantamento. Para alterar a duração dos serviços, edite o levantamento vinculado.'
                : 'Informe os dias corridos da permanência. A integração não altera este prazo.'
              : campo === 'execution'
                ? 'Dias de segunda a sexta, considerando início na segunda-feira, menos os dias de integração.'
                : campo === 'integration'
                  ? integracaoDoLevantamento
                    ? 'Importado automaticamente. Para alterar a integração, edite as fases de mão de obra do levantamento vinculado.'
                    : 'Informe os dias de integração. O custo da equipe é definido nas fases de mão de obra do levantamento.'
                : undefined}
            error={campo === 'permanence' && erroDe('execution') && !erroDe('integration')
              ? erroDe(campo) || 'Informe a quantidade de dias corridos para calcular o prazo de execução.'
              : campo === 'execution' ? undefined : erroDe(campo)}
            onChange={valor => {
              if (campo === 'permanence' || campo === 'integration') {
                const prazos = atualizarPrazoDeExecucao({ ...form, [campo]: valor });
                editar({
                  [campo]: valor,
                  permanence: prazos.permanence,
                  execution: prazos.execution,
                  permanenceBase: prazos.permanenceBase,
                  integrationDaysApplied: prazos.integrationDaysApplied
                });
              } else editar({ [campo]: valor });
            }}
          />
        ))}
      </div>

      <Area
        label="Jornada de trabalho"
        required
        value={String(form.workday ?? '')}
        error={erroDe('workday')}
        onChange={valor => editar({ workday: valor })}
      />
      <p className="com-ajuda-campo">
        O texto do modelo já vem preenchido e pode ser alterado para esta proposta.
      </p>
    </section>
  );
}
