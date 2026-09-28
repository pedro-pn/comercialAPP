import {
  DEFAULT_COMMERCIAL_PERCENT,
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_OVERHEAD_PERCENT,
  DEFAULT_TAX_PERCENT,
  FILTROVALI_PRICING_MODEL
} from '../../../../../../shared/comercial/dist/cost-model.js';
import { Field, NumberField } from '../../components/Field';
import { number } from '../formato';
import type { Levantamento } from '../useLevantamento';

/**
 * Seção 1 — Premissas do levantamento.
 *
 * Cobre `CUSTO-CTL-028..038` (11 controles). Porte de `PremisesSection`
 * (`app/custos/page.tsx:611-635`).
 *
 * Dois pontos que não são óbvios lendo só a tela:
 *
 * 1. **Os rótulos mudam com o modelo de precificação.** No modelo Filtrovali
 *    é "Overhead s/ líquida (%)"; no legado é "Overhead (%)". São textos
 *    diferentes para o mesmo campo, e o inventário registra os dois.
 *
 * 2. **"Comercial s/ líquida" só existe no modelo Filtrovali.** No legado o
 *    campo não é escondido — ele não é renderizado.
 *
 * Quatro campos vêm desabilitados: HH mensal, dias úteis, jornada padrão e o
 * orçamentista. São bases do LEC v1.2 e do login, não escolhas do usuário.
 */

export function PremissasSection({ levantamento }: { levantamento: Levantamento }) {
  const { draft, assumptions, patchDraft, patchAssumptions, erroDe } = levantamento;
  const modeloFiltrovali = assumptions.pricingModel === FILTROVALI_PRICING_MODEL;

  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Premissas do levantamento</h2>
          <p>
            Defina o nome do serviço e as bases financeiras. Os percentuais permanecem
            editáveis para cada proposta.
          </p>
        </div>
        <span className="com-obrigatorios">Campos com * são obrigatórios</span>
      </div>

      <div className="com-form-grid">
        <div className="com-form-wide">
          <Field
            label="Nome do levantamento"
            required
            value={String(draft.title || '')}
            placeholder="Ex.: Limpeza química e flushing das linhas"
            error={erroDe('title')}
            onChange={value => patchDraft({ title: value })}
          />
        </div>

        <Field
          label="Orçamentista responsável"
          required
          value={String(draft.estimatorName || '')}
          readOnly
          onChange={() => {}}
        />

        <NumberField
          label="HH mensal LEC"
          value={assumptions.monthlyHours}
          min={1}
          disabled
          onChange={value => patchAssumptions({ monthlyHours: value })}
        />

        <NumberField
          label="Dias úteis / mês"
          value={assumptions.workdaysPerMonth}
          min={1}
          disabled
          onChange={value => patchAssumptions({ workdaysPerMonth: value })}
        />

        <NumberField
          label="Jornada padrão"
          value={assumptions.defaultHoursPerDay}
          min={1}
          step={0.5}
          disabled
          onChange={value => patchAssumptions({ defaultHoursPerDay: value })}
        />

        <NumberField
          label={modeloFiltrovali ? 'Overhead s/ líquida (%)' : 'Overhead (%)'}
          value={assumptions.overheadPercent}
          min={0}
          step={0.01}
          error={erroDe('assumptions.overheadPercent')}
          onChange={value => patchAssumptions({ overheadPercent: value })}
        />

        <NumberField
          label={modeloFiltrovali ? 'Imposto s/ bruta (%)' : 'Impostos LEC (%)'}
          value={assumptions.taxPercent}
          min={0}
          max={99}
          step={0.01}
          error={erroDe('assumptions.taxPercent')}
          onChange={value => patchAssumptions({ taxPercent: value })}
        />

        <NumberField
          label={modeloFiltrovali ? 'Comissão s/ líquida (%)' : 'Comissão LEC (%)'}
          value={assumptions.commissionPercent}
          min={0}
          max={99}
          step={0.01}
          error={erroDe('assumptions.commissionPercent')}
          onChange={value => patchAssumptions({ commissionPercent: value })}
        />

        {/* Só existe no modelo Filtrovali — no legado o campo NÃO é renderizado. */}
        {modeloFiltrovali && (
          <NumberField
            label="Comercial s/ líquida (%)"
            value={assumptions.commercialPercent}
            min={0}
            max={99}
            step={0.01}
            error={erroDe('assumptions.commercialPercent')}
            onChange={value => patchAssumptions({ commercialPercent: value })}
          />
        )}

        <NumberField
          label={modeloFiltrovali ? 'Margem s/ bruta (%)' : 'Margem desejada (%)'}
          value={assumptions.desiredMarginPercent}
          min={0}
          max={99}
          step={0.01}
          error={erroDe('assumptions.desiredMarginPercent')}
          onChange={value => patchAssumptions({ desiredMarginPercent: value })}
        />
      </div>

      <small className="com-nota">
        Mão de obra calculada exclusivamente pelo LEC v1.2: cargos oficiais, composição por
        Sede / Viagem / Offshore, 193,6 horas mensais, HE 70% e adicional noturno de 35%. A
        HE 100% usa a mesma base extraordinária do LEC com multiplicador 2,0.
      </small>

      <small className="com-nota">
        {modeloFiltrovali
          ? `Base Filtrovali: ${number(DEFAULT_TAX_PERCENT)}% de imposto sobre a receita bruta; ${number(DEFAULT_COMMISSION_PERCENT)}% de comissão, ${number(DEFAULT_OVERHEAD_PERCENT)}% de overhead e ${number(DEFAULT_COMMERCIAL_PERCENT)}% comercial sobre a receita líquida. A margem permanece editável.`
          : 'Este levantamento preserva a base histórica LEC. A atualização para a base Filtrovali está disponível no resumo.'}
      </small>
    </section>
  );
}
