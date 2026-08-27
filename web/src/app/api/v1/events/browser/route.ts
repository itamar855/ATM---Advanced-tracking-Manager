import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildBrowserEvent, getUserDataKeys, BrowserEventName, BrowserUserData, BrowserEventCustomData } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { reserveEvent, updateEventResult } from "@/lib/tracking/dedup-engine";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * Calcula o EMQ (Event Match Quality) com base nos sinais PII presentes no payload.
 * Retorna um score 0-100 proporcional ao número de sinais enviados.
 */
function calculateEmq(userDataKeys: string[]): number {
  const weights: Record<string, number> = {
    em: 20,     // E-mail (mais importante)
    ph: 15,     // Telefone
    fbp: 15,    // Cookie first-party Facebook
    fbc: 10,    // Click ID Facebook
    external_id: 10, // ID externo
    fn: 5,      // Primeiro nome
    ln: 5,      // Sobrenome
    ct: 5,      // Cidade
    st: 5,      // Estado
    zp: 4,      // CEP
    co: 3,      // País
    db: 2,      // Data de nascimento
    ge: 1,      // Gênero
  };
  let score = 0;
  for (const key of userDataKeys) {
    score += weights[key] || 0;
  }
  return Math.min(Math.round(score), 100);
}

/**
 * POST /api/v1/events/browser
 *
 * Recebe eventos de funil do Pixel do Shopify (PageView, ViewContent,
 * AddToCart, InitiateCheckout, AddPaymentInfo, Purchase, etc.) e os encaminha
 * à Meta Conversions API com todos os sinais disponíveis.
 *
 * v3.1.0 - Fixes:
 *   - Fallback de sessão por fbp (não só por track_id)
 *   - Para Purchase: enriquecimento reverso buscando PII em InitiateCheckout da mesma sessão/fbp
 *   - Cálculo real de EMQ (% de sinais PII presentes) — gravado em health_score
 *   - event_id do Purchase padronizado para aceitar prefixo "order_" para deduplicação correta com webhook
 */
function jsonWithCors(data: any, status = 200, origin = "*") {
  const res = NextResponse.json(data, { status });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const origin = request.headers.get("origin") || "*";

  try {
    const body = await request.json();

    const {
      store_id,
      track_id,
      event_name,
      event_id,
      event_source_url,
      user_data: rawUserData,
      custom_data: rawCustomData,
    } = body as {
      store_id: string;
      track_id: string;
      event_name: BrowserEventName;
      event_id: string;
      event_source_url: string;
      user_data?: BrowserUserData;
      custom_data?: BrowserEventCustomData;
    };

    // ── Validações básicas ──
    if (!store_id || !event_name || !event_id) {
      return jsonWithCors(
        { ok: false, error: "store_id, event_name e event_id são obrigatórios" },
        400,
        origin
      );
    }

    const validEvents: BrowserEventName[] = [
      "PageView", "ViewContent", "AddToCart",
      "InitiateCheckout", "AddPaymentInfo", "Purchase",
      "Search", "Lead", "CompleteRegistration", "Subscribe",
    ];
    if (!validEvents.includes(event_name)) {
      return jsonWithCors(
        { ok: false, error: `event_name inválido: ${event_name}` },
        400,
        origin
      );
    }

    const supabase = createAdminClient();

    // ── 1. Buscar integração Meta ativa ──
    let pixelId = "";
    let accessToken = "";
    let testEventCode = process.env.META_TEST_EVENT_CODE || undefined;

    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (integration) {
        pixelId = integration.pixel_id;
        const raw = integration.access_token_enc.toString();
        if (raw.startsWith("EAA")) {
          accessToken = raw;
        } else {
          try { accessToken = decrypt(raw); } catch { accessToken = raw; }
        }
        testEventCode = integration.config?.test_event_code || testEventCode;
      }
    } catch {
      console.warn("[Browser Event] Fallback de integração aplicado.");
    }

    if (!pixelId) pixelId = process.env.META_PIXEL_ID || "1104875232197441";
    if (!accessToken) accessToken = process.env.META_ACCESS_TOKEN || "";

    if (!accessToken) {
      return jsonWithCors(
        { ok: false, error: "Token da Meta não configurado." },
        500,
        origin
      );
    }

    // ── 2. Deduplicação ──
    const lock = await reserveEvent(store_id, event_name, event_id, "browser");
    if (!lock.acquired) {
      return jsonWithCors(
        { ok: true, message: `Evento ${event_name} deduplicado (${lock.state})`, deduplicated: true },
        200,
        origin
      );
    }

    // ── 3. Recuperar sessão para enriquecer com fbp, fbc, IP e UA ──
    // Estratégia em cascata: track_id → fbp → cabeçalho HTTP
    let sessionData: {
      fbp?: string | null;
      fbc?: string | null;
      client_ip?: string | null;
      client_user_agent?: string | null;
      utm_source?: string | null;
      utm_campaign?: string | null;
    } = {};

    // 3.1 Busca por track_id
    if (track_id) {
      const { data: session } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent, utm_source, utm_campaign")
        .eq("store_id", store_id)
        .eq("track_id", track_id)
        .maybeSingle();

      if (session) sessionData = session;
    }

    // 3.2 Fallback: busca por fbp (cookie first-party) se track_id não achou sessão
    if (!sessionData.client_ip && rawUserData?.fbp) {
      const { data: sessionByFbp } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent, utm_source, utm_campaign")
        .eq("store_id", store_id)
        .eq("fbp", rawUserData.fbp)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionByFbp) sessionData = sessionByFbp;
    }

    // 3.3 Fallback final: IP e UA do cabeçalho HTTP
    if (!sessionData.client_ip) {
      const forwarded = request.headers.get("x-forwarded-for");
      sessionData.client_ip = forwarded
        ? forwarded.split(",")[0].trim()
        : request.headers.get("x-real-ip") || undefined;
    }
    if (!sessionData.client_user_agent) {
      sessionData.client_user_agent = request.headers.get("user-agent") || undefined;
    }

    // ── 4. Construir dados de usuário com enriquecimento máximo ──
    const enrichedUserData: BrowserUserData = {
      ...(rawUserData || {}),
      externalId: (rawUserData && rawUserData.externalId) || track_id || undefined,
    };

    // Garante fbp/fbc da sessão se não vieram no payload
    if (!enrichedUserData.fbp && sessionData.fbp) enrichedUserData.fbp = sessionData.fbp;
    if (!enrichedUserData.fbc && sessionData.fbc) enrichedUserData.fbc = sessionData.fbc;

    // 4.1 Para Purchase e InitiateCheckout: enriquecimento reverso de PII
    // Busca email/telefone em eventos anteriores da mesma sessão (IC, ATC)
    const isPurchase = event_name === "Purchase";
    const isIC = event_name === "InitiateCheckout";

    if ((isPurchase || isIC) && (!enrichedUserData.email || !enrichedUserData.phone)) {
      try {
        // Busca em ICs anteriores desta sessão/fbp com dados de contato
        let prevQuery = supabase
          .from("events")
          .select("meta_response")
          .eq("store_id", store_id)
          .in("event_name", ["InitiateCheckout", "AddPaymentInfo"])
          .eq("status", "accepted")
          .not("meta_response->order_details->customer_email", "is", null)
          .order("created_at", { ascending: false })
          .limit(5);

        const { data: prevEvents } = await prevQuery;

        for (const prevEv of prevEvents || []) {
          const od = prevEv.meta_response?.order_details || {};
          if (od.customer_email && !enrichedUserData.email) {
            enrichedUserData.email = od.customer_email;
          }
          if (od.customer_phone && !enrichedUserData.phone) {
            enrichedUserData.phone = od.customer_phone;
          }
          if (od.customer_name && !enrichedUserData.firstName) {
            const parts = od.customer_name.split(" ");
            enrichedUserData.firstName = parts[0];
            enrichedUserData.lastName = parts.slice(1).join(" ") || undefined;
          }
          if (enrichedUserData.email && enrichedUserData.phone) break;
        }
      } catch {}
    }

    // Padrão de país BR
    if (!enrichedUserData.country) enrichedUserData.country = "BR";

    // ── 5. Construir evento Meta CAPI ──
    const metaEvent = buildBrowserEvent(
      event_name,
      event_id,
      event_source_url || "",
      sessionData,
      enrichedUserData,
      rawCustomData
    );

    // ── 6. Despachar para a Meta CAPI ──
    const capiConfig = {
      pixelId,
      accessToken,
      apiVersion: "v23.0",
      testEventCode,
    };

    const capiResult = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;

    const status = capiResult.ok ? "accepted" : "rejected";
    const userDataKeys = getUserDataKeys(metaEvent.user_data);
    const emqScore = calculateEmq(userDataKeys);

    // ── 7. Persiste resultado no banco com EMQ real ──
    await updateEventResult(
      store_id || "dckb5g-7d",
      event_id,
      "browser",
      status,
      {
        ...(capiResult.response || {}),
        custom_data: metaEvent.custom_data || rawCustomData || {},
        order_details: {
          value: metaEvent.custom_data?.value || rawCustomData?.value || 0,
          currency: metaEvent.custom_data?.currency || "BRL",
          customer_name: `${enrichedUserData.firstName || ""} ${enrichedUserData.lastName || ""}`.trim() || undefined,
          customer_email: enrichedUserData.email || undefined,
          customer_phone: enrichedUserData.phone || undefined,
        },
      },
      latencyMs,
      userDataKeys,
      event_name,
      undefined,  // orderId — não aplicável para eventos de browser
      emqScore    // EMQ calculado para health_score
    );

    if (!capiResult.ok) {
      console.error(`[Browser Event] ${event_name} REJECTED: ${capiResult.error}`);
      return jsonWithCors(
        { ok: false, error: capiResult.error },
        400,
        origin
      );
    }

    console.log(
      `[Browser Event] ${event_name} (${event_id.slice(-8)}) | ` +
      `Sinais: [${userDataKeys.join(", ")}] | EMQ: ${emqScore}% | ` +
      `Latência: ${latencyMs}ms`
    );

    return jsonWithCors({
      ok: true,
      event_name,
      event_id,
      signals_sent: userDataKeys,
      emq_score: emqScore,
    }, 200, origin);
  } catch (error: any) {
    console.error("[Browser Event Error]:", error);
    return jsonWithCors(
      { ok: false, error: "Erro interno no servidor" },
      500,
      origin
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "*";
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}
