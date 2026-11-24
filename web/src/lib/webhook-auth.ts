import crypto from "crypto";
import { verifyHmac, decrypt } from "./encryption";

/**
 * Autenticação dos webhooks de checkout.
 *
 * - Zedy, Vega e Gateway7 não assinam o corpo da requisição, então cada loja recebe
 *   uma URL com um token secreto (?token=...). O token é derivado de uma chave do
 *   servidor + ID da loja: não precisa ser guardado no banco e muda quando a chave muda.
 * - Shopify assina o corpo com HMAC-SHA256 (cabeçalho x-shopify-hmac-sha256).
 */

function getWebhookKey(): string {
  const key = process.env.ATM_WEBHOOK_SECRET || process.env.ATM_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("[ATM] ATM_WEBHOOK_SECRET (ou ATM_ENCRYPTION_KEY) não configurada: webhooks não podem ser validados.");
  }
  return key;
}

/** Token secreto da URL de webhook de uma loja. */
export function webhookTokenFor(storeId: string): string {
  return crypto.createHmac("sha256", getWebhookKey()).update(`atm-webhook:${storeId}`).digest("hex").slice(0, 40);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Aceita o token em ?token=, no cabeçalho x-atm-webhook-token ou em Authorization: Bearer. */
export function isValidWebhookToken(request: Request, storeId: string): boolean {
  let provided = "";
  try {
    const bearer = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    provided =
      new URL(request.url).searchParams.get("token") || request.headers.get("x-atm-webhook-token") || bearer;
  } catch {
    return false;
  }
  if (!provided || !storeId) return false;
  try {
    return safeEqual(provided, webhookTokenFor(storeId));
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }
}

/** Segredos que podem ter assinado um webhook da Shopify para esta loja. */
export function shopifyWebhookSecrets(store: {
  webhook_secret?: string | null;
  settings?: { shopify?: { client_secret_enc?: string | null; webhook_secret?: string | null } } | null;
} | null): string[] {
  const secrets: string[] = [];
  if (store?.webhook_secret) secrets.push(store.webhook_secret);
  if (store?.settings?.shopify?.webhook_secret) secrets.push(store.settings.shopify.webhook_secret);
  if (store?.settings?.shopify?.client_secret_enc) {
    try {
      secrets.push(decrypt(store.settings.shopify.client_secret_enc));
    } catch {
      // segredo ilegível: ignora
    }
  }
  for (const env of [process.env.SHOPIFY_API_SECRET, process.env.SHOPIFY_CLIENT_SECRET]) {
    if (env) secrets.push(env);
  }
  return Array.from(new Set(secrets.filter(Boolean)));
}

/** Valida o HMAC da Shopify contra qualquer um dos segredos conhecidos da loja. */
export function isValidShopifyHmac(rawBody: string, hmacHeader: string | null, secrets: string[]): boolean {
  if (!hmacHeader) return false;
  return secrets.some((secret) => verifyHmac(rawBody, hmacHeader, secret));
}
