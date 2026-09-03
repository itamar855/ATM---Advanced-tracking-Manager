import { decrypt } from "@/lib/encryption";

/**
 * Normaliza e resolve o token de acesso da Meta a partir de qualquer formato:
 * 1. String pura com prefixo EAA...
 * 2. String hexadecimal de coluna BYTEA do PostgreSQL (\x7b... ou \\x7b...)
 * 3. Objeto ou string JSON contendo { access_token: "..." }
 * 4. String criptografada via AES-256-GCM (decrypt)
 * 5. String com aspas envolventes ou espaços
 */
export function resolveMetaAccessToken(raw: any): string | null {
  if (!raw) return null;

  // 1. Se já for um objeto JS
  if (typeof raw === "object") {
    if (raw.access_token && typeof raw.access_token === "string") {
      return resolveMetaAccessToken(raw.access_token);
    }
    if (raw.token && typeof raw.token === "string") {
      return resolveMetaAccessToken(raw.token);
    }
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
    } catch (e) {
      console.warn("[resolveMetaAccessToken] Falha ao decodificar hex BYTEA:", e);
    }
  }

  // 3. Se for string JSON { "access_token": ... }
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const parsed = JSON.parse(str);
      if (parsed.access_token) {
        return resolveMetaAccessToken(parsed.access_token);
      }
      if (parsed.token) {
        return resolveMetaAccessToken(parsed.token);
      }
    } catch {
      // Se não for JSON válido, segue o fluxo
    }
  }

  // 4. Se for token puro direto da Meta (começa com EAA)
  if (str.startsWith("EAA")) {
    return str;
  }

  // 5. Tenta descriptografia AES-256-GCM
  try {
    const decrypted = decrypt(str).trim();
    if (decrypted) {
      // O valor descriptografado pode ser EAA... ou um JSON
      const nested = resolveMetaAccessToken(decrypted);
      if (nested) return nested;
    }
  } catch {
    // Não era uma string criptografada com AES-256-GCM
  }

  // 6. Último recurso: verifica se contém uma substring de token Meta (EAA...)
  const match = str.match(/EAA[A-Za-z0-9_-]+/);
  if (match) {
    return match[0];
  }

  return null;
}
