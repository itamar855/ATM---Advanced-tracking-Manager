import { requireStoreAccess } from "@/lib/auth/guard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders/list
 * Retorna todos os pedidos reais sincronizados via Webhooks de Checkout ou Browser Purchase
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const access = await requireStoreAccess(storeId);
    if (!access.ok) return access.response;

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required", orders: [] }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("store_id", storeId)
      .eq("event_name", "Purchase")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, orders: [] }, { status: 500 });
    }

    // Busca logs de recuperação forense exclusivamente para os pedidos carregados (Index Lookup)
    const recoveryMap = new Map<string, any>();
    const orderIds = (events || [])
      .map((ev: any) => ev.order_id)
      .filter(Boolean);

    if (orderIds.length > 0) {
      try {
        const { data: recoveryLogs } = await supabase
          .from("attribution_recovery_log")
          .select("order_id, campaign_id, source, confidence_score, evidence")
          .eq("store_id", storeId)
          .in("order_id", orderIds);

        if (recoveryLogs) {
          for (const log of recoveryLogs) {
            recoveryMap.set(log.order_id, log);
          }
        }
      } catch {
        // Falha silenciosa caso tabela de log ainda não tenha sido aplicada no Supabase
      }
    }

    const orders = (events || []).map((ev: any) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || customData.tracking_params || {};

      const val = Number(orderDetails.value || customData.value || 0);
      const isPix = String(orderDetails.payment_method || customData.payment_method || ev.order_id || "").toLowerCase().includes("pix");

      // Cascata de extração das UTMs
      const rawCamp = String(orderDetails.utm_campaign || customData.utm_campaign || tracking.utm_campaign || "").trim();
      const rawSource = String(orderDetails.utm_source || customData.utm_source || tracking.utm_source || "").trim();
      const rawMedium = String(orderDetails.utm_medium || customData.utm_medium || tracking.utm_medium || "").trim();
      const rawContent = String(orderDetails.utm_content || customData.utm_content || tracking.utm_content || "").trim();

      const fallbackId = ev.event_id ? `PED-${String(ev.event_id).slice(-8)}` : "S/I";
      const orderKey = ev.order_id || fallbackId;
      const recovered = recoveryMap.get(orderKey) || recoveryMap.get(ev.order_id);

      let utmCamp = rawCamp;
      let utmSourceVal = rawSource;
      let isRecovered = Boolean(customData.attribution_recovered || orderDetails.attribution_recovered);
      let recoveryScore = customData.attribution_confidence || orderDetails.attribution_confidence || null;

      if (!utmCamp && recovered && recovered.confidence_score >= 50) {
        utmCamp = recovered.evidence?.attribution_decision?.resolvedCampaignName || recovered.campaign_id || utmCamp;
        if (!utmSourceVal) utmSourceVal = recovered.source;
        isRecovered = true;
        recoveryScore = recovered.confidence_score;
      }

      const cleanSource = utmSourceVal ? (utmSourceVal.startsWith("FB") ? "FB" : utmSourceVal.toUpperCase()) : "FB";

      return {
        id: ev.id,
        orderId: orderKey,
        customerName: orderDetails.customer_name || "Cliente não informado",
        customerEmail: maskEmail(orderDetails.customer_email),
        status: ev.status === "accepted" ? "PAGO" : "PROCESSANDO",
        value: val,
        paymentMethod: orderDetails.payment_method || (isPix ? "Pix" : "Cartão / Gateway"),
        utmSource: cleanSource,
        utmCampaign: utmCamp || "[CAPI] Atribuição Direta",
        utmMedium: rawMedium || undefined,
        utmContent: rawContent || undefined,
        createdAt: ev.created_at,
        attributionRecovered: isRecovered,
        attributionConfidence: recoveryScore,
      };
    });

    return NextResponse.json({ ok: true, count: orders.length, orders });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, orders: [] }, { status: 500 });
  }
}

/** "maria@uol.com.br" → "mar***@uol.com.br". Vazio quando o checkout não mandou e-mail. */
function maskEmail(email: unknown): string {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "";
  return `${e.slice(0, Math.min(3, at))}***${e.slice(at)}`;
}
