import { createAdminClient } from "@/lib/supabase/server";
import { sendStorePushNotification, OrderNotificationPayload } from "./web-push";

export interface DispatchNotificationParams {
  storeId: string;
  orderId: string;
  type: "approved" | "pending";
  value: number;
  currency?: string;
  paymentMethod?: string;
  customerName?: string;
  itemsSummary?: string;
  title?: string;
  body?: string;
  metadata?: Record<string, any>;
  skipWebPush?: boolean;
}

export interface DispatchNotificationResult {
  ok: boolean;
  notificationId?: string;
  skippedDuplicate?: boolean;
  pushResult?: { ok: boolean; sent?: number; error?: string };
  error?: string;
}

/**
 * Normaliza o nome do método de pagamento para exibição amigável
 */
function normalizePaymentMethodLabel(rawMethod?: string): string {
  const method = String(rawMethod || "").trim().toLowerCase();
  if (method.includes("pix")) return "PIX";
  if (method.includes("boleto")) return "Boleto";
  if (method.includes("card") || method.includes("cartao") || method.includes("credit")) return "Cartão";
  return method ? method.toUpperCase() : "Pedido";
}

/**
 * Despacha uma notificação de venda (pendente ou aprovada):
 * 1. Insere na tabela 'notifications' com garantia anti-duplicação (store_id, order_id, type).
 * 2. Emite automaticamente via Supabase Realtime (graças à publicação no banco).
 * 3. Dispara Web Push VAPID para dispositivos móveis/desktop inscritos.
 */
export async function dispatchOrderNotification(
  params: DispatchNotificationParams
): Promise<DispatchNotificationResult> {
  const {
    storeId,
    orderId,
    type,
    value,
    currency = "BRL",
    paymentMethod,
    customerName,
    itemsSummary,
    metadata = {},
    skipWebPush = false,
  } = params;

  if (!storeId || !orderId || !type) {
    return { ok: false, error: "storeId, orderId e type são obrigatórios" };
  }

  const supabase = createAdminClient();
  const displayMethod = normalizePaymentMethodLabel(paymentMethod);
  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(Number(value || 0));

  const clientFirstName = (customerName || "Cliente").trim().split(" ")[0];

  // Título e mensagem padrão caso não fornecidos
  const defaultTitle =
    type === "approved"
      ? `💰 Venda Aprovada! (${displayMethod})`
      : `⏳ Pedido Pendente (${displayMethod})`;

  const defaultBody =
    type === "approved"
      ? `${customerName || "Cliente"} comprou ${formattedValue} via ${displayMethod}`
      : `Novo ${displayMethod} de ${formattedValue} gerado para ${clientFirstName}`;

  const finalTitle = params.title || defaultTitle;
  const finalBody = params.body || defaultBody;

  try {
    // 1. Inserção no banco com ON CONFLICT (store_id, order_id, type) DO NOTHING
    const { data: inserted, error: insertError } = await supabase
      .from("notifications")
      .insert({
        store_id: storeId,
        order_id: String(orderId),
        type,
        title: finalTitle,
        body: finalBody,
        value: Number(value || 0),
        currency,
        payment_method: paymentMethod || displayMethod,
        customer_name: customerName || null,
        items_summary: itemsSummary || null,
        read: false,
        metadata: {
          ...metadata,
          source: "atm_notification_service",
          dispatched_at: new Date().toISOString(),
        },
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      // Código Postgres 23505 = unique_violation (duplicidade já processada)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        return {
          ok: true,
          skippedDuplicate: true,
        };
      }

      console.error("[NotificationService] Erro ao registrar notificação:", insertError);
      return { ok: false, error: insertError.message };
    }

    // 2. Disparo de Web Push nativo para aparelhos conectados
    let pushResult: { ok: boolean; sent?: number; error?: string } | undefined;
    if (!skipWebPush) {
      try {
        const pushPayload: OrderNotificationPayload = {
          orderId,
          value: Number(value || 0),
          customerName: customerName || undefined,
          paymentMethod: displayMethod,
          itemsSummary: itemsSummary || undefined,
        };

        const res = await sendStorePushNotification(storeId, type, pushPayload);
        pushResult = {
          ok: res.ok,
          sent: res.sent,
          error: res.error,
        };
      } catch (pushErr: any) {
        console.warn("[NotificationService] Web Push disparado com aviso:", pushErr?.message);
        pushResult = { ok: false, error: pushErr?.message };
      }
    }

    return {
      ok: true,
      notificationId: inserted?.id,
      skippedDuplicate: false,
      pushResult,
    };
  } catch (error: any) {
    console.error("[NotificationService Fatal Error]:", error);
    return { ok: false, error: error.message };
  }
}
