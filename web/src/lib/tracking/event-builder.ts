import { sha256Hash, hashEmail, hashPhone } from "../encryption";
import { NormalizedOrder } from "../types";
import { MetaEvent } from "../meta/capi";

/**
 * Padrão de identificação estável para external_id sem usar CPF e nunca usando orderId puro.
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
    if (digits) {
      return `phone:${digits}`;
    }
  }

  return undefined;
}

/**
 * Normaliza e monta o payload Meta CAPI baseado na sessão de atribuição (bridge) e nos dados do webhook.
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
  // Padrão ouro validado de deduplicação: prefixo "Purchase_" + orderId
  const eventId = `Purchase_${order.orderId}`;
  
  // Prioriza o horário de pagamento do webhook. Caso não possua, assume o momento atual.
  const eventTime = order.timestamps.paid
    ? Math.floor(new Date(order.timestamps.paid).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  // Mapeamento dos parâmetros do usuário (UserData) com hash obrigatório de PII
  const user_data: MetaEvent["user_data"] = {};

  if (order.customer.email) {
    user_data.em = [hashEmail(order.customer.email)];
  }
  
  if (order.customer.phone) {
    user_data.ph = [hashPhone(order.customer.phone)];
  }

  if (order.customer.firstName) {
    user_data.fn = [sha256Hash(order.customer.firstName)];
  }

  if (order.customer.lastName) {
    user_data.ln = [sha256Hash(order.customer.lastName)];
  }

  if (order.address.city) {
    user_data.ct = [sha256Hash(order.address.city)];
  }

  if (order.address.state) {
    user_data.st = [sha256Hash(order.address.state)];
  }

  if (order.address.zip) {
    user_data.zp = [sha256Hash(order.address.zip.replace(/\D/g, ""))];
  }

  if (order.address.country) {
    user_data.country = [sha256Hash(order.address.country)];
  }

  // Identificação do cliente (Regra crítica: nunca orderId)
  const stableId = getStableCustomerId(order);
  if (stableId) {
    user_data.external_id = [sha256Hash(stableId)];
  }

  // Informações de sessão do browser
  if (session.fbp) user_data.fbp = session.fbp;
  if (session.fbc) user_data.fbc = session.fbc; // fbc é mantido raw, sem hash
  if (session.client_ip) user_data.client_ip_address = session.client_ip;
  if (session.client_user_agent) user_data.client_user_agent = session.client_user_agent;

  // Custom data
  const content_ids = order.products.map(p => p.id);
  const contents = order.products.map(p => ({
    id: p.id,
    quantity: p.quantity,
    item_price: p.price
  }));

  const custom_data = {
    value: order.value,
    currency: order.currency || "BRL",
    content_type: "product",
    content_ids,
    contents,
    order_id: order.orderId, // Armazenado no escopo customizado
    // Preserva as UTMs de marketing enviadas pelo checkout
    utm_source: order.trackingParams.utm_source,
    utm_medium: order.trackingParams.utm_medium,
    utm_campaign: order.trackingParams.utm_campaign,
    utm_content: order.trackingParams.utm_content,
    utm_term: order.trackingParams.utm_term
  };

  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: eventId,
    event_source_url: session.event_source_url || order.trackingParams.event_source_url || "",
    action_source: "website",
    user_data,
    custom_data
  };
}
