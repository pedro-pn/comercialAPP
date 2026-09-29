/**
 * De serviço técnico da proposta para produto do Nectar (tarefa T129).
 *
 * **A lógica é do comercial, não minha.** Lida dos cards reais do CRM em
 * 11/08/2026: cada oportunidade leva **um produto**, que é o **serviço vendido**,
 * com `quantidade: 1` e `valorUnitario = valorTotal = valor da proposta`.
 *
 *     card 26709855  "3694 - FILTRAGEM ABSOLUTA"   FV-01  R$ 473.800
 *     card 27045405  "3767 - LQ - ENGETAL"         FV-05  R$ 132.900
 *
 * O produto **não é enfeite**: os funis "Gestão Comercial" e "Funil de testes"
 * exigem produto para criar na etapa 1, e recusam com 409 sem ele. A alternativa
 * era desligar a regra no CRM; o mantenedor decidiu **respeitar a lógica que o
 * comercial já adotou**, e mandar o produto.
 *
 * **Serviço sem mapa recusa, não chuta.** Mandar o produto errado põe a proposta
 * na categoria errada do CRM, e o relatório de vendas por serviço passa a mentir
 * sem ninguém ver. Recusar dizendo o que falta é barato; consertar seis meses de
 * relatório não é.
 */

import { HttpError } from '../../auth/service.js';

/**
 * O mapa.
 *
 * **A chave é o `id`, nunca o `codigo`.** Descoberto em 12/08: o `FV-nn` do
 * Nectar **se desloca** quando o catálogo é editado. "Serviço especializado em
 * passagem de PIG" era FV-27 num dia e FV-26 no outro, com o **mesmo id**
 * 2832235. O `codigo` aqui é legenda para humano, e pode envelhecer sem quebrar
 * nada; o `id` é o que amarra.
 */
export const PRODUTO_POR_SERVICO = {
  flushing_primario: { id: 2315552, codigo: 'FV-04', nome: 'Serviço especializado em flushing primário' },
  flushing_secundario: { id: 2315551, codigo: 'FV-03', nome: 'Serviço especializado em flushing secundário' },
  filtragem_oleo_termico: { id: 2318567, codigo: 'FV-16', nome: 'Serviço especializado em filtragem de fluído térmico' },
  filtragem_oleo_diesel: { id: 6576861, codigo: 'FV-35', nome: 'Filtragem de óleo diesel' },
  filtragem_oleo_tempera: { id: 5922302, codigo: 'FV-32', nome: 'Filtragem de óleo de tempera' },
  limpeza_quimica: { id: 2315553, codigo: 'FV-05', nome: 'Serviço especializado em limpeza química' },
  hidrojateamento: { id: 6668620, codigo: 'FV-36', nome: 'Hidrojato' },
  teste_hidrostatico: { id: 2315555, codigo: 'FV-07', nome: 'Serviço especializado em teste hidrostático' },
  pre_engenharia: { id: 2323945, codigo: 'FV-22', nome: 'Serviço especializado em pré-engenharia' },
  limpeza_reservatorio: { id: 2315554, codigo: 'FV-06', nome: 'Serviço especializado em limpeza interna de reservatório' },

  // --- Confirmados pelo comercial em 12/08/2026 ---

  filtragem_hidraulico_lubrificante: { id: 2315549, codigo: 'FV-01', nome: 'Serviço especializado em filtragem absoluta' },
  /**
   * FV-27, e não o FV-08 de mesmo nome: **o FV-08 está `ativo: false`** no
   * catálogo. A duplicata já tinha sido resolvida no CRM; produto inativo não
   * entra em card novo.
   */
  passagem_pig: { id: 2832235, codigo: 'FV-26', nome: 'Serviço especializado em passagem de PIG' },

  /**
   * Os dois fluidos são **serviços diferentes para o comercial**, porque o preço
   * difere — desvio nº 16. A referência tinha um só, e é um dos pontos em que
   * ela é esboço e não retrato do uso real.
   */
  desidratacao_oleo: { id: 2315550, codigo: 'FV-02', nome: 'Serviço especializado em desidratação de óleo lubrificante/hidráulico' },
  desidratacao_oleo_diesel: { id: 2320154, codigo: 'FV-14', nome: 'Serviço especializado em desidratação de óleo diesel' },

  // --- Serviços novos, confirmados pelo comercial em 13/08/2026 (T133) ---

  /**
   * **Dois produtos ativos servem a este serviço**, e a escolha não é indiferente:
   * FV-28 "Flushing com água" (id 3033640) e FV-29 "Serviço especializado em
   * flushing com água" (id 3569930). Vale o FV-29 por duas fontes que concordam:
   * a regra de ambiguidade decidida em 12/08 — **vale o mais usado** (4 usos
   * contra 3) — e a planilha do comercial, que nomeia o FV-29.
   */
  flushing_agua: { id: 3569930, codigo: 'FV-29', nome: 'Serviço especializado em flushing com água' },
  boroscopia: { id: 2315558, codigo: 'FV-10', nome: 'Serviço especializado em boroscopia' }
};

/**
 * O produto da proposta.
 *
 * `servicos` são os serviços técnicos escolhidos. A regra do comercial é **um
 * produto por card**, então quando há mais de um serviço vale o primeiro — que é
 * o principal da proposta, o que dá nome ao documento.
 */
export function produtoDaProposta(servicos, valorTotal) {
  const escolhidos = (Array.isArray(servicos) ? servicos : [])
    .map(item => String(item?.id ?? item ?? ''))
    .filter(Boolean);

  if (!escolhidos.length) {
    throw new HttpError(422,
      'A proposta não tem serviço técnico selecionado, e o funil do Nectar exige produto na oportunidade.');
  }

  const principal = escolhidos[0];
  if (!(principal in PRODUTO_POR_SERVICO)) {
    throw new HttpError(422,
      `O serviço "${principal}" não tem produto correspondente no Nectar. Registre o mapa em nectar-produtos.js.`);
  }

  const produto = PRODUTO_POR_SERVICO[principal];
  if (!produto) {
    throw new HttpError(422,
      `O produto do Nectar para "${principal}" ainda não foi confirmado pelo comercial — há mais de um candidato no catálogo. Confirme antes de finalizar.`);
  }

  const valor = Number(valorTotal) || 0;

  // A forma que os cards reais usam: `refId` aponta o produto, e o valor vai nos
  // dois campos. Mandar `produto: { id }` com `valor` também é aceito, mas o
  // Nectar zera o `valorAvulso` da oportunidade — e a proposta aparece como R$ 0.
  return {
    refId: produto.id,
    quantidade: 1,
    valorUnitario: valor,
    valorTotal: valor
  };
}

/** Os serviços que ainda esperam decisão do comercial. */
export function servicosSemProduto() {
  return Object.entries(PRODUTO_POR_SERVICO)
    .filter(([, produto]) => produto === null)
    .map(([servico]) => servico);
}
