import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { reservePurchase, updateEventResult } from "@/lib/tracking/dedup-engine";
import { buildMetaPurchaseEvent } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { decrypt } from "@/lib/encryption";
import { NormalizedOrder } from "@/lib/types";

/**
 * POST /api/v1/webhook/vega/[store]
 * Webhook unificado para o Vega Checkout.
 * Processa transações aprovadas/pagas e despacha para a Meta Conversions API (CAPI).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store: storeId } = await params;
  const startTime = Date.now();

  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Identifica o tipo de evento do Vega Checkout:
    // 1. Purchase (Venda aprovada/paga)
    // 2. InitiateCheckout (Carrinho abandonado)
    // 3. AddPaymentInfo (Aguardando pagamento / PIX ou Boleto gerado)
    const eventType = (payload.event || payload.eventType || payload.type || "").toLowerCase();
    const status = (payload.status || payload.order_status || "").toLowerCase();

    let metaEventName: "Purchase" | "InitiateCheckout" | "AddPaymentInfo" = "Purchase";
    let isTrackable = false;

    const eventStr = `${eventType} ${status}`.toLowerCase();

    if (
      eventStr.includes("paid") ||
      eventStr.includes("approved") ||
      eventStr.includes("aprovad") ||
      eventStr.includes("pago") ||
      eventStr.includes("purchase") ||
      eventStr.includes("venda_aprovada")
    ) {
      metaEventName = "Purchase";
      isTrackable = true;
    } else if (
      eventStr.includes("abandon") ||
      eventStr.includes("carrinho_abandonado")
    ) {
      metaEventName = "InitiateCheckout";
      isTrackable = true;
    } else if (
      eventStr.includes("waiting") ||
      eventStr.includes("aguardando") ||
      eventStr.includes("pix") ||
      eventStr.includes("boleto") ||
      eventStr.includes("pending") ||
      eventStr.includes("venda_aguardando_pagamento")
    ) {
      metaEventName = "AddPaymentInfo";
      isTrackable = true;
    }

    if (!isTrackable) {
      return NextResponse.json({ ok: true, message: `Evento [${eventType || status}] ignorado para CAPI` }, { status: 200 });
    }

    // Extração do identificador do pedido/transação/carrinho (com fallbacks para simulação do Vega)
    let orderId = String(
      payload.order_id ||
      payload.orderId ||
      payload.id ||
      payload.code ||
      payload.cart_id ||
      payload.transaction_id ||
      payload.checkout_id ||
      payload.checkout?.id ||
      payload.checkout?.code ||
      payload.data?.id ||
      ""
    );

    // Se for modo de teste/simulação do Vega e não veio ID explícito
    if (!orderId && (payload.test_mode || payload.is_test)) {
      orderId = "VEGA_TEST_" + Date.now();
    }

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Identificador do pedido/carrinho ausente" }, { status: 400 });
    }

    // 1. Lock de Idempotência (para Purchase em produção real)
    const isTestMode = Boolean(payload.test_mode || payload.is_test || orderId.startsWith("VEGA_TEST_"));
    if (metaEventName === "Purchase" && !isTestMode) {
      const lock = await reservePurchase(storeId, orderId);
      if (!lock.acquired) {
        return NextResponse.json({ ok: true, message: "Pedido duplicado ignorado" }, { status: 200 });
      }
    }

    const supabase = createAdminClient();

    // 2. Busca integração ativa da Meta CAPI (com fallback resiliente)
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
          try {
            accessToken = decrypt(raw);
          } catch {
            accessToken = raw;
          }
        }
        testEventCode = integration.config?.test_event_code || testEventCode;
      }
    } catch {
      console.warn("[Vega Webhook] Fallback de integração aplicado.");
    }

    if (!pixelId) {
      pixelId = process.env.META_PIXEL_ID || "1104875232197441";
    }
    if (!accessToken) {
      accessToken =
        process.env.META_ACCESS_TOKEN ||
        "EAAPDF3XrnKgBSWbroWaXlqmY7yDXJYWBEwMZAFpDPKzk5TsFNgWayueQpn5J4eFWohXFNG4eMYMxOMtHZAjXS2EzvErOrD4Ju50N2rft10aAcTlND6OR8u8p1nB1ZAZAIVWJiLMeqYsXZC70v7w694XAbmYEcStPnM9iwThUJpNxHYYuyXjIdZAL2ZANcpDZCgxUSWyn3jRAEZAKI";
    }

    // 3. Normalização dos dados do cliente e pedido do Vega Checkout
    const customer = payload.customer || payload.buyer || payload.client || {};
    const address = payload.address || payload.shipping_address || payload.billing_address || {};
    const trackingParams = payload.tracking_params || payload.trackingParameters || payload.metadata || {};

    const utmSource = trackingParams.utm_source || payload.utm_source || "";
    const utmCampaign = trackingParams.utm_campaign || payload.utm_campaign || "";
    const utmMedium = trackingParams.utm_medium || payload.utm_medium || "";
    const utmContent = trackingParams.utm_content || payload.utm_content || "";
    const utmTerm = trackingParams.utm_term || payload.utm_term || "";
    const trackId = trackingParams.track_id || trackingParams._ztid || payload.track_id || "";

    // Valor da transação (cobrindo todas as variações de payload do Vega / Zedy / Gateways)
    let orderValue = 0;
    if (payload.total_price !== undefined && payload.total_price !== null) {
      orderValue = Number(payload.total_price);
    } else if (payload.totalPrice !== undefined && payload.totalPrice !== null) {
      orderValue = Number(payload.totalPrice);
    } else if (payload.value !== undefined && payload.value !== null) {
      orderValue = Number(payload.value);
    } else if (payload.amount !== undefined && payload.amount !== null) {
      orderValue = Number(payload.amount);
    } else if (payload.total_amount !== undefined && payload.total_amount !== null) {
      orderValue = Number(payload.total_amount);
    } else if (payload.totalPriceInCents !== undefined && payload.totalPriceInCents !== null) {
      orderValue = Number(payload.totalPriceInCents) / 100;
    } else if (payload.total !== undefined && payload.total !== null) {
      orderValue = Number(payload.total);
    }

    const rawProducts = payload.items || payload.products || payload.line_items || [];
    const products = rawProducts.map((item: any) => ({
      id: String(item.id || item.product_id || item.variant_id || "PROD"),
      name: item.title || item.name || "Produto",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || item.unit_price || 0),
    }));

    const rawAddress =
      payload.address ||
      payload.customer?.address ||
      payload.shipping_address ||
      payload.billing_address ||
      payload.shippingAddress ||
      payload.billingAddress ||
      {};

    const normalizedOrder: NormalizedOrder = {
      orderId,
      customer: {
        email: customer.email || payload.email || "",
        phone: customer.phone || customer.cellphone || payload.phone || payload.telephone || "",
        firstName: (customer.name || customer.first_name || payload.name || "").split(" ")[0] || "",
        lastName: (customer.name || customer.first_name || payload.name || "").split(" ").slice(1).join(" ") || customer.last_name || "",
        externalId: customer.email || customer.document || customer.cpf || String(customer.id || ""),
      },
      address: {
        city: rawAddress.city || rawAddress.cidade || customer.city || payload.city || "",
        state: rawAddress.state || rawAddress.estado || rawAddress.province || customer.state || payload.state || "",
        zip: String(rawAddress.zipcode || rawAddress.zip || rawAddress.cep || customer.zipcode || payload.zipcode || "").replace(/\D/g, ""),
        country: rawAddress.country || rawAddress.pais || "BR",
      },
      products,
      value: orderValue,
      currency: payload.currency || "BRL",
      timestamps: {
        paid: payload.paid_at || payload.approved_at || new Date().toISOString(),
      },
      trackingParams: {
        utm_source: trackingParams.utm_source || payload.utm_source || "",
        utm_campaign: trackingParams.utm_campaign || payload.utm_campaign || "",
        utm_medium: trackingParams.utm_medium || payload.utm_medium || "",
        utm_content: trackingParams.utm_content || payload.utm_content || "",
        utm_term: trackingParams.utm_term || payload.utm_term || "",
        track_id: trackId,
      },
    };

    // 4. Busca os dados de sessão se houver track_id OU faz busca reversa por email / phone
    let sessionData: {
      fbp?: string | null;
      fbc?: string | null;
      client_ip?: string | null;
      client_user_agent?: string | null;
      event_source_url?: string | null;
    } = {};

    if (trackId) {
      const { data: dbSession } = await supabase
        .from("sessions")
        .select("*")
        .eq("track_id", trackId)
        .maybeSingle();

      if (dbSession) {
        sessionData = {
          fbp: dbSession.fbp,
          fbc: dbSession.fbc,
          client_ip: dbSession.client_ip,
          client_user_agent: dbSession.client_user_agent,
          event_source_url: dbSession.event_source_url,
        };
      }
    }

    // Recuperação Mágica de fbc via utm_content (ex: formato Utmify Ad|id::fbclid)
    const magicUtmContent = normalizedOrder.trackingParams.utm_content;
    if (!sessionData.fbc && magicUtmContent && magicUtmContent.includes("::")) {
      const parts = magicUtmContent.split("::");
      for (const p of parts) {
        if (p.length > 40 && /^[a-zA-Z0-9_\-]+$/.test(p)) {
          sessionData.fbc = `fb.1.${Date.now()}.${p}`;
          break;
        }
      }
    }

    // Busca Reversa por Email ou Telefone no histórico de sessões se fbp/fbc ainda não foi encontrado
    if (!sessionData.fbp && normalizedOrder.customer.email) {
      try {
        const { data: matchedSession } = await supabase
          .from("sessions")
          .select("fbp, fbc, client_ip, client_user_agent, event_source_url")
          .not("fbp", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matchedSession) {
          sessionData.fbp = sessionData.fbp || matchedSession.fbp;
          sessionData.fbc = sessionData.fbc || matchedSession.fbc;
          sessionData.client_ip = sessionData.client_ip || matchedSession.client_ip;
          sessionData.client_user_agent = sessionData.client_user_agent || matchedSession.client_user_agent;
        }
      } catch {}
    }

    // Cruzamento de Identidade & Retroalimentação de Eventos (Identity Stitching)
    if (normalizedOrder.customer.email || normalizedOrder.customer.phone) {
      try {
        const { stitchVisitorIdentity, enrichAndFlushBufferedEvents, retroactivelyEnrichCompletedEvents } = await import("@/lib/tracking/identity-stitcher");
        stitchVisitorIdentity(storeId, trackId, sessionData.fbp, {
          phone: normalizedOrder.customer.phone,
          email: normalizedOrder.customer.email,
          firstName: normalizedOrder.customer.firstName,
          lastName: normalizedOrder.customer.lastName,
          fbp: sessionData.fbp,
          fbc: sessionData.fbc,
          client_ip: sessionData.client_ip,
          client_user_agent: sessionData.client_user_agent,
        }).catch(() => {});

        enrichAndFlushBufferedEvents(storeId, trackId, sessionData.fbp, {
          phone: normalizedOrder.customer.phone,
          email: normalizedOrder.customer.email,
          firstName: normalizedOrder.customer.firstName,
          lastName: normalizedOrder.customer.lastName,
        }).catch(() => {});

        retroactivelyEnrichCompletedEvents(storeId, trackId, sessionData.fbp, {
          phone: normalizedOrder.customer.phone,
          email: normalizedOrder.customer.email,
        }).catch(() => {});
      } catch {}
    }

    // Fallbacks de IP e User-Agent vindos do checkout ou headers da requisição
    if (!sessionData.client_ip) {
      const forwarded = request.headers.get("x-forwarded-for");
      sessionData.client_ip =
        payload.client_ip ||
        payload.customer_ip ||
        payload.ip ||
        (forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip")) ||
        "186.216.52.196";
    }

    if (!sessionData.client_user_agent) {
      sessionData.client_user_agent =
        payload.client_user_agent ||
        payload.user_agent ||
        request.headers.get("user-agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    }

    // Se fbp ainda não existir, gera o identificador seguro
    if (!sessionData.fbp) {
      sessionData.fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000000000000)}`;
    }

    // 5. Monta o evento da Meta customizado para o evento correto
    const metaEvent = buildMetaPurchaseEvent(normalizedOrder, sessionData);
    metaEvent.event_name = metaEventName;
    metaEvent.event_id = `${metaEventName}_${orderId}`;

    // 6. Envia para a Meta CAPI
    const capiConfig = {
      pixelId: pixelId,
      accessToken: accessToken,
      apiVersion: "v23.0",
      testEventCode: testEventCode,
    };

    const metaResponse = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;
    const eventStatus = metaResponse.ok ? "accepted" : "rejected";

    const paymentMethodDetected = String(payload.payment_method || payload.gateway || payload.payment_type || (orderId.toLowerCase().includes("pix") ? "Pix" : "Cartão / Gateway"));

    await updateEventResult(
      storeId || "dckb5g-7d",
      `${metaEventName}_${orderId}`,
      "server",
      eventStatus,
      {
        ...(metaResponse.response || {}),
        custom_data: {
          value: orderValue,
          currency: payload.currency || "BRL",
        },
        order_details: {
          value: orderValue,
          currency: payload.currency || "BRL",
          customer_name: `${normalizedOrder.customer.firstName} ${normalizedOrder.customer.lastName}`.trim() || "Cliente Identificado",
          customer_email: normalizedOrder.customer.email || "",
          customer_phone: normalizedOrder.customer.phone || "",
          payment_method: paymentMethodDetected,
          tracking_params: normalizedOrder.trackingParams,
        },
      },
      latencyMs,
      Object.keys(metaEvent.user_data || {}),
      metaEventName,
      orderId
    );

    // 8. Disparo de Notificação Telegram
    try {
      const { data: storeData } = await supabase
        .from("stores")
        .select("telegram_bot_token, telegram_chat_id, telegram_notify_approved, telegram_notify_pending")
        .eq("id", storeId)
        .maybeSingle();

      const isPending = payload.status === "pending" || eventType === "ORDER_CREATED";
      
      const shouldNotify = 
        (isPending && storeData?.telegram_notify_pending !== false) ||
        (!isPending && storeData?.telegram_notify_approved !== false);

      if (storeData?.telegram_bot_token && storeData?.telegram_chat_id && shouldNotify) {
        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: payload.currency || 'BRL' }).format(orderValue);
        const customerName = `${normalizedOrder.customer.firstName} ${normalizedOrder.customer.lastName}`.trim() || "Cliente Identificado";
        
        const emoji = isPending ? "🟡" : "💰";
        const statusText = isPending ? "Venda Pendente/Pix" : "Venda Aprovada";
        const message = `${emoji} *${statusText}!*\n\n*Valor:* ${formattedValue}\n*Gateway:* Vega\n*Produto:* ${products?.[0]?.title || 'Não informado'}\n*Cliente:* ${customerName}`;

        fetch(`https://api.telegram.org/bot${storeData.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: storeData.telegram_chat_id,
            text: message,
            parse_mode: "Markdown"
          })
        }).catch(err => console.error("[Telegram Push Error (Vega)]", err));
      }
    } catch (e) {
      console.error("Erro ao buscar store para Telegram (Vega):", e);
    }

    // Disparo de Notificação Web Push Nativa (iPhone / Android / PC)
    try {
      const { sendStorePushNotification } = await import("@/lib/notifications/web-push");
      const isPending = (
        metaEventName === "AddPaymentInfo" ||
        payload.status === "pending" ||
        payload.status === "waiting_payment" ||
        eventType === "ORDER_CREATED" ||
        eventStr.includes("waiting") ||
        eventStr.includes("aguardando") ||
        eventStr.includes("pix") ||
        eventStr.includes("boleto")
      );
      const pushType = isPending ? "pending" : "approved";
      const customerName = `${normalizedOrder.customer.firstName || ""} ${normalizedOrder.customer.lastName || ""}`.trim() || "Cliente";
      sendStorePushNotification(storeId, pushType, {
        orderId,
        value: orderValue,
        customerName,
        paymentMethod: payload.payment_method || "Cartão/PIX",
        itemsSummary: products?.[0]?.title,
      }).catch((pushErr) => console.warn("[Web Push Vega Error]:", pushErr));
    } catch {}

    return NextResponse.json({
      ok: metaResponse.ok,
      event_name: metaEventName,
      order_id: orderId,
      value: orderValue,
      meta_response: metaResponse,
    });
  } catch (error: any) {
    console.error("[Vega Webhook Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
