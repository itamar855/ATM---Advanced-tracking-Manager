/* eslint-disable @typescript-eslint/no-explicit-any -- payloads de terceiros chegam sem formato fixo; cada campo é validado ao ler */
import {
  CONVERSION_KINDS,
  SUBSCRIPTION_KINDS,
  type AdapterResult,
  type BillingInterval,
  type ConversionKind,
  type PaymentMethod,
} from "../types";
import { compact, firstString, splitName } from "./util";

/**
 * Adaptador da API universal do ATM: POST /api/v1/conversions/<loja>
 *
 * Formato (só "event" e "id" são obrigatórios):
 * {
 *   "event": "purchase",                 // ver EVENT_ALIASES abaixo
 *   "id": "txn_123",                     // ID único da transação/lead/cobrança
 *   "event_id": "Purchase_txn_123",      // opcional: mesmo ID mandado pelo pixel, para deduplicar
 *   "value": 97.00,                      // ou "value_in_cents": 9700
 *   "currency": "BRL",
 *   "payment_method": "pix",             // pix | boleto | card | other
 *   "occurred_at": "2026-11-23T12:00:00Z",
 *   "test": false,
 *   "customer": { "email", "phone", "name" | "first_name" + "last_name", "id" },
 *   "address": { "city", "state", "zip", "country" },
 *   "products": [{ "id", "name", "quantity", "price" }],
 *   "tracking": { "track_id", "fbp", "fbc", "utm_source", "utm_medium", "utm_campaign",
 *                 "utm_content", "utm_term", "utm_id", "ip", "user_agent", "page_url" },
 *   "subscription": { "id", "plan", "interval" }  // id obrigatório nos eventos de assinatura;
 *                                                  // interval: day|week|month|quarter|semester|year (ou mensal, anual...)
 * }
 */

const EVENT_ALIASES: Record<string, ConversionKind> = {
  // português
  cadastro: "lead",
  checkout_iniciado: "checkout_started",
  pix_gerado: "payment_pending",
  boleto_gerado: "payment_pending",
  pagamento_pendente: "payment_pending",
  compra_aprovada: "purchase",
  venda_aprovada: "purchase",
  reembolso: "refund",
  estorno: "refund",
  trial_iniciado: "trial_started",
  assinatura_iniciada: "subscription_started",
  assinatura_renovada: "subscription_renewed",
  assinatura_cancelada: "subscription_canceled",
  // inglês alternativo
  initiate_checkout: "checkout_started",
  pix_generated: "payment_pending",
  subscription_cancelled: "subscription_canceled",
};

export function resolveEventKind(raw: unknown): ConversionKind | null {
  const key = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CONVERSION_KINDS as readonly string[]).includes(key)) return key as ConversionKind;
  return EVENT_ALIASES[key] || null;
}

const PAYMENT_METHODS: PaymentMethod[] = ["pix", "boleto", "card", "other"];

const INTERVAL_ALIASES: Record<string, BillingInterval> = {
  day: "day", daily: "day", diario: "day", diaria: "day",
  week: "week", weekly: "week", semanal: "week",
  month: "month", monthly: "month", mensal: "month", mes: "month",
  quarter: "quarter", quarterly: "quarter", trimestral: "quarter",
  semester: "semester", semiannual: "semester", semestral: "semester",
  year: "year", yearly: "year", annual: "year", anual: "year", ano: "year",
};

/** "Mensal", "monthly", "month" → "month". undefined se vazio, null se inválido. */
export function resolveInterval(raw: unknown): BillingInterval | null | undefined {
  const key = String(raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!key) return undefined;
  return INTERVAL_ALIASES[key] || null;
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function parseAtmApi(body: any): AdapterResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, ignored: false, error: "O corpo precisa ser um objeto JSON." };
  }

  const kind = resolveEventKind(body.event);
  if (!kind) {
    return {
      ok: false,
      ignored: false,
      error: `Campo "event" inválido. Use um destes: ${CONVERSION_KINDS.join(", ")}.`,
    };
  }

  const orderId = firstString(body.id, body.order_id, body.transaction_id);
  if (!orderId) return { ok: false, ignored: false, error: 'Campo "id" é obrigatório (ID único da transação ou do lead).' };
  if (orderId.length > 200) return { ok: false, ignored: false, error: 'Campo "id" muito longo (máx. 200).' };

  let value = toNumber(body.value);
  const cents = toNumber(body.value_in_cents);
  if (value === null && cents !== null) value = Number.isNaN(cents) ? NaN : cents / 100;
  if (Number.isNaN(value) || (value !== null && value < 0)) {
    return { ok: false, ignored: false, error: 'Campo "value" precisa ser um número maior ou igual a zero.' };
  }
  const needsValue = ["purchase", "subscription_started", "subscription_renewed", "payment_pending"].includes(kind);
  if (needsValue && !(value && value > 0)) {
    return { ok: false, ignored: false, error: `O evento "${kind}" precisa de "value" maior que zero.` };
  }

  const currency = firstString(body.currency).toUpperCase() || "BRL";
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, ignored: false, error: 'Campo "currency" precisa ser um código de 3 letras (ex.: BRL).' };

  const pm = firstString(body.payment_method).toLowerCase();
  if (pm && !PAYMENT_METHODS.includes(pm as PaymentMethod)) {
    return { ok: false, ignored: false, error: `Campo "payment_method" inválido. Use: ${PAYMENT_METHODS.join(", ")}.` };
  }

  let occurredAt: string | undefined;
  if (body.occurred_at) {
    const d = new Date(body.occurred_at);
    if (Number.isNaN(d.getTime())) return { ok: false, ignored: false, error: 'Campo "occurred_at" precisa ser uma data ISO 8601.' };
    occurredAt = d.toISOString();
  }

  const c = body.customer && typeof body.customer === "object" ? body.customer : {};
  const name = c.first_name ? { firstName: firstString(c.first_name), lastName: firstString(c.last_name) } : splitName(c.name);
  const a = body.address && typeof body.address === "object" ? body.address : {};
  const t = body.tracking && typeof body.tracking === "object" ? body.tracking : {};
  const sub = body.subscription && typeof body.subscription === "object" ? body.subscription : null;
  const subscriptionId = firstString(sub?.id, body.subscription_id);
  if (SUBSCRIPTION_KINDS.includes(kind) && !subscriptionId) {
    return { ok: false, ignored: false, error: `O evento "${kind}" precisa de "subscription.id" (o ID da assinatura no seu sistema).` };
  }
  if (subscriptionId.length > 200) return { ok: false, ignored: false, error: 'Campo "subscription.id" muito longo (máx. 200).' };
  const interval = resolveInterval(sub?.interval);
  if (interval === null) {
    return { ok: false, ignored: false, error: 'Campo "subscription.interval" inválido. Use: day, week, month, quarter, semester ou year (ou mensal, anual...).' };
  }

  const rawProducts = Array.isArray(body.products) ? body.products.slice(0, 100) : [];
  const products = rawProducts.map((p: any, i: number) => ({
    id: firstString(p?.id) || `item_${i + 1}`,
    name: firstString(p?.name) || undefined,
    quantity: Math.max(1, Math.floor(Number(p?.quantity) || 1)),
    price: Number(p?.price) || 0,
  }));

  return {
    ok: true,
    conversion: {
      kind,
      source: firstString(body.source).slice(0, 40) || "api",
      orderId,
      eventId: firstString(body.event_id).slice(0, 200) || undefined,
      value: value || 0,
      currency,
      paymentMethod: (pm || undefined) as PaymentMethod | undefined,
      paymentLabel: pm || undefined,
      occurredAt,
      isTest: body.test === true,
      customer: compact({
        email: firstString(c.email),
        phone: firstString(c.phone),
        firstName: name.firstName,
        lastName: name.lastName,
        externalId: firstString(c.id, c.external_id),
      }),
      address: compact({
        city: firstString(a.city),
        state: firstString(a.state),
        zip: firstString(a.zip, a.zipcode, a.cep).replace(/\D/g, ""),
        country: firstString(a.country) || "BR",
      }),
      products,
      tracking: compact({
        track_id: firstString(t.track_id),
        utm_source: firstString(t.utm_source),
        utm_medium: firstString(t.utm_medium),
        utm_campaign: firstString(t.utm_campaign),
        utm_content: firstString(t.utm_content),
        utm_term: firstString(t.utm_term),
        utm_id: firstString(t.utm_id, t.campaign_id),
      }),
      signals: compact({
        fbp: firstString(t.fbp),
        fbc: firstString(t.fbc),
        client_ip: firstString(t.ip, t.client_ip),
        client_user_agent: firstString(t.user_agent, t.client_user_agent),
        event_source_url: firstString(t.page_url, t.event_source_url),
      }),
      subscription: subscriptionId || sub
        ? compact({ id: subscriptionId, plan: firstString(sub?.plan), interval: interval || undefined })
        : undefined,
    },
  };
}