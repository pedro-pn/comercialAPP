/**
 * Formatadores do módulo Comercial — porte de `app/custos/page.tsx:3362-3382`.
 *
 * Copiados ao pé da letra porque o formato faz parte da paridade: mudar de
 * "R$ 105.920,80" para "R$ 105920.8" é divergência visível em toda a tela, e
 * o aceite lado a lado compara texto por texto.
 */

export function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numberValue(value));
}

export function percent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(numberValue(value));
}

export function number(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(
    numberValue(value)
  );
}

export function people(value: number, singular = 'pessoa', plural = 'pessoas'): string {
  const amount = numberValue(value);
  return `${number(amount)} ${amount === 1 ? singular : plural}`;
}

/**
 * A máscara dos campos de valor — **desvio nº 15**, aprovado em 11/08.
 *
 * Os dígitos são lidos como **centavos**: digitar `12345` dá `R$ 123,45`. É
 * exatamente o que `formatarDinheiro` faz na etapa Comercial da proposta, porte
 * de `formatMoneyInput` da referência.
 *
 * **As duas telas do módulo pedem valor**, e com comportamentos diferentes quem
 * passa de uma para a outra digita errado na segunda. A diferença é só onde o
 * valor mora: na proposta ele é texto do documento, aqui ele alimenta o motor
 * de cálculo — então a tela guarda **número** e a máscara vive na exibição.
 */
export function mascaraDeDinheiro(valor: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numberValue(valor));
}

/**
 * Desfaz a máscara: o que o usuário digitou vira número em reais.
 *
 * Só os dígitos contam. Colar "R$ 1.234,56" devolve 1234.56, e apagar tudo
 * devolve 0 — nunca `NaN`, que entraria no cálculo e contaminaria o total
 * inteiro sem erro visível.
 */
export function dinheiroDigitado(texto: string): number {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  if (!digitos) return 0;
  return Number(digitos) / 100;
}
