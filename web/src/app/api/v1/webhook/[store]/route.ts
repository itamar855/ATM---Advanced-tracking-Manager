import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reservePurchase, updateEventStatus } from "@/lib/tracking/dedup-engine";
import { buildMetaPurchaseEvent } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { calculateHealthScore } from "@/lib/tracking/health-score";
import { decrypt } from "@/lib/encryption";
import { NormalizedOrder } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store: storeId } = await params;
  const startTime = Date.now();

  try {
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const topicHeader = request.headers.get("x-shopify-topic");
    const rawBody = await request.text();

    if (!hmacHeader || (topicHeader !== "orders/paid" && topicHeader !== "orders/create")) {
      return new NextResponse("Invalid topic or headers", { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const orderId = String(payload.id);

    const isPending = payload.financial_status === "pending" || payload.financial_status === "authorized";

    // 1. Tratamento específico para criação de pedido pendente (PIX/Boleto aguardando pagamento)
    // Não adquire lock de Purchase para permitir que orders/paid seja processado quando o pagamento for aprovado
    if (topicHeader === "orders/create" && isPending) {
      const gatewayRaw = String(payload.payment_gateway_names?.[0] || payload.gateway || "").toLowerCase();
      let cleanPaymentMethod = "PEDIDO";
      if (gatewayRaw.includes("pix")) cleanPaymentMethod = "PIX";
      else if (gatewayRaw.includes("boleto")) cleanPaymentMethod = "BOLETO";
      else if (gatewayRaw.includes("card") || gatewayRaw.includes("cartao") || gatewayRaw.includes("credit")) cleanPaymentMethod = "CARTÃO";
      else if (gatewayRaw) cleanPaymentMethod = gatewayRaw.toUpperCase();
      const customerName = `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim() || "Cliente";

      console.log("[NOTIFICATION_PENDING_TRIGGER]", {
        orderId,
        paymentMethod: cleanPaymentMethod,
        status: payload.financial_status,
        storeId,
      });

      try {
        const { dispatchOrderNotification } = await import("@/lib/notifications/notification-service");
        await dispatchOrderNotification({
          storeId,
          orderId,
          type: "pending",
          value: Number(payload.total_price || 0),
          currency: payload.currency || "BRL",
          paymentMethod: cleanPaymentMethod,
          customerName,
          itemsSummary: payload.line_items?.[0]?.title,
        });
      } catch (e: any) {
        console.warn("[Shopify Webhook Pending Notification Error]:", e?.message);
      }

      return NextResponse.json({
        ok: true,
        message: "Pedido pendente registrado e notificado com sucesso",
        order_id: orderId,
        type: "pending",
      }, { status: 200 });
    }

    // 2. Lock de Idempotência para Venda Aprovada (Purchase)
    const lock = await reservePurchase(storeId, orderId);
    if (!lock.acquired) {
      if (lock.state === "sent") {
        return NextResponse.json({ ok: true, message: "Purchase duplicado ignorado (já enviado)" }, { status: 200 });
      }
      return NextResponse.json({ ok: true, message: "Purchase em processamento concorrente" }, { status: 202 });
    }

    const supabase = await createClient();

    // 2. Tentar buscar integração ativa da Meta CAPI para esta loja
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration) {
      await updateEventStatus(storeId, orderId, "failed", { error: "Sem integração Meta CAPI ativa" });
      return NextResponse.json({ ok: false, error: "Integração Meta CAPI não configurada" }, { status: 400 });
    }

    // 3. Recuperar track_id (ztid) contido nos parâmetros do pedido
    // Procura o marcador nos campos comuns de UTMs/Tracking
    const noteAttributes = payload.note_attributes || [];
    let trackId = "";
    
    const trackIdAttr = noteAttributes.find((attr: any) => attr.name === "_ztid" || attr.name === "track_id");
    if (trackIdAttr) {
      trackId = trackIdAttr.value;
    }

    // Fallback: Procura na landing_site/referring_site por regex ztid
    if (!trackId) {
      const trackingSource = `${payload.landing_site || ""}|${payload.referring_site || ""}`;
      const match = trackingSource.match(/(?:^|:|_)ztid_([A-Za-z0-9_-]{16,80})(?:::|_|$)/);
      if (match) {
        trackId = match[1];
      }
    }

    // 4. Carrega os dados de sessão se o track_id for localizado
    let sessionData: any = {};
    if (trackId) {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("store_id", storeId)
        .eq("track_id", trackId)
        .maybeSingle();

      if (!sessionError && session) {
        sessionData = session;
      }
    }

    // 4.1 Busca Reversa por Email/Telefone caso não tenha achado a sessão ou falte dados cruciais
    const customerEmail = payload.customer?.email || payload.email;
    if ((!sessionData.fbp || !sessionData.fbc) && customerEmail) {
      try {
        const { data: revSession } = await supabase
          .from("sessions")
          .select("fbp, fbc, client_ip, client_user_agent")
          .eq("store_id", storeId)
          .ilike("event_source_url", `%${customerEmail}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (revSession) {
          if (!sessionData.fbp) sessionData.fbp = revSession.fbp;
          if (!sessionData.fbc) sessionData.fbc = revSession.fbc;
          if (!sessionData.client_ip) sessionData.client_ip = revSession.client_ip;
          if (!sessionData.client_user_agent) sessionData.client_user_agent = revSession.client_user_agent;
        }
      } catch (err) {}
    }

    // 4.2 Recuperação Mágica de fbc via utm_content (ex: formato Utmify Ad|id::fbclid)
    const utmContent = payload.utm_content || "";
    if (!sessionData.fbc && utmContent && utmContent.includes("::")) {
      const parts = utmContent.split("::");
      for (const p of parts) {
        if (p.length > 40 && /^[a-zA-Z0-9_\-]+$/.test(p)) {
          sessionData.fbc = `fb.1.${Date.now()}.${p}`;
          break;
        }
      }
    }

    // 5. Normalizar o payload do webhook do Shopify
    const firstProduct = payload.line_items?.[0] || {};
    const normalizedOrder: NormalizedOrder = {
      orderId,
      trackId: trackId || undefined,
      value: parseFloat(payload.total_price || "0"),
      currency: payload.currency || "BRL",
      customer: {
        email: payload.customer?.email || payload.email || undefined,
        phone: payload.customer?.phone || payload.phone || undefined,
        firstName: payload.customer?.first_name || undefined,
        lastName: payload.customer?.last_name || undefined,
        externalId: payload.customer?.id ? String(payload.customer.id) : undefined,
      },
      address: {
        city: payload.billing_address?.city || payload.shipping_address?.city || undefined,
        state: payload.billing_address?.province_code || payload.shipping_address?.province_code || undefined,
        zip: payload.billing_address?.zip || payload.shipping_address?.zip || undefined,
        country: payload.billing_address?.country_code || payload.shipping_address?.country_code || undefined,
      },
      products: (payload.line_items || []).map((item: any) => ({
        id: String(item.variant_id || item.product_id),
        name: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price || "0")
      })),
      timestamps: {
        created: payload.created_at,
        paid: payload.processed_at || new Date().toISOString()
      },
      trackingParams: {
        utm_source: payload.utm_source || "",
        utm_medium: payload.utm_medium || "",
        utm_campaign: payload.utm_campaign || "",
        utm_content: payload.utm_content || "",
        utm_term: payload.utm_term || "",
        event_source_url: payload.landing_site || ""
      }
    };

    // Cruzamento de Identidade & Retroalimentação de Eventos (Identity Stitching)
    if (normalizedOrder.customer.email || normalizedOrder.customer.phone) {
      try {
        const { stitchVisitorIdentity, enrichAndFlushBufferedEvents, retroactivelyEnrichCompletedEvents } = await import("@/lib/tracking/identity-stitcher");
        const fullPii = {
          phone: normalizedOrder.customer.phone,
          email: normalizedOrder.customer.email,
          firstName: normalizedOrder.customer.firstName || undefined,
          lastName: normalizedOrder.customer.lastName || undefined,
          city: normalizedOrder.address.city || undefined,
          state: normalizedOrder.address.state || undefined,
          zip: normalizedOrder.address.zip || undefined,
          country: normalizedOrder.address.country || "BR",
          fbp: sessionData.fbp,
          fbc: sessionData.fbc,
          client_ip: sessionData.client_ip,
          client_user_agent: sessionData.client_user_agent,
        };

        stitchVisitorIdentity(storeId, trackId, sessionData.fbp, fullPii).catch(() => {});
        enrichAndFlushBufferedEvents(storeId, trackId, sessionData.fbp, fullPii).catch(() => {});
        retroactivelyEnrichCompletedEvents(storeId, trackId, sessionData.fbp, fullPii).catch(() => {});
      } catch {}
    }

    // 6. Construir e validar Evento Meta
    const metaEvent = buildMetaPurchaseEvent(normalizedOrder, sessionData);

    // 7. Calcular o Health Score
    const hasFbc = !!sessionData.fbc;
    const isMetaClick = !!sessionData.fbclid || hasFbc;
    
    const scoreResult = calculateHealthScore({
      hasFbp: !!sessionData.fbp,
      hasFbc,
      hasFbclid: !!sessionData.fbclid,
      hasClientIp: !!sessionData.client_ip,
      hasClientUserAgent: !!sessionData.client_user_agent,
      hasEmail: !!normalizedOrder.customer.email,
      hasPhone: !!normalizedOrder.customer.phone,
      hasExternalId: !!metaEvent.user_data.external_id,
      hasCity: !!normalizedOrder.address.city,
      hasState: !!normalizedOrder.address.state,
      hasZip: !!normalizedOrder.address.zip,
      hasCountry: !!normalizedOrder.address.country,
      hasContentIds: metaEvent.custom_data?.content_ids ? metaEvent.custom_data.content_ids.length > 0 : false,
      hasContents: metaEvent.custom_data?.contents ? metaEvent.custom_data.contents.length > 0 : false,
      hasConsistentEventId: metaEvent.event_id === `Purchase_${orderId}`,
      metaAccepted: true, // Será atualizado após despacho
      isMetaClick
    });

    // 8. Obter credenciais criptografadas de despacho
    const decryptedToken = decrypt(integration.access_token_enc.toString());
    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedToken,
      apiVersion: integration.api_version,
      testEventCode: integration.config?.test_event_code
    };

    // 9. Enviar à Meta CAPI
    const capiResult = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;

    if (capiResult.ok) {
      await updateEventStatus(storeId, orderId, "accepted", capiResult.response, latencyMs);
      
      // Atualizar o Health Score do evento na tabela
      await supabase
        .from("events")
        .update({ health_score: scoreResult.score })
        .eq("store_id", storeId)
        .eq("event_id", metaEvent.event_id)
        .eq("source", "server");

      const gatewayRaw = String(payload.payment_gateway_names?.[0] || payload.gateway || "").toLowerCase();
      let cleanPaymentMethod = "PEDIDO";
      if (gatewayRaw.includes("pix")) cleanPaymentMethod = "PIX";
      else if (gatewayRaw.includes("boleto")) cleanPaymentMethod = "BOLETO";
      else if (gatewayRaw.includes("card") || gatewayRaw.includes("cartao") || gatewayRaw.includes("credit")) cleanPaymentMethod = "CARTÃO";
      else if (gatewayRaw) cleanPaymentMethod = gatewayRaw.toUpperCase();

      const customerName = `${normalizedOrder.customer.firstName || ""} ${normalizedOrder.customer.lastName || ""}`.trim() || "Cliente";

      // Disparo unificado de notificação interna (Realtime + Toast) + Web Push nativo
      try {
        const { dispatchOrderNotification } = await import("@/lib/notifications/notification-service");
        await dispatchOrderNotification({
          storeId,
          orderId,
          type: "approved",
          value: Number(payload.total_price || 0),
          currency: payload.currency || "BRL",
          paymentMethod: cleanPaymentMethod,
          customerName,
          itemsSummary: payload.line_items?.[0]?.title,
        });
      } catch (pushErr) {
        console.warn("[Notification Shopify Approved Error]:", pushErr);
      }

      return NextResponse.json({
        ok: true,
        message: "Purchase CAPI processado com sucesso",
        event_id: metaEvent.event_id,
        health_score: scoreResult.score
      });
    } else {
      await updateEventStatus(storeId, orderId, "rejected", { error: capiResult.error }, latencyMs);
      return NextResponse.json({ ok: false, error: capiResult.error }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`[Webhook Process Error] Falha crítica no pipeline do store [${storeId}]:`, error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
