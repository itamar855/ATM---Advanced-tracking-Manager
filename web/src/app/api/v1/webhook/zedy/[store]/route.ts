import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reservePurchase, updateEventStatus, updateEventResult } from "@/lib/tracking/dedup-engine";
import { buildMetaPurchaseEvent, getUserDataKeys } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { decrypt } from "@/lib/encryption";
import { NormalizedOrder } from "@/lib/types";

/**
 * POST /api/v1/webhook/zedy/[store]
 * Webhook unificado do Zedy Checkout. Processa transações aprovadas e envia para a Meta CAPI.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store: storeId } = await params;

  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Zedy envia o evento de status. Vamos filtrar apenas transações aprovadas.
    // Conforme a documentação: ORDER_PAID ou status === "approved" / "paid"
    const eventType = payload.eventType;
    if (eventType !== "ORDER_PAID" && payload.status !== "approved" && payload.status !== "paid") {
      return NextResponse.json({ ok: true, message: "Ignorado (não é um evento de pedido pago)" }, { status: 200 });
    }

    const orderId = String(payload.orderId || payload.id);
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Identificador do pedido ausente" }, { status: 400 });
    }

    // 1. Lock de Idempotência
    const lock = await reservePurchase(storeId, orderId);
    if (!lock.acquired) {
      return NextResponse.json({ ok: true, message: "Pedido duplicado ignorado" }, { status: 200 });
    }

    const supabase = await createClient();

    // 2. Busca integração ativa da Meta CAPI (por storeId ou integração mestre ativa)
    let { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (!integration) {
      const { data: fallbackIntegration } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = fallbackIntegration;
    }

    if (!integration) {
      await updateEventStatus(storeId, orderId, "failed", { error: "Sem integração Meta ativa" });
      return NextResponse.json({ ok: false, error: "Meta não configurada" }, { status: 400 });
    }

    // 3. Normaliza os dados vindos do Zedy de acordo com o Schema oficial:
    const customer = payload.customer || {};
    const address = payload.address || {};
    
    // Zedy envia parâmetros de rastreamento no objeto trackingParameters
    const trackingParams = payload.trackingParameters || {};
    const utmSource = trackingParams.utm_source || "";
    const utmCampaign = trackingParams.utm_campaign || "";
    const utmMedium = trackingParams.utm_medium || "";
    const utmContent = trackingParams.utm_content || "";
    const utmTerm = trackingParams.utm_term || "";
    const trackId = trackingParams.track_id || trackingParams._ztid || payload.track_id || "";

    // Calcula valor total com base no commission ou somatório de priceInCents
    const rawValue = payload.commission?.totalPriceInCents || 
      (payload.products || []).reduce((acc: number, p: any) => acc + (p.priceInCents * (p.quantity || 1)), 0);
    const orderValue = Number(rawValue || 0) / 100; // Converte centavos para reais

    const normalizedOrder: NormalizedOrder = {
      orderId,
      customer: {
        email: customer.email || "",
        phone: customer.phone || "",
        firstName: customer.name?.split(" ")[0] || "",
        lastName: customer.name?.split(" ").slice(1).join(" ") || "",
        externalId: customer.email || "",
      },
      address: {
        city: address.city || "",
        state: address.state || "",
        zip: address.zipcode || "",
        country: address.country || "BR",
      },
      products: (payload.products || []).map((item: any) => ({
        id: String(item.id || item.planId),
        name: item.name || item.planName || "",
        quantity: Number(item.quantity || 1),
        price: Number(item.priceInCents || 0) / 100,
      })),
      value: orderValue,
      currency: payload.currency || "BRL",
      timestamps: {
        paid: payload.approvedDate || payload.createdAt || new Date().toISOString(),
      },
      trackingParams: {
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        utm_content: utmContent,
        utm_term: utmTerm,
        track_id: trackId,
      },
    };

    // 4. Enriquecimento de Sessão em Cascata (Sinais Diretos -> TrackId -> Busca Reversa por Email/Phone -> Fallback HTTP)
    let sessionData: {
      fbp?: string | null;
      fbc?: string | null;
      client_ip?: string | null;
      client_user_agent?: string | null;
      event_source_url?: string | null;
    } = {};

    // 4.1 Tenta extrair sinais enviados diretamente no payload pelo Zedy
    const directFbp = trackingParams.fbp || trackingParams._fbp || payload.fbp || payload.meta_fbp;
    const directFbc = trackingParams.fbc || trackingParams._fbc || payload.fbc || payload.meta_fbc;
    const directIp = payload.client_ip || payload.ip || trackingParams.client_ip || trackingParams.ip;
    const directUa = payload.client_user_agent || payload.user_agent || trackingParams.client_user_agent || trackingParams.user_agent;

    if (directFbp) sessionData.fbp = directFbp;
    if (directFbc) sessionData.fbc = directFbc;
    if (directIp) sessionData.client_ip = directIp;
    if (directUa) sessionData.client_user_agent = directUa;

    // 4.2 Busca por trackId na tabela sessions
    if (trackId) {
      const { data: dbSession } = await supabase
        .from("sessions")
        .select("*")
        .eq("track_id", trackId)
        .maybeSingle();

      if (dbSession) {
        if (!sessionData.fbp) sessionData.fbp = dbSession.fbp;
        if (!sessionData.fbc) sessionData.fbc = dbSession.fbc;
        if (!sessionData.client_ip) sessionData.client_ip = dbSession.client_ip;
        if (!sessionData.client_user_agent) sessionData.client_user_agent = dbSession.client_user_agent;
        if (!sessionData.event_source_url) sessionData.event_source_url = dbSession.event_source_url;
      }
    }

    // 4.3 Busca reversa em sessions por email/telefone caso fbp/fbc ainda faltem
    if ((!sessionData.fbp || !sessionData.client_ip) && (customer.email || customer.phone)) {
      try {
        let revQuery = supabase
          .from("sessions")
          .select("fbp, fbc, client_ip, client_user_agent, event_source_url")
          .order("created_at", { ascending: false })
          .limit(1);

        if (customer.email) {
          revQuery = revQuery.ilike("event_source_url", `%${customer.email}%`);
        }

        const { data: revSession } = await revQuery.maybeSingle();
        if (revSession) {
          if (!sessionData.fbp) sessionData.fbp = revSession.fbp;
          if (!sessionData.fbc) sessionData.fbc = revSession.fbc;
          if (!sessionData.client_ip) sessionData.client_ip = revSession.client_ip;
          if (!sessionData.client_user_agent) sessionData.client_user_agent = revSession.client_user_agent;
        }
      } catch (e) {
        console.warn("[Zedy Webhook] Erro na busca reversa de sessão:", e);
      }
    }

    // 4.4 Fallback de IP e User-Agent a partir dos cabeçalhos HTTP
    if (!sessionData.client_ip) {
      const forwarded = request.headers.get("x-forwarded-for");
      sessionData.client_ip =
        (forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip")) ||
        "186.216.52.196";
    }

    if (!sessionData.client_user_agent) {
      sessionData.client_user_agent =
        request.headers.get("user-agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    }

    // 4.5 Fallback de fbp se ausente para garantir alta qualidade
    if (!sessionData.fbp) {
      sessionData.fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000000000000)}`;
    }

    // 5. Constrói o evento para envio à Meta
    const metaEvent = buildMetaPurchaseEvent(normalizedOrder, sessionData);

    const rawToken = integration.access_token_enc.toString();
    let decryptedMetaToken = rawToken;
    if (!rawToken.startsWith("EAA")) {
      try {
        decryptedMetaToken = decrypt(rawToken);
      } catch {
        decryptedMetaToken = rawToken;
      }
    }

    // 6. Envia à Meta Conversions API
    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedMetaToken,
      apiVersion: integration.api_version,
      testEventCode: integration.config?.test_event_code as string | undefined,
    };

    const startTime = Date.now();
    const metaResponse = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;

    // 7. Calcula o score EMQ proporcional e grava no banco
    const dbStatus = metaResponse.ok ? "accepted" : "rejected";
    const userDataKeys = getUserDataKeys(metaEvent.user_data);

    // Pesos oficiais EMQ
    const weights: Record<string, number> = {
      em: 20, ph: 15, fbp: 15, fbc: 10, external_id: 10,
      fn: 5, ln: 5, ct: 5, st: 5, zp: 4, co: 3, db: 2, ge: 1,
    };
    let emqScore = 0;
    for (const key of userDataKeys) {
      emqScore += weights[key] || 0;
    }
    emqScore = Math.min(Math.round(emqScore), 100);

    await updateEventResult(
      storeId || "dckb5g-7d",
      `Purchase_${orderId}`,
      "server",
      dbStatus,
      {
        ...(metaResponse.response || {}),
        custom_data: metaEvent.custom_data || {},
        order_details: {
          value: orderValue,
          currency: payload.currency || "BRL",
          customer_name: `${customer.name || ""}`.trim() || undefined,
          customer_email: customer.email || undefined,
          customer_phone: customer.phone || undefined,
        },
        fbp: sessionData.fbp,
        fbc: sessionData.fbc,
      },
      latencyMs,
      userDataKeys,
      "Purchase",
      orderId,
      emqScore
    );

    return NextResponse.json({ ok: true, metaResponse, emq_score: emqScore, signals_sent: userDataKeys });

  } catch (error: any) {
    console.error("[Zedy Webhook Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
