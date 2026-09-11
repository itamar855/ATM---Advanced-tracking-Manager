import { decrypt } from "@/lib/encryption";

/**
 * Validador estrito de token puro da Meta.
 * Tokens legítimos começam com EAA (ex: EAAB para tokens de BM/System User, EAAP para User Tokens),
 * contêm apenas caracteres alfanuméricos, underscore e hífen, com comprimento mínimo >= 20.
 * Garante terminantemente que JSON, HEX, escapes de BYTEA ou strings corrompidas nunca sejam considerados tokens.
 */
export function isCleanMetaToken(val: string | null | undefined): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("\\x") ||
    trimmed.startsWith("\\\\x") ||
    trimmed.includes(":") ||
    trimmed.includes('"') ||
    trimmed.includes("'")
  ) {
    return false;
  }
  return /^EAA[A-Za-z0-9_-]{20,}$/.test(trimmed);
}

/**
 * Normaliza e resolve o token de acesso da Meta a partir de qualquer formato histórico:
 * 1. String pura com prefixo EAA... (EAAB, EAAP, etc.)
 * 2. String hexadecimal de coluna BYTEA do PostgreSQL (\x... ou \\x...)
 * 3. Objeto ou string JSON contendo { access_token: "..." }, { token: "..." } ou embutido
 * 4. String criptografada via AES-256-GCM (decrypt)
 * 5. String com aspas envolventes ou espaços
 * 6. Recuperação resiliente de substring EAAB/EAAP embutida em payloads antigos
 *
 * REGRA ABSOLUTA: NUNCA retorna JSON, HEX, objeto ou token malformado.
 */
export function resolveMetaAccessToken(raw: any): string | null {
  if (!raw) return null;

  // Se for Buffer do Node.js
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }

  // 1. Se já for um objeto JS
  if (typeof raw === "object") {
    if (raw.access_token) {
      const resolved = resolveMetaAccessToken(raw.access_token);
      if (resolved) return resolved;
    }
    if (raw.token) {
      const resolved = resolveMetaAccessToken(raw.token);
      if (resolved) return resolved;
    }
    // Varredura segura em propriedades
    for (const key of Object.keys(raw)) {
      const val = raw[key];
      if (typeof val === "string" || (val && typeof val === "object")) {
        const nested = resolveMetaAccessToken(val);
        if (nested) return nested;
      }
    }
    return null;
  }

  let str = String(raw).trim();

  // Remove aspas duplas ou simples envolventes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }

  // 2. Se for string hexadecimal de PostgreSQL BYTEA (\x... ou \\x...)
  if (/^\\+x/i.test(str)) {
    try {
      const hex = str.replace(/^\\+x/i, "");
      if (hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
        const decoded = Buffer.from(hex, "hex").toString("utf8").trim();
        if (decoded) {
          const nested = resolveMetaAccessToken(decoded);
          if (nested) return nested;
        }
      }
    } catch {
      // Ignora erro de decodificação hex
    }
  }

  // 3. Se for string JSON
  if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
    try {
      const parsed = JSON.parse(str);
      const nested = resolveMetaAccessToken(parsed);
      if (nested) return nested;
    } catch {
      // Se não for JSON válido, segue o fluxo
    }
  }

  // 4. Se for token puro direto da Meta (começa com EAA, ex: EAAB, EAAP)
  if (isCleanMetaToken(str)) {
    return str;
  }

  // 5. Tenta descriptografia AES-256-GCM
  try {
    const decrypted = decrypt(str).trim();
    if (decrypted) {
      const nested = resolveMetaAccessToken(decrypted);
      if (nested) return nested;
    }
  } catch {
    // Não era uma string criptografada com AES-256-GCM
  }

  // 6. Recuperação segura de token Meta embutido em payloads antigos (EAAB, EAAP, EAA...)
  const match = str.match(/EAA[A-Za-z0-9_-]{20,}/);
  if (match && isCleanMetaToken(match[0])) {
    return match[0];
  }

  // NUNCA retornar JSON, HEX ou string arbitrária
  return null;
}
