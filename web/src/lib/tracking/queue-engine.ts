import { createAdminClient } from "../supabase/server";
import { sendMetaCAPIEvent, MetaEvent } from "../meta/capi";
import { decrypt, hashEmail, hashPhone, hashState, sha256Hash } from "../encryption";
import { getVisitorIdentity, normalizeEmail, normalizePhone } from "./identity-stitcher";
import { classifyCapiError } from "./capi-error-classifier";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

export interface QueueProcessResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  retried: number;
  rejected: number;
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
 * Processa a fila de eventos pendentes, falhos e eventos retidos no buffer (2 minutos).
 */
export async function processEventQueue(maxEvents = 100): Promise<QueueProcessResult> {
  const result: QueueProcessResult = {
    totalProcessed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    rejected: 0,
    errors: [],
  };

  const creds = await getMetaCredentials();
  if (!creds || !creds.accessToken) {
    result.errors.push({ eventId: "ALL", error: "Credenciais da Meta não disponíveis." });
    return result;
  }

  const supabase = createAdminClient();
  const nowMs = Date.now();
  const sevenDaysAgoIso = new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString();

  // 1. Busca eventos pendentes/falhos e eventos em buffer (PageView, ViewContent, AddToCart, InitiateCheckout)
  // Restringe a busca pela janela permitida de 7 dias da Meta CAPI para evitar travamento da fila
  const [{ data: pendingEvents }, { data: bufferedEvents }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .in("status", ["pending", "failed", "processing"])
      .lt("attempt_count", 5)
      .gte("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: true })
      .limit(Math.floor(maxEvents / 2)),
    supabase
      .from("events")
      .select("*")
      .eq("status", "buffered")
      .order("created_at", { ascending: true })
      .limit(maxEvents),
  ]);

  // Filtra os eventos em buffer que atingiram seu timeout específico (scheduled_for ou fallback de 120s)
  const expiredBufferedEvents = (bufferedEvents || []).filter((ev) => {
    const scheduledFor = ev.meta_response?.scheduled_for;
    if (typeof scheduledFor === "number") {
      return scheduledFor <= nowMs;
    }
    const createdAtMs = new Date(ev.created_at || 0).getTime();
    return nowMs - createdAtMs >= 120_000;
  }).slice(0, Math.floor(maxEvents / 2));

  const allEvents = [...expiredBufferedEvents, ...(pendingEvents || [])].slice(0, maxEvents);

  if (allEvents.length === 0) {
    return result;
  }

  for (const ev of allEvents) {
    result.totalProcessed++;
    const currentAttempt = (ev.attempt_count || 0) + 1;
    const startTime = Date.now();

    // Constrói payload CAPI a partir do registro do evento com SHA-256
    const metaResp = ev.meta_response || {};
    const orderDetails = metaResp.order_details || {};
    const customData = metaResp.custom_data || {};

    let rawEmail = normalizeEmail(orderDetails.customer_email || customData.customer_email);
    let rawPhone = normalizePhone(orderDetails.customer_phone || customData.customer_phone);
    let rawName = orderDetails.customer_name || customData.customer_name || "";

    // Para eventos em buffer (PageView), faz uma busca final de identidade por track_id / fbp
    if ((!rawEmail || !rawPhone) && (metaResp.track_id || metaResp.fbp)) {
      try {
        const identity = await getVisitorIdentity(ev.store_id, metaResp.track_id, metaResp.fbp);
        if (!rawEmail && identity.email) rawEmail = identity.email;
        if (!rawPhone && identity.phone) rawPhone = identity.phone;
        if (!rawName && identity.firstName) {
          rawName = `${identity.firstName} ${identity.lastName || ""}`.trim();
        }
        if (!orderDetails.customer_city && identity.city) orderDetails.customer_city = identity.city;
        if (!orderDetails.customer_state && identity.state) orderDetails.customer_state = identity.state;
        if (!orderDetails.customer_zip && identity.zip) orderDetails.customer_zip = identity.zip;
      } catch {}
    }

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
      user_data.st = [hashState(orderDetails.customer_state)];
    }
    if (orderDetails.customer_zip) {
      user_data.zp = [sha256Hash(orderDetails.customer_zip.replace(/\D/g, ""))];
    }
    user_data.country = [sha256Hash("br")];
    user_data.co = [sha256Hash("br")];

    if (rawEmail) {
      user_data.external_id = [sha256Hash(`customer:${rawEmail.trim().toLowerCase()}`)];
    } else if (metaResp.fbp || customData.fbp) {
      user_data.external_id = [sha256Hash(`visitor:${metaResp.fbp || customData.fbp}`)];
    }

    const eventTimeSec = Math.floor(new Date(ev.created_at || Date.now()).getTime() / 1000);
    const nowSec = Math.floor(nowMs / 1000);
    const SEVEN_DAYS_SECONDS = 7 * 24 * 3600; // 604800s

    // ── Validação rigorosa da janela de 7 dias da Meta CAPI ──
    // Se o evento for anterior a 7 dias, rejeita localmente (Dead Letter Queue) sem chamar a Meta API.
    if ((nowSec - eventTimeSec) > SEVEN_DAYS_SECONDS) {
      result.rejected++;
      result.errors.push({
        eventId: ev.event_id,
        error: "Registro de data e hora do evento anterior a 7 dias (expirado na janela Meta CAPI)",
      });

      await supabase
        .from("events")
        .update({
          status: "rejected",
          meta_response: {
            ...(ev.meta_response || {}),
            rejection_reason: "expired_meta_7d_window",
            rejection_type: "PERMANENT",
            rejected_at: new Date().toISOString(),
            meta_error_code: 100,
            meta_error_subcode: 2804003,
            error: "Rejeitado localmente: Registro de data e hora do evento anterior a 7 dias",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", ev.id);

      continue;
    }

    const metaEvent: MetaEvent = {
      event_name: ev.event_name,
      event_time: eventTimeSec,
      event_id: ev.event_id,
      event_source_url: metaResp.event_source_url || metaResp.custom_data?.event_source_url || metaResp.order_details?.event_source_url || "https://checkout.loja.com",
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
        const keys = ["fbp", "fbc", "ip", "ua", "addr"];
        if (rawEmail) keys.push("em");
        if (rawPhone) keys.push("ph");
        if (user_data.external_id) keys.push("external_id");
        const emq = Math.min(100, Math.round((keys.length / 8) * 100));

        await supabase
          .from("events")
          .update({
            status: "accepted",
            sent_at: new Date().toISOString(),
            latency_ms: latencyMs,
            attempt_count: currentAttempt,
            user_data_keys: keys,
            health_score: emq,
            meta_response: {
              ...(ev.meta_response || {}),
              ...(capiResult.response || {}),
              fbtrace_id: capiResult.response?.fbtrace_id || ev.meta_response?.fbtrace_id || null,
              order_details: {
                ...(ev.meta_response?.order_details || {}),
                customer_email: rawEmail || ev.meta_response?.order_details?.customer_email,
                customer_phone: rawPhone || ev.meta_response?.order_details?.customer_phone,
                customer_name: rawName || ev.meta_response?.order_details?.customer_name,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      } else {
        const classification = classifyCapiError(capiResult.response, 400);

        if (classification.isPermanent || currentAttempt >= 5) {
          result.rejected++;
          result.errors.push({ eventId: ev.event_id, error: capiResult.error || classification.description });

          await supabase
            .from("events")
            .update({
              status: "rejected",
              attempt_count: currentAttempt,
              meta_response: {
                ...(ev.meta_response || {}),
                rejection_reason: classification.reason,
                rejection_type: "PERMANENT",
                rejected_at: new Date().toISOString(),
                meta_error_code: classification.errorCode || null,
                meta_error_subcode: classification.errorSubcode || null,
                error: capiResult.error || classification.description,
                last_attempt_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", ev.id);
        } else {
          result.failed++;
          result.retried++;
          result.errors.push({ eventId: ev.event_id, error: capiResult.error || classification.description });

          await supabase
            .from("events")
            .update({
              status: "failed",
              attempt_count: currentAttempt,
              meta_response: {
                ...(ev.meta_response || {}),
                temporary_error_reason: classification.reason,
                error: capiResult.error || classification.description,
                last_attempt_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", ev.id);
        }
      }
    } catch (e: any) {
      const classification = classifyCapiError(e);
      if (classification.isPermanent || currentAttempt >= 5) {
        result.rejected++;
        result.errors.push({ eventId: ev.event_id, error: e.message || classification.description });

        await supabase
          .from("events")
          .update({
            status: "rejected",
            attempt_count: currentAttempt,
            meta_response: {
              ...(ev.meta_response || {}),
              rejection_reason: classification.reason,
              rejection_type: "PERMANENT",
              rejected_at: new Date().toISOString(),
              error: e.message,
              last_error: e.message,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      } else {
        result.failed++;
        result.retried++;
        result.errors.push({ eventId: ev.event_id, error: e.message });

        await supabase
          .from("events")
          .update({
            status: "failed",
            attempt_count: currentAttempt,
            meta_response: {
              ...(ev.meta_response || {}),
              temporary_error_reason: classification.reason,
              last_error: e.message,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      }
    }
  }

  return result;
}
