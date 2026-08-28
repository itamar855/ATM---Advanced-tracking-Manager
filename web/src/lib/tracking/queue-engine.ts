import { createAdminClient } from "../supabase/server";
import { sendMetaCAPIEvent, MetaEvent } from "../meta/capi";
import { decrypt, hashEmail, hashPhone, sha256Hash } from "../encryption";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

export interface QueueProcessResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  retried: number;
  errors: Array<{ eventId: string; error: string }>;
}

/**
 * Busca credenciais ativas da Meta (Pixel ID e Access Token)
 */
async function getMetaCredentials(): Promise<{ pixelId: string; accessToken: string; testEventCode?: string } | null> {
  try {
    const supabase = createAdminClient();
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("platform", "meta")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) return null;

    let accessToken = integration.access_token_enc || "";
    if (accessToken && !accessToken.startsWith("EAA")) {
      try {
        accessToken = decrypt(accessToken);
      } catch {
        // fallback
      }
    }

    return {
      pixelId: integration.pixel_id || process.env.META_PIXEL_ID || "1104875232197441",
      accessToken,
      testEventCode: integration.config?.test_event_code || process.env.META_TEST_EVENT_CODE || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Processa a fila de eventos pendentes ou falhos com retentativa e backoff exponencial.
 */
export async function processEventQueue(maxEvents = 100): Promise<QueueProcessResult> {
  const result: QueueProcessResult = {
    totalProcessed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    errors: [],
  };

  const creds = await getMetaCredentials();
  if (!creds || !creds.accessToken) {
    result.errors.push({ eventId: "ALL", error: "Credenciais da Meta não disponíveis." });
    return result;
  }

  const supabase = createAdminClient();

  // Busca eventos que precisam de envio ou retry (pending, processing, failed com < 5 tentativas)
  const { data: pendingEvents, error: fetchErr } = await supabase
    .from("events")
    .select("*")
    .in("status", ["pending", "failed", "processing"])
    .lt("attempt_count", 5)
    .order("created_at", { ascending: true })
    .limit(maxEvents);

  if (fetchErr || !pendingEvents || pendingEvents.length === 0) {
    return result;
  }

  for (const ev of pendingEvents) {
    result.totalProcessed++;
    const currentAttempt = (ev.attempt_count || 0) + 1;
    const startTime = Date.now();

    // Constrói payload CAPI a partir do registro do evento com SHA-256
    const metaResp = ev.meta_response || {};
    const orderDetails = metaResp.order_details || {};
    const customData = metaResp.custom_data || {};

    const rawEmail = orderDetails.customer_email || customData.customer_email;
    const rawPhone = orderDetails.customer_phone || customData.customer_phone;
    const rawName = orderDetails.customer_name || customData.customer_name || "";

    const user_data: MetaEvent["user_data"] = {
      fbp: metaResp.fbp || customData.fbp || undefined,
      fbc: metaResp.fbc || customData.fbc || undefined,
      client_ip_address: metaResp.client_ip || customData.client_ip || undefined,
      client_user_agent: metaResp.client_user_agent || customData.client_user_agent || undefined,
    };

    if (rawEmail) {
      const h = hashEmail(rawEmail);
      if (h) user_data.em = [h];
    }
    if (rawPhone) {
      const h = hashPhone(rawPhone);
      if (h) user_data.ph = [h];
    }
    if (rawName) {
      const parts = rawName.trim().split(" ");
      user_data.fn = [sha256Hash(parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
      if (parts.length > 1) {
        user_data.ln = [sha256Hash(parts.slice(1).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
      }
    }
    if (orderDetails.customer_city) {
      user_data.ct = [sha256Hash(orderDetails.customer_city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
    }
    if (orderDetails.customer_state) {
      user_data.st = [sha256Hash(orderDetails.customer_state.toLowerCase().slice(0, 2))];
    }
    if (orderDetails.customer_zip) {
      user_data.zp = [sha256Hash(orderDetails.customer_zip.replace(/\D/g, ""))];
    }
    user_data.co = [sha256Hash("br")];

    if (rawEmail) {
      user_data.external_id = [sha256Hash(`customer:${rawEmail.trim().toLowerCase()}`)];
    } else if (metaResp.fbp || customData.fbp) {
      user_data.external_id = [sha256Hash(`visitor:${metaResp.fbp || customData.fbp}`)];
    }

    const metaEvent: MetaEvent = {
      event_name: ev.event_name,
      event_time: Math.floor(new Date(ev.created_at || Date.now()).getTime() / 1000),
      event_id: ev.event_id,
      event_source_url: metaResp.event_source_url || "https://atacadodasgaiolas.shop",
      action_source: "website",
      user_data,
      custom_data: {
        value: Number(customData.value || orderDetails.value || 0),
        currency: customData.currency || orderDetails.currency || "BRL",
        content_type: "product",
        ...(customData || {}),
      },
    };

    try {
      const capiResult = await sendMetaCAPIEvent(
        {
          pixelId: creds.pixelId,
          accessToken: creds.accessToken,
          apiVersion: "v23.0",
          testEventCode: creds.testEventCode,
        },
        metaEvent
      );

      const latencyMs = Date.now() - startTime;
      const isAccepted = capiResult.ok;

      // Registra a tentativa na tabela event_attempts
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/event_attempts`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            event_id: ev.id,
            attempt: currentAttempt,
            status_code: isAccepted ? 200 : 400,
            response: capiResult.response || null,
            latency_ms: latencyMs,
            error: capiResult.error || null,
          }),
        });
      } catch (attErr) {
        console.warn("[Queue Engine] Erro ao gravar tentativa:", attErr);
      }

      if (isAccepted) {
        result.succeeded++;
        await supabase
          .from("events")
          .update({
            status: "accepted",
            sent_at: new Date().toISOString(),
            latency_ms: latencyMs,
            attempt_count: currentAttempt,
            meta_response: {
              ...(ev.meta_response || {}),
              ...(capiResult.response || {}),
              fbtrace_id: capiResult.response?.fbtrace_id || ev.meta_response?.fbtrace_id || null,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      } else {
        result.failed++;
        result.errors.push({ eventId: ev.event_id, error: capiResult.error || "Rejeitado pela Meta" });

        await supabase
          .from("events")
          .update({
            status: currentAttempt >= 5 ? "rejected" : "failed",
            attempt_count: currentAttempt,
            meta_response: {
              ...(ev.meta_response || {}),
              error: capiResult.error || "Falha no envio Meta CAPI",
              last_attempt_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      }
    } catch (e: any) {
      result.failed++;
      result.errors.push({ eventId: ev.event_id, error: e.message });

      await supabase
        .from("events")
        .update({
          status: "failed",
          attempt_count: currentAttempt,
          meta_response: {
            ...(ev.meta_response || {}),
            last_error: e.message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", ev.id);
    }
  }

  return result;
}
