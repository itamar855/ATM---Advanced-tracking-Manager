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
    const eventType = payload.event;
    if (eventType !== "transaction.approved" && eventType !== "transaction.paid" && payload.status !== "approved") {
      return NextResponse.json({ ok: true, message: "Ignorado (não aprovado)" }, { status: 200 });
    }

    const orderId = String(payload.id || payload.transaction_id || payload.order_id);
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

    // 3. Normaliza os dados vindos do Zedy de acordo com a interface do NormalizedOrder
    const customer = payload.customer || {};
    const address = payload.address || customer.address || {};
    
    const metadata = payload.metadata || {};
    const utmSource = metadata.utm_source || payload.utm_source || "";
    const utmCampaign = metadata.utm_campaign || payload.utm_campaign || "";
    const utmMedium = metadata.utm_medium || payload.utm_medium || "";
    const utmContent = metadata.utm_content || payload.utm_content || "";
    const utmTerm = metadata.utm_term || payload.utm_term || "";
    const trackId = metadata.track_id || metadata._ztid || payload.track_id || "";

    const normalizedOrder: NormalizedOrder = {
      orderId,
      customer: {
        email: customer.email || "",
        phone: customer.phone || "",
        firstName: customer.first_name || customer.name?.split(" ")[0] || "",
        lastName: customer.last_name || customer.name?.split(" ").slice(1).join(" ") || "",
        externalId: customer.id || "",
      },
      address: {
        city: address.city || "",
        state: address.state || "",
        zip: address.zip_code || address.zipcode || "",
        country: address.country || "BR",
      },
      products: (payload.items || []).map((item: any) => ({
        id: String(item.id || item.product_id),
        name: item.name || item.title || "",
        quantity: Number(item.quantity || 1),
        price: Number(item.price || item.unit_price || 0) / (payload.amount ? 100 : 1),
      })),
      value: Number(payload.amount || payload.total_price || payload.value || 0) / (payload.amount ? 100 : 1),
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
