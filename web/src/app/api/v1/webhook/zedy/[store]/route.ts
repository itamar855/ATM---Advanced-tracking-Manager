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

    // Zedy envia o evento de status: transações aprovadas e pendentes (PIX/Boleto gerado)
    const eventType = (payload.eventType || payload.event || "").toUpperCase();
    const status = (payload.status || payload.order_status || "").toLowerCase();
    const isApproved = eventType === "ORDER_PAID" || status === "approved" || status === "paid";
    const isPending = eventType === "ORDER_CREATED" || eventType === "ORDER_PENDING" || status === "pending" || status === "waiting_payment" || status === "aguardando_pagamento";

    if (!isApproved && !isPending) {
      return NextResponse.json({ ok: true, message: `Ignorado (evento ${eventType || status} não é venda ou pendente)` }, { status: 200 });
    }

    const orderId = String(payload.orderId || payload.id);
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Identificador do pedido ausente" }, { status: 400 });
    }

    // Identificação precisa do método de pagamento e validação de PIX real
    const paymentMethodRaw = String(
      payload.paymentMethod ||
      payload.payment_method ||
      payload.gateway ||
      payload.payment_type ||
      (payload.commission?.paymentMethod) ||
      ""
    ).toLowerCase();

    const isPix = paymentMethodRaw.includes("pix");
    const isBoleto = paymentMethodRaw.includes("boleto");
    const isCard = paymentMethodRaw.includes("card") || paymentMethodRaw.includes("cartao") || paymentMethodRaw.includes("credit");

    // Validação estrita se o Pix foi REALMENTE gerado (tem QR Code ou Copia-e-Cola emitido pelo gateway)
    const hasPixData = Boolean(
      (payload.pix_qr_code && String(payload.pix_qr_code).trim() !== "") ||
      (payload.pix_code && String(payload.pix_code).trim() !== "") ||
      (payload.pix_copy_paste && String(payload.pix_copy_paste).trim() !== "") ||
      (payload.qr_code && String(payload.qr_code).trim() !== "") ||
      (payload.qrcode && String(payload.qrcode).trim() !== "") ||
      (payload.qr_code_base64 && String(payload.qr_code_base64).trim() !== "") ||
      payload.point_of_interaction?.transaction_data?.qr_code ||
      (payload.data?.pix_qr_code && String(payload.data?.pix_qr_code).trim() !== "") ||
      (payload.data?.qr_code && String(payload.data?.qr_code).trim() !== "") ||
      (payload.order?.pix_code && String(payload.order?.pix_code).trim() !== "") ||
      (payload.transaction?.pix_code && String(payload.transaction?.pix_code).trim() !== "")
    );

    // Validação estrita de Boleto REALMENTE gerado (tem código de barras ou URL emitida)
    const hasBoletoData = Boolean(
      (payload.boleto_url && String(payload.boleto_url).trim() !== "") ||
      (payload.boleto_barcode && String(payload.boleto_barcode).trim() !== "") ||
      (payload.boleto_number && String(payload.boleto_number).trim() !== "") ||
      (payload.data?.boleto_url && String(payload.data?.boleto_url).trim() !== "") ||
      (payload.data?.boleto_barcode && String(payload.data?.boleto_barcode).trim() !== "") ||
      (payload.order?.boleto_url && String(payload.order?.boleto_url).trim() !== "")
    );

    // BLINDAGEM ESTREITA: Jamais considera PIX ou Boleto gerado se não houver a chave/documento emitido!
    // Se o cliente apenas avançou para a tela de pagamento e abandonou, NÃO É PIX GERADO (é apenas InitiateCheckout sem notificação).
    const isRealPixPending = isPix && hasPixData;
    const isRealBoletoPending = isBoleto && hasBoletoData;

    // Define evento Meta CAPI:
    // Purchase = venda confirmada
    // AddPaymentInfo = PIX gerado ou Boleto impresso real
    // InitiateCheckout = carrinho criado / início de checkout sem método de pagamento finalizado
    let metaEventName: "Purchase" | "AddPaymentInfo" | "InitiateCheckout" = "Purchase";
    if (isApproved) {
      metaEventName = "Purchase";
    } else if (isRealPixPending || isRealBoletoPending) {
      metaEventName = "AddPaymentInfo";
    } else {
      metaEventName = "InitiateCheckout";
    }

    // 1. Lock de Idempotência: bloqueia compra real ou AddPaymentInfo duplicado
    if (isApproved) {
      const lock = await reservePurchase(storeId, orderId);
      if (!lock.acquired) {
        return NextResponse.json({ ok: true, message: "Pedido aprovado duplicado ignorado" }, { status: 200 });
      }
    } else if (metaEventName === "AddPaymentInfo") {
      const { reserveEvent } = await import("@/lib/tracking/dedup-engine");
      const lock = await reserveEvent(storeId, "AddPaymentInfo", `AddPaymentInfo_${orderId}`, "server");
      if (!lock.acquired) {
        return NextResponse.json({ ok: true, message: "AddPaymentInfo duplicado ignorado" }, { status: 200 });
      }
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
    const utmSource = trackingParams.utm_source || payload.utm_source || "";
    const utmCampaign = trackingParams.utm_campaign || payload.utm_campaign || "";
    const utmMedium = trackingParams.utm_medium || payload.utm_medium || "";
    const utmContent = trackingParams.utm_content || payload.utm_content || "";
    const utmTerm = trackingParams.utm_term || payload.utm_term || "";

    // track_id injetado pelo Pixel ATM via Link Decoration (vem no payload ou em checkoutUrl)
    const checkoutUrlParams = (() => {
      try {
        const checkoutUrl = payload.checkoutUrl || payload.checkout_url || payload.orderUrl || trackingParams.checkout_url || "";
        if (checkoutUrl) return new URL(checkoutUrl).searchParams;
        return new URLSearchParams();
      } catch { return new URLSearchParams(); }
    })();

    const trackId =
      trackingParams.track_id ||
      trackingParams._ztid ||
      payload.track_id ||
      payload._ztid ||
      checkoutUrlParams.get("track_id") ||
      checkoutUrlParams.get("_ztid") ||
      "";

    // Calcula valor total com base no commission ou somatório de priceInCents
    const rawValue = payload.commission?.totalPriceInCents ||
      (payload.products || []).reduce((acc: number, p: any) => acc + (p.priceInCents * (p.quantity || 1)), 0);
    const orderValue = Number(rawValue || 0) / 100; // Converte centavos para reais

    // Método de pagamento — Zedy pode enviar em vários campos
    const paymentMethod =
      payload.paymentMethod ||
      payload.payment_method ||
      payload.gateway ||
      payload.payment_type ||
      (payload.commission?.paymentMethod) ||
      "";

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

    // 4.1.5 Recuperação Mágica de fbc via utm_content (ex: formato Utmify Ad|id::fbclid)
    if (!sessionData.fbc && utmContent && utmContent.includes("::")) {
      const parts = utmContent.split("::");
      for (const p of parts) {
        if (p.length > 40 && /^[a-zA-Z0-9_\-]+$/.test(p)) {
          sessionData.fbc = `fb.1.${Date.now()}.${p}`;
          break;
        }
      }
    }

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

    // 4.3.1 Cruzamento de Identidade & Retroalimentação de Eventos (Identity Stitching)
    if (customer.email || customer.phone) {
      try {
        const { stitchVisitorIdentity, enrichAndFlushBufferedEvents, retroactivelyEnrichCompletedEvents } = await import("@/lib/tracking/identity-stitcher");
        const fullPii = {
          phone: customer.phone,
          email: customer.email,
          firstName: customer.name?.split(" ")[0] || undefined,
          lastName: customer.name?.split(" ").slice(1).join(" ") || undefined,
          city: address.city || undefined,
          state: address.state || undefined,
          zip: address.zipcode || address.zip || undefined,
          country: address.country || "BR",
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

    // 5. Constrói o evento para envio à Meta conforme o status (Purchase se aprovado, AddPaymentInfo se pendente)
    const metaEvent = buildMetaPurchaseEvent(normalizedOrder, sessionData);
    metaEvent.event_name = metaEventName;
    metaEvent.event_id = `${metaEventName}_${orderId}`;

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
      `${metaEventName}_${orderId}`,
      "server",
      dbStatus,
      {
        ...(metaResponse.response || {}),
        // custom_data contém value e utm_source — lidos pelo dashboard para faturamento e atribuição
        custom_data: {
          ...(metaEvent.custom_data || {}),
          value: orderValue,
          currency: payload.currency || "BRL",
          utm_source: utmSource || undefined,
          utm_campaign: utmCampaign || undefined,
          utm_medium: utmMedium || undefined,
          payment_method: paymentMethod || undefined,
        },
        order_details: {
          value: orderValue,
          currency: payload.currency || "BRL",
          customer_name: `${customer.name || ""}`.trim() || undefined,
          customer_email: customer.email || undefined,
          customer_phone: customer.phone || undefined,
          payment_method: paymentMethod || undefined,
          utm_source: utmSource || undefined,
          utm_campaign: utmCampaign || undefined,
        },
        fbp: sessionData.fbp,
        fbc: sessionData.fbc,
      },
      latencyMs,
      userDataKeys,
      metaEventName,
      orderId,
      emqScore
    );

    // 8. Disparo de Notificação Pushcut
    try {
      const { data: storeData } = await supabase
        .from("stores")
        .select("telegram_bot_token, telegram_chat_id, telegram_notify_approved, telegram_notify_pending")
        .eq("id", storeId)
        .maybeSingle();

      const isApprovedNotify = isApproved;
      // Somente notifica pendente se for comprovadamente PIX Gerado ou Boleto Gerado!
      const shouldSendPendingNotification = isRealPixPending || isRealBoletoPending;

      const shouldNotifyTelegram = 
        (isApprovedNotify && storeData?.telegram_notify_approved !== false) || 
        (!isApprovedNotify && shouldSendPendingNotification && storeData?.telegram_notify_pending !== false);

      if (storeData?.telegram_bot_token && storeData?.telegram_chat_id && shouldNotifyTelegram) {
        const emoji = isApprovedNotify ? "💰" : (isRealPixPending ? "🟡" : "📄");
        const statusText = isApprovedNotify ? "Venda Aprovada" : (isRealPixPending ? "Pix Gerado" : "Boleto Gerado");
        const valueText = orderValue > 0 ? `R$ ${orderValue.toFixed(2).replace('.', ',')}` : "Valor indefinido";
        const methodLabel = isRealPixPending ? "PIX" : (isRealBoletoPending ? "Boleto" : (isCard ? "Cartão" : "Outro"));
        const message = `${emoji} *${statusText}!*\n\n*Valor:* ${valueText}\n*Gateway:* Zedy (${methodLabel})\n*Produto:* ${payload.items?.[0]?.title || payload.products?.[0]?.name || 'Não informado'}\n*Cliente:* ${customer.name || payload.customer?.name || 'Não informado'}`;

        fetch(`https://api.telegram.org/bot${storeData.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: storeData.telegram_chat_id,
            text: message,
            parse_mode: "Markdown"
          })
        }).catch(err => console.error("[Telegram Push Error]", err));
      }
    } catch (e) {
      console.error("Erro ao buscar store para Telegram (Zedy):", e);
    }

    // 8.1 Disparo de Notificação Web Push Nativa (iPhone / Android / PC)
    // Apenas dispara para compras aprovadas OU PIX/Boleto gerados de verdade!
    const shouldSendPush = isApproved || isRealPixPending || isRealBoletoPending;
    if (shouldSendPush) {
      try {
        const { sendStorePushNotification } = await import("@/lib/notifications/web-push");
        const pushType = isApproved ? "approved" : "pending";
        const cleanMethod = isRealPixPending ? "PIX" : (isRealBoletoPending ? "BOLETO" : (isCard ? "CARTÃO" : "PEDIDO"));
        sendStorePushNotification(storeId, pushType, {
          orderId,
          value: orderValue,
          customerName: customer.name || payload.customer?.name,
          paymentMethod: cleanMethod,
          itemsSummary: payload.items?.[0]?.title || payload.products?.[0]?.name,
        }).catch((pushErr) => console.warn("[Web Push Zedy Error]:", pushErr));
      } catch {}
    }

    return NextResponse.json({ ok: true, metaResponse, emq_score: emqScore, signals_sent: userDataKeys });

  } catch (error: any) {
    console.error("[Zedy Webhook Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
