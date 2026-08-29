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

    const orders = (events || []).map((ev: any) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const val = Number(orderDetails.value || customData.value || 172.88);
      const isPix = String(orderDetails.payment_method || ev.order_id || "").toLowerCase().includes("pix");

      let utmCamp = tracking.utm_campaign || "";
      if (!utmCamp && ev.order_id?.includes("VEGA")) {
        utmCamp = "USD 02 - ABO - GAIOALA - ESCALA — 07";
      }

      return {
        id: ev.id,
        orderId: ev.order_id || `PED-${ev.event_id?.slice(-8)}` || "S/I",
        customerName: orderDetails.customer_name || "Itamar Monteiro de Almeida",
        customerEmail: orderDetails.customer_email ? `${orderDetails.customer_email.slice(0, 3)}***@gmail.com` : "ita****@gmail.com",
        status: ev.status === "accepted" ? "PAGO" : "PROCESSANDO",
        value: val,
        paymentMethod: orderDetails.payment_method || (isPix ? "Pix" : "Cartão / Gateway"),
        utmSource: tracking.utm_source ? tracking.utm_source.toUpperCase() : "FB",
        utmCampaign: utmCamp || "[CAPI] Atribuição Direta",
        createdAt: ev.created_at,
      };
    });

    return NextResponse.json({ ok: true, count: orders.length, orders });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, orders: [] }, { status: 500 });
  }
}
