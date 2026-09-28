import type { DocumentoEmitido } from '../../../api/comercial';
import { documentosEscolhidos, type EscolhaDeDownload } from './finalizacao';

export function FinalizacaoPanel({
  documentos,
  escolha,
  baixandoId,
  onBaixar
}: {
  documentos: DocumentoEmitido[];
  escolha: EscolhaDeDownload;
  baixandoId: string;
  onBaixar: (documentos: DocumentoEmitido[]) => void;
}) {
  if (!documentos.length) return null;

  const escolhidos = documentosEscolhidos(documentos, escolha);
  const baixando = Boolean(baixandoId);
  const rotulo =
    escolha === 'both'
      ? 'Baixar técnica + comercial'
      : escolha === 'commercial'
        ? 'Baixar proposta comercial'
        : 'Baixar proposta técnica';

  return (
    <section
      className="com-painel com-finalizacao-painel"
      aria-label="Documentos finalizados"
    >
      <div>
        <strong>Documentos prontos</strong>
        <span>
          Os dois PDFs estão guardados no histórico e continuam disponíveis
          aqui.
        </span>
      </div>

      <button
        type="button"
        className="com-btn com-btn-primario com-download-selecionado"
        disabled={baixando}
        onClick={() => onBaixar(escolhidos)}
      >
        {baixando ? 'Preparando download...' : rotulo}
      </button>

      <div className="com-download-separado">
        {documentos.map((documento) => (
          <button
            type="button"
            className="com-btn com-btn-fantasma"
            key={documento.id}
            disabled={baixando}
            onClick={() => onBaixar([documento])}
          >
            Baixar separadamente a proposta{' '}
            {documento.kind === 'COMERCIAL' ? 'comercial' : 'técnica'}
          </button>
        ))}
      </div>
    </section>
  );
}
