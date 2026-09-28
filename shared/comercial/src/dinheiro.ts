/**
 * Leitura da máscara de moeda — **uma definição só**, para os três lados.
 *
 * Esta função nasceu privada dentro do gerador do documento, saiu de lá para
 * `backend/src/lib/comercial/dinheiro.js` quando o `totalValue` passou a ser
 * somado no servidor, e chega aqui pelo mesmo motivo de sempre, agora com a
 * tela entrando na conta (T130):
 *
 * > Duas implementações da mesma conta divergem em silêncio, e a divergência
 * > aparece como um valor no histórico diferente do TOTAL GERAL impresso no PDF
 * > que o cliente já recebeu.
 *
 * O caso concreto que trouxe a função para cá: a tela precisa mostrar a soma de
 * cada cenário ao lado da escolha, e o front tinha o seu próprio leitor
 * (`dinheiroDigitado`, que trata o texto como centavos). Os dois **concordam**
 * com valor mascarado — "R$ 1.234,56" dá 1234,56 nos dois — e **divergem 100×**
 * sem máscara: "1000" é mil aqui e dez reais lá. Uma tela mostrando dez reais
 * enquanto o CRM recebe mil é o defeito que este arquivo existe para não ter.
 */

/**
 * Desfaz a máscara de moeda do formulário.
 *
 * Ponto é milhar e vírgula é decimal, ao contrário do que `Number` espera. Ler
 * "R$ 11.250,00" com `Number` daria `NaN`, e o total sairia "R$ NaN" impresso.
 */
export function lerDinheiro(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const limpo = String(valor ?? "").replace(/[^\d,.-]/g, "");
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

export function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(valor) ? valor : 0,
  );
}

/**
 * A soma de um conjunto de valores mascarados.
 *
 * Passa por **centavos inteiros** de propósito: somar 0,1 + 0,2 em ponto
 * flutuante dá 0,30000000000000004, e este total aparece na tela ao lado da
 * escolha do vendedor e vai gravado no histórico.
 */
export function somarDinheiro(valores: readonly unknown[]): number {
  const centavos = valores.reduce<number>(
    (soma, valor) => soma + Math.round(lerDinheiro(valor) * 100),
    0,
  );
  return centavos / 100;
}
