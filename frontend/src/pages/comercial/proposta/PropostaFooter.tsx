/** Mesmas ações e estados no topo e no rodapé da proposta. */
export function PropostaFooter({
  primeiraEtapa,
  aviso,
  rotulo,
  ocupado,
  posicao = 'rodape',
  onCancelar,
  onVoltar,
  onAvancar
}: {
  primeiraEtapa: boolean;
  aviso: string;
  rotulo: string;
  ocupado: boolean;
  posicao?: 'topo' | 'rodape';
  onCancelar: () => void;
  onVoltar: () => void;
  onAvancar: () => void;
}) {
  const Container = posicao === 'topo' ? 'div' : 'footer';
  return (
    <Container className={`com-rodape${posicao === 'topo' ? ' com-acoes-topo' : ''}`}
      role="group" aria-label={`Ações da proposta no ${posicao === 'topo' ? 'topo' : 'rodapé'}`}>
      <div className="com-rodape-acoes">
        <button type="button" className="com-btn com-btn-fantasma" onClick={onCancelar}>
          Cancelar e voltar
        </button>
        {!primeiraEtapa && <button type="button" className="com-btn com-btn-fantasma" onClick={onVoltar}>
          ← Voltar
        </button>}
      </div>

      <span className="com-faltando">{aviso}</span>

      <div className="com-rodape-acoes">
      <button
        type="button"
        className="com-btn com-btn-primario"
        disabled={ocupado}
        onClick={onAvancar}
      >
        {rotulo}
      </button>
      </div>
    </Container>
  );
}
