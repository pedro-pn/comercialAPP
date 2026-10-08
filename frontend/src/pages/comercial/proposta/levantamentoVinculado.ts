import type { LevantamentoSalvo } from '../../../api/comercial';
import { businessDaysFromCalendar, calculateEstimate, normalizeCostEstimatePayload } from '../../../../../shared/comercial/dist/cost-model.js';
import { dimensioningItems, dimensioningServiceAllowed } from '../../../../../shared/comercial/dist/dimensioning.js';
import { scopeTablesFromDimensioning } from '../../../../../shared/comercial/dist/dimensioning-scope.js';
import type { ScopeBlock, ScopeServiceItem } from '../../../../../shared/comercial/dist/scope-content.js';
import {
  createTechnicalServiceSelection,
  getTechnicalServiceDefinition,
  updateTechnicalServiceParameter,
  type ChemicalMaterial,
  type TechnicalServiceId,
  type TechnicalServiceSelection
} from '../../../../../shared/comercial/dist/technical-services.js';

import {
  recalcularItensDePreco,
  type ItemDePreco
} from './etapas';
import { atualizarPrazoDeExecucao, prazoDeExecucao } from './prazoExecucao';

type LevantamentoComPayload = Pick<LevantamentoSalvo, 'title' | 'salePrice'> & {
  payload?: Record<string, unknown>;
};

type OpcoesDoItemDePreco = {
  local?: ItemDePreco['local'];
};

type CircuitoDoLevantamento = {
  id: string;
  name: string;
  material: string;
  oilType?: string;
};

type GrupoDeServico = {
  serviceId: TechnicalServiceId;
  circuitos: CircuitoDoLevantamento[];
};

export type ServicosImportadosDoLevantamento = {
  escopo: ScopeServiceItem[];
  blocos: ScopeBlock[];
  tecnicos: TechnicalServiceSelection[];
};

function gruposDeServicosDoLevantamento(
  levantamento: Pick<LevantamentoComPayload, 'payload'>
): GrupoDeServico[] {
  const payload = normalizeCostEstimatePayload(levantamento.payload || {});
  const circuitosBrutos = payload.volumeSystems;
  const associacoes = payload.circuitServices;
  if (!Array.isArray(circuitosBrutos) || !Array.isArray(associacoes)) return [];

  const circuitos = new Map<string, CircuitoDoLevantamento>();
  circuitosBrutos.forEach((candidato, indice) => {
    if (!candidato || typeof candidato !== 'object') return;
    const registro = candidato as Record<string, unknown>;
    if (registro.enabled === false) return;
    const id = String(registro.id || '').trim();
    if (!id) return;
    circuitos.set(id, {
      id,
      name: String(registro.name || `Circuito ${indice + 1}`).trim(),
      material: String(registro.material || 'other')
    });
  });

  const grupos = new Map<TechnicalServiceId, GrupoDeServico>();
  associacoes.forEach(candidato => {
    if (!candidato || typeof candidato !== 'object') return;
    const registro = candidato as Record<string, unknown>;
    const serviceId = String(registro.serviceId || '') as TechnicalServiceId;
    let circuito = circuitos.get(String(registro.systemId || ''));
    if (!circuito || !getTechnicalServiceDefinition(serviceId)) return;

    if (registro.itemId) {
      const system = payload.volumeSystems.find(item => item.id === registro.systemId);
      const dimensionado = system && dimensioningItems(system).find(item => item.item.id === registro.itemId && item.type === registro.itemType);
      if (!dimensionado || !dimensioningServiceAllowed(dimensionado.type, serviceId)) return;
      const linha = dimensionado.item;
      const detalhes = [linha.oilType, linha.oilBrandViscosity].filter(Boolean).join(' — ');
      circuito = { id: `${circuito.id}:${registro.itemType}:${linha.id}`,
        name: `${circuito.name} — ${linha.description || 'Sistema'}${detalhes ? ` (${detalhes})` : ''}`,
        material: linha.material || 'other', oilType: linha.oilType };
    }

    const grupo = grupos.get(serviceId) ?? { serviceId, circuitos: [] };
    if (!grupo.circuitos.some(item => item.id === circuito.id)) grupo.circuitos.push(circuito);
    grupos.set(serviceId, grupo);
  });

  return [...grupos.values()];
}

function materialQuimicoDosCircuitos(circuitos: CircuitoDoLevantamento[]): {
  material: ChemicalMaterial;
  otherMaterial?: string;
} {
  const rotulos = [...new Set(circuitos.map(circuito => ({
    carbon_steel: 'Aço carbono',
    stainless_steel: 'Aço inoxidável',
    other: 'Outro metal'
  })[circuito.material] ?? 'Outro metal'))];

  if (rotulos.length === 1 && rotulos[0] !== 'Outro metal') {
    return { material: rotulos[0] as ChemicalMaterial };
  }
  return {
    material: 'Outro metal',
    otherMaterial: rotulos.join(', ') || 'material informado no levantamento'
  };
}

/**
 * Converte a seleção feita no orçamento em escopo e modelos técnicos já
 * preenchidos, mantendo ambos editáveis na proposta.
 */
export function servicosImportadosDoLevantamento(
  levantamento: Pick<LevantamentoComPayload, 'payload'>
): ServicosImportadosDoLevantamento {
  const grupos = gruposDeServicosDoLevantamento(levantamento);
  const tecnicos = grupos.map(grupo => {
    let selecao: TechnicalServiceSelection = createTechnicalServiceSelection(
      grupo.serviceId,
      `levantamento-${grupo.serviceId}`
    );
    if (grupo.serviceId === 'limpeza_quimica') {
      const material = materialQuimicoDosCircuitos(grupo.circuitos);
      selecao = updateTechnicalServiceParameter(selecao, 'material', material.material);
      if (material.otherMaterial) {
        selecao = updateTechnicalServiceParameter(
          selecao,
          'otherMaterial',
          material.otherMaterial
        );
      }
    }
    const tiposDeOleo = [...new Set(grupo.circuitos.map(circuito => circuito.oilType).filter(Boolean))];
    if (getTechnicalServiceDefinition(grupo.serviceId)?.asksOilType && tiposDeOleo.length === 1
      && (tiposDeOleo[0] === 'Óleo hidráulico' || tiposDeOleo[0] === 'Óleo lubrificante')) {
      selecao = updateTechnicalServiceParameter(selecao, 'oilType', tiposDeOleo[0]);
    }
    return selecao;
  });

  return {
    tecnicos,
    blocos: scopeTablesFromDimensioning(levantamento.payload || {}),
    escopo: grupos.map((grupo, indice) => {
      const selecao = tecnicos[indice];
      const nomes = grupo.circuitos.map(circuito => circuito.name);
      const aplicacao = nomes.length === 1
        ? `Sistema contemplado: ${nomes[0]}.`
        : `Sistemas contemplados: ${nomes.join(', ')}.`;
      return {
        id: `escopo-levantamento-${grupo.serviceId}`,
        title: selecao.title,
        description: `${aplicacao}\n\n${selecao.text}`
      };
    })
  };
}

/** Preserva ajustes já feitos na aba Técnica de uma proposta existente. */
export function preencherServicosTecnicosAusentesDoLevantamento(
  atuais: TechnicalServiceSelection[],
  importados: TechnicalServiceSelection[]
): TechnicalServiceSelection[] {
  return atuais.length || !importados.length ? atuais : importados;
}

/**
 * Parâmetros canônicos para abrir uma proposta a partir de um levantamento.
 *
 * A finalização da tela de custos e a escolha manual precisam produzir o mesmo
 * endereço. Se cada entrada montar a URL por conta própria, uma delas pode
 * vincular apenas o id sem aplicar título, local da obra e preço de venda.
 */
export function parametrosDaPropostaComLevantamento(
  levantamento: Pick<LevantamentoSalvo, 'id' | 'proposalCode' | 'revisionNumber' | 'propostaVinculada'>
): URLSearchParams {
  const parametros = new URLSearchParams();
  parametros.set('levantamento', levantamento.id);
  parametros.set('proposta', levantamento.proposalCode);
  parametros.set('modo', levantamento.revisionNumber > 0 ? 'revision' : 'new');
  parametros.set('revisao', String(levantamento.revisionNumber || 0));
  parametros.set('etapa', 'cliente');
  parametros.set('usarLevantamento', '1');
  const proposta = levantamento.propostaVinculada;
  if (proposta && proposta.revisionNumber === levantamento.revisionNumber) {
    parametros.set('id', proposta.id);
    if (proposta.status === 'FALHA_INTEGRACAO') parametros.set('etapa', 'revisao');
  }
  return parametros;
}

/**
 * O endereço de execução da proposta é o destino orçado no levantamento.
 *
 * `obra-principal` é a chave criada pela tela de logística. Levantamentos
 * antigos podem não tê-la; nesses casos usamos o primeiro destino que de fato
 * tenha endereço, sem confundir o local da obra com o endereço do CRM.
 */
export function localDaObraDoLevantamento(
  levantamento: Pick<LevantamentoComPayload, 'payload'>
): string {
  const destinos = levantamento.payload?.logisticsDestinations;
  if (!Array.isArray(destinos)) return '';

  const normalizados = destinos.flatMap(destino => {
    if (!destino || typeof destino !== 'object') return [];
    const registro = destino as Record<string, unknown>;
    const endereco = String(registro.address ?? '').trim();
    if (!endereco) return [];
    return [{ id: String(registro.id ?? ''), endereco }];
  });

  return (
    normalizados.find(destino => destino.id === 'obra-principal')?.endereco ??
    normalizados[0]?.endereco ??
    ''
  );
}

/** Período das fases ativas, sem duplicar fases que acontecem em paralelo. */
export function prazosDoLevantamento(
  levantamento: Pick<LevantamentoComPayload, 'payload'>
): { permanence: string; execution: string; integration?: string } | null {
  const payload = levantamento.payload;
  if (!payload || payload.noLabor === true
    || (payload.scopeConfirmations as Record<string, unknown> | undefined)?.noLabor === true
    || !Array.isArray(payload.laborContexts)) return null;
  const periodos = payload.laborContexts.flatMap(fase => {
    if (!fase || typeof fase !== 'object') return [];
    const registro = fase as Record<string, unknown>;
    if (registro.enabled === false) return [];
    const duracao = Number(registro.durationDays);
    const inicio = Number(registro.startOffsetDays ?? 0);
    if (!Number.isSafeInteger(duracao) || duracao <= 0 || !Number.isSafeInteger(inicio) || inicio < 0
      || !Number.isSafeInteger(inicio + duracao)) return [];
    return [{ inicio, fim: inicio + duracao, integracao: registro.integrationDays }];
  });
  if (!periodos.length) return null;
  const inicio = Math.min(...periodos.map(periodo => periodo.inicio));
  const diasCorridos = Math.max(...periodos.map(periodo => periodo.fim)) - inicio;
  const execution = prazoDeExecucao(diasCorridos);
  let integration: string | undefined;
  if (periodos.some(periodo => periodo.integracao !== undefined)) {
    const integracoes = periodos.map(periodo => ({
      inicio: businessDaysFromCalendar(periodo.inicio - inicio),
      dias: Number(periodo.integracao ?? 0),
      duracao: periodo.fim - periodo.inicio
    }));
    if (integracoes.some(periodo => !Number.isSafeInteger(periodo.dias)
      || periodo.dias < 0 || periodo.dias > businessDaysFromCalendar(periodo.duracao))) {
      integration = '';
    } else {
      // Integrações simultâneas ocupam os mesmos dias úteis da permanência.
      const intervalos = integracoes.filter(periodo => periodo.dias > 0)
        .map(periodo => ({ inicio: periodo.inicio,
          fim: Math.min(periodo.inicio + periodo.dias, Number(execution)) }))
        .sort((a, b) => a.inicio - b.inicio);
      let dias = 0;
      let fimAnterior = 0;
      for (const periodo of intervalos) {
        dias += Math.max(0, periodo.fim - Math.max(fimAnterior, periodo.inicio));
        fimAnterior = Math.max(fimAnterior, periodo.fim);
      }
      integration = String(dias);
    }
  }
  return {
    permanence: String(diasCorridos),
    execution,
    ...(integration === undefined ? {} : { integration })
  };
}

/** A duração do levantamento vinculado é a origem dos prazos da proposta. */
export function sincronizarPrazosDoLevantamento(
  form: Record<string, unknown>, levantamento: Pick<LevantamentoComPayload, 'payload'>
): Record<string, unknown> {
  const prazos = prazosDoLevantamento(levantamento);
  if (!prazos) return atualizarPrazoDeExecucao(form);
  if (prazos.integration !== undefined) {
    return form.permanence === prazos.permanence && form.execution === prazos.execution
      && form.integration === prazos.integration && form.integrationIncludedInPermanence === true
      && form.permanenceBase === prazos.permanence && form.integrationDaysApplied === 0
      ? form : { ...form, ...prazos, permanenceBase: prazos.permanence,
        integrationDaysApplied: 0, integrationIncludedInPermanence: true };
  }
  const atualizado = atualizarPrazoDeExecucao(form, prazos.permanence);
  return form.permanence === atualizado.permanence && form.execution === atualizado.execution
    && form.permanenceBase === atualizado.permanenceBase
    && form.integrationDaysApplied === atualizado.integrationDaysApplied ? form : atualizado;
}

/** Formata o Decimal da API sem reaplicar a máscara de digitação por centavos. */
export function formatarValorDoLevantamento(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numero);
}

/**
 * Valor da ida da equipe lançado na Logística do levantamento.
 *
 * Equipamentos e desmobilização são intencionalmente excluídos: o campo da
 * proposta pede apenas uma nova mobilização da equipe, não todo o custo
 * logístico de um evento completo.
 */
export function valorDaMobilizacaoDeEquipeDoLevantamento(
  levantamento: Pick<LevantamentoComPayload, 'payload'>
): string {
  if (!levantamento.payload) return '';
  const calculado = calculateEstimate(levantamento.payload);
  const total = calculado.logisticsResults
    .filter(item => item.direction === 'mobilization' && item.slotType === 'crew')
    .reduce((soma, item) => soma + item.total, 0);
  return formatarValorDoLevantamento(total);
}

/**
 * O levantamento fecha um preço global. Na proposta ele entra como uma verba
 * única, editável, para que o vendedor possa detalhá-la depois se necessário.
 */
export function itemDePrecoDoLevantamento(
  levantamento: Pick<LevantamentoSalvo, 'title' | 'salePrice'>,
  opcoes: OpcoesDoItemDePreco = {}
): ItemDePreco {
  const valor = formatarValorDoLevantamento(levantamento.salePrice);
  return {
    description: levantamento.title || 'Serviços conforme levantamento de custos',
    unit: 'VB',
    quantity: '1',
    unitValue: valor,
    value: valor,
    ...(opcoes.local ? { local: opcoes.local } : {})
  };
}

/**
 * Uma proposta já iniciada pode ter sido salva antes da importação do preço do
 * levantamento. Nesse caso a linha padrão existe, mas continua em R$ 0,00.
 *
 * A ausência é decidida pelo valor, não pela descrição: modelos antigos já
 * preenchiam um texto genérico ("Serviço especializado conforme escopo") e,
 * ainda assim, deixavam o preço zerado. Uma linha com valor positivo é edição
 * comercial válida e nunca deve ser sobrescrita silenciosamente.
 */
export function precosPrecisamDoLevantamento(precos: ItemDePreco[]): boolean {
  return !precos.some(item => {
    const centavos = String(item.value || '').replace(/\D/g, '');
    return Number(centavos) > 0;
  });
}

const DESCRICOES_GENERICAS_DE_PRECO = new Set([
  '',
  'serviço especializado conforme escopo',
  'serviços conforme levantamento de custos'
]);

/**
 * Completa uma proposta antiga sem destruir o que já foi negociado nela.
 *
 * - sem preço: recebe integralmente a linha do levantamento;
 * - com preço: preserva os valores e só troca a descrição genérica pelo nome
 *   dos serviços levantados;
 * - hidrojateamento legado: ganha ONSHORE para a linha não ficar fora das duas
 *   tabelas por não possuir cenário.
 */
export function preencherPrecosAusentesDoLevantamento(
  precos: ItemDePreco[],
  importado: ItemDePreco
): ItemDePreco[] {
  if (precosPrecisamDoLevantamento(precos)) return [importado];

  return recalcularItensDePreco(precos.map((item, indice) => {
    const descricaoAtual = item.description.trim().toLocaleLowerCase('pt-BR');
    return {
      ...item,
      ...(indice === 0 && DESCRICOES_GENERICAS_DE_PRECO.has(descricaoAtual)
        ? { description: importado.description }
        : {}),
      ...(importado.local && !item.local ? { local: importado.local } : {})
    };
  }));
}

/** Atualiza automaticamente apenas a verba que ainda conserva o preço importado. */
export function sincronizarPrecosDoLevantamento(
  precos: ItemDePreco[], importado: ItemDePreco, origem: unknown, levantamentoId: string
): ItemDePreco[] {
  const anterior = origem && typeof origem === 'object'
    ? origem as { id?: string; item?: ItemDePreco } : null;
  const doCenario = importado.local ? precos.filter(item => item.local === importado.local) : precos;
  const atual = doCenario[0];
  const itemAnterior = anterior?.item;
  if (doCenario.length === 1 && anterior?.id === levantamentoId && itemAnterior &&
      atual.quantity === itemAnterior.quantity && atual.unitValue === itemAnterior.unitValue &&
      atual.value === itemAnterior.value && atual.local === itemAnterior.local) {
    return precos.map(item => item === atual
      ? { ...item, unitValue: importado.unitValue, value: importado.value } : item);
  }
  return preencherPrecosAusentesDoLevantamento(precos, importado);
}
