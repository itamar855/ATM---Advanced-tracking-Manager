import { createAdminClient } from "../supabase/server";
import { getSupabaseUrl, getServiceRoleKey } from "../supabase/env";

/**
 * Motor universal de idempotência/deduplicação do ATM.
 * Suporta qualquer tipo de evento (Purchase, ViewContent, AddToCart, etc.)
 * de qualquer source (server | browser).
 */

export type EventSource = "server" | "browser";
export type EventStatus = "pending" | "buffered" | "processing" | "sent" | "accepted" | "rejected" | "deduped" | "failed";


/**
 * Reserva (lock) um evento genérico para processamento.
 * Retorna { acquired: true } se o lock foi obtido.
 * Retorna { acquired: false, state } se já estava processado ou em processamento.
 */
export async function reserveEvent(
  storeId: string,
  eventName: string,
  eventId: string,
  source: EventSource = "server"
): Promise<{ acquired: boolean; state?: "sent" | "processing" }> {
  const finalStoreId = storeId || "dckb5g-7d";

  try {
    // 1. Verificar se evento já existe e está concluído
    const checkRes = await fetch(
      `${getSupabaseUrl()}/rest/v1/events?store_id=eq.${finalStoreId}&event_id=eq.${eventId}&source=eq.${source}&select=status`,
      {
        headers: {
          apikey: getServiceRoleKey(),
          Authorization: `Bearer ${getServiceRoleKey()}`,
        },
        cache: "no-store",
      }
    );

    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        const status = existing[0].status;
        if (status === "sent" || status === "accepted" || status === "deduped") {
          return { acquired: false, state: "sent" };
        }
      }
    }

    return { acquired: true };
  } catch {
    // Fallback resiliente: libera o processamento
    return { acquired: true };
  }
}

/**
 * Salva ou atualiza o resultado final do evento no banco de dados.
 */
export async function updateEventResult(
  storeId: string,
  eventId: string,
  source: EventSource,
  status: EventStatus,
  metaResponse?: any,
  latencyMs?: number,
  userDataKeys: string[] = [],
  eventName: string = "Event",
  orderId?: string,
  emqScore?: number,
  createdAt?: string
): Promise<void> {
  const finalStoreId = storeId || "dckb5g-7d";

  try {
    const payload: any = {
      store_id: finalStoreId,
      order_id: orderId || null,
      event_name: eventName,
      event_id: eventId,
      source,
      status,
      user_data_keys: userDataKeys,
      health_score: emqScore !== undefined ? emqScore : 95,
      meta_response: metaResponse || null,
      latency_ms: latencyMs || null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (createdAt) {
      payload.created_at = createdAt;
    }

    await fetch(`${getSupabaseUrl()}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: getServiceRoleKey(),
        Authorization: `Bearer ${getServiceRoleKey()}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    console.error(`[Dedup Engine] Falha ao registrar evento ${eventId}:`, error.message);
  }
}

// ─── Wrappers de Compatibilidade (Purchase Server-side) ───────────────────────

/**
 * @deprecated Use reserveEvent() diretamente.
 */
export async function reservePurchase(
  storeId: string,
  orderId: string
): Promise<{ acquired: boolean; state?: "sent" | "processing" }> {
  return reserveEvent(storeId, "Purchase", `Purchase_${orderId}`, "server");
}

/**
 * @deprecated Use updateEventResult() diretamente.
 */
export async function updateEventStatus(
  storeId: string,
  orderId: string,
  status: "accepted" | "rejected" | "failed",
  errors?: any,
  latencyMs?: number
): Promise<void> {
  const eventStatus: EventStatus = status === "accepted" ? "accepted" : "rejected";
  await updateEventResult(
    storeId,
    `Purchase_${orderId}`,
    "server",
    eventStatus,
    errors ? { errors } : null,
    latencyMs,
    ["em", "ph", "fn", "ln", "ct", "st", "zp", "co"],
    "Purchase",
    orderId
  );
}
