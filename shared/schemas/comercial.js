/**
 * Contratos Zod do módulo Comercial.
 *
 * O campo `payload` de `CostEstimate` e de `Proposal` é `Json`, e o padrão de
 * módulo exige contrato validado para campo `Json` — senão vira depósito sem
 * forma, e ninguém descobre que a estrutura mudou até o cálculo sair errado.
 *
 * A validação aqui é de FORMA, não de regra de negócio. A regra vive em
 * `shared/comercial` (portada sem alteração da referência) e é verificada pelos
 * 16 goldens. Duplicar a regra aqui criaria duas verdades — e a segunda
 * divergiria em silêncio.
 */

/** Os dois modos da referência (`EstimateMode = "new" | "revision"`).
 *  Não existe modo "levantar": na tela de proposta, "Levantar custos" é um
 *  link para `/custos`, não um modo. */
export const COST_ESTIMATE_MODES = ["NOVA", "REVISAO"];
export const COST_ESTIMATE_STATUSES = ["RASCUNHO", "SALVO"];
export const PROPOSAL_STATUSES = [
  "RASCUNHO",
  "FINALIZANDO",
  "FINALIZADA",
  "FALHA_INTEGRACAO",
];
export const PROPOSAL_DOCUMENT_KINDS = ["COMERCIAL", "TECNICA"];
export const SALES_ATTRIBUTION_KINDS = ["REPRESENTANTE", "INDICACAO"];

/** Seções do levantamento, na ordem da referência (app/custos/page.tsx:54-59). */
export const COST_SECTIONS = [
  { value: "premises", label: "Premissas" },
  { value: "labor", label: "Mão de obra" },
  { value: "inputs", label: "Materiais e insumos" },
  { value: "logistics", label: "Mob. e desmob." },
  { value: "summary", label: "Resumo e QQP" },
];

/** Etapas do assistente de proposta, na ordem da referência (app/page.tsx:92). */
export const PROPOSAL_STEPS = [
  "Cliente",
  "Escopo",
  "Responsabilidades",
  "Prazos",
  "Técnica",
  "Comercial",
  "Revisão",
];

/**
 * Limites dos blocos de conteúdo do escopo.
 * Vêm de `app/scope-content.ts:37-41` da referência congelada — não são
 * escolha nossa, são paridade.
 */
export const SCOPE_LIMITS = {
  photos: 8,
  tables: 8,
  tableColumns: 6,
  tableRows: 40,
  tableCellCharacters: 300,
  captionCharacters: 240,
};

/**
 * Limites do envio na finalização (FR-059), portados de `lib/finalization.ts`.
 *
 * **O limite é AGREGADO**, e essa é a regra inteira: dois PDFs + a planilha de
 * custos + todos os anexos, somados. Validar cada arquivo isoladamente deixa o
 * conjunto passar — cinco anexos de 5 MB passam um a um e estouram juntos, e a
 * descoberta acontece no meio do envio, com o card já criado no CRM.
 */
export const ATTACHMENT_LIMITS = {
  /** Soma de tudo que vai ao destino externo. */
  maxAggregateBytes: 20 * 1024 * 1024,
  /** Corpo de UMA requisição de anexo — um arquivo por vez. */
  maxRequestBytes: 22 * 1024 * 1024,
};

export function formatFileSize(bytes) {
  const valor = Number(bytes) || 0;
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

/** Limites do upload de foto de escopo (app/api/scope-assets/route.ts). */
export const SCOPE_PHOTO_LIMITS = {
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  /** Depois da otimização no cliente. */
  maxBytes: 1_500_000,
  /** Corpo inteiro da requisição. */
  maxRequestBytes: 2_000_000,
  /** Arquivo original, antes de otimizar. */
  maxOriginalBytes: 10_000_000,
  maxMegapixels: 24,
  /** Maior lado, depois do redimensionamento. */
  maxEdgePixels: 1600,
};

/**
 * Assinaturas de bytes aceitas, por tipo declarado.
 *
 * Confiar no `Content-Type` é confiar em quem envia: um arquivo qualquer
 * renomeado para `.jpg` chega com `image/jpeg`. A referência já checava isto
 * (`matchesImageSignature`), e o porte mantém.
 */
export const IMAGE_SIGNATURES = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // WebP: "RIFF" .... "WEBP" — os bytes 8..11 são checados à parte.
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};

export function matchesImageSignature(bytes, contentType) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const signatures = IMAGE_SIGNATURES[contentType];
  if (!signatures) return false;

  const matchesPrefix = signatures.some((signature) =>
    signature.every((byte, index) => view[index] === byte),
  );
  if (!matchesPrefix) return false;

  if (contentType === "image/webp") {
    // "WEBP" nos bytes 8..11 — sem isso, qualquer RIFF (áudio, vídeo) passaria.
    return (
      view[8] === 0x57 &&
      view[9] === 0x45 &&
      view[10] === 0x42 &&
      view[11] === 0x50
    );
  }

  return true;
}

export function makeComercialSchemas(z) {
  if (!z?.object || !z?.enum) {
    throw new TypeError(
      "A valid Zod instance is required to build comercial schemas.",
    );
  }

  const id = z.string().trim().min(1);
  const queryBoolean = z.preprocess((value) => {
    if (value === undefined) return false;
    if (value === true || value === 1 || value === "1" || value === "true")
      return true;
    if (value === false || value === 0 || value === "0" || value === "false")
      return false;
    return value;
  }, z.boolean());
  const pagina = z.coerce.number().int().min(1).max(100_000).default(1);
  const tamanhoDaPagina = z.coerce.number().int().min(1).max(100).default(25);

  /**
   * O payload do levantamento é validado como objeto com `schemaVersion`.
   * Não replicamos a estrutura interna: ela tem ~40 coleções aninhadas e é
   * `normalizeCostEstimatePayload` do cost-model que a normaliza — replicá-la
   * aqui seria a segunda verdade que este arquivo existe para evitar.
   */
  const costEstimatePayload = z
    .object({ schemaVersion: z.union([z.number(), z.string()]).optional() })
    .passthrough();

  const proposalPayload = z.object({}).passthrough();

  const costEstimateCreate = z.object({
    proposalCode: z.string().trim().min(1).max(40),
    revisionNumber: z.number().int().min(0).default(0),
    title: z.string().trim().min(1).max(200),
    mode: z.enum(COST_ESTIMATE_MODES),
    status: z.enum(COST_ESTIMATE_STATUSES).default("SALVO"),
    payload: costEstimatePayload,
    // totalCost, salePrice e marginPercent NÃO entram: são recalculados no
    // servidor com calculateEstimate. Aceitar do cliente permitiria forjar margem.
  });

  const scopeTableBlock = z.object({
    id,
    type: z.literal("table"),
    title: z.string().max(120).default(""),
    columns: z.array(z.string().max(80)).min(2).max(SCOPE_LIMITS.tableColumns),
    rows: z
      .array(z.array(z.string().max(SCOPE_LIMITS.tableCellCharacters)))
      .max(SCOPE_LIMITS.tableRows),
  });

  const scopePhotoBlock = z.object({
    id,
    type: z.literal("photo"),
    assetId: id,
    caption: z.string().max(SCOPE_LIMITS.captionCharacters).default(""),
    fileName: z.string().max(255).default(""),
  });

  const scopeContentBlocks = z
    .array(z.discriminatedUnion("type", [scopeTableBlock, scopePhotoBlock]))
    .superRefine((blocks, ctx) => {
      const photos = blocks.filter((block) => block.type === "photo").length;
      const tables = blocks.filter((block) => block.type === "table").length;
      if (photos > SCOPE_LIMITS.photos) {
        ctx.addIssue({
          code: "custom",
          message: `A proposta aceita até ${SCOPE_LIMITS.photos} fotos no escopo.`,
        });
      }
      if (tables > SCOPE_LIMITS.tables) {
        ctx.addIssue({
          code: "custom",
          message: `A proposta aceita até ${SCOPE_LIMITS.tables} tabelas no escopo.`,
        });
      }
    });

  const proposalCreate = z.object({
    proposalCode: z.string().trim().min(1).max(40),
    revisionNumber: z.number().int().min(0).default(0),
    costEstimateId: id.nullable().optional(),
    clientName: z.string().trim().min(1).max(200),
    cnpj: z.string().trim().min(1).max(20),
    contact: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    site: z.string().trim().min(1).max(300),
    department: z.string().trim().max(200).optional().nullable(),
    sellerUserId: id,
    payload: proposalPayload,
    // `totalValue` NÃO entra, pelo mesmo motivo dos totais do levantamento: o
    // servidor soma os itens de preço do payload com a mesma leitura de moeda
    // que o gerador do documento usa. Aceitá-lo do cliente permitiria mandar ao
    // CRM um valor que o PDF não confirma — e ninguém confere os dois.
  });

  /**
   * Versão otimista obrigatória nos dois PUTs (FR-070). `forceOverwrite` é a
   * segunda tentativa, feita somente depois da confirmação explícita na tela.
   */
  const concurrentUpdate = {
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    forceOverwrite: z.boolean().default(false),
  };

  return {
    MODES: COST_ESTIMATE_MODES,
    COST_STATUSES: COST_ESTIMATE_STATUSES,
    PROPOSAL_STATUSES,
    DOCUMENT_KINDS: PROPOSAL_DOCUMENT_KINDS,
    ATTRIBUTION_KINDS: SALES_ATTRIBUTION_KINDS,
    SECTIONS: COST_SECTIONS,
    STEPS: PROPOSAL_STEPS,
    SCOPE_LIMITS,
    SCOPE_PHOTO_LIMITS,

    costEstimatePayload,
    costEstimateCreate,
    costEstimateUpdate: costEstimateCreate
      .partial({ mode: true })
      .extend(concurrentUpdate),
    scopeContentBlocks,
    proposalCreate,
    proposalUpdate: proposalCreate.partial().extend(concurrentUpdate),

    /** Listagem: o filtro de arquivados é explícito, nunca implícito. */
    listQuery: z.object({
      arquivados: queryBoolean,
      busca: z.string().trim().max(200).default(""),
      status: z.enum(COST_ESTIMATE_STATUSES).optional(),
      page: pagina,
      pageSize: tamanhoDaPagina,
    }),

    /**
     * Emissão dos documentos: só o id da proposta.
     *
     * O conteúdo **não** vem no corpo, ao contrário da prévia. O que se emite é
     * o que está salvo — aceitar o formulário aqui permitiria gerar um documento
     * que o registro não confirma, e é esse documento que vai ao cliente.
     */
    proposalDocumentsRequest: z.object({ proposalId: id }),

    /**
     * Finalização: o id da proposta e o funil do CRM.
     *
     * O funil vem vazio quando o envio está desligado no ambiente — e isso é
     * caminho normal, não erro de preenchimento: os documentos são gerados do
     * mesmo jeito, e é a integração que recusa depois, com o motivo.
     */
    proposalFinalizeRequest: z.object({
      proposalId: id,
      pipelineId: z.string().trim().max(80).default(""),
      /**
       * Pasta já existente no OneDrive (`PROP-CTL-080`, opcional). Havendo
       * valor, os arquivos vão para dentro dela em vez de uma pasta nova — a
       * obra que já tem pasta não pode acabar com os documentos em dois lugares.
       */
      pastaExistente: z.string().trim().max(300).default(""),
    }),

    /** A listagem de propostas aceita busca livre, como o histórico da referência. */
    proposalListQuery: z.object({
      arquivados: queryBoolean,
      busca: z.string().trim().max(200).default(""),
      page: pagina,
      pageSize: tamanhoDaPagina,
    }),

    /**
     * Endereço da sede — configuração do módulo (T131).
     *
     * O teto de tamanho está aqui só para barrar corpo absurdo. As regras que o
     * usuário lê — vazio, curto demais — moram em `configuracao.js`, com
     * mensagem própria, porque um `400` do zod diria "String must contain at
     * least 8 character(s)" a quem só quer saber que faltou a rua.
     */
    comercialSedeUpdate: z.object({
      sedeEndereco: z.string().max(400).default(""),
      /**
       * Preenchido quando o endereço veio de uma sugestão escolhida na lista.
       * Vazio quando foi digitado à mão — e aí o servidor geocodifica.
       */
      sedePlaceId: z.string().trim().max(255).default(""),
    }),

    /** Busca de sugestões de endereço enquanto se digita. */
    enderecoSugestaoQuery: z.object({
      termo: z.string().trim().max(200).default(""),
    }),
  };
}
