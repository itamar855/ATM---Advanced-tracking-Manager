import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { updateEventResult } from "@/lib/tracking/dedup-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/sync/zedy
 * Sincroniza e reconcilia pedidos e vendas do Zedy para o ATM
 * Suporta busca via API Zedy e importação direta em lote (JSON/Array).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    let providedOrders: any[] = [];
    try {
      const body = await request.json();
      if (Array.isArray(body)) {
        providedOrders = body;
      } else if (Array.isArray(body?.orders)) {
        providedOrders = body.orders;
      } else if (Array.isArray(body?.data)) {
        providedOrders = body.data;
      } else if (typeof body?.raw_json === "string") {
        const parsed = JSON.parse(body.raw_json);
        providedOrders = Array.isArray(parsed) ? parsed : (parsed.orders || parsed.data || []);
      }
    } catch {
      // Nenhum body JSON explícito, tenta busca direta na API
    }

    // 1. Busca token salvo do Zedy e Meta
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .order("updated_at", { ascending: false });

    const zedyIntegration = integrations?.find((i) => i.platform === "zedy");
    const metaIntegration = integrations?.find((i) => i.platform === "meta");

    let token =
      zedyIntegration?.access_token_enc ||
      zedyIntegration?.config?.zedy_api_token ||
      metaIntegration?.config?.zedy_api_token ||
      "";

    if (token && !token.startsWith("zdy_")) {
      try {
        token = decrypt(token);
      } catch {
        // fallback
      }
    }

    const storeId = metaIntegration?.store_id || "dckb5g-7d";

    let ordersToProcess = [...providedOrders];
    let sourceUsed = providedOrders.length > 0 ? "manual_payload" : "api_probe";

    // Se nenhum pedido foi enviado no corpo, tenta buscar na API da Zedy
    if (ordersToProcess.length === 0 && token) {
      const candidateEndpoints = [
        "https://app.zedy.com.br/api/v1/orders",
        "https://api.zedy.com.br/v1/orders",
        "https://app.zedy.com.br/api/orders",
      ];

      for (const url of candidateEndpoints) {
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-API-Token": token,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(6000),
          });

          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.data || data.orders || data.pedidos || []);
            if (Array.isArray(list) && list.length > 0) {
              ordersToProcess = list;
              sourceUsed = url;
              break;
            }
          }
        } catch {
          // continua
        }
      }
    }

    if (ordersToProcess.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Nenhum pedido encontrado para sincronização. Forneça o array de pedidos ou verifique a conexão com a API Zedy.",
        synced_count: 0,
      });
    }

    let syncedCount = 0;
    let newInsertedCount = 0;
    let totalRevenueReconciled = 0;

    for (const order of ordersToProcess) {
      const orderId = String(
        order.id ||
        order.orderId ||
        order.order_id ||
        order.code ||
        order.numero ||
        order.transaction_id ||
        ""
      ).trim();

      if (!orderId) continue;

      const rawStatus = String(order.status || order.eventType || order.situacao || "").toLowerCase();
      const isPaid =
        rawStatus.includes("paid") ||
        rawStatus.includes("approved") ||
        rawStatus.includes("aprovado") ||
        rawStatus.includes("pago") ||
        rawStatus.includes("order_paid") ||
        rawStatus.includes("completed") ||
        rawStatus === "1";

      if (!isPaid) continue;

      // Normalização de Valor
      let rawVal = order.commission?.totalPriceInCents || order.totalPriceInCents || order.priceInCents || order.value || order.total || order.amount || 0;
      if (typeof rawVal === "string") {
        rawVal = parseFloat(rawVal.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
      }
      const orderValue = rawVal > 1000 && Number.isInteger(rawVal) ? rawVal / 100 : Number(rawVal || 0);

      // Normalização de Pagamento
      const rawMethod = String(
        order.payment_method ||
        order.paymentMethod ||
        order.payment?.method ||
        order.forma_pagamento ||
        "pix"
      ).toLowerCase();

      const paymentMethod = rawMethod.includes("pix")
        ? "pix"
        : (rawMethod.includes("card") || rawMethod.includes("cart") || rawMethod.includes("credit") ? "credit_card" : (rawMethod.includes("bol") ? "boleto" : "pix"));

      // Normalização de UTMs
      const tracking = order.trackingParameters || order.tracking_params || order.tracking || {};
      const utmSource = String(tracking.utm_source || order.utm_source || "FB").trim();
      const utmCampaign = String(tracking.utm_campaign || order.utm_campaign || "").trim();
      const utmMedium = String(tracking.utm_medium || order.utm_medium || "").trim();
      const utmContent = String(tracking.utm_content || order.utm_content || "").trim();

      // Normalização de Cliente
      const customer = order.customer || order.cliente || {};
      const customerName = String(customer.name || customer.nome || order.customer_name || "").trim();
      const customerEmail = String(customer.email || order.customer_email || "").trim();
      const customerPhone = String(customer.phone || customer.telefone || order.customer_phone || "").trim();

      const createdAt = order.createdAt || order.created_at || order.data_criacao || new Date().toISOString();

      // Grava no Supabase via updateEventResult com idempotência
      const eventId = `zedy_sync_${orderId}`;

      try {
        await updateEventResult(
          storeId,
          eventId,
          "server",
          "accepted",
          {
            source: "zedy_sync",
            fbtrace_id: `ZEDY-SYNC-${orderId.slice(-8)}`,
            custom_data: {
              value: orderValue,
              currency: "BRL",
              utm_source: utmSource,
              utm_campaign: utmCampaign,
              utm_medium: utmMedium,
              utm_content: utmContent,
              payment_method: paymentMethod,
              order_id: orderId,
            },
            order_details: {
              value: orderValue,
              currency: "BRL",
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
        console.error(`[Zedy Sync] Erro ao gravar pedido ${orderId}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Sincronização concluída: ${syncedCount} pedidos reconciliados com sucesso.`,
      synced_count: syncedCount,
      total_revenue_reconciled: totalRevenueReconciled,
      source_used: sourceUsed,
    });
  } catch (error: any) {
    console.error("[Zedy Sync API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
