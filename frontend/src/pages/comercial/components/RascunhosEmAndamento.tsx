import { useCallback, useEffect, useRef, useState } from 'react';

import { listarLevantamentos, listarPropostas, mensagemDeErro } from '../../../api/comercial';

export type RascunhoEmAndamento = {
  id: string;
  proposalCode: string;
  revisionNumber: number;
  mode?: string;
  status?: string;
  title?: string;
  clientName?: string;
  updatedAt?: string;
};

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Rascunhos e levantamentos salvos da conta, disponíveis para continuar o trabalho. */
export function RascunhosEmAndamento({ tipo, onAbrir }: {
  tipo: 'proposta' | 'custos';
  onAbrir: (item: RascunhoEmAndamento) => void;
}) {
  const [items, setItems] = useState<RascunhoEmAndamento[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [statusCustos, setStatusCustos] = useState<'RASCUNHO' | 'SALVO'>('RASCUNHO');
  const requisicao = useRef(0);
  const custosSalvos = tipo === 'custos' && statusCustos === 'SALVO';

  const carregar = useCallback(async (page = 1) => {
    const atual = ++requisicao.current;
    setCarregando(true);
    setErro('');
    try {
      const resposta = tipo === 'proposta'
        ? await listarPropostas({ status: 'RASCUNHO', page, pageSize: 25 })
        : await listarLevantamentos({ status: statusCustos, page, pageSize: 25 });
      if (atual !== requisicao.current) return;
      setItems(anteriores => page === 1 ? resposta.items : [...anteriores, ...resposta.items]);
      setTotal(resposta.total);
      setPagina(page);
    } catch (error) {
      if (atual === requisicao.current)
        setErro(mensagemDeErro(error, 'Não foi possível carregar os rascunhos.'));
    } finally {
      if (atual === requisicao.current) setCarregando(false);
    }
  }, [tipo, statusCustos]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    void carregar();
    return () => { requisicao.current += 1; };
  }, [carregar]);

  return (
    <section className="com-levantamentos-entrada" aria-live="polite">
      <div className="com-levantamentos-cabecalho">
        <div>
          <strong>{tipo === 'proposta' ? 'Propostas em andamento' : custosSalvos ? 'Custos salvos' : 'Custos em andamento'}</strong>
          <span>{custosSalvos
            ? 'Os levantamentos concluídos continuam disponíveis para consulta e edição.'
            : 'Os rascunhos são salvos automaticamente. Escolha um para continuar.'}</span>
        </div>
        <button type="button" className="com-btn com-btn-fantasma"
          disabled={carregando} onClick={() => void carregar()}>
          Atualizar
        </button>
      </div>
      {tipo === 'custos' && <div className="com-rodape-acoes" role="group" aria-label="Situação dos custos">
        <button type="button" className="com-btn com-btn-fantasma"
          aria-pressed={!custosSalvos} onClick={() => setStatusCustos('RASCUNHO')}>Em andamento</button>
        <button type="button" className="com-btn com-btn-fantasma"
          aria-pressed={custosSalvos} onClick={() => setStatusCustos('SALVO')}>Salvos</button>
      </div>}
      {erro && <p className="com-recado" role="alert">{erro}</p>}
      {!carregando && !erro && items.length === 0 && <p>{custosSalvos
        ? 'Nenhum levantamento salvo.' : 'Nenhum rascunho em andamento.'}</p>}
      {items.length > 0 && (
        <div className="com-levantamentos-lista com-rascunhos-lista">
          {items.map(item => (
            <button key={item.id} type="button" onClick={() => onAbrir(item)}>
              <span>
                <strong>
                  {tipo === 'proposta' ? 'Proposta' : 'Levantamento'} {item.proposalCode}
                  {item.revisionNumber > 0 ? ` · Rev ${item.revisionNumber}` : ''}
                </strong>
                <small>
                  {item.title || item.clientName || 'Rascunho sem título'}
                  {item.updatedAt ? ` · Atualizado em ${dataHora.format(new Date(item.updatedAt))}` : ''}
                </small>
              </span>
              <b>{custosSalvos ? 'Abrir levantamento' : 'Continuar'}</b>
            </button>
          ))}
        </div>
      )}
      {carregando && <p>{custosSalvos ? 'Carregando levantamentos salvos...' : 'Carregando rascunhos...'}</p>}
      {items.length < total && (
        <button type="button" className="com-btn com-btn-fantasma"
          disabled={carregando} onClick={() => void carregar(pagina + 1)}>
          Carregar mais
        </button>
      )}
    </section>
  );
}
