import { useEffect, useRef, type KeyboardEvent } from 'react';
import { BotaoFecharDialogo } from './FecharDialogo';

type NumberingConfirmationDialogProps = {
  numero: number;
  alteracao: boolean;
  proximoNumero: number | null;
  salvando: boolean;
  erro: string;
  onConfirmar: () => void;
  onCancelar: () => void;
};

export function NumberingConfirmationDialog({
  numero, alteracao, proximoNumero, salvando, erro, onConfirmar, onCancelar
}: NumberingConfirmationDialogProps) {
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const anterior = document.activeElement;
    cancelarRef.current?.focus();
    return () => { if (anterior instanceof HTMLElement) anterior.focus(); };
  }, []);

  function manterFoco(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const botoes = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const primeiro = botoes[0];
    const ultimo = botoes[botoes.length - 1];
    if (event.shiftKey && document.activeElement === primeiro) {
      event.preventDefault();
      ultimo?.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primeiro?.focus();
    }
  }

  return (
    <div className="com-overlay" role="alertdialog" aria-modal="true"
      aria-labelledby="com-numeracao-confirmacao-titulo"
      aria-describedby="com-numeracao-confirmacao-descricao"
      aria-busy={salvando} onKeyDown={manterFoco}>
      <section className="com-painel com-modo-card com-conflito-card">
        <BotaoFecharDialogo fechar={onCancelar} rotulo="Cancelar configuração da numeração" />
        <span className="com-eyebrow">NUMERAÇÃO DAS PROPOSTAS</span>
        <h1 id="com-numeracao-confirmacao-titulo">
          {alteracao ? 'Alterar a numeração inicial?' : 'Configurar a numeração inicial?'}
        </h1>
        <p id="com-numeracao-confirmacao-descricao">
          {alteracao && <>O próximo número na sequência atual é <strong>{proximoNumero}</strong>. </>}
          A sequência passará a começar em <strong>{numero}</strong> para as próximas reservas.
          {' '}Propostas existentes manterão seus números e números já reservados serão pulados.
        </p>
        <p>Confira os códigos usados no CRM e no legado antes de confirmar.</p>
        {erro && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
        <div className="com-conflito-acoes">
          <button ref={cancelarRef} type="button" className="com-btn com-btn-fantasma"
            disabled={salvando} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="com-btn com-btn-primario"
            disabled={salvando} onClick={onConfirmar}>
            {salvando ? 'Salvando...' : alteracao ? 'Confirmar alteração' : 'Confirmar configuração'}
          </button>
        </div>
      </section>
    </div>
  );
}
