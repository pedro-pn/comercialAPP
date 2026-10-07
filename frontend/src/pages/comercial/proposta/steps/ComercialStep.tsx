import { Area, Field } from '../../components/Field';
import { AvisoPendencia } from '../../custos/ConfirmacaoEscopo';
import {
  tabelasDePrecoDoModelo,
  TITULO_PRECOS_INFORMATIVOS,
  NOTA_PRECOS_INFORMATIVOS,
  type LocalOperacao,
  type ModeloProposta,
  totalStandbyEquipe
} from '../../../../../../shared/comercial/dist/modelo-documento.js';
// O MESMO leitor de moeda do servidor e do gerador do documento. Um leitor
// próprio aqui mostraria ao vendedor um total que o CRM não confirma.
import { lerDinheiro, moeda, somarDinheiro } from '../../../../../../shared/comercial/dist/dinheiro.js';
import { itensInformativosDaProposta } from '../../../../../../shared/comercial/dist/proposal-validation.js';
import {
  CAMPOS_STANDBY,
  formatarDinheiro,
  itemDePrecoCompleto,
  quantidadeDoItemDePreco,
  recalcularItemDePreco,
  type ItemDePreco
} from '../etapas';

/**
 * Etapa 6 — Conteúdo da proposta comercial (`PROP-CTL-058..071`).
 *
 * Porte de `app/page.tsx:1044-1071`.
 *
 * **"Incluir valor unitário" muda o documento, não só a tela.** Marcado, a tabela do
 * PDF ganha as colunas de preço unitário e quantidade; desmarcado, o cliente vê só o
 * total. É decisão comercial — há proposta em que abrir o unitário convida a
 * negociação linha a linha.
 *
 * Os valores são guardados como texto monetário para preservar a máscara usada no
 * documento. O total de cada linha, porém, é sempre recalculado a partir de quantidade
 * × valor unitário para que a tela, o PDF e o CRM tenham o mesmo número.
 */

type AnyRecord = Record<string, unknown>;

/**
 * O cenário pré-selecionado.
 *
 * ONSHORE porque é o mais comum, apurado pelo mantenedor em 12/08. Pré-selecionar
 * não é decidir pelo vendedor: as duas somas ficam à vista lado a lado, e é
 * justamente ver os dois números que faz notar quando o caso é o outro.
 */
const PADRAO_DE_CENARIO: LocalOperacao = 'ONSHORE';

type Props = {
  form: AnyRecord;
  editar: (patch: AnyRecord) => void;
  precos: ItemDePreco[];
  onPrecos: (atualizar: (atual: ItemDePreco[]) => ItemDePreco[]) => void;
  incluirUnitario: boolean;
  onIncluirUnitario: (valor: boolean) => void;
  erroDe: (campo: string) => string | undefined;
  mostrarErros: boolean;
  modelo: ModeloProposta;
};

export function ComercialStep({
  form,
  editar,
  precos,
  onPrecos,
  incluirUnitario,
  onIncluirUnitario,
  erroDe,
  mostrarErros,
  modelo
}: Props) {
  // Hidrojateamento apresenta DUAS tabelas, ONSHORE e OFFSHORE, cada uma com o
  // seu TOTAL GERAL (T071f). O modelo padrão tem uma só, e aí `local` é
  // indefinido em todos os itens.
  const locais = tabelasDePrecoDoModelo(modelo);
  const cenarioInformado = String(form.priceScenario ?? '').trim().toUpperCase();
  const cenarioEscolhido =
    locais?.find(local => local === cenarioInformado) ?? PADRAO_DE_CENARIO;
  const completos = precos.filter(itemDePrecoCompleto).length;
  const informativos = itensInformativosDaProposta(form);
  const incluirInformativos = form.includeInformationalPrices === true;

  function atualizarInformativos(atualizar: (atual: ItemDePreco[]) => ItemDePreco[]) {
    editar({ informationalPrices: atualizar(informativos) });
  }

  function editarInformativo(indice: number, campo: keyof ItemDePreco, valor: string) {
    atualizarInformativos(atual => atual.map((item, i) => i === indice
      ? recalcularItemDePreco({ ...item, [campo]: valor }) : item));
  }

  function editarPreco(indice: number, campo: keyof ItemDePreco, valor: string) {
    onPrecos(atual =>
      atual.map((item, i) => {
        if (i !== indice) return item;
        const editado = { ...item, [campo]: valor };
        return campo === 'quantity' || campo === 'unitValue'
          ? recalcularItemDePreco(editado)
          : editado;
      })
    );
  }

  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Conteúdo da proposta comercial</h2>
          <p>Cadastre preços, condições, impostos e observações comerciais.</p>
        </div>
      </div>

      <label className="com-incluir com-incluir-bloco">
        <input
          type="checkbox"
          checked={incluirUnitario}
          onChange={evento => onIncluirUnitario(evento.target.checked)}
        />
        <span>
          <strong>Incluir valor unitário</strong>
          <small>
            Exibe preço unitário, quantidade e total conforme o modelo oficial.
          </small>
        </span>
      </label>

      {mostrarErros && completos === 0 && (
        <AvisoPendencia>
          Informe ao menos um item de preço com descrição, quantidade e valor unitário.
        </AvisoPendencia>
      )}

      {(locais ?? [undefined]).map(local => (
        <TabelaDePrecos
          key={local ?? 'unica'}
          local={local}
          precos={precos}
          onPrecos={onPrecos}
          mostrarErros={mostrarErros}
          editarPreco={editarPreco}
        />
      ))}

      {locais && locais.length > 1 && (
        <CenarioContratado
          locais={locais}
          precos={precos}
          escolhido={cenarioEscolhido}
          onEscolher={valor => editar({ priceScenario: valor })}
        />
      )}

      <fieldset className="com-fieldset">
        <legend>{TITULO_PRECOS_INFORMATIVOS} (opcional)</legend>
        <label className="com-incluir com-incluir-bloco">
          <input
            type="checkbox"
            checked={incluirInformativos}
            onChange={evento => editar({
              includeInformationalPrices: evento.target.checked,
              ...(evento.target.checked && !informativos.length ? {
                informationalPrices: [{ description: '', unit: 'VB', quantity: '1', unitValue: '', value: '' }]
              } : {})
            })}
          />
          <span>
            <strong>Incluir tabela de equipamentos e outras despesas</strong>
            <small>{NOTA_PRECOS_INFORMATIVOS}</small>
          </span>
        </label>
        {incluirInformativos && <>
          {erroDe('informationalPrices') && <AvisoPendencia>{erroDe('informationalPrices')}</AvisoPendencia>}
          <TabelaDePrecos
            precos={informativos}
            onPrecos={atualizarInformativos}
            mostrarErros={mostrarErros}
            editarPreco={editarInformativo}
            informativa
          />
        </>}
      </fieldset>


      {/* Item 9 do documento intercala prosa e tabela: a frase da hora extra, o
          título do bloco, a TABELA, a explicação de cada linha e só então as
          observações gerais. Estes quatro são os MERGEFIELDs `valor_he`,
          `valor_standby`, `diaria_equipamento` e `valor_desmob_extra`, que não
          existiam em campo nenhum — T071d. */}
      <fieldset className="com-fieldset">
        <legend>Stand-by e mobilização adicional</legend>
        <p className="com-fieldset-nota">
          Saem na tabela do item 9 da proposta comercial.
        </p>
        <div className="com-form-grid">
          {CAMPOS_STANDBY.map(({ campo, label }) => (
            <Field
              key={campo}
              label={label}
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={String(form[campo] ?? '')}
              required
              error={erroDe(campo)}
              onChange={valor => editar({ [campo]: formatarDinheiro(valor) })}
            />
          ))}
          <Field
            label="Quantidade de colaboradores para stand-by"
            type="number"
            inputMode="numeric"
            required
            value={String(form.standbyTeamQuantity ?? '1')}
            error={erroDe('standbyTeamQuantity')}
            onChange={valor => editar({ standbyTeamQuantity: valor })}
          />
        </div>
        <p className="com-fieldset-nota">
          Diária total da equipe: {moeda(totalStandbyEquipe(
            lerDinheiro(form.standbyTeam),
            form.standbyTeamQuantity ?? 1
          ))}
        </p>
      </fieldset>

      <div className="com-form-grid">
        <Area
          label="Condições de pagamento"
          required
          value={String(form.payment ?? '')}
          error={erroDe('payment')}
          onChange={valor => editar({ payment: valor })}
        />
        <Area
          label="Observações comerciais"
          value={String(form.observations ?? '')}
          onChange={valor => editar({ observations: valor })}
        />
      </div>

      <Area
        label="Impostos"
        required
        value={String(form.taxes ?? '')}
        error={erroDe('taxes')}
        onChange={valor => editar({ taxes: valor })}
      />

      <Field
        label="Validade das propostas (dias)"
        required
        type="number"
        inputMode="numeric"
        value={String(form.validity ?? '')}
        error={erroDe('validity')}
        onChange={valor => editar({ validity: valor })}
      />
    </section>
  );
}

/**
 * Uma tabela de preços.
 *
 * No modelo padrão há uma; no de hidrojateamento há duas, ONSHORE e OFFSHORE,
 * cada uma com o **seu** TOTAL GERAL (T071f). Somar as duas juntas apresentaria
 * ao cliente um total que ele não vai pagar: são cenários alternativos de
 * execução, não parcelas do mesmo serviço.
 *
 * O índice usado na edição é o do array COMPLETO, não o da fatia. Editar pelo
 * índice da fatia trocaria o item errado assim que a primeira tabela tivesse
 * mais de uma linha — e o erro seria silencioso.
 */
/**
 * Qual das duas tabelas o cliente vai contratar (T130).
 *
 * ONSHORE e OFFSHORE são cenários **alternativos**: o cliente contrata um ou o
 * outro. O documento leva as duas — é proposta, o cliente escolhe —, mas o
 * `totalValue` que vai ao CRM e ao histórico é de um só.
 *
 * Até aqui o servidor decidia pela **maior** das duas. Não era regra de negócio;
 * era um chute com cara de regra, e o número ia para fora sem ninguém conferir.
 *
 * As duas somas aparecem lado a lado de propósito: escolher entre "ONSHORE" e
 * "OFFSHORE" sem ver os valores é escolher no escuro, e é vendo os dois números
 * que se percebe quando o caso é o menos comum.
 */
function CenarioContratado({
  locais,
  precos,
  escolhido,
  onEscolher
}: {
  locais: readonly LocalOperacao[];
  precos: ItemDePreco[];
  escolhido: string;
  onEscolher: (valor: LocalOperacao) => void;
}) {
  return (
    <fieldset className="com-fieldset">
      <legend>Cenário contratado</legend>
      <p className="com-fieldset-nota">
        As duas tabelas vão no documento. Este é o valor que será registrado no CRM e no
        histórico — o cliente contrata um cenário, não os dois.
      </p>
      <div className="com-cenario-opcoes">
        {locais.map(local => (
          <label
            key={local}
            className={
              escolhido === local ? 'com-cenario-opcao com-cenario-ativo' : 'com-cenario-opcao'
            }
          >
            <input
              type="radio"
              name="cenario-contratado"
              value={local}
              checked={escolhido === local}
              onChange={() => onEscolher(local)}
            />
            <strong>{local}</strong>
            <span>{moeda(somarDinheiro(precos.filter(p => p.local === local).map(p => p.value)))}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TabelaDePrecos({
  local,
  precos,
  onPrecos,
  mostrarErros,
  editarPreco,
  informativa = false
}: {
  local?: LocalOperacao;
  precos: ItemDePreco[];
  onPrecos: (atualizar: (atual: ItemDePreco[]) => ItemDePreco[]) => void;
  mostrarErros: boolean;
  editarPreco: (indice: number, campo: keyof ItemDePreco, valor: string) => void;
  informativa?: boolean;
}) {
  const daTabela = precos
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => (local ? item.local === local : true));

  return (
    <div className="com-tabela-precos">
      <div className="com-secao-titulo">
        {local ? <h3>{local}</h3> : <span />}
        <button
          type="button"
          className="com-btn-add"
          onClick={() =>
            onPrecos(atual => [
              ...atual,
              {
                description: '',
                unit: 'VB',
                quantity: '1',
                unitValue: '',
                value: '',
                ...(local ? { local } : {})
              }
            ])
          }
        >
          {informativa ? '+ Adicionar equipamento ou despesa' : '+ Adicionar item de preço'}
        </button>
      </div>

      {daTabela.length > 0 ? (
        <div className="com-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">
                  Descrição<span className="survey-required-marker">*</span>
                </th>
                <th scope="col">
                  Qtd.<span className="survey-required-marker">*</span>
                </th>
                <th scope="col">
                  Valor unitário<span className="survey-required-marker">*</span>
                </th>
                <th scope="col">Valor total</th>
                <th scope="col">
                  <span className="com-sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {daTabela.map(({ item, indice }, ordem) => {
                const incompleto = mostrarErros && !itemDePrecoCompleto(item);
                const rotulo = `${informativa ? 'informativo ' : ''}${ordem + 1}${local ? ` de ${local}` : ''}`;
                const descricaoInvalida = incompleto && !item.description.trim();
                const quantidadeInvalida = incompleto && quantidadeDoItemDePreco(item.quantity) <= 0;
                const unitarioInvalido = incompleto && !item.unitValue.trim();

                return (
                  <tr key={indice}>
                    <td>
                      <input
                        aria-label={`Descrição do item ${rotulo}`}
                        aria-invalid={descricaoInvalida || undefined}
                        className={
                          descricaoInvalida
                            ? 'com-campo-invalido'
                            : undefined
                        }
                        value={item.description}
                        onChange={e => editarPreco(indice, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Quantidade do item ${rotulo}`}
                        aria-invalid={quantidadeInvalida || undefined}
                        className={
                          quantidadeInvalida
                            ? 'com-campo-invalido'
                            : undefined
                        }
                        value={item.quantity}
                        onChange={e => editarPreco(indice, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="numeric"
                        aria-label={`Valor unitário do item ${rotulo}`}
                        aria-invalid={unitarioInvalido || undefined}
                        placeholder="R$ 0,00"
                        className={
                          unitarioInvalido
                            ? 'com-campo-invalido'
                            : undefined
                        }
                        value={item.unitValue}
                        onChange={e =>
                          editarPreco(indice, 'unitValue', formatarDinheiro(e.target.value))
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Valor total do item ${rotulo}`}
                        placeholder="R$ 0,00"
                        value={item.value}
                        readOnly
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="com-remover"
                        aria-label={`Remover item ${rotulo}`}
                        onClick={() => onPrecos(atual => atual.filter((_, i) => i !== indice))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="com-vazio" aria-invalid={informativa && mostrarErros || undefined}>
          {informativa ? 'Nenhum equipamento ou despesa cadastrado.' : 'Nenhum item de preço cadastrado.'}
        </div>
      )}
    </div>
  );
}
