import type { DocumentoEmitido, PropostaSalva } from '../../../api/comercial';
import { RegerarDocumentosButton } from '../proposta/RegerarDocumentosButton';

type HistoricoTabelaProps = {
  propostas: PropostaSalva[];
  podeVerValores: boolean;
  onBaixarDocumento?: (documento: DocumentoEmitido) => void;
  baixandoDocumentoId?: string;
  onAbrirProposta?: (proposta: PropostaSalva) => void;
  onCriarRevisao?: (proposta: PropostaSalva) => void;
  onDocumentosRegenerados?: (proposalId: string, documents: DocumentoEmitido[]) => void;
  rascunhosOnly?: boolean;
};

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const percentual = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1
});

const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short'
});

function rotuloDaProposta(
  proposta: Pick<PropostaSalva, 'proposalCode' | 'revisionNumber'>
) {
  return proposta.revisionNumber > 0
    ? `${proposta.proposalCode} Rev ${proposta.revisionNumber}`
    : proposta.proposalCode;
}

function formatarDinheiro(valor: string | number | null | undefined) {
  return dinheiro.format(Number(valor) || 0);
}

function formatarMargem(valor: string | number | null | undefined) {
  return percentual.format((Number(valor) || 0) / 100);
}

function formatarData(valor: string | null | undefined) {
  return valor ? data.format(new Date(valor)) : '—';
}

function formatarDataHora(valor: string | null | undefined) {
  return valor ? dataHora.format(new Date(valor)) : '—';
}

function classeDaIntegracao(status: PropostaSalva['nectarStatus'] | PropostaSalva['prismaDeliveryStatus']) {
  if (status === 'SUCESSO') return 'is-ok';
  if (status === 'ERRO') return 'is-fail';
  return 'is-pending';
}

function Documento({
  kind,
  documentos,
  onBaixarDocumento,
  baixandoDocumentoId
}: {
  kind: DocumentoEmitido['kind'];
  documentos: DocumentoEmitido[];
  onBaixarDocumento: (documento: DocumentoEmitido) => void;
  baixandoDocumentoId?: string;
}) {
  const documento = documentos.find((item) => item.kind === kind &&
    (!item.format || item.format === 'PDF'));
  const comercial = kind === 'COMERCIAL';

  return (
    <div className="com-history-documento">
      <span>{comercial ? 'Comercial' : 'Técnica'}</span>
      <small title={documento?.fileName}>{documento?.fileName || '—'}</small>
      {documento && (
        <button
          type="button"
          className="com-history-pdf-link"
          disabled={baixandoDocumentoId === documento.id}
          onClick={() => onBaixarDocumento(documento)}
        >
          {baixandoDocumentoId === documento.id
            ? 'Baixando...'
            : comercial
              ? 'Baixar comercial'
              : 'Baixar técnica'}
        </button>
      )}
    </div>
  );
}

export function HistoricoTabela({
  propostas,
  podeVerValores,
  onBaixarDocumento,
  baixandoDocumentoId,
  onAbrirProposta,
  onCriarRevisao,
  onDocumentosRegenerados,
  rascunhosOnly = false
}: HistoricoTabelaProps) {
  const mostraAcoes = Boolean(onAbrirProposta || onCriarRevisao);
  return (
    <div className="com-history-table-wrap">
      <table className="com-history-table">
        <thead>
          <tr>
            <th>Proposta</th>
            <th>Cliente / serviço</th>
            <th>Documentos</th>
            <th>Responsáveis</th>
            <th>Contato</th>
            {podeVerValores && <th>Valor</th>}
            {!rascunhosOnly && <th>Integrações / funil</th>}
            <th>Atualização</th>
            {mostraAcoes && (
              <th>
                <span className="com-sr">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {propostas.map((proposta) => {
            const documentos = proposta.documents || [];
            return (
              <tr key={proposta.id}>
                <td>
                  <strong>{rotuloDaProposta(proposta)}</strong>
                  <small>
                    {formatarData(proposta.finalizedAt || proposta.createdAt)}
                  </small>
                  <small>{proposta.status}</small>
                  {proposta.crmReleaseId && <small>Prisma: {{ PENDENTE: 'Aguardando decisão', APPROVED: 'Aceita', REJECTED: 'Recusada', CANCELLED: 'Cancelada' }[proposta.crmApprovalStatus || 'PENDENTE']}</small>}
                </td>
                <td>
                  <strong>{proposta.clientName || '—'}</strong>
                  <small>{proposta.title || '—'}</small>
                  <small>{proposta.site || '—'}</small>
                </td>
                <td>
                  {podeVerValores && onBaixarDocumento && (
                    <Documento
                      kind="COMERCIAL"
                      documentos={documentos}
                      onBaixarDocumento={onBaixarDocumento}
                      baixandoDocumentoId={baixandoDocumentoId}
                    />
                  )}
                  {onBaixarDocumento && <Documento
                    kind="TECNICA"
                    documentos={documentos}
                    onBaixarDocumento={onBaixarDocumento}
                    baixandoDocumentoId={baixandoDocumentoId}
                  />}
                  {podeVerValores && onDocumentosRegenerados && documentos.length === 4
                    && !proposta.archivedAt && proposta.status !== 'FINALIZANDO' && (
                    <RegerarDocumentosButton proposalId={proposta.id}
                      onRegenerated={documents => onDocumentosRegenerados(proposta.id, documents)} />
                  )}
                </td>
                <td>
                  <span>Vendedor</span>
                  <small>{proposta.sellerName || '—'}</small>
                  <span>Orçamentista</span>
                  <small>{proposta.estimatorName || '—'}</small>
                </td>
                <td>
                  <span>{proposta.contact || '—'}</span>
                  <small>{proposta.email || '—'}</small>
                </td>
                {podeVerValores && (
                  <td>
                    <strong>{formatarDinheiro(proposta.totalValue)}</strong>
                    {proposta.costEstimateId && (
                      <small className="com-history-cost">
                        Custo: {formatarDinheiro(proposta.totalCost)} · Margem:{' '}
                        {formatarMargem(proposta.marginPercent)}
                      </small>
                    )}
                  </td>
                )}
                {!rascunhosOnly && <td>
                  <div className="com-history-status">
                    {proposta.crmReleaseId && <span className={classeDaIntegracao(proposta.prismaDeliveryStatus)}>Prisma · {proposta.prismaDeliveryStatus === 'SUCESSO' ? 'recebida' : proposta.prismaDeliveryStatus === 'ERRO' ? 'falha no envio' : proposta.prismaDeliveryStatus === 'ENVIANDO' ? 'enviando PDFs' : 'envio pendente'}</span>}
                    <span className={classeDaIntegracao(proposta.nectarStatus)}>
                      Nectar
                    </span>
                    <span
                      className={classeDaIntegracao(proposta.sharepointStatus)}
                    >
                      SharePoint
                    </span>
                    {proposta.costEstimateId && (
                      <span className="is-ok">Custos</span>
                    )}
                  </div>
                  <small>
                    Funil: {proposta.nectarPipelineName || '—'}
                    {proposta.nectarPipelineId
                      ? ` (${proposta.nectarPipelineId})`
                      : ''}
                  </small>
                  {proposta.sharepointFolder && (
                    <small title={proposta.sharepointFolder}>
                      {proposta.sharepointFolder}
                    </small>
                  )}
                  {proposta.integrationError && (
                    <small className="com-history-error">
                      {proposta.integrationError}
                    </small>
                  )}
                </td>}
                <td>
                  <span>{formatarDataHora(proposta.updatedAt)}</span>
                  {!rascunhosOnly && proposta.nectarOpportunityId && (
                    <small>Oportunidade {proposta.nectarOpportunityId}</small>
                  )}
                </td>
                {mostraAcoes && (
                  <td>
                    {proposta.status === 'FINALIZADA' && onCriarRevisao ? (
                      <button
                        type="button"
                        className="com-btn com-btn-fantasma"
                        onClick={() => onCriarRevisao(proposta)}
                      >
                        Criar revisão
                      </button>
                    ) : proposta.status === 'FINALIZANDO' ? (
                      <button
                        type="button"
                        className="com-btn com-btn-fantasma"
                        disabled
                      >
                        Finalização em andamento
                      </button>
                    ) : onAbrirProposta && (!rascunhosOnly || proposta.status === 'RASCUNHO') ? (
                      <button
                        type="button"
                        className="com-btn com-btn-fantasma"
                        onClick={() => onAbrirProposta(proposta)}
                      >
                        {proposta.status === 'FALHA_INTEGRACAO'
                          ? 'Tentar integrações novamente'
                          : 'Continuar proposta'}
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
