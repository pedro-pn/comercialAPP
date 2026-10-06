import { useCallback, useEffect, useRef, useState } from 'react';

import { listarLevantamentos, listarPropostas, mensagemDeErro } from '../../../api/comercial';

export type RascunhoEmAndamento = {
  id: string;
  proposalCode: string;
  revisionNumber: number;
  mode?: string;
  title?: string;
  clientName?: string;
  updatedAt?: string;
};

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Trabalhos da conta que ainda podem ser preenchidos, ordenados pela última edição. */
export function RascunhosEmAndamento({ tipo, onAbrir }: {
  tipo: 'proposta' | 'custos';
  onAbrir: (item: RascunhoEmAndamento) => void;
}) {
  const [items, setItems] = useState<RascunhoEmAndamento[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const requisicao = useRef(0);

  const carregar = useCallback(async (page = 1) => {
    const atual = ++requisicao.current;
    setCarregando(true);
    setErro('');
    try {
      const filtros = { status: 'RASCUNHO' as const, page, pageSize: 25 };
      const resposta = tipo === 'proposta'
        ? await listarPropostas(filtros)
        : await listarLevantamentos(filtros);
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
  }, [tipo]);

  useEffect(() => {
    void carregar();
    return () => { requisicao.current += 1; };
  }, [carregar]);

  return (
    <section className="com-levantamentos-entrada" aria-live="polite">
      <div className="com-levantamentos-cabecalho">
        <div>
          <strong>{tipo === 'proposta' ? 'Propostas em andamento' : 'Custos em andamento'}</strong>
          <span>Os rascunhos são salvos automaticamente. Escolha um para continuar.</span>
        </div>
        <button type="button" className="com-btn com-btn-fantasma"
          disabled={carregando} onClick={() => void carregar()}>
          Atualizar
        </button>
      </div>
      {erro && <p className="com-recado" role="alert">{erro}</p>}
      {!carregando && !erro && items.length === 0 && <p>Nenhum rascunho em andamento.</p>}
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
              <b>Continuar</b>
            </button>
          ))}
        </div>
      )}
      {carregando && <p>Carregando rascunhos...</p>}
      {items.length < total && (
        <button type="button" className="com-btn com-btn-fantasma"
          disabled={carregando} onClick={() => void carregar(pagina + 1)}>
          Carregar mais
        </button>
      )}
    </section>
  );
}
