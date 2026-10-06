import { normalizeCostEstimatePayload, type VolumeSystem, type PipeSegment } from './cost-model.js';
import {
  DIMENSIONING_TYPES, SYSTEM_MATERIALS, dimensioningItems, dimensioningServiceAllowed,
  type DimensioningType
} from './dimensioning.js';
import {
  MAX_SCOPE_TABLES, MAX_SCOPE_TABLE_ROWS,
  type ScopeBlock, type ScopeServiceItem, type ScopeTableBlock, type ScopeTopic
} from './scope-content.js';
import { TECHNICAL_SERVICE_CATALOG } from './technical-services.js';

type DimensionedItem = ReturnType<typeof dimensioningItems>[number];
type TableGroup = {
  serviceId: string;
  system: VolumeSystem;
  type: DimensioningType;
  items: DimensionedItem['item'][];
};

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const columns: Record<DimensioningType, string[]> = {
  pipes: ['Sistema', 'Material', 'Quantidade', 'Comprimento', 'Ø interno', 'Preenchimento (%)'],
  reservoirs: ['Sistema', 'Material', 'Quantidade', 'Volume unitário (L)'],
  oil: ['Sistema', 'Tipo de óleo', 'Marca / viscosidade', 'Quantidade', 'Volume unitário (L)'],
  equipment: ['Sistema', 'Material', 'Quantidade', 'Volume unitário (L)']
};

function tableRow(item: DimensionedItem['item'], type: DimensioningType, system: VolumeSystem): string[] {
  const values = item as DimensionedItem['item'] & { quantity: number; volumeLiters: number };
  const quantity = number.format(values.quantity);
  if (type === 'oil') {
    return [item.description, item.oilType || '', item.oilBrandViscosity || '', quantity,
      number.format(values.volumeLiters)];
  }
  const material = SYSTEM_MATERIALS.find(option => option.value === (item.material || system.material))?.label || 'Outro';
  if (type === 'pipes') {
    const pipe = item as PipeSegment;
    const lengthUnit = pipe.lengthUnit || 'm';
    const length = pipe.lengthM * ({ m: 1, cm: 100, mm: 1000 })[lengthUnit];
    const diameter = pipe.diameterUnit === 'in'
      ? `${number.format(pipe.internalDiameterMm / 25.4)}"`
      : `${number.format(pipe.internalDiameterMm)} mm`;
    return [item.description, material, quantity, `${number.format(length)} ${lengthUnit}`,
      pipe.schedule ? `${diameter} (SCH ${pipe.schedule})` : diameter, number.format(pipe.fillPercent)];
  }
  return [item.description, material, quantity, number.format(values.volumeLiters)];
}

/** Copia apenas os sistemas contemplados por cada serviço, sem alterar o levantamento. */
export function scopeTablesFromDimensioning(value: unknown): ScopeTableBlock[] {
  const payload = normalizeCostEstimatePayload(value);
  const systems = new Map(payload.volumeSystems.filter(system => system.enabled).map(system => [system.id, system]));
  const groups = new Map<string, TableGroup>();

  for (const assignment of payload.circuitServices || []) {
    const system = systems.get(assignment.systemId);
    if (!system || !TECHNICAL_SERVICE_CATALOG.some(service => service.id === assignment.serviceId)) continue;
    const items = dimensioningItems(system);
    // Mangueiras dos levantamentos antigos usam as mesmas medidas das tubulações.
    if (!assignment.itemId) {
      items.push(...system.hoseSegments.map((item, index) => ({
        type: 'pipes' as const, collection: 'pipeSegments' as const, index,
        item: { ...item, id: `legacy-hose-${item.id}`, material: system.material }
      })));
    }
    for (const { type, item } of items) {
      if (item.included === false || !dimensioningServiceAllowed(type, assignment.serviceId)) continue;
      if (assignment.itemId && (item.id !== assignment.itemId || type !== assignment.itemType)) continue;
      const key = JSON.stringify([assignment.serviceId, system.id, type]);
      const group = groups.get(key) || { serviceId: assignment.serviceId, system, type, items: [] };
      if (!group.items.some(existing => existing.id === item.id)) group.items.push(item);
      groups.set(key, group);
    }
  }

  const tables: ScopeTableBlock[] = [];
  for (const group of groups.values()) {
    const typeTitle = DIMENSIONING_TYPES.find(type => type.id === group.type)!.title;
    const pages = Math.ceil(group.items.length / MAX_SCOPE_TABLE_ROWS);
    for (let page = 0; page < pages; page += 1) {
      const cycles = group.system.cycles > 1 ? ` · ${number.format(group.system.cycles)} ciclos` : '';
      const continuation = pages > 1 ? ` (${page + 1}/${pages})` : '';
      tables.push({
        id: `tabela-levantamento-${group.serviceId}-${group.system.id}-${group.type}-${page}`,
        type: 'table',
        scopeItemId: `escopo-levantamento-${group.serviceId}`,
        title: `${group.system.name} — ${typeTitle}${cycles}${continuation}`.slice(0, 120),
        columns: [...columns[group.type]],
        rows: group.items.slice(page * MAX_SCOPE_TABLE_ROWS, (page + 1) * MAX_SCOPE_TABLE_ROWS)
          .map(item => tableRow(item, group.type, group.system))
      });
    }
  }
  if (tables.length > MAX_SCOPE_TABLES) {
    throw new Error(`O dimensionamento gera ${tables.length} tabelas. A proposta aceita até ${MAX_SCOPE_TABLES}; reduza a quantidade de circuitos antes de criar a proposta.`);
  }
  return tables;
}

type ProposalScope = { items: ScopeServiceItem[]; blocks: ScopeBlock[] };

function hasTopicText(topics: ScopeTopic[]): boolean {
  return topics.some(topic => Boolean(topic.text.trim()) || hasTopicText(topic.children || []));
}

/** O levantamento preenche o escopo inicial; conteúdo editado ou salvo permanece intacto. */
export function fillScopeFromDimensioning(current: ProposalScope, imported: ProposalScope): ProposalScope {
  if (!imported.items.length || current.blocks.length) return current;
  const initial = current.items.length === 1 ? current.items[0] : undefined;
  const empty = !current.items.length || Boolean(initial
    && /^serviço\s+\d+$/iu.test(initial.title.trim())
    && !initial.description.trim()
    && !initial.subitems?.some(text => text.trim())
    && !hasTopicText(initial.topics || []));
  return empty ? imported : current;
}
