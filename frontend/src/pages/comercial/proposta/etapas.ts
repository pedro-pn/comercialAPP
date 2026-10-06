/**
 * As 7 etapas da proposta, a navegação e as validações de preenchimento.
 *
 * Porte de `app/page.tsx:857-863` (o stepper) e do rodapé com o contador de
 * pendências. Módulo puro, sem React, pelo mesmo motivo da cadeia do rodapé de
 * custos: a regra é testável sozinha, e a tela não é.
 *
 * As abas do rascunho são livres. O rodapé valida ao salvar e avançar, e a
 * conclusão confere todas as etapas, inclusive as que o usuário pulou.
 */

import {
  matrizDoModelo,
  type ModeloProposta
} from '../../../../../shared/comercial/dist/modelo-documento.js';
import {
  ehLinhaDeEquipamentosDaFiltrovali, quantidadeDoItemDePreco, valorTotalDoItemDePreco,
  pendenciasDoCliente, pendenciasDoEscopo, pendenciasDasResponsabilidades,
  pendenciasDosPrazos, pendenciasDaTecnica, pendenciasDaComercial,
  type EtapaProposta, type PendenciaEtapa, type ItemDePreco
} from '../../../../../shared/comercial/dist/proposal-validation.js';
export * from '../../../../../shared/comercial/dist/proposal-validation.js';

type Formulario = Record<string, unknown>;

export const ETAPAS: Array<{ value: EtapaProposta; label: string }> = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'escopo', label: 'Escopo' },
  { value: 'responsabilidades', label: 'Responsabilidades' },
  { value: 'prazos', label: 'Prazos' },
  { value: 'tecnica', label: 'Técnica' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'revisao', label: 'Revisão' }
];

export function indiceDaEtapa(etapa: EtapaProposta): number {
  const indice = ETAPAS.findIndex(item => item.value === etapa);
  return indice < 0 ? 0 : indice;
}

/** Documentos emitidos só permitem acessar a revisão/integração. */
export function podeAcessarEtapa(status: string, etapa: EtapaProposta): boolean {
  return status === 'RASCUNHO' || etapa === 'revisao';
}

export function formatarCnpj(valor: string): string {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export type LinhaResponsabilidade = {
  item: string;
  owner: string;
  note: string;
  /**
   * O subtítulo que ocupa a largura da tabela no documento (MÃO DE OBRA E
   * EQUIPE TÉCNICA, LOGÍSTICA, UTILIDADES…). A referência não tem este campo e
   * desenha uma tabela plana — é o desvio 12, tarefa T071b.
   */
  categoria: string;
  /** Lista aninhada dentro da célula ESCOPO: equipamentos, EPI, efetivo. */
  subitens?: string[];
};

/** "N/A" é resposta legítima: há obrigação que não cabe a ninguém no contrato e
 *  precisa constar assim mesmo, para não parecer esquecimento. */
export const RESPONSAVEIS = ['Filtrovali', 'Contratante', 'N/A'];

/** As categorias que os documentos usam, na ordem em que costumam aparecer. */
export const CATEGORIAS_RESPONSABILIDADE = [
  'MÃO DE OBRA E EQUIPE TÉCNICA',
  'EQUIPAMENTOS E MATERIAIS',
  'CONSUMÍVEIS E UTILIDADES',
  'LOGÍSTICA',
  'SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE',
  'SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE',
  'ACESSIBILIDADE E APOIO DE CAMPO',
  'MEIO AMBIENTE'
];

export function linhaVazia(): LinhaResponsabilidade {
  return { item: '', owner: 'Filtrovali', note: '', categoria: CATEGORIAS_RESPONSABILIDADE[0] };
}

/**
 * Normaliza a categoria digitada.
 *
 * Maiúsculas e espaço colapsado porque a categoria é **chave de agrupamento**, e
 * no documento ela vira um subtítulo. "Logística", "LOGISTICA " e "LOGÍSTICA"
 * digitadas em propostas diferentes produziriam três subtítulos onde deveria
 * haver um — que foi exatamente o motivo de trocar o campo livre por lista.
 */
export function normalizarCategoria(valor: string): string {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('pt-BR');
}

/** Chave de comparação: ignora acento, além do que `normalizarCategoria` já faz. */
function chaveDaCategoria(valor: string): string {
  return normalizarCategoria(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Acrescenta uma categoria à lista, recusando vazio e repetição.
 *
 * A repetição é detectada **sem acento**: "LOGISTICA" e "LOGÍSTICA" são a mesma
 * categoria para quem lê o documento, e deixar as duas entrarem devolveria o
 * problema que a lista veio resolver.
 */
export function acrescentarCategoria(
  lista: string[],
  valor: string
): { lista: string[]; erro?: string } {
  const nova = normalizarCategoria(valor);
  if (!nova) return { lista, erro: 'Informe o nome da categoria.' };

  const chave = chaveDaCategoria(nova);
  const existente = lista.find(item => chaveDaCategoria(item) === chave);
  if (existente) {
    return { lista, erro: `"${existente}" já está na lista.` };
  }

  return { lista: [...lista, nova] };
}

/**
 * Remove uma categoria — a não ser que alguma linha ainda a use.
 *
 * Remover em uso deixaria a linha apontando para uma categoria que não existe
 * mais na lista, e o `select` a mostraria vazia. Recusar e dizer quantas linhas
 * dependem dela é o que permite ao usuário decidir.
 */
export function removerCategoria(
  lista: string[],
  categoria: string,
  linhas: Array<{ categoria?: string }>
): { lista: string[]; erro?: string } {
  const emUso = linhas.filter(
    linha => chaveDaCategoria(linha.categoria || '') === chaveDaCategoria(categoria)
  ).length;

  if (emUso > 0) {
    return {
      lista,
      erro: `"${categoria}" está em ${emUso} ${emUso === 1 ? 'linha' : 'linhas'}. Troque a categoria dessas linhas antes de removê-la.`
    };
  }

  return { lista: lista.filter(item => item !== categoria) };
}

/**
 * A matriz com que a proposta nasce, vinda do modelo escolhido.
 *
 * A referência nascia com 17 linhas de **caldeiraria e solda** que não aparecem
 * em nenhum dos quatro documentos — matriz de outro negócio. Estas vêm dos
 * `.docx`, e são editáveis como qualquer outra: o vendedor apaga o que não se
 * aplica à obra dele.
 */
export function matrizInicial(modelo: ModeloProposta): LinhaResponsabilidade[] {
  return matrizDoModelo(modelo).map(linha => {
    const inicial: LinhaResponsabilidade = {
      item: linha.item,
      owner: linha.responsavel,
      note: linha.nota,
      categoria: linha.categoria,
      ...(linha.subitens ? { subitens: [...linha.subitens] } : {})
    };

    // O catálogo do modelo é uma lista de OPÇÕES, não uma promessa de que todos
    // os equipamentos irão para toda obra. Novas propostas começam sem seleção.
    if (modelo === 'padrao' && ehLinhaDeEquipamentosDaFiltrovali(inicial)) {
      return { ...inicial, subitens: [] };
    }
    return inicial;
  });
}

/**
 * As pendências da etapa ativa.
 *
 * As etapas ainda não portadas devolvem lista vazia **de propósito**: uma trava que
 * bloqueia sem ter o que validar prenderia o usuário numa etapa em branco. Quando a
 * etapa for portada, a validação dela entra aqui junto.
 */
export function pendenciasDaEtapa(
  etapa: EtapaProposta,
  form: Formulario,
  escopo: {
    itens?: Array<{ title?: string; description?: string }>;
    responsabilidades?: Array<{ item?: string }>;
    errosTecnicos?: string[];
    precos?: ItemDePreco[];
  } = {}
): PendenciaEtapa[] {
  if (etapa === 'cliente') return pendenciasDoCliente(form);
  if (etapa === 'escopo') {
    return pendenciasDoEscopo(String(form.title ?? ''), escopo.itens || []);
  }
  if (etapa === 'responsabilidades') {
    return pendenciasDasResponsabilidades(escopo.responsabilidades || []);
  }
  if (etapa === 'prazos') return pendenciasDosPrazos(form);
  if (etapa === 'tecnica') return pendenciasDaTecnica(escopo.errosTecnicos || []);
  if (etapa === 'comercial') return pendenciasDaComercial(form, escopo.precos || []);
  return [];
}

/** Pendências de todo o documento, na ordem das abas e com o campo de destino. */
export function pendenciasDaProposta(
  form: Formulario,
  escopo: Parameters<typeof pendenciasDaEtapa>[2] = {}
): Array<PendenciaEtapa & { etapa: EtapaProposta }> {
  return ETAPAS.flatMap(({ value: etapa }) =>
    pendenciasDaEtapa(etapa, form, escopo).map(pendencia => ({ ...pendencia, etapa }))
  );
}

export const VALORES_PADRAO_STANDBY = {
  overtimeRate: 'R$ 250,00',
  standbyTeam: 'R$ 2.250,00'
} as const;

export function recalcularItemDePreco(item: ItemDePreco): ItemDePreco {
  return {
    ...item,
    value: valorTotalDoItemDePreco(item.quantity, item.unitValue)
  };
}

export function recalcularItensDePreco(itens: ItemDePreco[]): ItemDePreco[] {
  return itens.map(item =>
    String(item.unitValue || '').trim() && quantidadeDoItemDePreco(item.quantity) > 0
      ? recalcularItemDePreco(item)
      : item
  );
}

/**
 * Máscara de moeda, portada de `formatMoneyInput` (`app/page.tsx:1747`).
 *
 * Os dígitos são lidos como **centavos**: digitar `12345` dá `R$ 123,45`. É o
 * comportamento da referência, e o que evita a ambiguidade de quem digita `1.500`
 * querendo dizer mil e quinhentos ou um e meio.
 */
export function formatarDinheiro(valor: string): string {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(digitos) / 100);
}

/**
 * O rótulo do botão primário, no texto da referência.
 *
 * **A contagem de pendências vai num aviso próprio ao lado**, não no botão — é
 * assim na referência (`<span className="missing">`), e é assim aqui.
 *
 * O que diverge da referência, e é deliberado: lá o botão fica **desabilitado**
 * enquanto há pendência. Aqui ele continua clicável, e o clique é o que revela a
 * marcação em cada campo (L1). Desabilitar esconderia a resposta de quem está
 * perdido, e o aviso com a contagem já diz que falta alguma coisa.
 */
export function rotuloDoAvanco(
  _pendencias: PendenciaEtapa[],
  ultima: boolean,
  proximaEtapa = ''
): string {
  if (ultima) return 'Gerar e salvar técnica + comercial';
  return proximaEtapa ? `Salvar e ir para ${proximaEtapa} →` : 'Salvar e continuar →';
}

/** "Preencha N campo(s) obrigatório(s)" — o aviso ao lado do botão. */
export function avisoDePendencias(pendencias: PendenciaEtapa[]): string {
  if (pendencias.length === 0) return '';
  return pendencias.length === 1
    ? 'Preencha 1 campo obrigatório'
    : `Preencha ${pendencias.length} campos obrigatórios`;
}

/** Índice campo → mensagem, para a etapa consultar sem varrer a lista a cada campo. */
export function indiceDePendencias(pendencias: PendenciaEtapa[]) {
  const mapa = new Map<string, string>();
  for (const item of pendencias) if (!mapa.has(item.campo)) mapa.set(item.campo, item.mensagem);
  return mapa;
}
