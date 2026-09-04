import crypto from "crypto";

const DEFAULT_SECRET = process.env.ATM_ENCRYPTION_KEY || "atm-shopify-oauth-secret-fallback-key-32b";

/**
 * Escopos necessários para leitura de pedidos, produtos e clientes
 * permitindo o cálculo real do faturamento e lucro líquido.
 */
export const SHOPIFY_OAUTH_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_customers"
].join(",");

/**
 * Assina um state OAuth com HMAC SHA-256 contendo storeId, clientId e timestamp.
 * Permite que a URL de autorização seja aberta em qualquer navegador (ex: aba anônima
 * ou navegador onde a loja Shopify está logada), sem depender de cookies locais de sessão.
 */
export function signOAuthState(storeId: string, clientId: string = ""): string {
  const timestamp = Date.now();
  const payload = `${storeId}:${clientId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", DEFAULT_SECRET).update(payload).digest("hex");
  const data = Buffer.from(JSON.stringify({ storeId, clientId, timestamp, hmac })).toString("base64url");
  return data;
}

/**
 * Valida a integridade do state retornado pela Shopify no callback.
 * Validade: 60 minutos (para permitir que o lojista copie o link com calma).
 */
export function verifyOAuthState(stateString: string): {
  valid: boolean;
  storeId?: string;
  clientId?: string;
  error?: string;
} {
  try {
    const raw = Buffer.from(stateString, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    const { storeId, clientId, timestamp, hmac } = parsed;

    if (!storeId || !timestamp || !hmac) {
      return { valid: false, error: "State incompleto ou malformado." };
    }

    // Validação de expiração (60 minutos)
    const maxAgeMs = 60 * 60 * 1000;
    if (Date.now() - Number(timestamp) > maxAgeMs) {
      return { valid: false, error: "O link de autorização expirou. Gere um novo link no painel da ATM." };
    }

    const payload = `${storeId}:${clientId || ""}:${timestamp}`;
    const expectedHmac = crypto.createHmac("sha256", DEFAULT_SECRET).update(payload).digest("hex");

    if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return { valid: true, storeId, clientId };
    }

    return { valid: false, error: "Assinatura do state inválida." };
  } catch (err: any) {
    return { valid: false, error: "Falha ao decodificar state: " + err.message };
  }
}

/**
 * Monta a URL oficial de autorização da Shopify
 */
export function buildShopifyAuthorizeUrl(params: {
  shop: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const cleanShop = params.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();

  const url = new URL(`https://${cleanShop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", params.clientId.trim());
  url.searchParams.set("scope", SHOPIFY_OAUTH_SCOPES);
  url.searchParams.set("redirect_uri", params.redirectUri.trim());
  url.searchParams.set("state", params.state);

  return url.toString();
}
