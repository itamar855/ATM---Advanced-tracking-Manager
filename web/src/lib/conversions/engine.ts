import { createAdminClient } from "@/lib/supabase/server";
import { reserveEvent, updateEventResult } from "@/lib/tracking/dedup-engine";
import { buildMetaPurchaseEvent, getUserDataKeys } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent, type MetaEvent } from "@/lib/meta/capi";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { hashEmail, hashPhone } from "@/lib/encryption";
import type { NormalizedOrder } from "@/lib/types";
import { SUBSCRIPTION_KINDS, type ConversionInput, type ConversionKind, type ConversionResult } from "./types";

/**
 * Motor único de conversão do ATM.
 *
 * Recebe uma conversão já normalizada (vinda de qualquer checkout ou da API universal) e:
 *   1. decide qual evento vai para a Meta (ou se é só registro interno);
 *   2. trava a deduplicação;
 *   3. busca a integração Meta DA PRÓPRIA LOJA (nunca de outra);
 *   4. junta os sinais do comprador (fbp, fbc, IP, navegador) pela sessão e pela identidade;
 *   5. envia para a Meta CAPI e grava em `events` (é de lá que o painel lê o faturamento);
 *   6. grava/atualiza o pedido em `orders` e dispara as notificações.
 */

/** Evento da Meta para cada tipo de conversão. null = não vai para a Meta (só registro interno). */
export const META_EVENT_FOR_KIND: Record<ConversionKind, string | null> = {
  lead: "Lead",
  checkout_started: "InitiateCheckout",
  payment_pending: "AddPaymentInfo",
  purchase: "Purchase",
  // A 1ª cobrança da assinatura é a compra que a campanha gerou
  subscription_started: "Purchase",
  trial_started: "StartTrial",
  // Renovação, cancelamento e estorno não são "compra nova": não ensinam errado o algoritmo
  subscription_renewed: null,
  subscription_canceled: null,
  refund: null,
  chargeback: null,
};

/** Pesos usados para estimar a qualidade de correspondência (EMQ) dos sinais enviados. */
const EMQ_WEIGHTS: Record<string, number> = {
  em: 20, ph: 15, fbp: 15, fbc: 10, external_id: 10,
  fn: 5, ln: 5, ct: 5, st: 5, zp: 4, co: 3, db: 2, ge: 1,
};

export function estimateEmqScore(userDataKeys: string[]): number {
  let score = 0;
  for (const key of userDataKeys) score += EMQ_WEIGHTS[key] || 0;
  return Math.min(Math.round(score), 100);
}

/** Extrai o fbclid de um utm_content no formato "Ad|id::fbclid" (padrão Utmify). */
export function fbcFromUtmContent(utmContent?: string, now = Date.now()): string | undefined {
  if (!utmContent || !utmContent.includes("::")) return undefined;
  for (const part of utmContent.split("::")) {
    if (part.length > 40 && /^[a-zA-Z0-9_\-]+$/.test(part)) return `fb.1.${now}.${part}`;
  }
  return undefined;
}

type OrderStatus = "created" | "pix_pending" | "paid" | "refunded" | "cancelled";

/** Status do pedido em `orders` para cada tipo de conversão. null = não mexe em `orders`. */
export function orderStatusFor(input: Pick<ConversionInput, "kind" | "paymentMethod">): OrderStatus | null {
  switch (input.kind) {
    case "checkout_started":
      return "created";
    case "payment_pending":
      return input.paymentMethod === "pix" ? "pix_pending" : "created";
    case "purchase":
    case "subscription_started":
    case "subscription_renewed":
      return "paid";
    case "refund":
    case "chargeback":
      return "refunded";
    default:
      return null;
  }
}

/** Rótulo curto do método de pagamento para as notificações. */
function paymentBadge(method?: string): string {
  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  if (method === "card") return "CARTÃO";
  return "PEDIDO";
}

interface MetaCredentials {
  pixelId: string;
  accessToken: string;
  apiVersion: string;
  testEventCode?: string;
}

/** Integração Meta ativa da loja. Sem fallback para a integração de outra loja. */
async function loadMetaCredentials(storeId: string): Promise<MetaCredentials | null> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("integrations")
    .select("pixel_id, access_token_enc, api_version, config")
    .eq("store_id", storeId)
    .eq("platform", "meta")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (integration?.pixel_id) {
    const accessToken = resolveMetaAccessToken(integration.access_token_enc);
    if (accessToken) {
      return {
        pixelId: String(integration.pixel_id),
        accessToken,
        apiVersion: integration.api_version || "v23.0",
        testEventCode: (integration.config as { test_event_code?: string } | null)?.test_event_code || process.env.META_TEST_EVENT_CODE || undefined,
      };
    }
  }

  // Fallback opcional por variável de ambiente (só se as duas estiverem configuradas)
  if (process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN) {
    return {
      pixelId: process.env.META_PIXEL_ID,
      accessToken: process.env.META_ACCESS_TOKEN,
      apiVersion: "v23.0",
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    };
  }
  return null;
}

interface SessionSignals {
  fbp?: string | null;
  fbc?: string | null;
  client_ip?: string | null;
  client_user_agent?: string | null;
  event_source_url?: string | null;
}

/** Junta os sinais do comprador: payload → sessão do pixel → grafo de identidade. Tudo restrito à loja. */
async function resolveSignals(storeId: string, input: ConversionInput, requestHeaders?: Headers): Promise<SessionSignals> {
  const s: SessionSignals = { ...(input.signals || {}) };
  const trackId = input.tracking.track_id;

  if (!s.fbc) s.fbc = fbcFromUtmContent(input.tracking.utm_content);

  if (trackId) {
    try {
      const supabase = createAdminClient();
      const { data: session } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent, event_source_url")
        .eq("store_id", storeId)
        .eq("track_id", trackId)
        .maybeSingle();
      if (session) {
        s.fbp = s.fbp || session.fbp;
        s.fbc = s.fbc || session.fbc;
        s.client_ip = s.client_ip || session.client_ip;
        s.client_user_agent = s.client_user_agent || session.client_user_agent;
        s.event_source_url = s.event_source_url || session.event_source_url;
      }
    } catch (err) {
      console.warn("[Conversions] Falha ao buscar a sessão:", (err as Error).message);
    }
  }

  if ((!s.fbp || !s.fbc) && (trackId || s.fbp)) {
    try {
      const { getVisitorIdentity } = await import("@/lib/tracking/identity-stitcher");
      const identity = await getVisitorIdentity(storeId, trackId, s.fbp);
      s.fbp = s.fbp || identity.fbp;
      s.fbc = s.fbc || identity.fbc;
    } catch {}
  }

  // A Meta exige o navegador em eventos de site. Último recurso: o cabeçalho da requisição.
  if (!s.client_user_agent && requestHeaders) {
    s.client_user_agent = requestHeaders.get("user-agent") || null;
  }
  return s;
}

function toNormalizedOrder(input: ConversionInput): NormalizedOrder {
  return {
    orderId: input.orderId,
    trackId: input.tracking.track_id,
    value: input.value,
    currency: input.currency,
    customer: { ...input.customer },
    address: { country: "BR", ...(input.address || {}) },
    products: input.products,
    timestamps: { paid: input.occurredAt || new Date().toISOString() },
    trackingParams: Object.fromEntries(
      Object.entries(input.tracking).filter(([, v]) => typeof v === "string" && v !== "")
    ) as Record<string, string>,
  };
}

/** Monta o evento da Meta para a conversão. Exportado para teste. */
export function buildConversionMetaEvent(
  input: ConversionInput,
  metaEventName: string,
  eventId: string,
  signals: SessionSignals
): MetaEvent {
  const event = buildMetaPurchaseEvent(toNormalizedOrder(input), signals);
  event.event_name = metaEventName;
  event.event_id = eventId;
  if (!signals.client_user_agent) event.action_source = "system_generated";

  const custom = event.custom_data || {};
  if (input.products.length === 0) {
    delete custom.content_type;
    delete custom.content_ids;
    delete custom.contents;
  }
  if (metaEventName === "Lead" && !(input.value > 0)) {
    delete custom.value;
    delete custom.currency;
  }
  if (input.subscription?.id) custom.subscription_id = input.subscription.id;
  if (input.subscription?.plan) custom.plan = input.subscription.plan;
  for (const k of Object.keys(custom)) if (custom[k] === undefined || custom[k] === "") delete custom[k];
  event.custom_data = custom;
  return event;
}

async function saveOrder(storeId: string, input: ConversionInput): Promise<void> {
  const status = orderStatusFor(input);
  if (!status || input.isTest) return;
  const now = input.occurredAt || new Date().toISOString();

  const row: Record<string, unknown> = {
    store_id: storeId,
    order_id: input.orderId,
    track_id: input.tracking.track_id || null,
    customer_email_hash: input.customer.email ? hashEmail(input.customer.email) : null,
    customer_phone_hash: input.customer.phone ? hashPhone(input.customer.phone) : null,
    customer_external_id: input.customer.externalId || null,
    value: input.value,
    currency: input.currency,
    products: input.products,
    payment_method: input.paymentMethod || null,
    status,
  };
  if (status === "created" || status === "pix_pending") row.order_created_at = now;
  if (status === "paid") row.order_paid_at = now;
  if (status === "refunded") {
    row.refunded_at = now;
    row.refund_value = input.value;
  }

  try {
    const supabase = createAdminClient();
    // Pendente nunca rebaixa um pedido que já existe (ex.: chegou depois do "pago")
    const isPending = status === "created" || status === "pix_pending";
    if (status === "refunded") {
      // Estorno só atualiza o que mudou, sem apagar o valor original do pedido
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("store_id", storeId)
        .eq("order_id", input.orderId)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("orders")
          .update({ status, refunded_at: row.refunded_at, refund_value: row.refund_value })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
    }
    const { error } = await supabase
      .from("orders")
      .upsert(row, { onConflict: "store_id,order_id", ignoreDuplicates: isPending });
    if (error) throw error;
  } catch (err) {
    console.warn(`[Conversions] Falha ao gravar o pedido ${input.orderId}:`, (err as Error).message);
  }
}

/** ID da campanha da Meta a partir de "nome|id" (padrão das UTMs) ou do utm_id. */
export function campaignIdFrom(tracking: ConversionInput["tracking"]): string | undefined {
  const camp = tracking.utm_campaign || "";
  if (camp.includes("|")) {
    const id = camp.split("|")[1]?.trim();
    if (id) return id;
  }
  return tracking.utm_id || undefined;
}

/** Corpo da função atm_record_subscription_event (migration 029). Exportado para teste. */
export function buildSubscriptionPayload(storeId: string, input: ConversionInput): Record<string, unknown> {
  return {
    store_id: storeId,
    kind: input.kind,
    subscription_id: input.subscription?.id,
    charge_id: input.orderId,
    amount: input.value,
    currency: input.currency,
    interval: input.subscription?.interval || "month",
    plan: input.subscription?.plan,
    occurred_at: input.occurredAt,
    source: input.source,
    track_id: input.tracking.track_id,
    utm_source: input.tracking.utm_source,
    utm_medium: input.tracking.utm_medium,
    utm_campaign: input.tracking.utm_campaign,
    utm_content: input.tracking.utm_content,
    utm_term: input.tracking.utm_term,
    campaign_id: campaignIdFrom(input.tracking),
    email_hash: input.customer.email ? hashEmail(input.customer.email) : undefined,
    external_id: input.customer.externalId,
    payment_method: input.paymentMethod,
  };
}

/** UTMs da visita (sessão do pixel) quando a origem só mandou o track_id. */
async function fillUtmsFromSession(storeId: string, input: ConversionInput): Promise<ConversionInput> {
  const t = input.tracking;
  if (!t.track_id || t.utm_campaign || t.utm_source) return input;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("sessions")
      .select("utm_source, utm_medium, utm_campaign, utm_content, utm_term")
      .eq("store_id", storeId)
      .eq("track_id", t.track_id)
      .maybeSingle();
    if (!data) return input;
    const filled = { ...t };
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
      if (!filled[k] && data[k]) filled[k] = data[k];
    }
    return { ...input, tracking: filled };
  } catch {
    return input;
  }
}

const SUBSCRIPTION_KIND_SET = new Set<ConversionKind>(SUBSCRIPTION_KINDS);

/**
 * Grava o que a conversão muda no banco do ATM (fora a Meta):
 * assinatura + cobrança pela função atômica, ou o pedido comum em `orders`.
 */
async function persistRecords(storeId: string, input: ConversionInput): Promise<void> {
  if (input.isTest) return;
  const isRefund = input.kind === "refund" || input.kind === "chargeback";

  if (SUBSCRIPTION_KIND_SET.has(input.kind) || isRefund) {
    const enriched = await fillUtmsFromSession(storeId, input);
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("atm_record_subscription_event", {
        p: buildSubscriptionPayload(storeId, enriched),
      });
      if (error) throw error;
      // Estorno de um pedido que o ATM ainda não conhecia: registra como estornado
      if (isRefund && (data as { order_found?: boolean } | null)?.order_found === false) await saveOrder(storeId, input);
      return;
    } catch (err) {
      console.warn(
        `[Conversions] Falha ao gravar assinatura/estorno (${input.kind} ${input.orderId}). A migration 029 foi aplicada?`,
        (err as Error).message
      );
      if (input.kind === "trial_started" || input.kind === "subscription_canceled") return;
    }
  }
  await saveOrder(storeId, input);
}

async function notify(storeId: string, input: ConversionInput, type: "approved" | "pending"): Promise<void> {
  try {
    const { dispatchOrderNotification } = await import("@/lib/notifications/notification-service");
    const name = `${input.customer.firstName || ""} ${input.customer.lastName || ""}`.trim() || "Cliente";
    await dispatchOrderNotification({
      storeId,
      orderId: input.orderId,
      type,
      value: input.value,
      currency: input.currency,
      paymentMethod: paymentBadge(input.paymentMethod),
      customerName: name,
      itemsSummary: input.products[0]?.name || input.subscription?.plan,
    });
  } catch (err) {
    console.warn(`[Conversions] Falha na notificação (${input.source}):`, (err as Error).message);
  }
}

function stitchIdentity(storeId: string, input: ConversionInput, signals: SessionSignals): void {
  if (!input.customer.email && !input.customer.phone) return;
  import("@/lib/tracking/identity-stitcher")
    .then(({ stitchVisitorIdentity, enrichAndFlushBufferedEvents, retroactivelyEnrichCompletedEvents }) => {
      const trackId = input.tracking.track_id;
      const pii = {
        email: input.customer.email,
        phone: input.customer.phone,
        firstName: input.customer.firstName || undefined,
        lastName: input.customer.lastName || undefined,
        city: input.address?.city || undefined,
        state: input.address?.state || undefined,
        zip: input.address?.zip || undefined,
        country: input.address?.country || "BR",
        fbp: signals.fbp,
        fbc: signals.fbc,
        client_ip: signals.client_ip,
        client_user_agent: signals.client_user_agent,
      };
      stitchVisitorIdentity(storeId, trackId, signals.fbp, pii).catch(() => {});
      enrichAndFlushBufferedEvents(storeId, trackId, signals.fbp, pii).catch(() => {});
      retroactivelyEnrichCompletedEvents(storeId, trackId, signals.fbp, pii).catch(() => {});
    })
    .catch(() => {});
}

export interface ProcessOptions {
  requestHeaders?: Headers;
}

export async function processConversion(
  storeId: string,
  input: ConversionInput,
  options: ProcessOptions = {}
): Promise<ConversionResult> {
  const metaEventName = META_EVENT_FOR_KIND[input.kind];
  const base = { kind: input.kind, orderId: input.orderId, metaEventName };
  const isApprovedSale = input.kind === "purchase" || input.kind === "subscription_started";
  const isPendingCharge =
    input.kind === "payment_pending" && (input.paymentMethod === "pix" || input.paymentMethod === "boleto");

  // ── Só registro interno (renovação, cancelamento, estorno) ──
  if (!metaEventName) {
    await persistRecords(storeId, input);
    if (input.kind === "subscription_renewed" && !input.isTest) await notify(storeId, input, "approved");
    return {
      ...base,
      ok: true,
      status: 200,
      eventId: null,
      sentToMeta: false,
      message: "Registrado no ATM. Este tipo de evento não é enviado para a Meta.",
    };
  }

  const eventId = input.eventId || `${metaEventName}_${input.orderId}`;

  // ── Deduplicação ──
  if (!input.isTest) {
    const lock = await reserveEvent(storeId, metaEventName, eventId, "server");
    if (!lock.acquired) {
      return { ...base, ok: true, status: 200, eventId, sentToMeta: false, duplicate: true, message: "Evento duplicado ignorado." };
    }
  }

  const startTime = Date.now();
  const credentials = await loadMetaCredentials(storeId);
  const signals = await resolveSignals(storeId, input, options.requestHeaders);
  stitchIdentity(storeId, input, signals);
  const metaEvent = buildConversionMetaEvent(input, metaEventName, eventId, signals);
  const userDataKeys = getUserDataKeys(metaEvent.user_data);
  const emqScore = estimateEmqScore(userDataKeys);

  // Teste sem código de teste da Meta: não envia nada para o pixel de produção
  if (input.isTest && !credentials?.testEventCode) {
    return {
      ...base,
      ok: true,
      status: 200,
      eventId,
      sentToMeta: false,
      dryRun: true,
      emqScore,
      signals: userDataKeys,
      message: "Teste: evento montado, mas não enviado. Configure o código de teste da Meta para enviar.",
      metaResponse: { preview: metaEvent },
    };
  }

  const customerName = `${input.customer.firstName || ""} ${input.customer.lastName || ""}`.trim();
  const recordDetails = (metaResponse: Record<string, unknown>) => ({
    ...metaResponse,
    custom_data: {
      ...(metaEvent.custom_data || {}),
      value: input.value,
      currency: input.currency,
      utm_source: input.tracking.utm_source || undefined,
      utm_campaign: input.tracking.utm_campaign || undefined,
      utm_medium: input.tracking.utm_medium || undefined,
      payment_method: input.paymentLabel || input.paymentMethod || undefined,
    },
    order_details: {
      order_id: input.orderId,
      source: input.source,
      kind: input.kind,
      value: input.value,
      currency: input.currency,
      customer_name: customerName || undefined,
      customer_email: input.customer.email || undefined,
      customer_phone: input.customer.phone || undefined,
      payment_method: input.paymentLabel || input.paymentMethod || undefined,
      utm_source: input.tracking.utm_source || undefined,
      utm_campaign: input.tracking.utm_campaign || undefined,
      tracking_params: input.tracking,
      subscription: input.subscription,
    },
    fbp: signals.fbp || undefined,
    fbc: signals.fbc || undefined,
  });

  if (!credentials) {
    if (!input.isTest) {
      await updateEventResult(
        storeId, eventId, "server", "failed",
        recordDetails({ error: "Integração Meta não configurada para esta loja." }),
        Date.now() - startTime, userDataKeys, metaEventName, input.orderId, emqScore
      );
      await persistRecords(storeId, input);
      if (isApprovedSale) await notify(storeId, input, "approved");
      else if (isPendingCharge) await notify(storeId, input, "pending");
    }
    return {
      ...base,
      ok: false,
      status: 200,
      eventId,
      sentToMeta: false,
      emqScore,
      signals: userDataKeys,
      error: "Integração Meta não configurada para esta loja. A venda foi registrada, mas não foi enviada.",
    };
  }

  const metaResponse = await sendMetaCAPIEvent(
    {
      pixelId: credentials.pixelId,
      accessToken: credentials.accessToken,
      apiVersion: credentials.apiVersion,
      testEventCode: credentials.testEventCode,
    },
    metaEvent
  );
  const latencyMs = Date.now() - startTime;

  if (!input.isTest) {
    await updateEventResult(
      storeId, eventId, "server", metaResponse.ok ? "accepted" : "rejected",
      recordDetails((metaResponse.response as Record<string, unknown>) || { error: metaResponse.error }),
      latencyMs, userDataKeys, metaEventName, input.orderId, emqScore
    );
    await persistRecords(storeId, input);
    if (isApprovedSale) await notify(storeId, input, "approved");
    else if (isPendingCharge) await notify(storeId, input, "pending");
  }

  return {
    ...base,
    ok: metaResponse.ok,
    status: 200,
    eventId,
    sentToMeta: true,
    emqScore,
    signals: userDataKeys,
    error: metaResponse.ok ? undefined : metaResponse.error,
    metaResponse: metaResponse.response,
  };
}
