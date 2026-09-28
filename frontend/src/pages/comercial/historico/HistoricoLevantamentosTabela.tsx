import type { LevantamentoSalvo } from '../../../api/comercial';

type Props = {
  levantamentos: LevantamentoSalvo[];
  onAbrir: (levantamento: LevantamentoSalvo) => void;
};

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const percentual = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1
});

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short'
});

function rotulo(levantamento: LevantamentoSalvo) {
  return levantamento.revisionNumber > 0
    ? `${levantamento.proposalCode} Rev ${levantamento.revisionNumber}`
    : levantamento.proposalCode;
}

function valor(valorRecebido: string | number | null | undefined) {
  return dinheiro.format(Number(valorRecebido) || 0);
}

function margem(valorRecebido: string | number | null | undefined) {
  return percentual.format((Number(valorRecebido) || 0) / 100);
}

export function HistoricoLevantamentosTabela({ levantamentos, onAbrir }: Props) {
  return (
    <div className="com-history-table-wrap">
      <table className="com-history-table com-history-cost-table">
        <thead>
          <tr>
            <th>Levantamento</th>
            <th>Descrição</th>
            <th>Formação do preço</th>
            <th>Atualização</th>
            <th><span className="com-sr">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {levantamentos.map(levantamento => (
            <tr key={levantamento.id}>
              <td>
                <strong>{rotulo(levantamento)}</strong>
                <small>{levantamento.mode === 'REVISAO' ? 'Revisão' : 'Nova proposta'}</small>
              </td>
              <td>
                <strong>{levantamento.title || 'Sem título'}</strong>
                <small>{levantamento.status === 'SALVO' ? 'Salvo' : 'Rascunho'}</small>
              </td>
              <td>
                <span>Preço: {valor(levantamento.salePrice)}</span>
                <small>
                  Custo: {valor(levantamento.totalCost)} · Margem: {margem(levantamento.marginPercent)}
                </small>
              </td>
              <td>{dataHora.format(new Date(levantamento.updatedAt))}</td>
              <td>
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  onClick={() => onAbrir(levantamento)}
                >
                  Abrir levantamento
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
