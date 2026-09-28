import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  baixarDocumento,
  listarLevantamentos,
  listarPropostas,
  mensagemDeErro,
  type DocumentoEmitido,
  type LevantamentoSalvo,
  type PropostaSalva
} from '../../../api/comercial';
import { useAuth } from '../../../auth/AuthContext';
import { moduleRoutePath } from '../../../modules/registry';
import { LOGO_URL } from '../components/marca';
import { HistoricoTabela } from './HistoricoTabela';
import { HistoricoLevantamentosTabela } from './HistoricoLevantamentosTabela';

const REGISTROS_POR_PAGINA = 25;

export function HistoricoPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [busca, setBusca] = useState('');
  const [propostas, setPropostas] = useState<PropostaSalva[]>([]);
  const [levantamentos, setLevantamentos] = useState<LevantamentoSalvo[]>([]);
  const [totalPropostas, setTotalPropostas] = useState(0);
  const [totalLevantamentos, setTotalLevantamentos] = useState(0);
  const [paginaPropostas, setPaginaPropostas] = useState(1);
  const [paginaLevantamentos, setPaginaLevantamentos] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [baixandoDocumentoId, setBaixandoDocumentoId] = useState('');

  const podeVerValores = Boolean(
    user?.moduleRoles?.some((role) =>
      ['comercial:manager', 'comercial:seller'].includes(role)
    )
  );
  const podeVerLevantamentos = podeVerValores;

  const carregar = useCallback(
    async (termo = '', paginaDasPropostas = 1, paginaDosLevantamentos = 1) => {
      setCarregando(true);
      setErro('');
      try {
        const [respostaPropostas, respostaLevantamentos] = await Promise.all([
          listarPropostas({
            busca: termo,
            page: paginaDasPropostas,
            pageSize: REGISTROS_POR_PAGINA
          }),
          podeVerLevantamentos
            ? listarLevantamentos({
                busca: termo,
                page: paginaDosLevantamentos,
                pageSize: REGISTROS_POR_PAGINA
              })
            : Promise.resolve({ items: [] as LevantamentoSalvo[], total: 0 })
        ]);
        setPropostas(respostaPropostas.items);
        setLevantamentos(respostaLevantamentos.items);
        setTotalPropostas(respostaPropostas.total);
        setTotalLevantamentos(respostaLevantamentos.total);
        setPaginaPropostas(paginaDasPropostas);
        setPaginaLevantamentos(paginaDosLevantamentos);
      } catch (error) {
        setErro(mensagemDeErro(error, 'Falha ao consultar o histórico.'));
      } finally {
        setCarregando(false);
      }
    },
    [podeVerLevantamentos]
  );

  function abrirLevantamento(levantamento: LevantamentoSalvo) {
    const parametros = new URLSearchParams({
      modo: levantamento.mode === 'REVISAO' ? 'revision' : 'new',
      base: levantamento.proposalCode,
      revisao: String(levantamento.revisionNumber || 0),
      id: levantamento.id,
      secao: 'summary'
    });
    navigate(
      `${moduleRoutePath('comercial', 'custos')}?${parametros.toString()}`
    );
  }

  function abrirProposta(proposta: PropostaSalva) {
    const parametros = new URLSearchParams({
      id: proposta.id,
      proposta: proposta.proposalCode,
      revisao: String(proposta.revisionNumber || 0),
      modo: proposta.revisionNumber > 0 ? 'revision' : 'new',
      etapa: proposta.status === 'FALHA_INTEGRACAO' ? 'revisao' : 'cliente'
    });
    if (proposta.costEstimateId)
      parametros.set('levantamento', proposta.costEstimateId);
    navigate(
      `${moduleRoutePath('comercial', 'propostas')}?${parametros.toString()}`
    );
  }

  function criarRevisao(proposta: PropostaSalva) {
    const parametros = new URLSearchParams({
      modo: 'revision',
      proposta: proposta.proposalCode,
      etapa: 'cliente'
    });
    navigate(
      `${moduleRoutePath('comercial', 'propostas')}?${parametros.toString()}`
    );
  }

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function sair() {
    await logout();
    navigate('/login', { replace: true });
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
      URL.revokeObjectURL(url);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Falha ao baixar o documento.'));
    } finally {
      setBaixandoDocumentoId('');
    }
  }

  return (
    <main className="com-root com-history-page">
      <header className="com-history-topbar">
        <button
          type="button"
          className="com-marca"
          aria-label="Filtrovali Engenharia"
          onClick={() => navigate(moduleRoutePath('comercial', 'index'))}
        >
          <img src={LOGO_URL} alt="Filtrovali Engenharia" />
        </button>
        <div className="com-history-topbar-actions">
          <span className="com-usuario">
            Orçamentista: <b className="com-quebrar">{user?.name || '—'}</b>
          </span>
          {/* Um "← Voltar" só, para o menu do módulo, com o mesmo rótulo das
              Configurações. O "← Voltar ao gerador" da referência
              (`HIST-CTL-002`) foi **removido por decisão do mantenedor em
              14/08** — desvio nº 17. Ele levava ao gerador, que abre o diálogo
              "Como deseja começar?": dois botões de voltar lado a lado, e o da
              referência empurrava para dentro de outro fluxo. */}
          <button
            type="button"
            className="com-btn com-btn-fantasma"
            onClick={() => navigate(moduleRoutePath('comercial', 'index'))}
          >
            ← Voltar
          </button>
          <button
            type="button"
            className="com-btn com-btn-fantasma"
            onClick={() => void sair()}
          >
            Sair
          </button>
        </div>
      </header>

      <section className="com-history-hero">
        <div>
          <span className="com-eyebrow">COMERCIAL / PROPOSTAS</span>
          <h1>Histórico comercial</h1>
          <p>
            Consulte levantamentos salvos, propostas geradas, integrações e
            documentos.
          </p>
        </div>
        <div className="com-history-count">
          <strong>{totalPropostas + totalLevantamentos}</strong>
          <span>registros encontrados</span>
        </div>
      </section>

      <section className="com-history-content">
        <form
          className="com-history-search"
          onSubmit={(event) => {
            event.preventDefault();
            void carregar(busca, 1, 1);
          }}
        >
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por número, cliente, documento, responsável ou funil..."
            aria-label="Buscar no histórico"
          />
          <button type="submit" className="com-btn com-btn-primario">
            Buscar
          </button>
          {busca && (
            <button
              type="button"
              className="com-btn com-btn-fantasma"
              onClick={() => {
                setBusca('');
                void carregar('', 1, 1);
              }}
            >
              Limpar
            </button>
          )}
        </form>

        {erro && (
          <div className="com-history-error-message" role="alert">
            {erro}
          </div>
        )}
        {carregando ? (
          <div className="com-history-empty" aria-live="polite">
            Carregando histórico...
          </div>
        ) : propostas.length === 0 && levantamentos.length === 0 ? (
          <div className="com-history-empty">
            Nenhum levantamento ou proposta registrado ainda.
          </div>
        ) : (
          <div className="com-history-sections">
            {podeVerLevantamentos && (
              <section
                className="com-history-section"
                aria-labelledby="historico-levantamentos"
              >
                <div className="com-history-section-title">
                  <div>
                    <h2 id="historico-levantamentos">Levantamentos de custo</h2>
                    <p>
                      Rascunhos e levantamentos concluídos, com acesso para
                      continuar o trabalho.
                    </p>
                  </div>
                  <strong>{totalLevantamentos}</strong>
                </div>
                {levantamentos.length ? (
                  <HistoricoLevantamentosTabela
                    levantamentos={levantamentos}
                    onAbrir={abrirLevantamento}
                  />
                ) : (
                  <div className="com-history-empty com-history-empty-compact">
                    Nenhum levantamento encontrado.
                  </div>
                )}
                {totalLevantamentos > REGISTROS_POR_PAGINA && (
                  <div
                    className="com-oferta-acoes"
                    aria-label="Paginação dos levantamentos"
                  >
                    <button
                      type="button"
                      className="com-btn com-btn-fantasma"
                      disabled={paginaLevantamentos <= 1}
                      onClick={() =>
                        void carregar(
                          busca,
                          paginaPropostas,
                          paginaLevantamentos - 1
                        )
                      }
                    >
                      ← Anterior
                    </button>
                    <span>
                      Página {paginaLevantamentos} de{' '}
                      {Math.ceil(totalLevantamentos / REGISTROS_POR_PAGINA)}
                    </span>
                    <button
                      type="button"
                      className="com-btn com-btn-fantasma"
                      disabled={
                        paginaLevantamentos * REGISTROS_POR_PAGINA >=
                        totalLevantamentos
                      }
                      onClick={() =>
                        void carregar(
                          busca,
                          paginaPropostas,
                          paginaLevantamentos + 1
                        )
                      }
                    >
                      Próxima →
                    </button>
                  </div>
                )}
              </section>
            )}

            <section
              className="com-history-section"
              aria-labelledby="historico-propostas"
            >
              <div className="com-history-section-title">
                <div>
                  <h2 id="historico-propostas">Propostas</h2>
                  <p>
                    Rascunhos, documentos emitidos e situação das integrações.
                  </p>
                </div>
                <strong>{totalPropostas}</strong>
              </div>
              {propostas.length ? (
                <HistoricoTabela
                  propostas={propostas}
                  podeVerValores={podeVerValores}
                  baixandoDocumentoId={baixandoDocumentoId}
                  onBaixarDocumento={(documento) => void baixar(documento)}
                  onAbrirProposta={podeVerValores ? abrirProposta : undefined}
                  onCriarRevisao={podeVerValores ? criarRevisao : undefined}
                />
              ) : (
                <div className="com-history-empty com-history-empty-compact">
                  Nenhuma proposta encontrada.
                </div>
              )}
              {totalPropostas > REGISTROS_POR_PAGINA && (
                <div
                  className="com-oferta-acoes"
                  aria-label="Paginação das propostas"
                >
                  <button
                    type="button"
                    className="com-btn com-btn-fantasma"
                    disabled={paginaPropostas <= 1}
                    onClick={() =>
                      void carregar(
                        busca,
                        paginaPropostas - 1,
                        paginaLevantamentos
                      )
                    }
                  >
                    ← Anterior
                  </button>
                  <span>
                    Página {paginaPropostas} de{' '}
                    {Math.ceil(totalPropostas / REGISTROS_POR_PAGINA)}
                  </span>
                  <button
                    type="button"
                    className="com-btn com-btn-fantasma"
                    disabled={
                      paginaPropostas * REGISTROS_POR_PAGINA >= totalPropostas
                    }
                    onClick={() =>
                      void carregar(
                        busca,
                        paginaPropostas + 1,
                        paginaLevantamentos
                      )
                    }
                  >
                    Próxima →
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
