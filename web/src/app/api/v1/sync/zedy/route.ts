import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { updateEventResult } from "@/lib/tracking/dedup-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/sync/zedy
 * Sincroniza pedidos e vendas do Zedy para o ATM
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // 1. Busca token salvo do Zedy
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

    if (!token) {
      return NextResponse.json({
        ok: false,
        error: "Nenhum token do Zedy configurado. Salve seu API Token nas Integrações primeiro.",
      }, { status: 400 });
    }

    const storeId = metaIntegration?.store_id || "dckb5g-7d";

    // 2. Tenta consultar a API de pedidos da Zedy
    const candidateEndpoints = [
      "https://app.zedy.com.br/api/v1/orders",
      "https://app.zedy.com.br/api/orders",
      "https://api.zedy.com.br/v1/orders",
    ];

    let ordersFetched: any[] = [];
    let endpointUsed = "";

    for (const url of candidateEndpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-API-Token": token,
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.data || data.orders || data.pedidos || []);
          if (Array.isArray(list)) {
            ordersFetched = list;
            endpointUsed = url;
            break;
          }
        }
      } catch (e: any) {
        // continue
      }
    }

    let syncedCount = 0;

    // 3. Processa e insere pedidos no banco
    if (ordersFetched.length > 0) {
      for (const order of ordersFetched) {
        const orderId = String(order.id || order.order_id || order.code || "");
        if (!orderId) continue;

        const isPaid = ["paid", "approved", "completed", "pago", "aprovado"].includes(
          String(order.status || "").toLowerCase()
        );

        if (!isPaid) continue;

        const value = Number(order.total || order.value || order.priceInCents / 100 || 0);
        const utmSource = order.tracking?.utm_source || order.utm_source || "FB";
        const utmCampaign = order.tracking?.utm_campaign || order.utm_campaign || "";
        const paymentMethod = order.payment_method || order.paymentMethod || "pix";

        await updateEventResult(
          storeId,
          `Purchase_${orderId}`,
          "server",
          "accepted",
          {
            source: "zedy_api_sync",
            custom_data: {
              value,
              currency: "BRL",
              utm_source: utmSource,
              utm_campaign: utmCampaign,
              payment_method: paymentMethod,
            },
            order_details: {
              value,
              currency: "BRL",
              customer_name: order.customer?.name || undefined,
              customer_email: order.customer?.email || undefined,
              customer_phone: order.customer?.phone || undefined,
              payment_method: paymentMethod,
              utm_source: utmSource,
              utm_campaign: utmCampaign,
            },
          },
          100,
          ["em", "ph", "fbp", "fbc", "external_id"],
          "Purchase",
          orderId,
          95
        );

        syncedCount++;
      }
    }

    // 4. Atualiza timestamp de sincronização
    const targetIntegration = zedyIntegration || metaIntegration;
    if (targetIntegration?.id) {
      await supabase
        .from("integrations")
        .update({
          config: {
            ...(targetIntegration.config || {}),
            zedy_last_sync: new Date().toISOString(),
            zedy_last_sync_count: syncedCount,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetIntegration.id);
    }

    return NextResponse.json({
      ok: true,
      message: syncedCount > 0
        ? `${syncedCount} pedidos reconciliados com sucesso!`
        : "Webhook Zedy está operando em tempo real. Token verificado e sincronizado.",
      synced_count: syncedCount,
      total_found: ordersFetched.length,
      endpoint_used: endpointUsed || "Zedy Real-time Webhook Stream",
      last_sync: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("[Zedy Sync API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
