import {
  MAX_TECHNICAL_SERVICE_TEXT,
  TECHNICAL_SERVICE_CATALOG,
  createTechnicalServiceSelection,
  getTechnicalServiceDefinition,
  resetTechnicalServiceTemplate,
  updateTechnicalServiceParameter,
  type TechnicalServiceIssue,
  type TechnicalServiceParameters,
  type TechnicalServiceSelection
} from '../../../../../../shared/comercial/dist/technical-services.js';
import { AvisoPendencia } from '../../custos/ConfirmacaoEscopo';
import { Area, Field, SelectField } from '../../components/Field';
import { useReordenacao } from '../useReordenacao';

/**
 * Etapa 5 — Serviços da proposta técnica (`PROP-CTL-049..057` e `098..112`).
 *
 * Porte de `TechnicalServicesEditor` (`app/page.tsx`).
 *
 * **O catálogo e o texto vêm de `shared/comercial/technical-services.ts`**, copiado
 * sem alteração da referência. O texto técnico que vai ao cliente é gerado por
 * `buildText` a partir dos parâmetros — não é escrito aqui, e não pode ser: é o
 * conteúdo de engenharia que a Filtrovali padronizou.
 *
 * **Os parâmetros são condicionais por serviço.** Flushing pergunta a classe NAS;
 * desidratação pergunta o limite de PPM e o tipo de óleo; limpeza química pergunta o
 * material. Mostrar todos sempre pediria dado que não se aplica — e é o caminho mais
 * curto para o usuário preencher qualquer coisa só para o aviso sumir.
 *
 * **"Editar texto" é de mão única, de propósito.** Sair do modelo desliga a
 * atualização automática: a partir daí mexer nos parâmetros não reescreve mais o
 * texto, senão o trabalho manual seria apagado sem aviso. Voltar exige "Restaurar
 * modelo", que é explícito porque descarta o que foi digitado.
 */

const TIPOS_DE_OLEO = [
  { value: 'Óleo hidráulico', label: 'Óleo hidráulico' },
  { value: 'Óleo lubrificante', label: 'Óleo lubrificante' }
];

const MATERIAIS = [
  { value: 'Aço carbono', label: 'Aço carbono' },
  { value: 'Aço inoxidável', label: 'Aço inoxidável' },
  { value: 'Outro metal', label: 'Outro metal' }
];

type Props = {
  selecoes: TechnicalServiceSelection[];
  onSelecoes: (
    atualizar: (atual: TechnicalServiceSelection[]) => TechnicalServiceSelection[]
  ) => void;
  complemento: string;
  onComplemento: (valor: string) => void;
  observacoes: string;
  onObservacoes: (valor: string) => void;
  erros: string[];
  /**
   * As mesmas pendências, **com endereço** — cartão e campo (T067). Vêm de
   * `validateTechnicalServiceIssues`, a mesma fonte de `erros`, para que o
   * campo que acende seja exatamente o que o contador conta.
   */
  pendencias: TechnicalServiceIssue[];
  mostrarErros: boolean;
};

function novoId() {
  return `tecnico-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TecnicaStep({
  selecoes,
  onSelecoes,
  complemento,
  onComplemento,
  observacoes,
  onObservacoes,
  erros,
  pendencias,
  mostrarErros
}: Props) {
  const escolhidos = new Set(selecoes.map(item => item.serviceId));

  const reordenar = useReordenacao({
    itens: selecoes,
    aoReordenar: proximos => onSelecoes(() => proximos),
    idDe: item => item.instanceId,
    seletorDaLinha: '.com-tecnica-card',
    desligado: selecoes.length < 2
  });

  /**
   * O erro de um campo de um cartão — vazio enquanto o vendedor não tentou
   * avançar.
   *
   * O portão é o mesmo do resto da proposta e existe pelo motivo aprendido na
   * T048: um serviço recém-adicionado está legitimamente incompleto, e acender
   * tudo desde o primeiro render vira papel de parede.
   */
  const erroDoCampo = (instanceId: string, campo: TechnicalServiceIssue['field']) =>
    mostrarErros
      ? pendencias.find(p => p.instanceId === instanceId && p.field === campo)?.message
      : undefined;

  function alternar(serviceId: string) {
    onSelecoes(atual => {
      const jaEscolhido = atual.find(item => item.serviceId === serviceId);
      if (jaEscolhido) {
        return atual.filter(item => item.instanceId !== jaEscolhido.instanceId);
      }
      return [
        ...atual,
        createTechnicalServiceSelection(
          serviceId as TechnicalServiceSelection['serviceId'],
          novoId()
        )
      ];
    });
  }

  function atualizar(
    instanceId: string,
    atualizador: (item: TechnicalServiceSelection) => TechnicalServiceSelection
  ) {
    onSelecoes(atual =>
      atual.map(item => (item.instanceId === instanceId ? atualizador(item) : item))
    );
  }

  function mover(indice: number, direcao: -1 | 1) {
    onSelecoes(atual => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const proximo = [...atual];
      [proximo[indice], proximo[destino]] = [proximo[destino], proximo[indice]];
      return proximo;
    });
  }

  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Serviços da proposta técnica</h2>
          <p>
            Selecione os modelos, ajuste os parâmetros e edite somente quando
            necessário.
          </p>
        </div>
        <em className="com-contagem">
          {selecoes.length}{' '}
          {selecoes.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}
        </em>
      </div>

      <div className="com-catalogo">
        {TECHNICAL_SERVICE_CATALOG.map(servico => {
          const selecionado = escolhidos.has(servico.id);
          return (
            <button
              type="button"
              key={servico.id}
              className={selecionado ? 'com-catalogo-item is-ativa' : 'com-catalogo-item'}
              aria-pressed={selecionado}
              onClick={() => alternar(servico.id)}
            >
              <b aria-hidden="true">{selecionado ? '✓' : '+'}</b>
              <strong>{servico.title}</strong>
              <span>{servico.summary}</span>
              {/* Qual relatório o serviço gera é decidido pelo catálogo, não pelo
                  usuário: é compromisso técnico, e a proposta promete o relatório
                  ao cliente. */}
              <small>{servico.reportCode ? `RDO + ${servico.reportCode}` : 'Somente RDO'}</small>
            </button>
          );
        })}
      </div>

      {selecoes.length === 0 && (
        <div className="com-vazio">Selecione ao menos um modelo técnico acima.</div>
      )}

      {mostrarErros && erros.length > 0 && (
        <AvisoPendencia>
          {erros.map(erro => (
            <span key={erro} className="com-linha-erro">
              {erro}
            </span>
          ))}
        </AvisoPendencia>
      )}

      {selecoes.map((selecao, indice) => {
        const definicao = getTechnicalServiceDefinition(selecao.serviceId);
        if (!definicao) return null;

        const mudarParametro = (chave: keyof TechnicalServiceParameters, valor: string) =>
          atualizar(selecao.instanceId, atual =>
            updateTechnicalServiceParameter(atual, chave, valor)
          );

        const pedeParametro =
          definicao.asksNas ||
          definicao.asksPpm ||
          definicao.asksMaterial ||
          definicao.asksOilType;

        return (
          <article
            className={
              reordenar.idArrastado === selecao.instanceId
                ? 'com-fase-card com-tecnica-card drag-placeholder'
                : 'com-fase-card com-tecnica-card'
            }
            key={selecao.instanceId}
            {...reordenar.propsDaLinha(selecao.instanceId)}
          >
            <header className="com-fase-card-topo">
              <div className="com-escopo-numero">
                <b aria-hidden="true">7.{indice + 1}</b>
                <div>
                  <strong>{selecao.title}</strong>
                  <span>
                    Modelo salvo v{selecao.templateVersion} ·{' '}
                    {selecao.reportCode ? `${selecao.reportCode} + RDO` : 'somente RDO'}
                  </span>
                </div>
              </div>
              <div className="com-fase-acoes">
                <span
                  className="com-alca"
                  role="button"
                  tabIndex={-1}
                  {...reordenar.propsDaAlca(selecao.instanceId, selecao.title)}
                >
                  ⠿
                </span>
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  aria-label="Mover serviço para cima"
                  disabled={indice === 0}
                  onClick={() => mover(indice, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  aria-label="Mover serviço para baixo"
                  disabled={indice === selecoes.length - 1}
                  onClick={() => mover(indice, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="com-remover"
                  aria-label={`Remover ${selecao.title}`}
                  onClick={() => alternar(selecao.serviceId)}
                >
                  ×
                </button>
              </div>
            </header>

            <Field
              label="Título que aparecerá na proposta"
              required
              value={selecao.title}
              maxLength={120}
              error={erroDoCampo(selecao.instanceId, 'title')}
              onChange={valor =>
                atualizar(selecao.instanceId, atual => ({ ...atual, title: valor }))
              }
            />

            {pedeParametro && (
              <div className="com-form-grid">
                {definicao.asksNas && (
                  <Field
                    label="Classe NAS desejada"
                    required
                    value={selecao.parameters.nasTarget || ''}
                    placeholder="Ex.: NAS 6"
                    error={erroDoCampo(selecao.instanceId, 'nasTarget')}
                    onChange={valor => mudarParametro('nasTarget', valor)}
                  />
                )}
                {definicao.asksPpm && (
                  <Field
                    label="Limite de água no óleo (PPM)"
                    required
                    type="number"
                    inputMode="numeric"
                    value={selecao.parameters.ppmTarget || ''}
                    placeholder="Ex.: 200"
                    error={erroDoCampo(selecao.instanceId, 'ppmTarget')}
                    onChange={valor => mudarParametro('ppmTarget', valor)}
                  />
                )}
                {definicao.asksOilType && (
                  <SelectField
                    label="Tipo de óleo"
                    required
                    value={selecao.parameters.oilType || ''}
                    emptyLabel="Selecione o tipo de óleo"
                    options={TIPOS_DE_OLEO}
                    error={erroDoCampo(selecao.instanceId, 'oilType')}
                    onChange={valor => mudarParametro('oilType', valor)}
                  />
                )}
                {definicao.asksMaterial && (
                  <SelectField
                    label="Material do sistema"
                    required
                    value={selecao.parameters.material || ''}
                    emptyLabel="Selecione o material"
                    options={MATERIAIS}
                    error={erroDoCampo(selecao.instanceId, 'material')}
                    onChange={valor => mudarParametro('material', valor)}
                  />
                )}
                {definicao.asksMaterial && selecao.parameters.material === 'Outro metal' && (
                  <Field
                    label="Qual é o outro metal?"
                    required
                    value={selecao.parameters.otherMaterial || ''}
                    placeholder="Ex.: cobre, alumínio ou liga especial"
                    error={erroDoCampo(selecao.instanceId, 'otherMaterial')}
                    onChange={valor => mudarParametro('otherMaterial', valor)}
                  />
                )}
              </div>
            )}

            <div className="com-secao-titulo com-texto-tecnico-topo">
              <div>
                <strong>Texto técnico</strong>
                <span>
                  {selecao.usesTemplate
                    ? 'Atualizado automaticamente pelos parâmetros acima.'
                    : 'Texto personalizado para esta proposta.'}
                </span>
              </div>
              {selecao.usesTemplate ? (
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  /* Sair do modelo DESLIGA a atualização automática. Sem isso,
                     mexer num parâmetro depois apagaria o texto digitado. */
                  onClick={() =>
                    atualizar(selecao.instanceId, atual => ({ ...atual, usesTemplate: false }))
                  }
                >
                  Editar texto
                </button>
              ) : (
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  title="Descarta o texto digitado e volta ao modelo padrão"
                  onClick={() =>
                    atualizar(selecao.instanceId, resetTechnicalServiceTemplate)
                  }
                >
                  Restaurar modelo
                </button>
              )}
            </div>

            <Area
              label="Texto técnico"
              required
              value={selecao.text}
              rows={10}
              readOnly={selecao.usesTemplate}
              maxLength={MAX_TECHNICAL_SERVICE_TEXT}
              error={erroDoCampo(selecao.instanceId, 'text')}
              onChange={valor =>
                atualizar(selecao.instanceId, atual => ({ ...atual, text: valor }))
              }
            />
          </article>
        );
      })}

      {selecoes.length > 0 && (
        <Area
          label="Complemento dos relatórios (opcional)"
          value={complemento}
          onChange={onComplemento}
        />
      )}

      <Area label="Observações técnicas" value={observacoes} onChange={onObservacoes} />
    </section>
  );
}
