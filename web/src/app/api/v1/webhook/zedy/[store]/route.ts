import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reservePurchase, updateEventStatus } from "@/lib/tracking/dedup-engine";
import { buildMetaPurchaseEvent } from "@/lib/tracking/event-builder";
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

    // 2. Busca integração ativa da Meta CAPI
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

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

    // 4. Busca os dados coletados de fbp/fbc associados a este trackId na sessão
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

    // 5. Constrói o evento para envio à Meta
    const metaEvent = buildMetaPurchaseEvent(normalizedOrder, sessionData);

    const decryptedMetaToken = decrypt(integration.access_token_enc.toString());

    // 6. Envia à Meta Conversions API
    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedMetaToken,
      apiVersion: integration.api_version,
      testEventCode: integration.config?.test_event_code as string | undefined,
    };

    const metaResponse = await sendMetaCAPIEvent(capiConfig, metaEvent);

    // 7. Registra no banco
    const dbStatus = metaResponse.ok ? "accepted" : "rejected";
    const errors = metaResponse.ok ? null : { metaError: metaResponse.error };

    await updateEventStatus(storeId, orderId, dbStatus, errors);

    return NextResponse.json({ ok: true, metaResponse });

  } catch (error: any) {
    console.error("[Zedy Webhook Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
