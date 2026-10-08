/** Regras de preenchimento usadas pela tela e pela finalização no servidor. */
import { categoriaCanonicaResponsabilidade, EQUIPAMENTOS_E_FERRAMENTAS_PADRAO,
  type LocalOperacao } from './modelo-documento.js';
import { lerDinheiro, moeda } from './dinheiro.js';
import { pendenciasDosDescontos } from './proposal-pricing.js';
import { normalizeTechnicalServiceSelections, validateTechnicalServiceSelections } from './technical-services.js';

export type EtapaProposta =
  | 'cliente'
  | 'escopo'
  | 'responsabilidades'
  | 'prazos'
  | 'tecnica'
  | 'comercial'
  | 'revisao';

export type PendenciaEtapa = { campo: string; mensagem: string };

/**
 * Validadores de formato, portados da referência.
 *
 * Os dois seguem a mesma regra que o `Field` da referência já aplicava: **erro só
 * quando há valor e ele está errado**. Campo vazio é "obrigatório", não "inválido" —
 * são dois estados, e trocá-los faz o usuário procurar um erro de digitação num
 * campo que ele simplesmente não preencheu.
 */
export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

/**
 * CNPJ: 14 dígitos **e** dígitos verificadores corretos.
 *
 * A referência conferia só a quantidade (`cnpjDigits.length === 14`). Conferir os
 * verificadores é mais estrito — e o CNPJ vai impresso no documento fiscal do
 * cliente, onde um dígito trocado inutiliza a proposta inteira.
 */
export function cnpjValido(valor: string): boolean {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const verificador = (base: string, pesos: number[]) => {
    const soma = base
      .split('')
      .reduce((total, digito, i) => total + Number(digito) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = verificador(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = verificador(digitos.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return primeiro === Number(digitos[12]) && segundo === Number(digitos[13]);
}

type Formulario = Record<string, unknown>;

function texto(form: Formulario, campo: string): string {
  const valor = form[campo];
  return typeof valor === 'string' || typeof valor === 'number' ? String(valor).trim() : '';
}

/**
 * As pendências da etapa **Cliente e responsáveis** (`PROP-CTL-011..025`).
 *
 * A trava da referência: proposta, cliente, contato, e-mail válido, CNPJ válido,
 * local da obra, consultor de vendas e orçamentista.
 */
export function pendenciasDoCliente(form: Formulario): PendenciaEtapa[] {
  const faltando: PendenciaEtapa[] = [];

  const obrigatorios: Array<[string, string]> = [
    ['seller', 'Selecione o consultor de vendas.'],
    ['date', 'Informe a data de emissão.'],
    ['client', 'Informe o cliente.'],
    ['contact', 'Informe o contato.'],
    ['site', 'Informe o local da obra.']
  ];

  for (const [campo, mensagem] of obrigatorios) {
    if (!texto(form, campo)) faltando.push({ campo, mensagem });
  }

  const cnpj = texto(form, 'cnpj');
  if (!cnpj) faltando.push({ campo: 'cnpj', mensagem: 'Informe o CNPJ.' });
  else if (!cnpjValido(cnpj)) {
    faltando.push({ campo: 'cnpj', mensagem: 'Informe um CNPJ válido com 14 dígitos.' });
  }

  const email = texto(form, 'email');
  if (!email) faltando.push({ campo: 'email', mensagem: 'Informe o e-mail.' });
  else if (!emailValido(email)) {
    faltando.push({ campo: 'email', mensagem: 'Digite um e-mail válido.' });
  }

  return faltando;
}

/**
 * As pendências da etapa **Escopo comum** (`PROP-CTL-026..033`).
 *
 * O título identifica o serviço no documento. A descrição é complementar e
 * pode ficar vazia quando o próprio título já define o escopo contratado.
 */
export function pendenciasDoEscopo(
  titulo: string,
  itens: Array<{ title?: string; description?: string }>
): PendenciaEtapa[] {
  const faltando: PendenciaEtapa[] = [];

  if (!String(titulo || '').trim()) {
    faltando.push({ campo: 'title', mensagem: 'Informe o título da proposta.' });
  }

  if (!itens.length) {
    faltando.push({ campo: 'scopeItems', mensagem: 'Adicione ao menos um serviço ao escopo.' });
  }

  itens.forEach((item, i) => {
    if (!texto(item, 'title')) {
      faltando.push({ campo: `escopo[${i}].title`, mensagem: 'Informe o título do serviço.' });
    }
  });

  return faltando;
}

export function ehLinhaDeEquipamentosDaFiltrovali(linha: {
  categoria?: string;
  owner?: string;
}): boolean {
  if (linha.owner !== 'Filtrovali') return false;
  return categoriaCanonicaResponsabilidade(
    linha.categoria || '',
    'Filtrovali'
  ) === 'EQUIPAMENTOS E MATERIAIS';
}

export function pendenciasDasResponsabilidades(
  linhas: Array<{
    item?: string;
    owner?: string;
    categoria?: string;
    subitens?: string[];
  }>
): PendenciaEtapa[] {
  const pendencias: PendenciaEtapa[] = [];
  const preenchidas = linhas.filter(linha => texto(linha, 'item')).length;
  if (preenchidas === 0) {
    pendencias.push({
      campo: 'responsabilidades',
      mensagem: 'Informe ao menos uma responsabilidade com o item preenchido.'
    });
  }

  const linhaDeEquipamentos = linhas.find(ehLinhaDeEquipamentosDaFiltrovali);
  const equipamentos = Array.isArray(linhaDeEquipamentos?.subitens)
    ? linhaDeEquipamentos.subitens.filter(item => typeof item === 'string' && item.trim()) : [];
  if (linhaDeEquipamentos && equipamentos.length === 0) {
    pendencias.push({
      campo: 'equipamentos',
      mensagem: `Selecione ao menos um dos ${EQUIPAMENTOS_E_FERRAMENTAS_PADRAO.length} equipamentos ou informe outro.`
    });
  }

  return pendencias;
}

/** As pendências de **Prazos e jornada** (`PROP-CTL-043..048`). */
export function pendenciasDosPrazos(form: Formulario): PendenciaEtapa[] {
  const obrigatorios: Array<[string, string]> = [
    ['attendance', 'Informe a previsão de atendimento.'],
    ['mobilization', 'Informe a mobilização após o pedido.'],
    ['permanence', 'Informe a permanência prevista em obra.'],
    // `dias_treinamento` no documento. Saía impresso sem ter de onde vir — T071c.
    ['integration', 'Informe o prazo previsto para integração.'],
    ['execution', 'Informe o prazo efetivo de execução.'],
    ['workday', 'Descreva a jornada de trabalho.']
  ];

  return obrigatorios
    .filter(([campo]) => !texto(form, campo))
    .map(([campo, mensagem]) => ({ campo, mensagem }));
}

export type ItemDePreco = {
  description: string;
  unit: string;
  quantity: string;
  unitValue: string;
  value: string;
  /**
   * A qual tabela o item pertence, no modelo de hidrojateamento: ONSHORE ou
   * OFFSHORE. Ausente no modelo padrão, que tem uma tabela só (T071f).
   *
   * Cada tabela fecha o **seu** TOTAL GERAL. Somar as duas juntas apresentaria
   * ao cliente um total que ele não vai pagar: são cenários alternativos de
   * execução, não parcelas do mesmo serviço.
   */
  local?: LocalOperacao;
};

export const CAMPOS_STANDBY = [
  { campo: 'overtimeRate', label: 'Homem/hora fora do horário previsto' },
  { campo: 'standbyTeam', label: 'Stand-by de equipe (diária por colaborador)' },
  { campo: 'standbyEquipment', label: 'Stand-by de equipamentos (diária)' },
  { campo: 'extraMobilization', label: 'Mobilização extra (por evento ida e volta)' }
] as const;

export function quantidadeDoItemDePreco(valor: unknown): number {
  const numero = Number(String(valor ?? '').trim().replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

/** O total impresso é sempre quantidade × valor unitário, arredondado em centavos. */
export function valorTotalDoItemDePreco(
  quantidade: unknown,
  valorUnitario: unknown
): string {
  if (!String(valorUnitario ?? '').trim()) return '';
  const quantidadeNumerica = quantidadeDoItemDePreco(quantidade);
  if (quantidadeNumerica <= 0) return '';
  return moeda(
    Math.round(quantidadeNumerica * lerDinheiro(valorUnitario) * 100) / 100
  );
}

export function itemDePrecoCompleto(item: ItemDePreco): boolean {
  return Boolean(
    texto(item, 'description')
      && quantidadeDoItemDePreco(item.quantity) > 0
      && texto(item, 'unitValue')
      && valorTotalDoItemDePreco(item.quantity, item.unitValue)
  );
}

/** Itens da tabela opcional, separados dos preços que compõem o total contratado. */
export function itensInformativosDaProposta(form: Formulario): ItemDePreco[] {
  if (!Array.isArray(form.informationalPrices)) return [];
  return form.informationalPrices.map(valor => {
    const item = valor && typeof valor === 'object' ? valor : {};
    const quantity = texto(item, 'quantity');
    const unitValue = texto(item, 'unitValue');
    return {
      description: typeof item.description === 'string' ? item.description : texto(item, 'description'),
      unit: texto(item, 'unit') || 'VB',
      quantity,
      unitValue,
      value: valorTotalDoItemDePreco(quantity, unitValue)
    };
  });
}

export function pendenciasDaTecnica(erros: string[]): PendenciaEtapa[] {
  return erros.map(mensagem => ({ campo: 'tecnica', mensagem }));
}

/**
 * As pendências de **Conteúdo da proposta comercial** (`PROP-CTL-058..071`).
 *
 * Ao menos um preço precisa de descrição, quantidade e valor unitário; o total
 * é derivado desses dois últimos. Os adicionais comerciais são obrigatórios
 * quando entram no item 9; na sede, permanece apenas a hora extra do item 9.1.
 */
export function pendenciasDaComercial(
  form: Formulario,
  precos: ItemDePreco[]
): PendenciaEtapa[] {
  const faltando: PendenciaEtapa[] = [];

  const completos = precos.filter(itemDePrecoCompleto).length;

  if (completos === 0) {
    faltando.push({
      campo: 'precos',
      mensagem: 'Informe ao menos um item de preço com descrição, quantidade e valor unitário.'
    });
  }

  if (form.includeInformationalPrices === true) {
    const informativos = itensInformativosDaProposta(form);
    if (!informativos.length || informativos.some(item => !itemDePrecoCompleto(item))) {
      faltando.push({
        campo: 'informationalPrices',
        mensagem: 'Informe descrição, quantidade e valor unitário de todos os itens de equipamentos e outras despesas, ou desmarque a tabela opcional.'
      });
    }
  }

  faltando.push(...pendenciasDosDescontos(form, precos).map(mensagem => ({ campo: 'discounts', mensagem })));

  const obrigatorios: Array<[string, string]> = [
    ['payment', 'Informe as condições de pagamento.'],
    ['taxes', 'Informe os impostos.']
  ];

  for (const [campo, mensagem] of obrigatorios) {
    if (!texto(form, campo)) faltando.push({ campo, mensagem });
  }

  for (const { campo, label } of CAMPOS_STANDBY) {
    if (form.workAtHeadquarters === true && campo !== 'overtimeRate') continue;
    if (!texto(form, campo)) {
      faltando.push({ campo, mensagem: `Informe ${label.toLocaleLowerCase('pt-BR')}.` });
    }
  }

  if (form.workAtHeadquarters !== true) {
    const quantidadeStandby = texto(form, 'standbyTeamQuantity');
    if (quantidadeStandby && (!Number.isInteger(Number(quantidadeStandby)) || Number(quantidadeStandby) <= 0)) {
      faltando.push({
        campo: 'standbyTeamQuantity',
        mensagem: 'Informe uma quantidade inteira de colaboradores maior que zero.'
      });
    } else if (!quantidadeStandby) {
      faltando.push({ campo: 'standbyTeamQuantity', mensagem: 'Informe a quantidade de colaboradores para o stand-by.' });
    }
  }

  const validade = Number(texto(form, 'validity'));
  if (!texto(form, 'validity')) {
    faltando.push({ campo: 'validity', mensagem: 'Informe a validade das propostas.' });
  } else if (!Number.isFinite(validade) || validade <= 0) {
    // Validade zero ou negativa produz uma proposta vencida na emissão.
    faltando.push({
      campo: 'validity',
      mensagem: 'A validade precisa ser de pelo menos 1 dia.'
    });
  }

  return faltando;
}

/** Confere o conteúdo persistido, sem depender de quais abas foram visitadas. */
export function pendenciasDoDocumento(form: Record<string, unknown>) {
  const registros = (valor: unknown) => Array.isArray(valor)
    ? valor.filter(item => item && typeof item === 'object') : [];
  const porEtapa = (etapa: EtapaProposta, pendencias: PendenciaEtapa[]) =>
    pendencias.map(pendencia => ({ ...pendencia, etapa }));
  return [
    ...porEtapa('cliente', pendenciasDoCliente(form)),
    ...porEtapa('escopo', pendenciasDoEscopo(texto(form, 'title'), registros(form.scopeItems))),
    ...porEtapa('responsabilidades', pendenciasDasResponsabilidades(registros(form.rows))),
    ...porEtapa('prazos', pendenciasDosPrazos(form)),
    ...porEtapa('tecnica', pendenciasDaTecnica(validateTechnicalServiceSelections(
      normalizeTechnicalServiceSelections(form.technicalServices)))),
    ...porEtapa('comercial', pendenciasDaComercial(form, registros(form.prices)))
  ];
}
