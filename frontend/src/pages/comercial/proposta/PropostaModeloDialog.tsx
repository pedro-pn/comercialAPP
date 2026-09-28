import { MODELOS_PROPOSTA, type ModeloProposta } from '../../../../../shared/comercial/dist/modelo-documento.js';
import { BotaoFecharDialogo } from '../components/FecharDialogo';
import { LOGO_URL } from '../components/marca';

/** O modelo é escolhido depois do modo; revisão com snapshot já pula este passo. */
export function PropostaModeloDialog({
  revisao,
  onEscolher,
  onFechar
}: {
  revisao: boolean;
  onEscolher: (modelo: ModeloProposta) => void;
  /** Fechar sem escolher volta ao menu do módulo. */
  onFechar: () => void;
}) {
  return (
    <div
      className="com-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="com-modelo-titulo"
    >
      <section className="com-painel com-modo-card">
        <BotaoFecharDialogo fechar={onFechar} />
        <img className="com-modo-logo" src={LOGO_URL} alt="Filtrovali" />
        <span className="com-eyebrow">
          {revisao ? 'REVISÃO DE PROPOSTA' : 'NOVA PROPOSTA'}
        </span>
        <h1 id="com-modelo-titulo">Qual modelo de documento?</h1>
        <p>
          O modelo define a matriz de responsabilidade, a jornada e as tabelas de preço
          que o documento vai trazer.
        </p>

        <div className="com-modo-opcoes">
          {MODELOS_PROPOSTA.map(opcao => (
            <button key={opcao.id} type="button" onClick={() => onEscolher(opcao.id)}>
              <b aria-hidden="true">{opcao.id === 'padrao' ? '📄' : '💧'}</b>
              <strong>{opcao.titulo}</strong>
              <span>{opcao.descricao}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
