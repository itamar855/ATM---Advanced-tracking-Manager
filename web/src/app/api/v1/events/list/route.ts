import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/events/list?store_id=...
 * Retorna os últimos eventos processados da loja para exibição no Event Explorer.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Busca os últimos 50 eventos ordenados por data
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, dbError: error.message, events: [] }, { status: 200 });
    }

    const formattedEvents = (events || []).map((e) => ({
      id: e.id,
      orderId: e.order_id || e.event_id?.slice(-8) || "S/I",
      eventName: e.event_name,
      source: e.source,
      status: e.status || "accepted",
      healthScore: e.health_score || 95,
      value: e.meta_response?.custom_data?.value || 0,
      createdAt: e.created_at,
      signals: {
        fbp: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("fbp") : true,
        fbc: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("fbc") : true,
        ip: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("client_ip_address") : true,
        ua: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("client_user_agent") : true,
        email: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("em") : false,
        phone: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("ph") : false,
        externalId: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("external_id") : false,
        address: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("ct") : false,
      },
    }));

    return NextResponse.json({ ok: true, events: formattedEvents });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, events: [] }, { status: 500 });
  }
}
