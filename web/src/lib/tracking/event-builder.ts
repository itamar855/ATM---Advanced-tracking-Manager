import { sha256Hash, hashEmail, hashPhone } from "../encryption";
import { NormalizedOrder } from "../types";
import { MetaEvent } from "../meta/capi";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Normalização e Hash (regras Meta CAPI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza e hasheia um nome (primeiro ou último) conforme exige a Meta.
 * Remove acentos, converte para lowercase e aplica SHA-256.
 */
function hashName(value: string): string {
  return sha256Hash(
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
  );
}

/**
 * Normaliza e hasheia cidade.
 * Meta exige: lowercase, sem espaços extras, sem acentos, sem pontuação.
 */
function hashCity(value: string): string {
  return sha256Hash(
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
  );
}

/**
 * Normaliza e hasheia estado/província.
 * Meta exige código de 2 letras em lowercase (ex: "sp", "rj").
 */
function hashState(value: string): string {
  return sha256Hash(value.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 2));
}

/**
 * Normaliza e hasheia CEP/ZIP.
 * Remove qualquer caractere não-numérico antes de hashear.
 */
function hashZip(value: string): string {
  return sha256Hash(value.trim().replace(/\D/g, ""));
}

/**
 * Normaliza e hasheia país.
 * Meta exige código ISO 2 letras em lowercase (ex: "br", "us").
 */
function hashCountry(value: string): string {
  return sha256Hash(value.trim().toLowerCase().slice(0, 2));
}

/**
 * Data de nascimento em formato YYYYMMDD → hasheia.
 * Meta aceita: "19900115" → SHA-256.
 */
function hashDateOfBirth(dob: string): string {
  return sha256Hash(dob.replace(/\D/g, ""));
}

/**
 * Gênero: "m" ou "f" em lowercase → hasheia.
 */
function hashGender(gender: string): string {
  const g = gender.trim().toLowerCase();
  if (g === "male" || g === "m") return sha256Hash("m");
  if (g === "female" || g === "f") return sha256Hash("f");
  return sha256Hash(g);
}

/**
 * Identificação estável do cliente para external_id.
 * NUNCA usa order_id — representa o comprador, não a transação.
 */
function getStableCustomerId(order: NormalizedOrder): string | undefined {
  if (order.customer.externalId) {
    return `customer:${order.customer.externalId.trim()}`;
  }
  if (order.customer.email) {
    return `email:${order.customer.email.trim().toLowerCase()}`;
  }
  if (order.customer.phone) {
    const digits = order.customer.phone.replace(/\D/g, "");
    if (digits) return `phone:${digits}`;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos Públicos
// ─────────────────────────────────────────────────────────────────────────────

export type BrowserEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Search"
  | "Lead"
  | "CompleteRegistration"
  | "Subscribe";

export interface BrowserEventSession {
  // Cookies do browser — NÃO hasheados (regra Meta + CEREBRO_TECNICO)
  fbp?: string | null;
  fbc?: string | null;
  // IP e UA do comprador capturados no momento da sessão
  client_ip?: string | null;
  client_user_agent?: string | null;
}

/**
 * Dados do usuário enriquecidos que podem ser coletados no browser
 * (ex: via formulário de checkout, login de cliente, etc.)
 * Todos os campos de PII serão normalizados e hasheados com SHA-256.
 */
export interface BrowserUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  dateOfBirth?: string; // formato YYYYMMDD ou ISO
  gender?: string;      // "m", "f", "male", "female"
  externalId?: string;  // customer ID do sistema
  fbp?: string;         // Facebook Browser ID (cookie 1st-party _fbp)
  fbc?: string;         // Facebook Click ID (cookie 1st-party _fbc)
}

export interface BrowserEventCustomData {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  order_id?: string;
  search_string?: string;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evento de Purchase (Server-side — Webhook Shopify/Zedy)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza e monta o payload Meta CAPI para eventos de Purchase via servidor.
 * Aplica hashing SHA-256 completo em todos os campos PII conforme exige a Meta.
 */
export function buildMetaPurchaseEvent(
  order: NormalizedOrder,
  session: {
    fbp?: string | null;
    fbc?: string | null;
    client_ip?: string | null;
    client_user_agent?: string | null;
    event_source_url?: string | null;
  }
): MetaEvent {
  const eventId = `Purchase_${order.orderId}`;
  const eventTime = order.timestamps.paid
    ? Math.floor(new Date(order.timestamps.paid).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const user_data: MetaEvent["user_data"] = {};

  // ── PII com hash SHA-256 ──
  if (order.customer.email) {
    const h = hashEmail(order.customer.email);
    if (h) user_data.em = [h];
  }
  if (order.customer.phone) {
    const h = hashPhone(order.customer.phone);
    if (h) user_data.ph = [h];
  }
  if (order.customer.firstName) {
    user_data.fn = [hashName(order.customer.firstName)];
  }
  const lastNameToUse = order.customer.lastName || order.customer.firstName || "";
  if (lastNameToUse) {
    user_data.ln = [hashName(lastNameToUse)];
  }
  if (order.address.city) {
    user_data.ct = [hashCity(order.address.city)];
  }
  if (order.address.state) {
    user_data.st = [hashState(order.address.state)];
  }
  if (order.address.zip) {
    user_data.zp = [hashZip(order.address.zip)];
  }
  
  // País sempre garantido (padrão Brasil BR)
  const countryToUse = order.address.country || "BR";
  user_data.co = [hashCountry(countryToUse)];

  // External ID universal garantido em 100% das compras
  const stableId =
    getStableCustomerId(order) ||
    (order.customer.email ? `customer:${order.customer.email.toLowerCase().trim()}` : null) ||
    (order.customer.phone ? `customer:${order.customer.phone.replace(/\D/g, "")}` : null) ||
    `customer:${order.orderId}`;

  if (stableId) {
    user_data.external_id = [sha256Hash(stableId)];
  }

  // ── Sinais de sessão do browser — NÃO hasheados ──
  if (session.fbp) user_data.fbp = session.fbp;
  if (session.fbc) user_data.fbc = session.fbc;
  if (session.client_ip) user_data.client_ip_address = session.client_ip;
  if (session.client_user_agent) user_data.client_user_agent = session.client_user_agent;

  // Custom data
  const content_ids = order.products.map(p => p.id);
  const contents = order.products.map(p => ({
    id: p.id,
    quantity: p.quantity,
    item_price: p.price,
  }));

  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: eventId,
    event_source_url: session.event_source_url || order.trackingParams.event_source_url || "",
    action_source: "website",
    user_data,
    custom_data: {
      value: order.value,
      currency: order.currency || "BRL",
      content_type: "product",
      content_ids,
      contents,
      order_id: order.orderId,
      utm_source: order.trackingParams.utm_source,
      utm_medium: order.trackingParams.utm_medium,
      utm_campaign: order.trackingParams.utm_campaign,
      utm_content: order.trackingParams.utm_content,
      utm_term: order.trackingParams.utm_term,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos de Funil (Browser-side — PageView, ViewContent, AddToCart, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constrói um evento de funil para envio à CAPI via browser.
 *
 * Aplica SHA-256 em TODOS os campos PII disponíveis (email, phone, nome,
 * cidade, estado, CEP, país, data de nascimento, gênero, external_id).
 *
 * Regras do CEREBRO_TECNICO.md:
 * - fbp e fbc NÃO são hasheados — enviados como recebidos do cookie
 * - client_ip e client_user_agent vêm da sessão (captura do browser)
 * - Nunca fabricar fbc se não foi coletado no clique original
 */
export function buildBrowserEvent(
  eventName: BrowserEventName,
  eventId: string,
  eventSourceUrl: string,
  session: BrowserEventSession,
  userData: BrowserUserData = {},
  customData?: BrowserEventCustomData
): MetaEvent {
  const eventTime = Math.floor(Date.now() / 1000);

  const user_data: MetaEvent["user_data"] = {};

  // ── PII com hash SHA-256 (todos os disponíveis) ──
  if (userData.email) {
    const h = hashEmail(userData.email);
    if (h) user_data.em = [h];
  }
  if (userData.phone) {
    const h = hashPhone(userData.phone);
    if (h) user_data.ph = [h];
  }
  if (userData.firstName) {
    user_data.fn = [hashName(userData.firstName)];
  }
  if (userData.lastName) {
    user_data.ln = [hashName(userData.lastName)];
  }
  if (userData.city) {
    user_data.ct = [hashCity(userData.city)];
  }
  if (userData.state) {
    user_data.st = [hashState(userData.state)];
  }
  if (userData.zip) {
    user_data.zp = [hashZip(userData.zip)];
  }
  if (userData.country) {
    user_data.co = [hashCountry(userData.country)];
  }
  if (userData.dateOfBirth) {
    user_data.db = [hashDateOfBirth(userData.dateOfBirth)];
  }
  if (userData.gender) {
    user_data.ge = [hashGender(userData.gender)];
  }
  if (userData.externalId) {
    user_data.external_id = [sha256Hash(`customer:${userData.externalId.trim()}`)];
  } else if (session.fbp) {
    user_data.external_id = [sha256Hash(`visitor:${session.fbp}`)];
  }

  // ── Sinais de sessão — NÃO hasheados ──
  if (session.fbp) user_data.fbp = session.fbp;
  if (session.fbc) user_data.fbc = session.fbc;
  if (session.client_ip) user_data.client_ip_address = session.client_ip;
  if (session.client_user_agent) user_data.client_user_agent = session.client_user_agent;

  // Custom data com defaults
  let builtCustomData: MetaEvent["custom_data"] | undefined;
  if (customData && Object.keys(customData).length > 0) {
    builtCustomData = {
      content_type: "product",
      currency: "BRL",
      ...customData,
    };
    // Remove campos null/undefined
    Object.keys(builtCustomData).forEach(key => {
      if (builtCustomData![key] === undefined || builtCustomData![key] === null) {
        delete builtCustomData![key];
      }
    });
  }

  return {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    event_source_url: eventSourceUrl,
    action_source: "website",
    user_data,
    custom_data: builtCustomData,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: Calcular quais sinais UserData estão presentes (para Health Score)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de chaves de user_data presentes no evento (para log de auditoria).
 */
export function getUserDataKeys(user_data: MetaEvent["user_data"]): string[] {
  return Object.keys(user_data).filter(
    k => user_data[k as keyof typeof user_data] !== undefined
  );
}
