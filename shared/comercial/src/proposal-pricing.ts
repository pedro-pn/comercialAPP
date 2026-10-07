import { lerDinheiro, moeda, somarDinheiro } from './dinheiro.js';
import type { LocalOperacao } from './modelo-documento.js';
import type { ItemDePreco } from './proposal-validation.js';

export type DescontoDaProposta = {
  description: string;
  value: string;
  local?: LocalOperacao;
};

export function descontosDaProposta(form: Record<string, unknown>): DescontoDaProposta[] {
  if (!Array.isArray(form.discounts)) return [];
  return form.discounts.map(value => {
    const item = value && typeof value === 'object' ? value : {};
    return {
      description: String(item.description ?? ''),
      value: typeof item.value === 'number' ? moeda(item.value) : String(item.value ?? ''),
      ...(['ONSHORE', 'OFFSHORE'].includes(item.local) ? { local: item.local as LocalOperacao } : {})
    };
  });
}

/** A mesma linha negativa é usada na prévia, nos documentos e no total do servidor. */
export function precosComDescontos(
  precos: readonly ItemDePreco[], descontos: readonly DescontoDaProposta[]
): ItemDePreco[] {
  return [...precos, ...descontos.flatMap(item => {
    const amount = Math.round(lerDinheiro(item.value) * 100) / 100;
    if (amount <= 0) return [];
    const value = moeda(-amount);
    return [{ description: `Desconto: ${item.description}`, unit: 'VB', quantity: '1',
      unitValue: value, value, ...(item.local ? { local: item.local } : {}) }];
  })];
}

export function pendenciasDosDescontos(
  form: Record<string, unknown>, precos: readonly ItemDePreco[]
): string[] {
  const descontos = descontosDaProposta(form);
  const errors: string[] = [];
  if (descontos.some(item => !item.description.trim() || lerDinheiro(item.value) <= 0)) {
    errors.push('Informe a descrição e um valor de desconto maior que zero, ou remova o desconto.');
  }
  const padrao = form.modelo === 'padrao';
  for (const local of new Set(descontos.map(item => padrao ? undefined : item.local))) {
    const total = somarDinheiro(precos.filter(item => padrao || item.local === local).map(item => item.value));
    const discount = somarDinheiro(descontos.filter(item => padrao || item.local === local).map(item => item.value));
    if (discount > total) errors.push(`Os descontos${local ? ` de ${local}` : ''} não podem ultrapassar o total dos itens de preço.`);
  }
  return errors;
}
