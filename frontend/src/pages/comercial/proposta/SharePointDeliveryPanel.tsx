import { useEffect, useState } from 'react';
import {
  enviarPropostaAoSharePoint, mensagemDeErro, obterEstadoSharePoint,
  type EstadoSharePointLocal
} from '../../../api/comercial';

export function SharePointDeliveryPanel({ proposalId, finalized }: {
  proposalId: string; finalized: boolean;
}) {
  const [state, setState] = useState<EstadoSharePointLocal | null>(null);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!proposalId) return;
    let active = true;
    obterEstadoSharePoint(proposalId).then(current => {
      if (!active) return;
      setState(current);
      setFolder(current.folder);
    }).catch(error => {
      if (active) setMessage(mensagemDeErro(error, 'Falha ao consultar o SharePoint.'));
    });
    return () => { active = false; };
  }, [proposalId, finalized]);

  async function send() {
    if (!proposalId || busy) return;
    setBusy(true);
    setMessage(state?.mode === 'fake' ? 'Simulando o envio...' : 'Enviando arquivos...');
    try {
      const result = await enviarPropostaAoSharePoint(proposalId, folder.trim());
      setMessage(result.message);
      if (result.status === 'SUCESSO') {
        const current = await obterEstadoSharePoint(proposalId);
        setState(current);
        setFolder(current.folder);
      }
    } catch (error) {
      setState(await obterEstadoSharePoint(proposalId).catch(() => state));
      setMessage(mensagemDeErro(error, 'Não foi possível enviar ao SharePoint.'));
    } finally { setBusy(false); }
  }

  return <section className="com-painel" aria-label="Integração com SharePoint">
    <div className="com-secao-titulo"><div>
      <h2>Arquivar no SharePoint</h2>
      <p>Envie os dois PDFs, a planilha de custos quando houver e os anexos da proposta.</p>
    </div></div>
    {!finalized && <p className="com-nota">Finalize a proposta localmente antes do envio.</p>}
    {state?.unavailable && <p className="com-nota com-nota-aviso">{state.unavailable}</p>}
    {state?.mode === 'fake' && !state.unavailable &&
      <p className="com-nota com-nota-aviso">Modo de teste: nenhuma pasta será criada.</p>}
    {state?.status === 'SUCESSO' && <p className="com-nota">Arquivos enviados para {state.folder}.</p>}
    {state?.status === 'ERRO' && state.message &&
      <p className="com-recado com-recado-erro" role="alert">Última tentativa: {state.message}</p>}
    {finalized && !state?.unavailable && state?.status !== 'SUCESSO' && <>
      <label className="field-group">
        <span>Pasta existente da obra (opcional)</span>
        <input value={folder} maxLength={500} disabled={busy || Boolean(state?.sending)}
          onChange={event => setFolder(event.target.value)}
          placeholder="Deixe em branco para criar a pasta da proposta" />
      </label>
      <div className="com-local-actions">
        <button type="button" className="com-btn com-btn-primario"
          disabled={busy || Boolean(state?.sending)} onClick={() => void send()}>
          {busy ? 'Aguarde...' : state?.mode === 'fake' ? 'Simular envio' : 'Enviar ao SharePoint'}
        </button>
      </div>
    </>}
    {message && <p className="com-recado" role="status">{message}</p>}
  </section>;
}
