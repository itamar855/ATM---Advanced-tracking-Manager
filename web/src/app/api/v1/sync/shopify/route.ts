import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateEventResult } from "@/lib/tracking/dedup-engine";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  try {
    let resetToday = false;
    try {
      const body = await request.json();
      if (body?.reset_today) {
        resetToday = true;
      }
    } catch {
      // no body
    }

    const supabase = await createClient();

    // 1. Busca loja para pegar Shopify Admin Token e Domain
    const { data: stores } = await supabase
      .from("stores")
      .select("*")
      .limit(1);

    const store = stores?.[0];
    if (!store) {
      return NextResponse.json({ ok: false, error: "Nenhuma loja encontrada" }, { status: 400 });
    }

    const domain = store.shop_domain;
    if (!domain) {
      return NextResponse.json({ ok: false, error: "Domínio da loja (Shopify) não configurado" }, { status: 400 });
    }

    let token = store.shopify_api_key_enc;
    if (token && typeof token !== "string") {
      try {
        token = decrypt(token); // se for Buffer ou bytea
      } catch {
        // fallback
      }
    } else if (typeof token === "string" && !token.startsWith("shpat_")) {
       try {
         token = decrypt(token);
       } catch {}
    }

    if (!token || !token.startsWith("shpat_")) {
      return NextResponse.json({
        ok: false,
        error: "Token da Shopify não encontrado ou inválido. Acesse Integrações e salve o Token Admin (shpat_...).",
      });
    }

    // Busca pedidos pagos na Shopify
    const shopifyUrl = `https://${domain}/admin/api/2024-01/orders.json?status=any&financial_status=paid&limit=250`;
    
    let ordersToProcess: any[] = [];

    try {
      const res = await fetch(shopifyUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return NextResponse.json({ ok: false, error: `Erro na API da Shopify: ${res.status} - ${errorText}` });
      }

      const data = await res.json();
      ordersToProcess = data.orders || [];
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: `Falha de conexão com Shopify: ${err.message}` });
    }

    if (ordersToProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Nenhum pedido pago encontrado na Shopify.",
        synced_count: 0,
      });
    }

    if (resetToday) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      await supabase
        .from("events")
        .delete()
        .eq("store_id", store.id)
        .eq("event_name", "Purchase")
        .gte("created_at", todayStart.toISOString());
    }

    let syncedCount = 0;
    let totalRevenueReconciled = 0;

    for (const order of ordersToProcess) {
      const orderId = String(order.id || order.name || "");
      if (!orderId) continue;

      // Shopify values
      const orderValue = Number(order.total_price || 0);
      const currency = order.currency || "BRL";
      
      // Payment Method
      const gateways = (order.payment_gateway_names || []).join(",").toLowerCase();
      let paymentMethod = "credit_card";
      if (gateways.includes("pix") || gateways.includes("mercadopago") || gateways.includes("pagseguro") || gateways.includes("yampi") || gateways.includes("zedy")) {
         paymentMethod = gateways.includes("pix") ? "pix" : "credit_card";
      }

      // Customer
      const customer = order.customer || {};
      const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
      const customerEmail = order.email || customer.email || "";
      const customerPhone = order.phone || customer.phone || "";

      // UTMs (Extract from Note Attributes or Landing Site)
      let utmSource = "";
      let utmCampaign = "";
      let utmMedium = "";
      let utmContent = "";

      if (Array.isArray(order.note_attributes)) {
        order.note_attributes.forEach((attr: any) => {
          const n = attr.name.toLowerCase();
          const v = attr.value;
          if (n === "utm_source" || n === "src") utmSource = v;
          if (n === "utm_campaign") utmCampaign = v;
          if (n === "utm_medium") utmMedium = v;
          if (n === "utm_content") utmContent = v;
        });
      }

      // Se não achou nos note_attributes, tenta na URL de entrada
      if (!utmSource && order.landing_site) {
        try {
          const urlParams = new URLSearchParams(order.landing_site.split("?")[1]);
          utmSource = urlParams.get("utm_source") || urlParams.get("src") || "";
          utmCampaign = urlParams.get("utm_campaign") || "";
          utmMedium = urlParams.get("utm_medium") || "";
          utmContent = urlParams.get("utm_content") || "";
        } catch {}
      }

      if (!utmSource) utmSource = "FB"; // Fallback default ATM

      const eventId = `shopify_sync_${orderId}`;

      try {
        await updateEventResult(
          store.id,
          eventId,
          "server",
          "accepted",
          {
            source: "shopify_sync",
            fbtrace_id: `SHOP-SYNC-${orderId.slice(-8)}`,
            custom_data: {
              value: orderValue,
              currency,
              utm_source: utmSource,
              utm_campaign: utmCampaign,
              utm_medium: utmMedium,
              utm_content: utmContent,
              payment_method: paymentMethod,
              order_id: orderId,
            },
            order_details: {
              value: orderValue,
              currency,
              customer_name: customerName || undefined,
              customer_email: customerEmail || undefined,
              customer_phone: customerPhone || undefined,
              payment_method: paymentMethod,
              utm_source: utmSource,
              utm_campaign: utmCampaign,
              utm_medium: utmMedium,
              utm_content: utmContent,
            },
          },
          50,
          ["em", "ph", "fn", "fbp", "external_id"],
          "Purchase",
          orderId,
          95
        );

        syncedCount++;
        totalRevenueReconciled += orderValue;
      } catch (err) {
        console.error(`[Shopify Sync] Erro ao gravar pedido ${orderId}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Sincronização concluída: ${syncedCount} pedidos reconciliados com sucesso da Shopify.`,
      synced_count: syncedCount,
      total_revenue_reconciled: totalRevenueReconciled,
    });

  } catch (error: any) {
    console.error("[Shopify Sync Error]:", error);
    return NextResponse.json({ ok: false, error: "Erro interno no servidor: " + error.message }, { status: 500 });
  }
}
