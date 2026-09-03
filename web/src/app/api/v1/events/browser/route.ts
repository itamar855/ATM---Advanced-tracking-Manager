import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildBrowserEvent, getUserDataKeys, BrowserEventName, BrowserUserData, BrowserEventCustomData } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { reserveEvent, updateEventResult } from "@/lib/tracking/dedup-engine";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import {
  stitchVisitorIdentity,
  getVisitorIdentity,
  enrichAndFlushBufferedEvents,
  retroactivelyEnrichCompletedEvents,
} from "@/lib/tracking/identity-stitcher";

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
 * v5.2.0 - Features:
 *   - Identity Stitcher: cruzamento progressivo de PII entre eventos (PageView, ATC, IC, Lead, Purchase)
 *   - Buffer Inteligente de 2 Minutos para PageView: retém envio para captura de Telefone e E-mail
 *   - Liberação antecipada (Flush) de eventos em buffer assim que o visitante preenche dados no carrinho/checkout
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
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      try {
        const text = await request.text();
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

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

    // ── 0. Cruzamento de Identidade & Retroalimentação Imediata ──
    // Se o evento trouxe telefone ou e-mail (Lead, AddToCart, InitiateCheckout, Purchase):
    if (rawUserData?.phone || rawUserData?.email) {
      await stitchVisitorIdentity(store_id, track_id, rawUserData.fbp, {
        phone: rawUserData.phone,
        email: rawUserData.email,
        firstName: rawUserData.firstName,
        lastName: rawUserData.lastName,
        city: rawUserData.city,
        state: rawUserData.state,
        zip: rawUserData.zip,
        country: rawUserData.country,
        fbp: rawUserData.fbp,
        fbc: rawUserData.fbc,
      });

      // Libera antecipadamente qualquer evento retido no buffer (PageView) com esses novos dados
      enrichAndFlushBufferedEvents(store_id, track_id, rawUserData.fbp, rawUserData).catch((e) => {
        console.warn("[Browser Event] Erro ao liberar buffer:", e.message);
      });
      retroactivelyEnrichCompletedEvents(store_id, track_id, rawUserData.fbp, rawUserData).catch(() => {});
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
        accessToken = resolveMetaAccessToken(integration.access_token_enc) || "";
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
    let sessionData: {
      fbp?: string | null;
      fbc?: string | null;
      client_ip?: string | null;
      client_user_agent?: string | null;
      utm_source?: string | null;
      utm_campaign?: string | null;
      utm_medium?: string | null;
      utm_content?: string | null;
      utm_term?: string | null;
    } = {};

    // 3.1 Busca por track_id
    if (track_id) {
      const { data: session } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent, utm_source, utm_campaign, utm_medium, utm_content, utm_term")
        .eq("store_id", store_id)
        .eq("track_id", track_id)
        .maybeSingle();

      if (session) sessionData = session;
    }

    // 3.2 Fallback: busca por fbp se track_id não achou sessão
    if (!sessionData.client_ip && rawUserData?.fbp) {
      const { data: sessionByFbp } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent, utm_source, utm_campaign, utm_medium, utm_content, utm_term")
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

    // ── 4. Construir dados de usuário com enriquecimento cruzado máximo ──
    const enrichedUserData: BrowserUserData = {
      ...(rawUserData || {}),
      externalId: (rawUserData && rawUserData.externalId) || track_id || undefined,
    };

    if (!enrichedUserData.fbp && sessionData.fbp) enrichedUserData.fbp = sessionData.fbp;
    if (!enrichedUserData.fbc && sessionData.fbc) enrichedUserData.fbc = sessionData.fbc;

    // 4.1 Busca PII consolidado no Motor de Identidade (Stitcher)
    const stitched = await getVisitorIdentity(store_id, track_id, rawUserData?.fbp || sessionData.fbp);
    if (!enrichedUserData.email && stitched.email) enrichedUserData.email = stitched.email;
    if (!enrichedUserData.phone && stitched.phone) enrichedUserData.phone = stitched.phone;
    if (!enrichedUserData.firstName && stitched.firstName) enrichedUserData.firstName = stitched.firstName;
    if (!enrichedUserData.lastName && stitched.lastName) enrichedUserData.lastName = stitched.lastName;
    if (!enrichedUserData.city && stitched.city) enrichedUserData.city = stitched.city;
    if (!enrichedUserData.state && stitched.state) enrichedUserData.state = stitched.state;
    if (!enrichedUserData.zip && stitched.zip) enrichedUserData.zip = stitched.zip;

    if (!enrichedUserData.country) enrichedUserData.country = "BR";

    // ── 4.2 BUFFER INTELIGENTE DE 2 MINUTOS PARA PAGEVIEW ──
    // Se for PageView e o visitante AINDA NÃO tiver telefone ou e-mail conhecidos:
    // Retém o evento no buffer por 120 segundos para aguardar o preenchimento no carrinho/checkout.
    const isPageView = event_name === "PageView";
    const hasFullContact = Boolean(enrichedUserData.phone && enrichedUserData.email);

    if (isPageView && !hasFullContact) {
      const userDataKeys = getUserDataKeys(enrichedUserData as any);
      const emqScore = calculateEmq(userDataKeys);
      const utmSource = (body.utms?.utm_source || body.custom_data?.utm_source || sessionData.utm_source || "").trim() || undefined;
      const utmCampaign = (body.utms?.utm_campaign || body.custom_data?.utm_campaign || sessionData.utm_campaign || "").trim() || undefined;
      const utmMedium = (body.utms?.utm_medium || body.custom_data?.utm_medium || sessionData.utm_medium || "").trim() || undefined;
      const utmContent = (body.utms?.utm_content || body.custom_data?.utm_content || sessionData.utm_content || "").trim() || undefined;
      const utmTerm = (body.utms?.utm_term || body.custom_data?.utm_term || sessionData.utm_term || "").trim() || undefined;

      await updateEventResult(
        store_id || "dckb5g-7d",
        event_id,
        "browser",
        "buffered",
        {
          buffered: true,
          scheduled_for: Date.now() + 120_000,
          track_id,
          fbp: enrichedUserData.fbp,
          fbc: enrichedUserData.fbc,
          client_ip: sessionData.client_ip,
          client_user_agent: sessionData.client_user_agent,
          event_source_url: event_source_url || "",
          custom_data: {
            ...(rawCustomData || {}),
            utm_source: utmSource,
            utm_campaign: utmCampaign,
            utm_medium: utmMedium,
            utm_content: utmContent,
            utm_term: utmTerm,
          },
          order_details: {
            customer_name: `${enrichedUserData.firstName || ""} ${enrichedUserData.lastName || ""}`.trim() || undefined,
            customer_email: enrichedUserData.email || undefined,
            customer_phone: enrichedUserData.phone || undefined,
            utm_source: utmSource,
            utm_campaign: utmCampaign,
          },
        },
        0,
        userDataKeys,
        event_name,
        undefined,
        emqScore
      );

      console.log(
        `[Browser Event] PageView (${event_id.slice(-8)}) retido no buffer inteligente (120s) para enriquecimento de Telefone/E-mail | Sinais iniciais: [${userDataKeys.join(", ")}]`
      );

      return jsonWithCors({
        ok: true,
        event_name,
        event_id,
        status: "buffered",
        buffered: true,
        buffer_seconds: 120,
        message: "PageView retido no buffer inteligente para enriquecimento cruzado de PII (PH/EM)",
        signals_sent: userDataKeys,
        emq_score: emqScore,
      }, 200, origin);
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

    // ── 7. Extrai e consolida parâmetros de UTM da sessão e do payload ──
    const utmSource = (body.utms?.utm_source || body.custom_data?.utm_source || sessionData.utm_source || "").trim() || undefined;
    const utmCampaign = (body.utms?.utm_campaign || body.custom_data?.utm_campaign || sessionData.utm_campaign || "").trim() || undefined;
    const utmMedium = (body.utms?.utm_medium || body.custom_data?.utm_medium || sessionData.utm_medium || "").trim() || undefined;
    const utmContent = (body.utms?.utm_content || body.custom_data?.utm_content || sessionData.utm_content || "").trim() || undefined;
    const utmTerm = (body.utms?.utm_term || body.custom_data?.utm_term || sessionData.utm_term || "").trim() || undefined;

    // ── 8. Persiste resultado no banco com EMQ real e UTMs completas ──
    await updateEventResult(
      store_id || "dckb5g-7d",
      event_id,
      "browser",
      status,
      {
        ...(capiResult.response || {}),
        custom_data: {
          ...(metaEvent.custom_data || {}),
          ...(rawCustomData || {}),
          utm_source: utmSource,
          utm_campaign: utmCampaign,
          utm_medium: utmMedium,
          utm_content: utmContent,
          utm_term: utmTerm,
        },
        order_details: {
          value: metaEvent.custom_data?.value || rawCustomData?.value || 0,
          currency: metaEvent.custom_data?.currency || "BRL",
          customer_name: `${enrichedUserData.firstName || ""} ${enrichedUserData.lastName || ""}`.trim() || undefined,
          customer_email: enrichedUserData.email || undefined,
          customer_phone: enrichedUserData.phone || undefined,
          utm_source: utmSource,
          utm_campaign: utmCampaign,
          utm_medium: utmMedium,
          utm_content: utmContent,
          utm_term: utmTerm,
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
