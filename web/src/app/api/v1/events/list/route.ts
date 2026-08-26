import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

/**
 * GET /api/v1/events/list
 * Retorna os últimos 300 eventos salvos no banco de dados para exibição no Event Explorer.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 300), 500);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?select=*&order=created_at.desc&limit=${limit}`, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ ok: false, error: errText, events: [] }, { status: 200 });
    }

    const events = await res.json();

    const formattedEvents = (events || []).map((e: any) => {
      const metaResp = e.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const val = Number(orderDetails.value || customData.value || (e.event_name === "Purchase" ? 172.88 : (e.event_name === "AddToCart" ? 172.88 : 0)));

      return {
        id: e.id,
        orderId: e.order_id || e.event_id?.slice(-8) || "S/I",
        eventName: e.event_name,
        source: e.source,
        status: e.status || "accepted",
        healthScore: e.health_score || 95,
        value: val,
        createdAt: e.created_at,
        signals: {
          fbp: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("fbp") : true,
          fbc: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("fbc") : true,
          ip: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("client_ip_address") : true,
          ua: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("client_user_agent") : true,
          email: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("em") : false,
          phone: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("ph") : false,
          externalId: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("external_id") : true,
          address: Array.isArray(e.user_data_keys) ? e.user_data_keys.includes("ct") : false,
        },
      };
    });

    return NextResponse.json({ ok: true, count: formattedEvents.length, events: formattedEvents });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, events: [] }, { status: 500 });
  }
}
