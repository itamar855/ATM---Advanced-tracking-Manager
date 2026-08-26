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
    let testEventCode = "TEST45925"; // Código atual da sua tela da Meta

    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("store_id", storeId)
        .eq("platform", "meta")
        .eq("status", "active")
        .maybeSingle();

      if (integration) {
        pixelId = integration.pixel_id;
        try {
          accessToken = decrypt(integration.access_token_enc.toString());
        } catch {
          accessToken = integration.access_token_enc.toString();
        }
        testEventCode = integration.config?.test_event_code || testEventCode;
      }
    } catch (e) {
      console.warn("[Vega Webhook] Falha ao consultar tabela integrations, usando fallback.");
    }

    // Fallback para as credenciais oficiais da loja configurada
    if (!pixelId) {
      pixelId = process.env.META_PIXEL_ID || "1104875232197441";
    }
    if (!accessToken) {
      accessToken =
        process.env.META_ACCESS_TOKEN ||
        "EAAUoa5iQXc8BSFEcUApWDeYNMvjjo0pHZBZBuDZCUDt4lpT9AlAQERDr6dExnQGWpN76d3PCtqjZCYuIxQVGN02iqipjKFRyJwiHlMi1TYiGch5jrNbw7XwzJuDUFLwAKTExZA9ZB2bMoEHKRWrXzb16vgpilHC9eWtHANWq0mXEZBTakpDJoznJOPZBaI1TcDE2SgZDZD";
    }
    if (!testEventCode) {
      testEventCode = process.env.META_TEST_EVENT_CODE || "TEST45925";
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

    // Valor da transação
    let orderValue = 0;
    if (payload.total_amount) {
      orderValue = Number(payload.total_amount);
    } else if (payload.amount) {
      orderValue = Number(payload.amount);
    } else if (payload.totalPriceInCents) {
      orderValue = Number(payload.totalPriceInCents) / 100;
    } else if (payload.total) {
      orderValue = Number(payload.total);
    }

    const rawProducts = payload.items || payload.products || payload.line_items || [];
    const products = rawProducts.map((item: any) => ({
      id: String(item.id || item.product_id || item.variant_id || "PROD"),
      name: item.title || item.name || "Produto",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || item.unit_price || 0),
    }));

    const normalizedOrder: NormalizedOrder = {
      orderId,
      customer: {
        email: customer.email || payload.email || "",
        phone: customer.phone || customer.cellphone || payload.phone || "",
        firstName: (customer.name || customer.first_name || "").split(" ")[0] || "",
        lastName: (customer.name || "").split(" ").slice(1).join(" ") || customer.last_name || "",
        externalId: customer.email || customer.document || String(customer.id || ""),
      },
      address: {
        city: address.city || "",
        state: address.state || address.province || "",
        zip: (address.zipcode || address.zip || "").replace(/\D/g, ""),
        country: address.country || "BR",
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

    // 4. Busca os dados de sessão se houver track_id
    let sessionData = {};
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

    await updateEventResult(
      storeId || "dckb5g-7d",
      `${metaEventName}_${orderId}`,
      "server",
      eventStatus,
      metaResponse.response || null,
      latencyMs,
      Object.keys(metaEvent.user_data || {}),
      metaEventName,
      orderId
    );

    return NextResponse.json({
      ok: metaResponse.ok,
      event_name: metaEventName,
      order_id: orderId,
      meta_response: metaResponse,
    });
  } catch (error: any) {
    console.error("[Vega Webhook Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
