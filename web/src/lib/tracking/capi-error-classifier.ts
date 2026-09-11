/**
 * lib/tracking/capi-error-classifier.ts
 *
 * Classificador de Erros da Meta Conversions API (CAPI).
 * Separa com precisão cirúrgica erros PERMANENTES (Dead Letter Queue imediata)
 * de erros TEMPORÁRIOS (elegíveis para retry com backoff).
 */

export type CapiErrorCategory = "PERMANENT" | "TEMPORARY";

export interface CapiErrorClassification {
  category: CapiErrorCategory;
  reason: string;
  isPermanent: boolean;
  shouldRetry: boolean;
  errorCode?: number;
  errorSubcode?: number;
  description: string;
}

/**
 * Classifica um erro ocorrido durante o ciclo de vida ou despacho de um evento Meta CAPI.
 *
 * @param error Objeto de erro ou mensagem (catch block ou response.error da Meta)
 * @param httpStatus Código HTTP retornado pela Meta (ex: 200, 400, 429, 500, etc.)
 */
export function classifyCapiError(error: any, httpStatus?: number): CapiErrorClassification {
  // 1. Extração de campos do erro da Meta (data.error)
  const metaError = error?.error || error;
  const errorCode = typeof metaError?.code === "number" ? metaError.code : undefined;
  const errorSubcode = typeof metaError?.error_subcode === "number" ? metaError.error_subcode : undefined;
  const message = String(metaError?.message || error?.message || error || "").toLowerCase();
  const isTransient = Boolean(metaError?.is_transient);

  // ---------------------------------------------------------------------------
  // A. ERROS PERMANENTES (Dead Letter Queue imediata - NUNCA sofrem retry)
  // ---------------------------------------------------------------------------

  // A1. Evento muito antigo / fora da janela permitida de 7 dias da Meta CAPI
  if (errorSubcode === 2804003 || message.includes("muito no passado") || message.includes("older than 7 days") || message.includes("expired_meta_7d_window")) {
    return {
      category: "PERMANENT",
      reason: "expired_meta_7d_window",
      isPermanent: true,
      shouldRetry: false,
      errorCode,
      errorSubcode: errorSubcode || 2804003,
      description: "Registro de data e hora do evento fora da janela de 7 dias da Meta CAPI",
    };
  }

  // A2. Token / permissão revogada ou inválida (Code 190)
  if (errorCode === 190 || message.includes("error validating access token") || message.includes("session has expired")) {
    return {
      category: "PERMANENT",
      reason: "invalid_meta_token_or_permission",
      isPermanent: true,
      shouldRetry: false,
      errorCode: 190,
      errorSubcode,
      description: "Token de acesso da Meta revogado ou permissões inválidas",
    };
  }

  // A3. Parâmetro inválido permanente (Code 100 sem flag de transitoriedade)
  // Obs: Erros 100 da Meta indicam payload malformado, campo ausente ou valor incompatível.
  if (errorCode === 100 && !isTransient) {
    return {
      category: "PERMANENT",
      reason: "invalid_capi_parameters",
      isPermanent: true,
      shouldRetry: false,
      errorCode: 100,
      errorSubcode,
      description: metaError?.message || "Parâmetros do evento inválidos ou rejeitados pela Meta",
    };
  }

  // ---------------------------------------------------------------------------
  // B. ERROS TEMPORÁRIOS (Elegíveis para retry com incremento de tentativa)
  // ---------------------------------------------------------------------------

  // B1. Rate limit da Meta (Code 17: User limit, Code 32: App limit, Code 613: Custom limit, ou HTTP 429)
  if (httpStatus === 429 || errorCode === 17 || errorCode === 32 || errorCode === 613 || message.includes("rate limit") || message.includes("too many requests")) {
    return {
      category: "TEMPORARY",
      reason: "meta_rate_limit_exceeded",
      isPermanent: false,
      shouldRetry: true,
      errorCode: errorCode || 613,
      errorSubcode,
      description: "Limite de requisições por segundo/minuto da Meta atingido",
    };
  }

  // B2. Timeout de conexão / abort signal
  if (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("fetch failed")
  ) {
    return {
      category: "TEMPORARY",
      reason: "network_or_timeout",
      isPermanent: false,
      shouldRetry: true,
      errorCode,
      errorSubcode,
      description: "Falha transitória de conexão de rede ou timeout com a Meta",
    };
  }

  // B3. Erros 5xx internos da Meta (HTTP >= 500, Code 1 ou Code 2) ou flag is_transient=true
  if ((httpStatus && httpStatus >= 500) || errorCode === 1 || errorCode === 2 || isTransient) {
    return {
      category: "TEMPORARY",
      reason: "meta_service_transient_error",
      isPermanent: false,
      shouldRetry: true,
      errorCode: errorCode || 1,
      errorSubcode,
      description: "Instabilidade transitória ou erro interno nos servidores da Meta",
    };
  }

  // ---------------------------------------------------------------------------
  // C. FALLBACK DEFAULT
  // ---------------------------------------------------------------------------
  // Por padrão, se for status 4xx não-transitório da Meta, classifica como permanente
  if (httpStatus && httpStatus >= 400 && httpStatus < 500 && !isTransient) {
    return {
      category: "PERMANENT",
      reason: "client_error_unrecoverable",
      isPermanent: true,
      shouldRetry: false,
      errorCode,
      errorSubcode,
      description: metaError?.message || `Erro cliente 4xx não recuperável da Meta (HTTP ${httpStatus})`,
    };
  }

  // Se nada foi determinado, trata como temporário conservador
  return {
    category: "TEMPORARY",
    reason: "unknown_transient_error",
    isPermanent: false,
    shouldRetry: true,
    errorCode,
    errorSubcode,
    description: message || "Erro desconhecido, marcado para retry conservador",
  };
}
