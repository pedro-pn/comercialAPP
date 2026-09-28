import { reorderRowsById } from '../../../utils/reorderDrag';

/**
 * A sessão de arrasto — **sem React**, como a cadeia do rodapé e a decisão da
 * distância.
 *
 * Aqui mora a única parte do arrastar que **erra em silêncio**: o cancelamento.
 * Arrastar move a lista à vista e um placeholder que não aparece se nota na
 * hora; já um cancelamento que não restaura deixa a proposta com os serviços em
 * ordem trocada, e ninguém percebe **até o documento sair**.
 *
 * Separada do hook para poder ser exercitada de verdade: começar, mover, mover
 * de novo, cancelar — e conferir que a lista voltou exatamente ao que era. Um
 * teste que só lesse o código do hook passaria com a restauração quebrada.
 */
export type SessaoDeArrasto<T> = {
  /** Quem está sendo arrastado. */
  origem: string;
  /** A ordem no instante em que o arrasto começou — o alvo do cancelamento. */
  ordemInicial: T[];
};

/** Abre a sessão, guardando a ordem para a qual o cancelamento volta. */
export function comecarArrasto<T>(itens: T[], origem: string): SessaoDeArrasto<T> {
  return { origem, ordemInicial: itens };
}

/**
 * Move a origem para a posição do alvo.
 *
 * Devolve a **mesma referência** quando nada muda — o hook compara por
 * referência para decidir se avisa o formulário, e uma cópia nova a cada
 * `dragover` re-renderizaria a proposta dezenas de vezes por segundo.
 */
export function moverNoArrasto<T>(
  sessao: SessaoDeArrasto<T> | null,
  itens: T[],
  alvo: string,
  idDe: (item: T) => string
): T[] {
  if (!sessao) return itens;
  return reorderRowsById(itens, sessao.origem, alvo, idDe);
}

/**
 * O fim do arrasto.
 *
 * `manter` distingue soltar de cancelar, e é a decisão inteira: soltar fica com
 * a ordem construída durante o arrasto; cancelar volta à do início. Sem sessão
 * — arrasto que nunca começou — nada muda, porque não há a que voltar.
 */
export function encerrarArrasto<T>(
  sessao: SessaoDeArrasto<T> | null,
  itens: T[],
  manter: boolean
): T[] {
  if (!sessao) return itens;
  return manter ? itens : sessao.ordemInicial;
}
