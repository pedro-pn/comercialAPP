import { MoneyInput } from '../../components/Field';
import { LEC_FILTER_CATALOG } from '../../../../../../shared/comercial/dist/cost-model.js';
import { money, numberValue } from '../formato';
import type { Levantamento } from '../useLevantamento';

/**
 * Filtros — bloco da seção Materiais e insumos.
 *
 * Porte de `draft.filters` (`app/custos/page.tsx:1234-...`).
 *
 * O catálogo LEC traz os filtros conhecidos com micragem e preço. O item
 * personalizado existe para o que o catálogo não tem — e é por isso que ele
 * nasce **desmarcado**: acrescentar um filtro em branco que já entra no custo
 * somaria zero e daria a impressão de estar considerado.
 */

type AnyRecord = Record<string, unknown>;

function registros(valor: unknown): AnyRecord[] {
  return Array.isArray(valor) ? (valor as AnyRecord[]) : [];
}

function novoFiltro(): AnyRecord {
  return {
    id: `filtro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filterName: 'Filtro personalizado',
    micronRating: '',
    unit: 'un.',
    quantity: 0,
    unitCost: 0,
    // Nasce fora do custo, como na referência.
    included: false
  };
}

export function FiltrosTabela({ levantamento }: { levantamento: Levantamento }) {
  const { draft, result, setDraft, updateCollection, removeCollection } = levantamento;
  const filtros = registros(draft.filters);
  const calculados = registros(result.filterResults);
  const catalogo = registros(LEC_FILTER_CATALOG);

  function acrescentar() {
    setDraft(atual => ({
      ...atual,
      filters: [...registros(atual.filters), novoFiltro()],
      scopeConfirmations: {
        ...((atual.scopeConfirmations as AnyRecord) || {}),
        noInputs: false
      }
    }));
  }

  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Filtros</h2>
          <p>
            Catálogo LEC com micragem e preço de referência. Marque os que entram e ajuste a
            quantidade.
          </p>
        </div>
        <button type="button" className="com-btn-add" onClick={acrescentar}>
          + Adicionar filtro
        </button>
      </div>

      {filtros.length > 0 ? (
        <div className="com-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Filtro</th>
                <th scope="col">Micragem</th>
                <th scope="col">Unidade</th>
                <th scope="col">Quantidade</th>
                <th scope="col">Custo unitário</th>
                <th scope="col">Incluir</th>
                <th scope="col">Subtotal</th>
                <th scope="col">
                  <span className="com-sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtros.map(item => {
                const id = String(item.id);
                const calculado = calculados.find(c => c.id === id) || {};
                const editar = (patch: AnyRecord) => updateCollection('filters', id, patch);

                return (
                  <tr key={id}>
                    <td>
                      <input
                        aria-label="Nome do filtro"
                        value={String(item.filterName || '')}
                        list="com-catalogo-filtros"
                        onChange={event => {
                          const nome = event.target.value;
                          const doCatalogoEscolhido = catalogo.find(c => c.filterName === nome);
                          // Escolher do catálogo traz micragem e preço juntos —
                          // mesma razão de repor o salário ao trocar de cargo.
                          editar(
                            doCatalogoEscolhido
                              ? {
                                  filterName: nome,
                                  micronRating: doCatalogoEscolhido.micronRating ?? '',
                                  unitCost: doCatalogoEscolhido.unitCost ?? item.unitCost
                                }
                              : { filterName: nome }
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Micragem"
                        value={String(item.micronRating ?? '')}
                        onChange={event => editar({ micronRating: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Unidade"
                        value={String(item.unit || '')}
                        onChange={event => editar({ unit: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label="Quantidade"
                        value={Number(item.quantity) || ''}
                        min={0}
                        step={1}
                        onChange={event =>
                          editar({
                            quantity: event.target.value === '' ? 0 : Number(event.target.value)
                          })
                        }
                      />
                    </td>
                    <td>
                      <MoneyInput
                        aria-label="Custo unitário"
                        value={(item.unitCost as number) ?? ''}
                        onChange={valor =>
                          editar({
                            unitCost: valor
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Incluir no levantamento"
                        checked={item.included === true}
                        onChange={event => editar({ included: event.target.checked })}
                      />
                    </td>
                    <td className="com-calculado">
                      {item.included !== true ? '—' : money(numberValue(calculado.total))}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="com-remover"
                        aria-label={`Remover ${String(item.filterName || 'filtro')}`}
                        onClick={() => removeCollection('filters', id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Catálogo como sugestão, não como trava: o campo continua livre
              para o filtro que o catálogo não tem. */}
          <datalist id="com-catalogo-filtros">
            {catalogo.map(filtro => (
              <option
                key={`${String(filtro.filterName)}-${String(filtro.micronRating)}`}
                value={String(filtro.filterName)}
              />
            ))}
          </datalist>
        </div>
      ) : (
        <div className="com-vazio">Nenhum filtro no levantamento.</div>
      )}
    </section>
  );
}
