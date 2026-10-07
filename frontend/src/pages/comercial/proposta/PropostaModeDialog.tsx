import { useState } from 'react';

import {
  ComercialValidationError,
  listarLevantamentos,
  mensagemDeErro,
  type ComercialIssue,
  type LevantamentoSalvo
} from '../../../api/comercial';
import { BotaoFecharDialogo } from '../components/FecharDialogo';
import { LOGO_URL } from '../components/marca';
import { MarcaDeOpcao } from '../components/MarcaDeOpcao';
import { formatarValorDoLevantamento } from './levantamentoVinculado';
import { prepararLevantamentoParaProposta } from './prepararLevantamento';
import { RascunhosEmAndamento } from '../components/RascunhosEmAndamento';
import { ImportarLecForm } from './ImportarLecForm';

/** Entrada da proposta: nova ou revisão de um número existente (PROP-CTL-001..005). */
export function PropostaModeDialog({
  recado,
  onLevantamento,
  onPendenciasDoLevantamento,
  onPropostaExistente,
  onRascunho,
  onNova,
  onRevisao,
  onLegada,
  onLecImportado,
  onFechar
}: {
  recado: string;
  onLevantamento: (levantamento: LevantamentoSalvo) => void;
  onPendenciasDoLevantamento: (
    levantamento: LevantamentoSalvo,
    issues: ComercialIssue[]
  ) => void;
  onPropostaExistente: (levantamento: LevantamentoSalvo) => void;
  onRascunho: (id: string) => void;
  onNova: () => void;
  onRevisao: (codigo: string) => Promise<boolean>;
  onLegada: (codigo: string, revisao: number) => Promise<boolean>;
  onLecImportado: (levantamento: LevantamentoSalvo) => void;
  /** Fechar sem escolher volta ao menu do módulo. */
  onFechar: () => void;
}) {
  const [mostrarLevantamentos, setMostrarLevantamentos] = useState(false);
  const [mostrarRevisao, setMostrarRevisao] = useState(false);
  const [mostrarLegada, setMostrarLegada] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoLegado, setCodigoLegado] = useState('');
  const [revisaoLegada, setRevisaoLegada] = useState('1');
  const [confirmouLegado, setConfirmouLegado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [carregandoLevantamentos, setCarregandoLevantamentos] = useState(false);
  const [levantamentos, setLevantamentos] = useState<LevantamentoSalvo[]>([]);
  const [erroDosLevantamentos, setErroDosLevantamentos] = useState('');
  const [levantamentoEmAbertura, setLevantamentoEmAbertura] = useState('');
  const [importandoLec, setImportandoLec] = useState(false);

  async function escolherLevantamento(item: LevantamentoSalvo) {
    if (levantamentoEmAbertura) return;
    setLevantamentoEmAbertura(item.id);
    setErroDosLevantamentos('');
    try {
      onLevantamento(await prepararLevantamentoParaProposta(item.id));
    } catch (error) {
      if (error instanceof ComercialValidationError) {
        onPendenciasDoLevantamento(item, error.issues);
      } else {
        setErroDosLevantamentos(
          mensagemDeErro(error, 'Não foi possível abrir a proposta com este levantamento.')
        );
      }
    } finally {
      setLevantamentoEmAbertura('');
    }
  }

  async function abrirLevantamentos(forcar = false) {
    setMostrarLevantamentos(true);
    setMostrarRevisao(false);
    setMostrarLegada(false);
    if ((!forcar && levantamentos.length) || carregandoLevantamentos) return;

    setCarregandoLevantamentos(true);
    setErroDosLevantamentos('');
    try {
      const resposta = await listarLevantamentos({
        pageSize: 100
      });
      setLevantamentos(resposta.items);
    } catch (error) {
      setErroDosLevantamentos(
        mensagemDeErro(
          error,
          'Não foi possível carregar os levantamentos salvos.'
        )
      );
    } finally {
      setCarregandoLevantamentos(false);
    }
  }

  async function carregar() {
    const procurado = codigo.trim();
    if (!procurado || carregando) return;
    setCarregando(true);
    try {
      await onRevisao(procurado);
    } finally {
      setCarregando(false);
    }
  }

  async function registrarLegada() {
    const numero = codigoLegado.trim();
    const revisao = Number(revisaoLegada);
    if (!numero || Number(numero) > 2_147_483_646 || !confirmouLegado || !Number.isInteger(revisao) ||
        revisao < 1 || revisao > 2_147_483_646 || carregando) return;
    setCarregando(true);
    try {
      await onLegada(numero, revisao);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className="com-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="com-proposta-modo-titulo"
    >
      <section className="com-painel com-modo-card">
        <BotaoFecharDialogo fechar={() => { if (!importandoLec) onFechar(); }} />
        <img className="com-modo-logo" src={LOGO_URL} alt="Filtrovali" />
        <span className="com-eyebrow">PROPOSTA TÉCNICA E COMERCIAL</span>
        <h1 id="com-proposta-modo-titulo">Como deseja começar?</h1>
        <p>
          Use um levantamento concluído para aproveitar o preço calculado, crie uma
          proposta sem levantamento ou revise uma proposta existente.
        </p>

        <div className="com-modo-opcoes com-modo-quatro">
          <button
            type="button"
            disabled={importandoLec || Boolean(levantamentoEmAbertura)}
            onClick={() => void abrirLevantamentos()}
          >
            <MarcaDeOpcao tipo="ok" />
            <strong>Usar levantamento salvo</strong>
            <span>
              Vincula custos, código, revisão e preço de venda à proposta.
            </span>
          </button>
          <button
            type="button"
            disabled={importandoLec || Boolean(levantamentoEmAbertura)}
            onClick={() => {
              setMostrarLevantamentos(false);
              setMostrarLegada(false);
              onNova();
            }}
          >
            <MarcaDeOpcao tipo="nova" />
            <strong>Proposta avulsa</strong>
            <span>
              Cria os documentos sem levantamento de custos vinculado.
            </span>
          </button>
          <button
            type="button"
            disabled={importandoLec || Boolean(levantamentoEmAbertura)}
            onClick={() => {
              setMostrarLevantamentos(false);
              setMostrarLegada(false);
              setMostrarRevisao(true);
            }}
          >
            <MarcaDeOpcao tipo="revisao" />
            <strong>Revisar proposta</strong>
            <span>Carrega os dados salvos e calcula a próxima revisão.</span>
          </button>
          <button
            type="button"
            disabled={importandoLec || Boolean(levantamentoEmAbertura)}
            onClick={() => {
              setMostrarLevantamentos(false);
              setMostrarRevisao(false);
              setMostrarLegada(true);
            }}
          >
            <MarcaDeOpcao tipo="revisao" />
            <strong>Revisar proposta legada</strong>
            <span>Importe o LEC e a proposta em PDF para revisar custos e documentos.</span>
          </button>
        </div>

        <RascunhosEmAndamento tipo="proposta" onAbrir={item => { if (!importandoLec) onRascunho(item.id); }} />

        {mostrarLevantamentos && (
          <section className="com-levantamentos-entrada" aria-live="polite">
            <div className="com-levantamentos-cabecalho">
              <div>
                <strong>Levantamentos salvos</strong>
                <span>
                  Escolha o levantamento para carregar os dados, serviços e valores
                  na proposta. Se houver pendências, os campos serão destacados.
                  Se já houver proposta, você continuará nela.
                </span>
              </div>
              {!carregandoLevantamentos && (
                <button
                  type="button"
                  disabled={Boolean(levantamentoEmAbertura)}
                  className="com-btn com-btn-fantasma"
                  onClick={() => {
                    void abrirLevantamentos(true);
                  }}
                >
                  Atualizar
                </button>
              )}
            </div>

            {carregandoLevantamentos ? (
              <p>Carregando levantamentos...</p>
            ) : erroDosLevantamentos ? (
              <p className="com-recado" role="alert">{erroDosLevantamentos}</p>
            ) : levantamentos.length === 0 ? (
              <p>
                Nenhum levantamento foi encontrado. Salve um orçamento para
                encontrá-lo aqui e continuar a proposta.
              </p>
            ) : (
              <div className="com-levantamentos-lista">
                {levantamentos.map((item) => {
                  const proposta = item.propostaVinculada;
                  const rascunho = item.status !== 'SALVO';
                  const emProcessamento = proposta?.status === 'FINALIZANDO';
                  const rotulo =
                    proposta?.status === 'RASCUNHO'
                      ? 'Continuar proposta'
                      : proposta?.status === 'FALHA_INTEGRACAO'
                        ? 'Tentar integrações novamente'
                        : proposta?.status === 'FINALIZADA'
                          ? 'Criar revisão'
                          : emProcessamento
                            ? 'Finalização em andamento'
                            : '';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={emProcessamento || Boolean(levantamentoEmAbertura)}
                      onClick={() => {
                        if (!proposta) {
                          void escolherLevantamento(item);
                          return;
                        }
                        if (proposta.status === 'FINALIZADA') {
                          void onRevisao(proposta.proposalCode);
                          return;
                        }
                        onPropostaExistente(item);
                      }}
                    >
                      <span>
                        <strong>
                          Proposta {item.proposalCode}
                          {item.revisionNumber > 0
                            ? ` · Rev ${item.revisionNumber}`
                            : ''}
                        </strong>
                        <small>
                          {rascunho ? 'Rascunho salvo' : 'Levantamento concluído'} ·{' '}
                          {item.title || 'Levantamento sem título'}
                          {rotulo ? ` · ${rotulo}` : ''}
                        </small>
                      </span>
                      <b>
                        {levantamentoEmAbertura === item.id ? 'Validando levantamento... · ' : ''}
                        {formatarValorDoLevantamento(item.salePrice) ||
                          'Preço a revisar'}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {mostrarRevisao && (
          <div className="com-revisao-entrada">
            <div className="field-group">
              <label htmlFor="com-proposta-revisao">
                Número da proposta existente
              </label>
              <input
                id="com-proposta-revisao"
                autoFocus
                inputMode="numeric"
                value={codigo}
                placeholder="Ex.: 4418"
                onChange={(evento) =>
                  setCodigo(evento.target.value.replace(/\D/g, ''))
                }
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') carregar();
                }}
              />
            </div>
            <button
              type="button"
              className="com-btn com-btn-fantasma"
              disabled={carregando || !codigo.trim()}
              onClick={carregar}
            >
              {carregando ? 'Carregando...' : 'Carregar revisão'}
            </button>
          </div>
        )}

        {mostrarLegada && (
          <>
          <ImportarLecForm onImportado={onLecImportado} onOcupado={setImportandoLec} />
          <details className="com-lec-manual">
          <summary>Preencher uma revisão legada manualmente, sem arquivos</summary>
          <div className="com-revisao-entrada">
            <div className="field-group">
              <label htmlFor="com-proposta-legada-numero">Número da proposta legada</label>
              <input
                id="com-proposta-legada-numero"
                autoFocus
                inputMode="numeric"
                value={codigoLegado}
                placeholder="Ex.: 4418"
                onChange={evento => setCodigoLegado(
                  evento.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10)
                )}
              />
            </div>
            <div className="field-group">
              <label htmlFor="com-proposta-legada-revisao">Revisão a criar</label>
              <input
                id="com-proposta-legada-revisao"
                type="number"
                min="1"
                max="2147483646"
                step="1"
                value={revisaoLegada}
                onChange={evento => setRevisaoLegada(evento.target.value)}
              />
            </div>
            <label className="com-legado-confirmacao">
              <input
                type="checkbox"
                checked={confirmouLegado}
                onChange={evento => setConfirmouLegado(evento.target.checked)}
              />
              Confirmei no histórico que esta proposta e a revisão anterior existem.
              Os dados antigos serão preenchidos novamente.
            </label>
            <button
              type="button"
              className="com-btn com-btn-fantasma"
              disabled={importandoLec || carregando || !codigoLegado || Number(codigoLegado) > 2_147_483_646 ||
                !confirmouLegado ||
                !Number.isInteger(Number(revisaoLegada)) || Number(revisaoLegada) < 1 ||
                Number(revisaoLegada) > 2_147_483_646}
              onClick={() => void registrarLegada()}
            >
              {carregando ? 'Registrando...' : 'Criar revisão legada'}
            </button>
          </div>
          </details>
          </>
        )}

        {recado && <p className="com-recado">{recado}</p>}
      </section>
    </div>
  );
}
