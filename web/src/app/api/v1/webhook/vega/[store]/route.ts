import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reservePurchase, updateEventStatus } from "@/lib/tracking/dedup-engine";
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

    if (
      eventType === "order_paid" ||
      eventType === "order_approved" ||
      eventType === "purchase" ||
      status === "paid" ||
      status === "approved" ||
      status === "pago"
    ) {
      metaEventName = "Purchase";
      isTrackable = true;
    } else if (
      eventType === "abandoned_cart" ||
      eventType === "cart_abandoned" ||
      eventType === "checkout_abandoned" ||
      eventType.includes("abandon") ||
      status.includes("abandon")
    ) {
      metaEventName = "InitiateCheckout";
      isTrackable = true;
    } else if (
      eventType === "order_waiting_payment" ||
      eventType === "waiting_payment" ||
      eventType.includes("waiting") ||
      status === "waiting_payment" ||
      status === "pending" ||
      status === "aguardando_pagamento"
    ) {
      metaEventName = "AddPaymentInfo";
      isTrackable = true;
    }

    if (!isTrackable) {
      return NextResponse.json({ ok: true, message: `Evento [${eventType || status}] ignorado para CAPI` }, { status: 200 });
    }

    const orderId = String(payload.order_id || payload.orderId || payload.id || payload.code || payload.cart_id || "");
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Identificador do pedido/carrinho ausente" }, { status: 400 });
    }

    // 1. Lock de Idempotência (para Purchase)
    if (metaEventName === "Purchase") {
      const lock = await reservePurchase(storeId, orderId);
      if (!lock.acquired) {
        return NextResponse.json({ ok: true, message: "Pedido duplicado ignorado" }, { status: 200 });
      }
    }

    const supabase = await createClient();

    // 2. Busca integração ativa da Meta CAPI
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (!integration) {
      if (metaEventName === "Purchase") {
        await updateEventStatus(storeId, orderId, "failed", { error: "Sem integração Meta ativa" });
      }
      return NextResponse.json({ ok: false, error: "Meta CAPI não configurada para esta loja" }, { status: 400 });
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
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        utm_content: utmContent,
        utm_term: utmTerm,
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

    const decryptedMetaToken = decrypt(integration.access_token_enc.toString());

    // 6. Envia para a Meta CAPI
    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedMetaToken,
      apiVersion: integration.api_version,
      testEventCode: integration.config?.test_event_code as string | undefined,
    };

    const metaResponse = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;

    if (metaEventName === "Purchase") {
      const dbStatus = metaResponse.ok ? "accepted" : "rejected";
      const errors = metaResponse.ok ? null : { metaError: metaResponse.error };
      await updateEventStatus(storeId, orderId, dbStatus, errors, latencyMs);
    }

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
