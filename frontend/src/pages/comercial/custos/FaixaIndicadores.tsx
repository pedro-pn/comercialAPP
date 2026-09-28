import {
  DEFAULT_MARGIN_PERCENT,
  FILTROVALI_PRICING_MODEL
} from '../../../../../shared/comercial/dist/cost-model.js';
import { money, number, people, percent } from './formato';
import type { Levantamento } from './useLevantamento';

/**
 * Faixa "Resumo em tempo real" — os 7 indicadores dentro do hero.
 *
 * Porte de `.cost-header-summary` + `.cost-kpis` (`app/custos/page.tsx:515-530`).
 *
 * É o retorno imediato do que se digita: cada tecla nas seções recalcula e a
 * faixa muda. Por isso ela vive no hero e não numa aba — o orçamentista precisa
 * ver a margem enquanto mexe no dimensionamento, não depois.
 *
 * O editor de margem no meio da faixa não é decoração: é o único campo
 * editável fora das seções, e existe porque ajustar margem é a última coisa
 * que se faz antes de fechar o preço.
 */

const KPI_ATENCAO = 'com-kpi-negativo';
const KPI_OK = 'com-kpi-positivo';

export function FaixaIndicadores({
  levantamento,
  modoLabel
}: {
  levantamento: Levantamento;
  modoLabel: string;
}) {
  const { result, assumptions, patchAssumptions } = levantamento;
  const modeloFiltrovali = assumptions.pricingModel === FILTROVALI_PRICING_MODEL;
  const lucro = Number(result.profitValue) || 0;

  return (
    <div className="com-resumo">
      <div className="com-resumo-titulo">
        <strong>Resumo em tempo real</strong>
        <small>{modoLabel}</small>
      </div>

      <div className="com-kpis">
        <Kpi label="Pico simultâneo" valor={people(Number(result.peakHeadcount) || 0)} />
        <Kpi label="HH total" valor={`${number(Number(result.totalLaborHours) || 0)} HH`} />
        <Kpi
          label="Volume calculado"
          valor={`${number(Number(result.totalVolumeLiters) || 0)} L`}
        />
        <Kpi label="Custo direto" valor={money(Number(result.directCost) || 0)} />

        <label className="com-kpi com-kpi-margem">
          <span>Margem desejada</span>
          <div>
            <input
              type="number"
              value={(assumptions.desiredMarginPercent as number) ?? ''}
              min={0}
              max={99}
              step={0.01}
              aria-label="Margem desejada em porcentagem"
              onChange={event =>
                patchAssumptions({
                  desiredMarginPercent:
                    event.target.value === '' ? 0 : Number(event.target.value)
                })
              }
            />
            <b aria-hidden="true">%</b>
          </div>
          <small>
            {modeloFiltrovali
              ? `Base Filtrovali ${number(DEFAULT_MARGIN_PERCENT)}%`
              : `LEC sugere ${number(Number(result.suggestedMarginPercent) || 0)}%`}
          </small>
        </label>

        <Kpi
          label="Lucro / margem"
          valor={`${money(lucro)} · ${percent(Number(result.margin) || 0)}`}
          /* Lucro negativo pinta de vermelho. É a informação mais importante
             da faixa e a que some num banner de texto. */
          className={lucro >= 0 ? KPI_OK : KPI_ATENCAO}
        />
        <Kpi
          label="Valor da proposta"
          valor={money(Number(result.salePrice) || 0)}
          className="com-kpi-final"
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  valor,
  className = ''
}: {
  label: string;
  valor: string;
  className?: string;
}) {
  return (
    <article className={`com-kpi ${className}`.trim()}>
      <span>{label}</span>
      <strong className="com-quebrar">{valor}</strong>
    </article>
  );
}
