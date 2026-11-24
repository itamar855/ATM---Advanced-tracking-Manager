import type { OrderProduct } from "@/lib/types";

/**
 * Tipos de conversão que o motor entende, independentes de checkout.
 * Cada adaptador (Zedy, Vega, Gateway7, API universal...) traduz o JSON de origem
 * para um ConversionInput e o motor faz o resto.
 */
export type ConversionKind =
  | "lead"
  | "checkout_started"
  | "payment_pending"
  | "purchase"
  | "refund"
  | "chargeback"
  | "trial_started"
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_canceled";

export const CONVERSION_KINDS: readonly ConversionKind[] = [
  "lead",
  "checkout_started",
  "payment_pending",
  "purchase",
  "refund",
  "chargeback",
  "trial_started",
  "subscription_started",
  "subscription_renewed",
  "subscription_canceled",
];

export type PaymentMethod = "pix" | "boleto" | "card" | "other";

export interface ConversionInput {
  kind: ConversionKind;
  /** Origem: "zedy", "vega", "gateway7", "api"... Só para log e painel. */
  source: string;
  /** ID do pedido / transação / lead na origem. Usado para deduplicar. */
  orderId: string;
  /** Sobrescreve o event_id enviado à Meta (para deduplicar com o pixel do navegador). */
  eventId?: string;
  value: number;
  currency: string;
  paymentMethod?: PaymentMethod;
  /** Texto original do método de pagamento, para o painel. */
  paymentLabel?: string;
  /** Quando aconteceu (ISO). Padrão: agora. */
  occurredAt?: string;
  /** Teste: não trava deduplicação, não grava pedido e só envia à Meta com test_event_code. */
  isTest?: boolean;
  customer: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    externalId?: string;
  };
  address?: {
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  products: OrderProduct[];
  tracking: {
    track_id?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    utm_id?: string;
  };
  /** Sinais do navegador do comprador, quando a origem os envia. */
  signals?: {
    fbp?: string;
    fbc?: string;
    client_ip?: string;
    client_user_agent?: string;
    event_source_url?: string;
  };
  subscription?: {
    id?: string;
    plan?: string;
    interval?: BillingInterval;
  };
}

export type BillingInterval = "day" | "week" | "month" | "quarter" | "semester" | "year";

/** Tipos que mexem na tabela de assinaturas (exigem subscription.id). */
export const SUBSCRIPTION_KINDS: readonly ConversionKind[] = [
  "trial_started",
  "subscription_started",
  "subscription_renewed",
  "subscription_canceled",
];

/** Resultado de um adaptador: ou uma conversão, ou um motivo para ignorar o evento. */
export type AdapterResult =
  | { ok: true; conversion: ConversionInput }
  | { ok: false; ignored: true; message: string }
  | { ok: false; ignored: false; error: string };

export interface ConversionResult {
  ok: boolean;
  /** HTTP status sugerido para a resposta. */
  status: number;
  kind: ConversionKind;
  orderId: string;
  metaEventName: string | null;
  eventId: string | null;
  sentToMeta: boolean;
  duplicate?: boolean;
  dryRun?: boolean;
  emqScore?: number;
  signals?: string[];
  message?: string;
  error?: string;
  metaResponse?: unknown;
}
