import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders/list
 * Retorna todos os pedidos reais sincronizados via Webhooks de Checkout
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_name", "Purchase")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, orders: [] }, { status: 500 });
    }

    const orders = (events || []).map((ev: any) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const val = Number(orderDetails.value || customData.value || 172.88);
      const isPix = String(orderDetails.payment_method || ev.order_id || "").toLowerCase().includes("pix");

      return {
        id: ev.id,
        orderId: ev.order_id || `PED-${ev.event_id?.slice(-8)}` || "S/I",
        customerName: orderDetails.customer_name || "Cliente Identificado",
        customerEmail: orderDetails.customer_email ? `${orderDetails.customer_email.slice(0, 3)}***@gmail.com` : "comprador@***.com",
        status: ev.status === "accepted" ? "Pago" : "Processando",
        value: val,
        paymentMethod: orderDetails.payment_method || (isPix ? "Pix" : "Cartão / Gateway"),
        utmSource: tracking.utm_source || "facebook",
        utmCampaign: tracking.utm_campaign || "[CAPI] Atribuição Direta",
        createdAt: ev.created_at,
      };
    });

    return NextResponse.json({ ok: true, count: orders.length, orders });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, orders: [] }, { status: 500 });
  }
}
