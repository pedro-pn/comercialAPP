import type { ComercialConcurrentWriteError } from '../../../api/comercial';

type ConflitoDeEdicaoDialogProps = {
  conflito: ComercialConcurrentWriteError;
  salvando: boolean;
  onRecarregar: () => void;
  onProsseguir: () => void;
  onCancelar: () => void;
};

/**
 * Aviso, não trava (FR-070): o usuário escolhe qual versão deve prevalecer.
 */
export function ConflitoDeEdicaoDialog({
  conflito,
  salvando,
  onRecarregar,
  onProsseguir,
  onCancelar
}: ConflitoDeEdicaoDialogProps) {
  return (
    <div
      className="com-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="com-conflito-titulo"
      aria-describedby="com-conflito-descricao"
    >
      <section className="com-painel com-modo-card com-conflito-card">
        <span className="com-eyebrow">ALTERAÇÃO CONCORRENTE</span>
        <h1 id="com-conflito-titulo">Este registro mudou enquanto você editava</h1>
        <p id="com-conflito-descricao">{conflito.message}</p>
        <p>
          Recarregar preserva a versão mais recente do servidor. Prosseguir grava
          suas alterações por cima dela.
        </p>

        <div className="com-conflito-acoes">
          <button
            type="button"
            className="com-btn com-btn-primario"
            disabled={salvando}
            onClick={onRecarregar}
          >
            Recarregar versão atual
          </button>
          <button
            type="button"
            className="com-btn com-btn-perigo"
            disabled={salvando}
            onClick={onProsseguir}
          >
            {salvando ? 'Sobrescrevendo...' : 'Prosseguir e sobrescrever'}
          </button>
          <button
            type="button"
            className="com-btn com-btn-fantasma"
            disabled={salvando}
            onClick={onCancelar}
          >
            Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}
