import { Area, Field } from '../../components/Field';
import { atualizarPrazoDeExecucao } from '../prazoExecucao';

/**
 * Etapa 4 — Prazos e jornada (`PROP-CTL-043..048`).
 *
 * Porte de `app/page.tsx:1009-1017`.
 *
 * O prazo efetivo é calculado pela permanência em dias corridos. Os demais
 * prazos continuam aceitando as condições de atendimento e mobilização.
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
    placeholder: 'Ex.: 12 dias corridos'
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
  permanenciaDoLevantamento = false
}: {
  form: AnyRecord;
  editar: (patch: AnyRecord) => void;
  erroDe: (campo: string) => string | undefined;
  permanenciaDoLevantamento?: boolean;
}) {
  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Prazos e jornada</h2>
          <p>{permanenciaDoLevantamento
            ? 'Os prazos são calculados a partir dos dias corridos do levantamento vinculado.'
            : 'Informe os dias corridos de permanência para calcular o prazo de execução.'}</p>
        </div>
        <span className="com-obrigatorios">Campos com * são obrigatórios</span>
      </div>

      <div className="com-form-grid">
        {CAMPOS.map(({ campo, label, placeholder }) => (
          <Field
            key={campo}
            label={label}
            required
            value={String(form[campo] ?? '')}
            placeholder={placeholder}
            readOnly={campo === 'execution' || (campo === 'permanence' && permanenciaDoLevantamento)}
            hint={campo === 'permanence'
              ? permanenciaDoLevantamento
                ? 'Importado automaticamente. Para alterar os dias corridos, edite o levantamento vinculado.'
                : 'Informe a quantidade de dias corridos. Ex.: 12 ou 12 dias corridos.'
              : campo === 'execution'
                ? 'Calculado de segunda a sexta, considerando início na segunda-feira.'
                : undefined}
            error={campo === 'permanence' && erroDe('execution')
              ? erroDe(campo) || 'Informe a quantidade de dias corridos para calcular o prazo de execução.'
              : campo === 'execution' ? undefined : erroDe(campo)}
            onChange={valor => editar(campo === 'permanence'
              ? atualizarPrazoDeExecucao({ permanence: valor })
              : { [campo]: valor })}
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
