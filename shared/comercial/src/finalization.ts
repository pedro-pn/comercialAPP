export const MAX_FINALIZATION_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_FINALIZATION_REQUEST_BYTES = 22 * 1024 * 1024;

export type FinalizeApiResult = {
  message?: string;
  error?: string;
  complete?: boolean;
  saved?: boolean;
  nectarComplete?: boolean;
  historySaved?: boolean;
  opportunityId?: string;
  folder?: string;
};

export type FinalizationStage =
  | "geração dos PDFs"
  | "preparação dos arquivos"
  | "envio às integrações"
  | "leitura da resposta";

export class FinalizeResponseError extends Error {
  readonly status: number;
  readonly requestId: string;

  constructor(
    message: string,
    status: number,
    requestId = "",
  ) {
    super(message);
    this.name = "FinalizeResponseError";
    this.status = status;
    this.requestId = requestId;
  }
}

export function proposalPdfFileName(
  type: "Comercial" | "Técnica",
  proposalCode: string,
  clientName: string,
) {
  return sanitizeDisplayFileName(
    `Proposta ${type} - ${proposalCode} - ${clientName}.pdf`,
    `Proposta ${type}.pdf`,
  );
}

export function sanitizeDisplayFileName(value: string, fallback = "arquivo") {
  const cleaned = String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s+(\.[A-Za-z0-9]{1,10})$/g, "$1")
    .replace(/[. ]+$/g, "")
    .trim();
  return limitFileName(cleaned || fallback, 180);
}

export function transportFileName(value: string, fallback = "arquivo") {
  const displayName = sanitizeDisplayFileName(value, fallback);
  const ascii = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/[^A-Za-z0-9 ._()\-]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/\s+(\.[A-Za-z0-9]{1,10})$/g, "$1")
    .replace(/[. ]+$/g, "")
    .trim();
  return limitFileName(ascii || sanitizeDisplayFileName(fallback, "arquivo"), 160);
}

export function totalUploadBytes(files: ArrayLike<{ size: number }>) {
  return Array.from(files).reduce((total, file) => total + Math.max(0, Number(file.size) || 0), 0);
}

export function validateFinalizationUploadSize(files: ArrayLike<{ size: number }>) {
  const total = totalUploadBytes(files);
  if (total <= MAX_FINALIZATION_UPLOAD_BYTES) return "";
  return `Os dois PDFs e os anexos somam ${formatFileSize(total)}. O limite por finalização é ${formatFileSize(MAX_FINALIZATION_UPLOAD_BYTES)}. Remova ou compacte anexos grandes e tente novamente.`;
}

export async function readFinalizeResponse(response: Response): Promise<FinalizeApiResult> {
  const requestId = response.headers.get("cf-ray")
    || response.headers.get("x-request-id")
    || "";
  let text = "";
  try {
    text = await response.text();
  } catch {
    throw new FinalizeResponseError(
      httpFailureMessage(response.status),
      response.status,
      requestId,
    );
  }

  let payload: FinalizeApiResult | null = null;
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as FinalizeApiResult;
      }
    } catch {
      // Respostas HTML ou vazias podem ser geradas pela infraestrutura antes de
      // a requisição chegar à rota. O status HTTP é mais útil do que o SyntaxError.
    }
  }

  if (!response.ok) {
    throw new FinalizeResponseError(
      payload?.error || httpFailureMessage(response.status),
      response.status,
      requestId,
    );
  }
  if (!payload) {
    throw new FinalizeResponseError(
      "O servidor devolveu uma resposta inválida ao concluir as integrações. Os PDFs continuam válidos; tente finalizar novamente.",
      response.status,
      requestId,
    );
  }
  return payload;
}

export function describeFinalizationError(error: unknown, stage: FinalizationStage) {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const genericWebKitSyntax = /the string did not match the expected pattern/i.test(rawMessage);
  const base = genericWebKitSyntax
    ? "A resposta da integração chegou em um formato inválido."
    : rawMessage || "Não foi possível concluir a proposta.";
  const requestId = error instanceof FinalizeResponseError && error.requestId
    ? ` Referência: ${error.requestId}.`
    : "";
  return `Falha na ${stage}: ${base}${requestId}`;
}

function httpFailureMessage(status: number) {
  if (status === 401 || status === 403) {
    return "Sua sessão de acesso expirou. Entre novamente no app e repita a finalização.";
  }
  if (status === 413) {
    return "O pacote com os PDFs e anexos excedeu o limite de envio. Remova ou compacte anexos grandes e tente novamente.";
  }
  if ([408, 429, 502, 503, 504].includes(status)) {
    return `A integração ficou temporariamente indisponível ou demorou além do limite (HTTP ${status}). Tente finalizar novamente.`;
  }
  return status
    ? `O servidor não concluiu as integrações (HTTP ${status}). Tente novamente.`
    : "A conexão foi interrompida antes da conclusão das integrações. Tente novamente.";
}

function limitFileName(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  const extensionMatch = value.match(/(\.[A-Za-z0-9]{1,10})$/);
  const extension = extensionMatch?.[1] || "";
  const base = extension ? value.slice(0, -extension.length) : value;
  return `${base.slice(0, Math.max(1, maximum - extension.length)).trim()}${extension}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
