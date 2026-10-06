import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ComercialChrome } from '../components/ComercialChrome';

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

  return <ComercialChrome
    variante="proposta"
    eyebrow="FILTROVALI / PROPOSTA FINALIZADA"
    titulo="Documentos da proposta " tituloComplemento={codigo}
    descricao="Baixe as propostas técnica e comercial e acompanhe o envio dos documentos."
    acoes={<>
      <button type="button" className="com-btn com-btn-fantasma"
        onClick={() => navigate('/historico')}>Voltar ao histórico</button>
      <button type="button" className="com-btn com-btn-primario" disabled={busy}
        onClick={() => void onEditar()}>{busy ? 'Abrindo...' : 'Editar proposta'}</button>
    </>}
  >
    <section className="com-painel" aria-label="Proposta finalizada">
      <h2>Proposta finalizada</h2>
      <p><strong>Cliente:</strong> {cliente}</p>
      <p><strong>Serviço:</strong> {titulo}</p>
      <p>Use Editar proposta para alterar o conteúdo mantendo o número e a revisão. Finalize novamente após as alterações.</p>
      {recado && <p className="com-recado" role="status">{recado}</p>}
    </section>
    {documentos}
  </ComercialChrome>;
}
