import { createClient } from "../supabase/server";

/**
 * Motor universal de idempotência/deduplicação do ATM.
 * Suporta qualquer tipo de evento (Purchase, ViewContent, AddToCart, etc.)
 * de qualquer source (server | browser).
 */

export type EventSource = "server" | "browser";
export type EventStatus = "pending" | "processing" | "sent" | "accepted" | "rejected" | "deduped" | "failed";

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
  const supabase = await createClient();

  try {
    // 1. Verificar se evento já existe
    try {
      const { data: existingEvent } = await supabase
        .from("events")
        .select("status")
        .eq("store_id", storeId)
        .eq("event_id", eventId)
        .eq("source", source)
        .maybeSingle();

      if (existingEvent) {
        const { status } = existingEvent;
        if (status === "sent" || status === "accepted" || status === "deduped") {
          return { acquired: false, state: "sent" };
        }
        if (status === "processing" || status === "pending") {
          return { acquired: false, state: "processing" };
        }
      }
    } catch {
      // Ignora erro se tabela não existir ainda
    }

    // 2. Inserir com status "processing" (lock de concorrência)
    try {
      const { error: upsertError } = await supabase
        .from("events")
        .upsert(
          {
            store_id: storeId,
            event_name: eventName,
            event_id: eventId,
            source,
            status: "processing",
            created_at: new Date().toISOString(),
          },
          { onConflict: "store_id,event_id,source" }
        );

      if (upsertError && upsertError.code !== "PGRST205") {
        console.warn(`[Dedup Engine] Falha no upsert do lock para ${eventId}:`, upsertError.message);
        return { acquired: false, state: "processing" };
      }
    } catch {
      // Segurança: em caso de erro no lock, libera para não bloquear o fluxo
    }

    return { acquired: true };
  } catch {
    // Fallback resiliente: libera o processamento em qualquer falha grave
    return { acquired: true };
  }
}

/**
 * Atualiza o status de um evento pós-processamento.
 */
export async function updateEventResult(
  storeId: string,
  eventId: string,
  source: EventSource,
  status: EventStatus,
  metaResponse?: any,
  latencyMs?: number
): Promise<void> {
  const supabase = await createClient();

  try {
    await supabase
      .from("events")
      .update({
        status,
        meta_response: metaResponse || null,
        latency_ms: latencyMs || null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("event_id", eventId)
      .eq("source", source);
  } catch (error: any) {
    console.error(`[Dedup Engine] Falha ao atualizar status do evento ${eventId}:`, error.message);
  }
}

// ─── Wrappers de Compatibilidade (Purchase Server-side) ───────────────────────

/**
 * @deprecated Use reserveEvent() diretamente.
 * Mantido para compatibilidade com webhook/[store]/route.ts
 */
export async function reservePurchase(
  storeId: string,
  orderId: string
): Promise<{ acquired: boolean; state?: "sent" | "processing" }> {
  return reserveEvent(storeId, "Purchase", `Purchase_${orderId}`, "server");
}

/**
 * @deprecated Use updateEventResult() diretamente.
 * Mantido para compatibilidade com webhook/[store]/route.ts
 */
export async function updateEventStatus(
  storeId: string,
  orderId: string,
  status: EventStatus,
  metaResponse?: any,
  latencyMs?: number
): Promise<void> {
  return updateEventResult(storeId, `Purchase_${orderId}`, "server", status, metaResponse, latencyMs);
}
