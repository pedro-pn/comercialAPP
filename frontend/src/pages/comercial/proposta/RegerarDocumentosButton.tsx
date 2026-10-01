import { useRef, useState } from 'react';
import { mensagemDeErro, regerarDocumentosDaProposta,
  type DocumentoEmitido } from '../../../api/comercial';

export function RegerarDocumentosButton({ proposalId, onRegenerated, disabled = false, onBusyChange }: {
  proposalId: string;
  onRegenerated: (documents: DocumentoEmitido[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function regenerate() {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setFailed(false);
    setMessage('Recriando os documentos com o modelo atual...');
    try {
      const result = await regerarDocumentosDaProposta(proposalId);
      onRegenerated(result.documentos);
      setMessage('PDF e DOCX atualizados. Número e revisão mantidos.');
    } catch (error) {
      setFailed(true);
      setMessage(`${mensagemDeErro(error, 'Não foi possível regerar os documentos.')} Os arquivos anteriores continuam disponíveis.`);
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return <div className="com-history-documento">
    <button type="button" className="com-history-pdf-link" disabled={busy || disabled}
      title="Recria os documentos com o modelo atual e os dados salvos, mantendo o número e a revisão."
      onClick={() => void regenerate()}>
      {busy ? 'Regerando documentos...' : 'Regerar PDF e DOCX'}
    </button>
    {message && <small className={failed ? 'com-history-error' : undefined}
      role={failed ? 'alert' : 'status'}>{message}</small>}
  </div>;
}
