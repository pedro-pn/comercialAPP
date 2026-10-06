import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import {
  buscarProjetosFiltroApp, mensagemDeErro, obterEstadoFiltroApp, reenviarAoFiltroApp,
  selecionarProjetoManual, sincronizarAprovacaoNectar, type EstadoFiltroApp,
  type ProjetoFiltroApp
} from '../../../api/comercial';

export function FiltroAppDeliveryPanel({ proposalId, finalized }: {
  proposalId: string; finalized: boolean;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<EstadoFiltroApp | null>(null);
  const [projectId, setProjectId] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [projectTerm, setProjectTerm] = useState('');
  const [projects, setProjects] = useState<ProjetoFiltroApp[]>([]);
  const [projectSearchError, setProjectSearchError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    if (proposalId) setState(await obterEstadoFiltroApp(proposalId));
  }
  useEffect(() => {
    if (!proposalId) return;
    let live = true;
    obterEstadoFiltroApp(proposalId).then(result => { if (live) setState(result); })
      .catch(error => { if (live) setMessage(mensagemDeErro(error, 'Falha ao consultar o FiltroAPP.')); });
    return () => { live = false; };
  }, [proposalId, finalized]);

  useEffect(() => {
    const term = projectTerm.trim();
    if (term.length < 2) { setProjects([]); setProjectSearchError(''); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      buscarProjetosFiltroApp(term).then(items => {
        if (active) { setProjects(items); setProjectSearchError(''); }
      }).catch(error => {
        if (active) { setProjects([]); setProjectSearchError(mensagemDeErro(error, 'Busca indisponível.')); }
      });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [projectTerm]);

  async function run(action: () => Promise<unknown>, pending: string) {
    setBusy(true); setMessage(pending);
    try {
      await action();
      await refresh();
      setMessage('Estado da integração atualizado.');
    } catch (error) {
      await refresh().catch(() => undefined);
      setMessage(mensagemDeErro(error, 'Falha na integração com o FiltroAPP.'));
    } finally { setBusy(false); }
  }

  return <section className="com-painel" aria-label="Integração com FiltroAPP">
    <div className="com-secao-titulo"><div>
      <h2>Aprovação e FiltroAPP</h2>
      <p>Após a aprovação e o vínculo ao projeto, a proposta segue para o Acompanhamento.</p>
    </div></div>
    {!finalized && <p className="com-nota">Finalize a proposta antes de registrar a aprovação.</p>}
    {state && <div className="com-nota-regra">
      <p>Aprovação: {state.approvalStatus === 'APPROVED' ? 'aprovada' :
        state.approvalStatus === 'REJECTED' ? 'rejeitada' : state.approvalStatus === 'CANCELLED' ? 'cancelada' : 'pendente'}
        {state.approvalSource ? ` (${state.approvalSource === 'MANUAL' ? 'manual' : state.approvalSource === 'PRISMA' ? 'Prisma' : 'Nectar'})` : ''}.</p>
      <p>Projeto: {state.projectId || 'aguardando vínculo'}.</p>
      <p>Entrega: {state.deliveryStatus === 'SUCESSO' ? 'orçamento selecionado' :
        state.deliveryStatus === 'AGUARDANDO_SELECAO' ? 'revisão recebida; seleção pendente no FiltroAPP' :
        state.deliveryStatus.toLowerCase()}.</p>
    </div>}
    {state?.message && <p className="com-recado com-recado-erro" role="alert">{state.message}</p>}
    {state?.nextRetryAt && <p className="com-nota">Próxima tentativa automática: {
      new Date(state.nextRetryAt).toLocaleString('pt-BR')}.</p>}
    {finalized && user?.moduleRoles.includes('comercial:manager') && state?.deliveryStatus !== 'SUCESSO' && <>
      {state?.opportunityId && state.approvalSource !== 'PRISMA' && <div className="com-local-actions">
        <button type="button" className="com-btn com-btn-fantasma" disabled={busy}
          onClick={() => void run(() => sincronizarAprovacaoNectar(proposalId),
            'Consultando o Nectar...')}>Consultar aprovação no Nectar</button>
      </div>}
      {(state?.approvalStatus !== 'APPROVED' || !state.projectId) && <div className="com-nota-regra">
        <strong>Seleção manual pelo gestor</strong>
        <p>Use quando o Nectar não enviar aprovação ou vínculo. Escolha o projeto e registre o motivo.</p>
        <label className="field-group"><span>Buscar projeto no FiltroAPP</span>
          <input value={projectTerm} onChange={event => setProjectTerm(event.target.value)}
            placeholder="Código, nome ou cliente" /></label>
        {projects.length > 0 && <ul className="com-local-file-list">
          {projects.map(project => <li key={project.id}>
            <span>{project.code} · {project.name} · {project.clientName}</span>
            <button type="button" className="com-btn com-btn-fantasma"
              onClick={() => {
                setProjectId(project.id);
                setSelectedProject(`${project.code} · ${project.name}`);
                setProjectTerm(''); setProjects([]);
              }}>
              Escolher
            </button>
          </li>)}
        </ul>}
        {projectSearchError && <p className="com-nota com-nota-aviso">{projectSearchError}</p>}
        {selectedProject && <p>Projeto selecionado: {selectedProject}</p>}
        <label className="field-group"><span>ID do projeto</span>
          <input value={projectId} onChange={event => {
            setProjectId(event.target.value); setSelectedProject('');
          }} /></label>
        <label className="field-group"><span>Motivo</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" className="com-btn com-btn-primario"
          disabled={busy || !projectId.trim() || reason.trim().length < 10}
          onClick={() => void run(() => selecionarProjetoManual(proposalId, projectId.trim(), reason.trim()),
            'Registrando seleção manual...')}>Aprovar e vincular</button>
      </div>}
      {state?.approvalStatus === 'APPROVED' && state.projectId &&
        <div className="com-local-actions"><button type="button" className="com-btn com-btn-fantasma"
          disabled={busy || state.sending}
          onClick={() => void run(() => reenviarAoFiltroApp(proposalId), 'Enviando ao FiltroAPP...')}>
          Tentar entrega novamente
        </button></div>}
    </>}
    {message && <p className="com-recado" role="status">{message}</p>}
  </section>;
}
