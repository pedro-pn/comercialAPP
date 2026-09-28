import { Area, Field } from '../../components/Field';

/**
 * Etapa 4 — Prazos e jornada (`PROP-CTL-043..048`).
 *
 * Porte de `app/page.tsx:1009-1017`.
 *
 * O subtítulo da referência diz o que importa: *"sem marcadores genéricos"*. São
 * campos de texto livre porque a resposta real varia ("7 dias", "após liberação da
 * área", "conforme parada programada") — e um prazo escrito como "a combinar" numa
 * proposta assinada vira discussão contratual depois.
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
  // `dias_treinamento` no documento: "Prazo previsto para integração – N dia(s)".
  // A linha já saía impressa e não tinha campo de origem nenhum (T071c).
  {
    campo: 'integration',
    label: 'Prazo previsto para integração',
    placeholder: 'Ex.: 1 dia'
  },
  {
    campo: 'execution',
    label: 'Prazo efetivo de execução',
    placeholder: 'Ex.: 10 dias trabalhados'
  }
];

export function PrazosStep({
  form,
  editar,
  erroDe
}: {
  form: AnyRecord;
  editar: (patch: AnyRecord) => void;
  erroDe: (campo: string) => string | undefined;
}) {
  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Prazos e jornada</h2>
          <p>Informe mobilização, permanência e execução sem marcadores genéricos.</p>
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
            error={erroDe(campo)}
            onChange={valor => editar({ [campo]: valor })}
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
