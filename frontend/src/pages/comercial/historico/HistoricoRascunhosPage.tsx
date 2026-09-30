import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import type { CommercialUser } from '../../../api/auth';
import {
  baixarDocumento,
  listarLevantamentos,
  listarPropostas,
  mensagemDeErro,
  type LevantamentoSalvo,
  type PropostaSalva,
  type DocumentoEmitido
} from '../../../api/comercial';
import { LOGO_URL } from '../components/marca';
import { HistoricoLevantamentosTabela } from './HistoricoLevantamentosTabela';
import { HistoricoTabela } from './HistoricoTabela';

const REGISTROS_POR_PAGINA = 25;

type Props = {
  user: CommercialUser;
  onLogout: () => Promise<void>;
};

/** Consulta apenas os registros que a API independente já oferece. */
export function HistoricoRascunhosPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const podeVerValores = user.role !== 'VIEWER';
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [busca, setBusca] = useState('');
  const [paginaPropostas, setPaginaPropostas] = useState(1);
  const [paginaLevantamentos, setPaginaLevantamentos] = useState(1);
  const [propostas, setPropostas] = useState<PropostaSalva[]>([]);
  const [levantamentos, setLevantamentos] = useState<LevantamentoSalvo[]>([]);
  const [totalPropostas, setTotalPropostas] = useState(0);
  const [totalLevantamentos, setTotalLevantamentos] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [baixandoDocumentoId, setBaixandoDocumentoId] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');

    void Promise.all([
      listarPropostas({ busca, page: paginaPropostas, pageSize: REGISTROS_POR_PAGINA }),
      podeVerValores
        ? listarLevantamentos({ busca, page: paginaLevantamentos, pageSize: REGISTROS_POR_PAGINA })
        : Promise.resolve({ items: [] as LevantamentoSalvo[], total: 0 })
    ]).then(([respostaPropostas, respostaLevantamentos]) => {
      if (!ativo) return;
      setPropostas(respostaPropostas.items);
      setLevantamentos(respostaLevantamentos.items);
      setTotalPropostas(respostaPropostas.total);
      setTotalLevantamentos(respostaLevantamentos.total);
    }).catch(error => {
      if (!ativo) return;
      setPropostas([]);
      setLevantamentos([]);
      setTotalPropostas(0);
      setTotalLevantamentos(0);
      setErro(mensagemDeErro(error, 'Falha ao consultar o histórico.'));
    }).finally(() => {
      if (ativo) setCarregando(false);
    });

    return () => { ativo = false; };
  }, [busca, paginaPropostas, paginaLevantamentos, podeVerValores, user.id]);

  function buscar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaginaPropostas(1);
    setPaginaLevantamentos(1);
    setBusca(buscaDigitada.trim());
  }

  function abrirLevantamento(levantamento: LevantamentoSalvo) {
    const parametros = new URLSearchParams({
      modo: levantamento.mode === 'REVISAO' ? 'revision' : 'new',
      base: levantamento.proposalCode,
      revisao: String(levantamento.revisionNumber || 0),
      id: levantamento.id,
      secao: levantamento.status === 'SALVO' ? 'summary' : 'premises'
    });
    navigate(`/custos?${parametros}`);
  }

  function abrirProposta(proposta: PropostaSalva) {
    navigate(`/propostas?id=${encodeURIComponent(proposta.id)}`);
  }

  async function baixar(documento: DocumentoEmitido) {
    setBaixandoDocumentoId(documento.id);
    setErro('');
    try {
      const blob = await baixarDocumento(documento.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = documento.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível baixar o documento.'));
    } finally { setBaixandoDocumentoId(''); }
  }

  return (
    <main className="com-root com-history-page">
      <header className="com-history-topbar">
        <button type="button" className="com-marca" aria-label="Voltar ao início"
          onClick={() => navigate('/')}>
          <img src={LOGO_URL} alt="Filtrovali Engenharia" />
        </button>
        <div className="com-history-topbar-actions">
          <span className="com-usuario">{user.name}</span>
          <button type="button" className="com-btn com-btn-fantasma"
            onClick={() => navigate('/')}>
            ← Voltar
          </button>
          <button type="button" className="com-btn com-btn-fantasma"
            onClick={() => void onLogout()}>
            Sair
          </button>
        </div>
      </header>

      <section className="com-history-hero">
        <div>
          <span className="com-eyebrow">COMERCIAL / HISTÓRICO</span>
          <h1>Histórico comercial</h1>
          <p>Consulte levantamentos e propostas salvos no Comercial.</p>
        </div>
        <div className="com-history-count">
          <strong>{totalLevantamentos + totalPropostas}</strong>
          <span>registros encontrados</span>
        </div>
      </section>

      <section className="com-history-content">
        <p className="com-history-empty com-history-empty-compact">
          {podeVerValores
            ? 'Reabra levantamentos e propostas, baixe documentos emitidos e consulte o vínculo com o CRM.'
            : 'Consulte propostas e baixe o documento técnico quando disponível.'}
        </p>
        <form className="com-history-search" onSubmit={buscar}>
          <input value={buscaDigitada} onChange={event => setBuscaDigitada(event.target.value)}
            placeholder="Buscar por número, cliente ou descrição"
            aria-label="Buscar no histórico" />
          <button type="submit" className="com-btn com-btn-primario">Buscar</button>
          {buscaDigitada && (
            <button type="button" className="com-btn com-btn-fantasma" onClick={() => {
              setBuscaDigitada('');
              setBusca('');
              setPaginaPropostas(1);
              setPaginaLevantamentos(1);
            }}>Limpar</button>
          )}
        </form>

        {erro && <div className="com-history-error-message" role="alert">{erro}</div>}
        {carregando ? (
          <div className="com-history-empty" role="status">Carregando histórico...</div>
        ) : propostas.length === 0 && levantamentos.length === 0 ? (
          <div className="com-history-empty">Nenhum registro encontrado.</div>
        ) : (
          <div className="com-history-sections">
            {podeVerValores && (
              <section className="com-history-section" aria-labelledby="historico-levantamentos">
                <div className="com-history-section-title">
                  <div>
                    <h2 id="historico-levantamentos">Levantamentos de custo</h2>
                    <p>Registros acessíveis ao seu perfil.</p>
                  </div>
                  <strong>{totalLevantamentos}</strong>
                </div>
                {levantamentos.length ? <HistoricoLevantamentosTabela levantamentos={levantamentos}
                  onAbrir={abrirLevantamento} />
                  : <div className="com-history-empty com-history-empty-compact">Nenhum levantamento encontrado.</div>}
                {totalLevantamentos > REGISTROS_POR_PAGINA && (
                  <div className="com-oferta-acoes" aria-label="Paginação dos levantamentos">
                    <button type="button" className="com-btn com-btn-fantasma"
                      disabled={paginaLevantamentos === 1}
                      onClick={() => setPaginaLevantamentos(page => page - 1)}>← Anterior</button>
                    <span>Página {paginaLevantamentos} de {Math.ceil(totalLevantamentos / REGISTROS_POR_PAGINA)}</span>
                    <button type="button" className="com-btn com-btn-fantasma"
                      disabled={paginaLevantamentos * REGISTROS_POR_PAGINA >= totalLevantamentos}
                      onClick={() => setPaginaLevantamentos(page => page + 1)}>Próxima →</button>
                  </div>
                )}
              </section>
            )}

            <section className="com-history-section" aria-labelledby="historico-propostas">
              <div className="com-history-section-title">
                <div>
                  <h2 id="historico-propostas">Propostas</h2>
                  <p>Registros disponíveis para consulta.</p>
                </div>
                <strong>{totalPropostas}</strong>
              </div>
              {propostas.length ? <HistoricoTabela propostas={propostas}
                podeVerValores={podeVerValores} rascunhosOnly
                onBaixarDocumento={(documento) => { void baixar(documento); }}
                baixandoDocumentoId={baixandoDocumentoId}
                onAbrirProposta={podeVerValores ? abrirProposta : undefined} />
                : <div className="com-history-empty com-history-empty-compact">Nenhuma proposta encontrada.</div>}
              {totalPropostas > REGISTROS_POR_PAGINA && (
                <div className="com-oferta-acoes" aria-label="Paginação das propostas">
                  <button type="button" className="com-btn com-btn-fantasma"
                    disabled={paginaPropostas === 1}
                    onClick={() => setPaginaPropostas(page => page - 1)}>← Anterior</button>
                  <span>Página {paginaPropostas} de {Math.ceil(totalPropostas / REGISTROS_POR_PAGINA)}</span>
                  <button type="button" className="com-btn com-btn-fantasma"
                    disabled={paginaPropostas * REGISTROS_POR_PAGINA >= totalPropostas}
                    onClick={() => setPaginaPropostas(page => page + 1)}>Próxima →</button>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
