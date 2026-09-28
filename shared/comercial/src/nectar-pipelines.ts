const NECTAR_BASE = "https://app.nectarcrm.com.br/crm/api/1";

export type NectarPipeline = {
  key: string;
  id: string;
  name: string;
  firstSequence: number;
};

export const NECTAR_PIPELINE_DEFINITIONS = [
  {
    key: "licitacoes-estudo-viabilidade-stand-by",
    label: "Licitações / Estudo de viabilidade / Stand by",
    aliases: ["licitacoes / estudo de viabilidade / stand by"],
    envKey: "NECTAR_PIPELINE_LICITACOES_ESTUDO_VIABILIDADE_STAND_BY_ID",
  },
  { key: "gestao-comercial", label: "Gestão Comercial", aliases: ["gestao comercial"], envKey: "NECTAR_PIPELINE_GESTAO_COMERCIAL_ID" },
] as const;

export async function fetchAllowedNectarPipelines(token: string) {
  let records = await fetchPipelineRecords("/pipelines?type=0&page=-1", token);
  if (!records.length) records = await fetchPipelineRecords("/pipeline?type=0&page=-1", token);
  const pipelines = resolveAllowedNectarPipelines(records);
  const found = new Set(pipelines.map((pipeline) => pipeline.key));
  if (found.size !== NECTAR_PIPELINE_DEFINITIONS.length) {
    const missing = NECTAR_PIPELINE_DEFINITIONS
      .filter((definition) => !found.has(definition.key))
      .map((definition) => definition.label);
    throw new Error(
      `Funis não encontrados no Nectar: ${missing.join(", ")}. Confira os nomes ou configure os IDs específicos da Filtrovali.`,
    );
  }
  return pipelines;
}

export function resolveAllowedNectarPipelines(
  records: Array<Record<string, unknown>>,
  overrides: Partial<Record<(typeof NECTAR_PIPELINE_DEFINITIONS)[number]["envKey"], string>> = {},
) {
  return NECTAR_PIPELINE_DEFINITIONS.flatMap((definition) => {
    const configuredId = String(overrides[definition.envKey] || process.env[definition.envKey] || "").trim();
    const matches = records.filter((record) => {
      if (configuredId) return String(record.id || "") === configuredId;
      const name = normalizePipelineName(String(record.nome || record.name || ""));
      return definition.aliases.some((alias) => normalizePipelineName(alias) === name);
    });
    const activeMatches = matches.filter((record) => readPipelineActive(record) === true);
    const eligibleMatches = activeMatches.length ? activeMatches : matches;
    if (!eligibleMatches.length) return [];
    if (!configuredId && eligibleMatches.length > 1) {
      throw new Error(
        `Há mais de um funil ativo compatível com ${definition.label}. IDs encontrados: ${eligibleMatches.map((record) => record.id).join(", ")}. Configure ${definition.envKey} com o ID correto.`,
      );
    }
    const record = eligibleMatches[0];
    return [{
      key: definition.key,
      id: String(record.id),
      name: String(record.nome || record.name || definition.label),
      firstSequence: readFirstSequence(record),
    } satisfies NectarPipeline];
  });
}

export function requireAllowedPipeline(pipelines: NectarPipeline[], pipelineId: string) {
  const pipeline = pipelines.find((item) => item.id === String(pipelineId));
  if (!pipeline) throw new Error("O funil selecionado não pertence à lista autorizada da Filtrovali.");
  return pipeline;
}

export function belongsToNectarPipeline(record: Record<string, unknown>, pipeline: Pick<NectarPipeline, "id" | "name">) {
  const pipelineObject = record.pipeline && typeof record.pipeline === "object" ? record.pipeline as Record<string, unknown> : {};
  const salesFunnel = record.funilVenda && typeof record.funilVenda === "object" ? record.funilVenda as Record<string, unknown> : {};
  const funnel = record.funil && typeof record.funil === "object" ? record.funil as Record<string, unknown> : {};
  const pipelineId = String(pipelineObject.id ?? salesFunnel.id ?? funnel.id ?? record.pipelineId ?? record.funilVendaId ?? "");
  if (pipelineId) return pipelineId === pipeline.id;
  const pipelineName = String(pipelineObject.nome ?? pipelineObject.name ?? salesFunnel.nome ?? funnel.nome ?? (typeof record.pipeline === "string" ? record.pipeline : ""));
  return normalizePipelineName(pipelineName) === normalizePipelineName(pipeline.name);
}

export function collectNectarRecords(payload: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6 || payload == null) return [];
  if (Array.isArray(payload)) return payload.flatMap((item) => collectNectarRecords(item, depth + 1));
  if (typeof payload !== "object") return [];
  const object = payload as Record<string, unknown>;
  const current = object.id != null && (object.nome != null || object.titulo != null || object.name != null) ? [object] : [];
  return current.concat(Object.values(object).flatMap((value) => collectNectarRecords(value, depth + 1)));
}

export function normalizePipelineName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function readFirstSequence(record: Record<string, unknown>) {
  const sequences = Array.isArray(record.sequencias) ? record.sequencias as Array<Record<string, unknown>> : [];
  const first = [...sequences].sort((a, b) => readSequence(a) - readSequence(b))[0];
  return Math.max(1, readSequence(first || {}) || 1);
}

function readSequence(record: Record<string, unknown>) {
  return Number(record.sequencia ?? record.etapa ?? record.ordem ?? 1) || 1;
}

function readPipelineActive(record: Record<string, unknown>) {
  const value = record.ativo ?? record.active ?? record.isActive ?? record.status;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;
  const normalized = normalizePipelineName(value);
  if (["true", "1", "ativo", "active"].includes(normalized)) return true;
  if (["false", "0", "inativo", "inactive"].includes(normalized)) return false;
  return null;
}

async function fetchPipelineRecords(path: string, token: string) {
  const response = await fetch(`${NECTAR_BASE}${path}`, {
    headers: { "Access-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nectar respondeu com erro ${response.status} ao consultar os funis.`);
  return collectNectarRecords(await response.json());
}
