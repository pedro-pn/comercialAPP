import { useEffect, useState } from 'react';
import {
  baixarAnexoDaProposta, baixarDocumento, emitirDocumentos,
  enviarAnexoDaProposta, listarAnexosDaProposta,
  listarDocumentosDaProposta, mensagemDeErro, removerAnexoDaProposta,
  regerarDocumentosDaProposta,
  type AnexoDaProposta, type DocumentoEmitido
} from '../../../api/comercial';
import { CrmDeliveryPanel } from './CrmDeliveryPanel';
import { SharePointDeliveryPanel } from './SharePointDeliveryPanel';
import { FiltroAppDeliveryPanel } from './FiltroAppDeliveryPanel';
import { RegerarDocumentosButton } from './RegerarDocumentosButton';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function FinalizacaoLocalPanel({ proposalId, status, save, validate,
  docs, documentsError, onDocumentsChange, busy, onBusyChange: setBusy }: {
  proposalId: string;
  status: string;
  save: () => Promise<string | null>;
  validate: () => boolean;
  docs: DocumentoEmitido[];
  documentsError: string;
  onDocumentsChange: (id: string, documents: DocumentoEmitido[]) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [attachments, setAttachments] = useState<AnexoDaProposta[]>([]);
  const [message, setMessage] = useState('');
  const finalized = status === 'FINALIZADA';

  useEffect(() => {
    if (!proposalId) return;
    let live = true;
    listarAnexosDaProposta(proposalId)
      .then(annexes => {
        if (!live) return;
        setAttachments(annexes.items);
      })
      .catch(error => { if (live) setMessage(mensagemDeErro(error, 'Falha ao carregar anexos.')); });
    return () => { live = false; };
  }, [proposalId, status]);

  async function issue() {
    if (!validate()) return;
    setBusy(true);
    setMessage('Salvando e gerando os documentos...');
    try {
      const id = await save();
      if (!id) {
        setMessage('Salve o rascunho antes de emitir os documentos.');
        return;
      }
      const anteriores = await listarDocumentosDaProposta(id);
      const result = anteriores.length === 4
        ? await regerarDocumentosDaProposta(id)
        : await emitirDocumentos(id);
      onDocumentsChange(id, result.documentos);
      setMessage('Propostas comercial e técnica disponíveis em PDF e DOCX.');
    } catch (error) {
      setMessage(mensagemDeErro(error, 'Não foi possível emitir os documentos.'));
    } finally { setBusy(false); }
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setMessage('Enviando anexos...');
    try {
      const id = proposalId || await save();
      if (!id) {
        setMessage('Preencha e salve os dados do cliente antes de anexar arquivos.');
        return;
      }
      for (const file of files) {
        const item = await enviarAnexoDaProposta(id, file);
        setAttachments(current => [...current, item]);
      }
      setMessage('Anexos guardados com a proposta.');
    } catch (error) {
      setMessage(mensagemDeErro(error, 'Falha ao enviar o anexo. Os anteriores permanecem salvos.'));
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!proposalId) return;
    setBusy(true);
    try {
      await removerAnexoDaProposta(proposalId, id);
      setAttachments(current => current.filter(item => item.id !== id));
      setMessage('Anexo removido.');
    } catch (error) {
      setMessage(mensagemDeErro(error, 'Não foi possível remover o anexo.'));
    } finally { setBusy(false); }
  }

  return <><section className="com-painel" aria-label="Documentos e finalização local">
    <div className="com-secao-titulo">
      <div>
        <h2>Documentos e finalização</h2>
        <p>Os arquivos ficam guardados neste aplicativo antes do envio ao CRM.</p>
      </div>
    </div>

    {!finalized && <label className="com-local-upload">
      Anexos do cliente (até 20 MB no conjunto)
      <input type="file" multiple disabled={busy} onChange={event => {
        const files = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = '';
        void upload(files);
      }} />
    </label>}
    {attachments.length > 0 && <ul className="com-local-file-list">
      {attachments.map(item => <li key={item.id}>
        <span>{item.originalName} ({Math.ceil(item.byteSize / 1024)} KB)</span>
        <button type="button" className="com-btn com-btn-fantasma" disabled={busy}
          onClick={() => void baixarAnexoDaProposta(item.id)
            .then(blob => download(blob, item.originalName))
            .catch(error => setMessage(mensagemDeErro(error, 'Falha ao baixar o anexo.')))}>
          Baixar
        </button>
        {!finalized && <button type="button" className="com-btn com-btn-fantasma"
          disabled={busy} onClick={() => void remove(item.id)}>Remover</button>}
      </li>)}
    </ul>}

    {docs.length > 0 && <div className="com-local-documents">
      <strong>Arquivos gerados</strong>
      <ul className="com-local-file-list">
        {docs.map(item => <li key={item.id}>
          <span>{item.fileName}</span>
          <button type="button" className="com-btn com-btn-fantasma" disabled={busy}
            onClick={() => void baixarDocumento(item.id)
              .then(blob => download(blob, item.fileName))
              .catch(error => setMessage(mensagemDeErro(error, 'Falha ao baixar o documento.')))}>
            Baixar
          </button>
        </li>)}
      </ul>
      {finalized && docs.length === 4 && <RegerarDocumentosButton
        proposalId={proposalId}
        onRegenerated={documents => onDocumentsChange(proposalId, documents)} />}
    </div>}

    {!finalized && <div className="com-local-actions">
      <button type="button" className="com-btn com-btn-primario" disabled={busy}
        onClick={() => void issue()}>
        {busy ? 'Aguarde...' : docs.length ? 'Atualizar documentos' : 'Emitir PDF e DOCX'}
      </button>
    </div>}
    {message && <p className="com-recado" role="status">{message}</p>}
    {documentsError && <p className="com-recado" role="alert">{documentsError}</p>}
  </section><CrmDeliveryPanel proposalId={proposalId} finalized={finalized} />
    <SharePointDeliveryPanel proposalId={proposalId} finalized={finalized} />
    <FiltroAppDeliveryPanel proposalId={proposalId} finalized={finalized} /></>;
}
