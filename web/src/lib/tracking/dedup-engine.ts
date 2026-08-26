import { createClient } from "../supabase/server";
import { NormalizedOrder } from "../types";

/**
 * Zera a concorrência e envia de forma idempotente.
 * Se o pedido já foi processado ou está sendo processado, impede novas requisições.
 */
export async function reservePurchase(
  storeId: string,
  orderId: string
): Promise<{ acquired: boolean; state?: "sent" | "processing" }> {
  const supabase = await createClient();

  try {
    // 1. Tenta buscar um evento existente de 'Purchase' para o respectivo pedido
    const { data: existingEvent, error: fetchError } = await supabase
      .from("events")
      .select("status")
      .eq("store_id", storeId)
      .eq("order_id", orderId)
      .eq("event_name", "Purchase")
      .eq("source", "server")
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existingEvent) {
      if (existingEvent.status === "sent" || existingEvent.status === "accepted") {
        return { acquired: false, state: "sent" };
      }
      if (existingEvent.status === "processing" || existingEvent.status === "pending") {
        return { acquired: false, state: "processing" };
      }
    }

    // 2. Insere ou atualiza o status de concorrência de forma idempotente para 'processing'
    const eventId = `Purchase_${orderId}`;
    const { error: upsertError } = await supabase
      .from("events")
      .upsert(
        {
          store_id: storeId,
          order_id: orderId,
          event_name: "Purchase",
          event_id: eventId,
          source: "server",
          status: "processing",
          created_at: new Date().toISOString(),
        },
        { onConflict: "store_id,event_id,source" }
      );

    if (upsertError) {
      // Se for erro de schema (tabela ainda não criada), permite o prosseguimento do envio CAPI
      if (upsertError.code === "PGRST205" || upsertError.message?.includes("events")) {
        return { acquired: true };
      }
      return { acquired: false, state: "processing" };
    }

    return { acquired: true };
  } catch (error) {
    console.warn(`[Dedup Engine Warning] Ignorando trava de concorrência por indisponibilidade de banco:`, error);
    return { acquired: true };
  }
}

/**
 * Atualiza o status do evento de compra pós processamento
 */
export async function updateEventStatus(
  storeId: string,
  orderId: string,
  status: "sent" | "accepted" | "rejected" | "failed",
  metaResponse?: any,
  latencyMs?: number
): Promise<void> {
  const supabase = await createClient();
  const eventId = `Purchase_${orderId}`;

  try {
    await supabase
      .from("events")
      .update({
        status,
        meta_response: metaResponse || null,
        latency_ms: latencyMs || null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("store_id", storeId)
      .eq("event_id", eventId)
      .eq("source", "server");
  } catch (error) {
    console.error(`[Dedup Engine Error] Falha ao atualizar status do evento #${orderId}:`, error);
  }
}
