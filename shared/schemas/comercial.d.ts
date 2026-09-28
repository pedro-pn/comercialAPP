/**
 * Tipos do contrato compartilhado do módulo Comercial.
 *
 * Escrito à mão, no padrão de `estoque.d.ts` e `qualidade.d.ts`: os schemas Zod são
 * construídos em tempo de execução a partir da instância que o chamador passa, então
 * não há como derivá-los. O que interessa ao TypeScript são as **constantes** — elas
 * atravessam para a tela e um número errado aqui vira limite errado lá.
 */

export type ComercialSchema = {
  parse: (value: unknown) => unknown;
  safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown };
};

export type ScopePhotoLimits = {
  allowedTypes: string[];
  /** Depois da otimização no cliente. */
  maxBytes: number;
  /** Corpo inteiro da requisição. */
  maxRequestBytes: number;
  /** Arquivo original, antes de otimizar. */
  maxOriginalBytes: number;
  maxMegapixels: number;
  /** Maior lado, depois do redimensionamento. */
  maxEdgePixels: number;
};

export const SCOPE_PHOTO_LIMITS: ScopePhotoLimits;

export const IMAGE_SIGNATURES: Record<string, number[][]>;

/**
 * Se os bytes correspondem ao tipo declarado.
 *
 * Confiar no `Content-Type` é confiar em quem envia — um arquivo qualquer renomeado
 * para `.jpg` chega com `image/jpeg`.
 */
export function matchesImageSignature(
  bytes: Uint8Array | ArrayBuffer,
  contentType: string
): boolean;

export type ComercialSchemas = {
  COST_ESTIMATE_MODES: readonly string[];
  costEstimateCreate: ComercialSchema;
  costEstimateUpdate: ComercialSchema;
  listQuery: ComercialSchema;
};

export function makeComercialSchemas(zod: unknown): ComercialSchemas;
