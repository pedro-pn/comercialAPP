import { useId } from 'react';

/** Opção de escopo junto ao preenchimento, com erro apenas após a validação. */

export function ConfirmacaoEscopo({
  confirmado,
  descricao,
  descricaoConfirmada,
  rotulo,
  error,
  onChange
}: {
  confirmado: boolean;
  descricao: string;
  descricaoConfirmada: string;
  rotulo: string;
  error?: string;
  onChange: (valor: boolean) => void;
}) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const descriptionId = useId();
  const errorId = useId();
  return (
    <div className={`com-confirmacao${confirmado ? ' is-confirmada' : ''}${error ? ' com-campo-invalido' : ''}`}>
      <label htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          aria-labelledby={labelId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ''}`}
          checked={confirmado}
          onChange={event => onChange(event.target.checked)}
        />
        <span>
          <strong id={labelId}>{rotulo}</strong>
          <small id={descriptionId}>{confirmado ? descricaoConfirmada : descricao}</small>
        </span>
      </label>
      {error && <small id={errorId} className="field-error">{error}</small>}
    </div>
  );
}

/** Aviso de pendência dentro da seção. */
export function AvisoPendencia({ children }: { children: React.ReactNode }) {
  return (
    <div className="com-aviso" role="status">
      {children}
    </div>
  );
}
