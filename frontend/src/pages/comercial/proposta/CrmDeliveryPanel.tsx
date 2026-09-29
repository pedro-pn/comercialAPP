import { useEffect, useState } from 'react';
import {
  enviarPropostaAoCrm, listarFunisNectar, mensagemDeErro,
  obterEstadoCrmDaProposta, type EstadoCrmLocal, type FunilNectar
} from '../../../api/comercial';
import { BuscaDeEmpresa } from './BuscaDeEmpresa';

export function CrmDeliveryPanel({ proposalId, finalized }: {
  proposalId: string; finalized: boolean;
}) {
  const [mode, setMode] = useState<'off' | 'fake' | 'real'>('off');
  const [funnels, setFunnels] = useState<FunilNectar[]>([]);
  const [unavailable, setUnavailable] = useState('');
  const [state, setState] = useState<EstadoCrmLocal | null>(null);
  const [pipelineId, setPipelineId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!proposalId) return;
    let active = true;
    Promise.all([listarFunisNectar(), obterEstadoCrmDaProposta(proposalId)])
      .then(([available, current]) => {
        if (!active) return;
        setMode(available.mode);
        setFunnels(available.items);
        setUnavailable(available.motivoIndisponivel);
        setState(current);
        setPipelineId(current.pipelineId || (available.items.length === 1 ? available.items[0].id : ''));
        setCompanyId(current.companyId);
        setContactId(current.contactId);
      })
      .catch(error => { if (active) setMessage(mensagemDeErro(error, 'Falha ao consultar o Nectar.')); });
    return () => { active = false; };
  }, [proposalId, finalized]);

  async function send() {
    if (!proposalId || busy) return;
    if (!pipelineId || !companyId || !contactId) {
      setMessage('Selecione o funil, a empresa e o contato do Nectar.');
      return;
    }
    setBusy(true);
    setMessage(mode === 'fake' ? 'Simulando o envio...' : 'Enviando ao Nectar...');
    try {
      const result = await enviarPropostaAoCrm(proposalId, { pipelineId, companyId, contactId });
      setState(await obterEstadoCrmDaProposta(proposalId));
      setMessage(result.message);
    } catch (error) {
      setState(await obterEstadoCrmDaProposta(proposalId).catch(() => state));
      setMessage(mensagemDeErro(error, 'Não foi possível enviar ao Nectar.'));
    } finally { setBusy(false); }
  }

  return <section className="com-painel" aria-label="Integração com Nectar CRM">
    <div className="com-secao-titulo">
      <div>
        <h2>Enviar ao Nectar CRM</h2>
        <p>O card recebe os dois PDFs, a planilha do levantamento vinculado e os anexos da proposta.</p>
      </div>
    </div>

    {!finalized && <p className="com-nota">Finalize a proposta localmente antes do envio.</p>}
    {unavailable && <p className="com-nota com-nota-aviso">{unavailable}</p>}
    {mode === 'fake' && !unavailable &&
      <p className="com-nota com-nota-aviso">Modo de teste: nenhum dado será enviado ao Nectar.</p>}
    {state?.status === 'SUCESSO' && <p className="com-nota">
      Enviada ao Nectar. Card {state.opportunityId} no funil {state.pipelineName || state.pipelineId}.
    </p>}
    {state?.status === 'ERRO' && state.message &&
      <p className="com-recado com-recado-erro" role="alert">Última tentativa: {state.message}</p>}

    {finalized && !unavailable && state?.status !== 'SUCESSO' && <>
      <label className="field-group">
        <span>Funil do Nectar</span>
        <select value={pipelineId} disabled={busy || Boolean(state?.opportunityId)}
          onChange={event => setPipelineId(event.target.value)}>
          <option value="">Selecione um funil</option>
          {funnels.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </label>
      <div className="com-nota-regra">
        <strong>Empresa e contato</strong>
        <p>Escolha os registros do Nectar que receberão a proposta.</p>
        {companyId && <p>Empresa: {companyId} · Contato: {contactId || 'selecione abaixo'}</p>}
      </div>
      {(!state?.opportunityId || !companyId || !contactId) &&
        <BuscaDeEmpresa onEscolher={patch => {
          if ('companyId' in patch) {
            setCompanyId(String(patch.companyId || ''));
            setContactId('');
          }
          if ('contactId' in patch) setContactId(String(patch.contactId || ''));
        }} />}
      <div className="com-local-actions">
        <button type="button" className="com-btn com-btn-primario"
          disabled={busy || Boolean(state?.sending) || !pipelineId || !companyId || !contactId}
          onClick={() => void send()}>
          {busy ? 'Aguarde...' : mode === 'fake' ? 'Simular envio' : 'Enviar ao Nectar'}
        </button>
      </div>
    </>}
    {message && <p className="com-recado" role="status">{message}</p>}
  </section>;
}
