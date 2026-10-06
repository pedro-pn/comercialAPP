import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ComercialChrome } from '../components/ComercialChrome';
import { BotaoFecharDialogo } from '../components/FecharDialogo';

export function PropostaDocumentosPage({ codigo, cliente, titulo, recado,
  documentos, busy, onEditar }: {
  codigo: string;
  cliente: string;
  titulo: string;
  recado: string;
  documentos: ReactNode;
  busy: boolean;
  onEditar: () => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const [tentouEditar, setTentouEditar] = useState(false);

  async function confirmarEdicao() {
    setTentouEditar(true);
    if (await onEditar()) setConfirmando(false);
  }

  return <ComercialChrome
    variante="proposta"
    eyebrow="FILTROVALI / PROPOSTA FINALIZADA"
    titulo="Documentos da proposta " tituloComplemento={codigo}
    descricao="Baixe as propostas técnica e comercial e acompanhe o envio dos documentos."
    acoes={<>
      <button type="button" className="com-btn com-btn-fantasma"
        onClick={() => navigate('/historico')}>Voltar ao histórico</button>
      <button type="button" className="com-btn com-btn-primario" disabled={busy}
        onClick={() => { setTentouEditar(false); setConfirmando(true); }}>Editar proposta</button>
    </>}
  >
    <section className="com-painel" aria-label="Proposta finalizada">
      <h2>Proposta finalizada</h2>
      <p><strong>Cliente:</strong> {cliente}</p>
      <p><strong>Serviço:</strong> {titulo}</p>
      <p>A proposta está bloqueada para edição. Para alterar o conteúdo, confirme a criação de uma nova revisão.</p>
      {recado && <p className="com-recado" role="status">{recado}</p>}
    </section>
    {documentos}
    {confirmando && <div className="com-overlay" role="dialog" aria-modal="true"
      aria-labelledby="com-editar-finalizada-titulo" aria-describedby="com-editar-finalizada-descricao">
      <section className="com-painel com-modo-card">
        <BotaoFecharDialogo rotulo="Cancelar edição" fechar={() => !busy && setConfirmando(false)} />
        <h1 id="com-editar-finalizada-titulo">Editar a proposta {codigo}?</h1>
        <p id="com-editar-finalizada-descricao">
          A edição cria uma nova revisão com os dados desta proposta. A versão finalizada e seus documentos permanecem no histórico.
        </p>
        {tentouEditar && recado && <p className="com-recado" role="status">{recado}</p>}
        <div className="com-oferta-acoes">
          <button type="button" className="com-btn com-btn-primario" disabled={busy}
            onClick={() => void confirmarEdicao()}>{busy ? 'Carregando...' : 'Confirmar e criar revisão'}</button>
          <button type="button" className="com-btn com-btn-fantasma" disabled={busy}
            onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      </section>
    </div>}
  </ComercialChrome>;
}
