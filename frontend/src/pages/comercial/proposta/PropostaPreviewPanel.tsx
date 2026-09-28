import type { ScopeBlock, ScopeServiceItem } from '../../../../../shared/comercial/dist/scope-content.js';
import type { TechnicalServiceSelection } from '../../../../../shared/comercial/dist/technical-services.js';
import type { ModeloProposta } from '../../../../../shared/comercial/dist/modelo-documento.js';

import { DocumentoPrevia, type TipoDeDocumento } from './DocumentoPrevia';
import { ETAPAS, type ItemDePreco, type LinhaResponsabilidade } from './etapas';

type AnyRecord = Record<string, unknown>;

/** A metade direita da montagem: prévia viva e os dois comandos de saída. */
export function PropostaPreviewPanel({
  indice,
  documento,
  onDocumento,
  form,
  codigo,
  itensEscopo,
  blocos,
  responsabilidades,
  precos,
  incluirUnitario,
  servicosTecnicos,
  complementoRelatorios,
  modelo,
  gerando,
  onGerarPdf
}: {
  indice: number;
  documento: TipoDeDocumento;
  onDocumento: (tipo: TipoDeDocumento) => void;
  form: AnyRecord;
  codigo: string;
  itensEscopo: ScopeServiceItem[];
  blocos: ScopeBlock[];
  responsabilidades: LinhaResponsabilidade[];
  precos: ItemDePreco[];
  incluirUnitario: boolean;
  servicosTecnicos: TechnicalServiceSelection[];
  complementoRelatorios: string;
  modelo: ModeloProposta;
  gerando: boolean;
  onGerarPdf: () => void;
}) {
  return (
    <aside className="com-previa">
      <div className="com-previa-topo">
        <div>
          <strong>Prévia oficial Filtrovali</strong>
          <span>As duas saídas usam o mesmo cadastro</span>
        </div>
        <b>
          {indice + 1}/{ETAPAS.length}
        </b>
      </div>

      <div className="com-previa-abas" role="tablist" aria-label="Documento em prévia">
        <button
          type="button"
          role="tab"
          aria-selected={documento === 'commercial'}
          className={documento === 'commercial' ? 'is-ativa' : undefined}
          onClick={() => onDocumento('commercial')}
        >
          Comercial
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={documento === 'technical'}
          className={documento === 'technical' ? 'is-ativa' : undefined}
          onClick={() => onDocumento('technical')}
        >
          Técnica
        </button>
      </div>

      <div className="com-previa-rolagem">
        <DocumentoPrevia
          tipo={documento}
          form={form}
          codigo={codigo}
          itensEscopo={itensEscopo}
          blocos={blocos}
          responsabilidades={responsabilidades}
          precos={precos}
          incluirUnitario={incluirUnitario}
          servicosTecnicos={servicosTecnicos}
          complementoRelatorios={complementoRelatorios}
          modelo={modelo}
        />
      </div>

      <div className="com-previa-acoes">
        <button
          type="button"
          className="com-previa-imprimir"
          disabled={gerando}
          onClick={onGerarPdf}
        >
          {gerando ? 'Gerando…' : 'Baixar PDF'}
        </button>
        <button
          type="button"
          className="com-previa-imprimir com-previa-imprimir-secundario"
          onClick={() => window.print()}
        >
          Imprimir prévia
        </button>
      </div>
    </aside>
  );
}
