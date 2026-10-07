import type { LegacyImportInfo } from '../../../../../shared/comercial/dist/cost-model.js';

export function LegacyImportNotice({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null;
  const info = value as LegacyImportInfo;
  if (!info.fileName) return null;
  return (
    <section className="com-recado com-lec-origem" role="status">
      <strong>Dados importados do LEC · revisão de origem {info.sourceRevisionNumber}</strong>
      <p>{info.fileName}{info.pdfFileName ? ` · ${info.pdfFileName}` : ''}</p>
      <p>Revise cada etapa e ajuste os campos antes de concluir. O preço foi importado como valor global;
        a formação de preço pode ser alterada em Resumo e QQP.</p>
      <details>
        <summary>Conferências identificadas na importação</summary>
        <ul>{(info.warnings || []).map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        <p>Orçamentista de origem: {info.sourceEstimator || 'não informado'} · Consultor de origem: {info.sourceSeller || 'não informado'}</p>
      </details>
    </section>
  );
}
