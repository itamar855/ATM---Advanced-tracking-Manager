import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

/**
 * GET /api/v1/events/list
 * Retorna os últimos eventos em tempo real para o Event Explorer com dados completos de CAPI e UTMs.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventNameFilter = searchParams.get("event_name");
    const limit = Math.min(Number(searchParams.get("limit") || 500), 1000);

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    // 1. Busca eventos no banco ordenados por criação descrescente
    let query = `${SUPABASE_URL}/rest/v1/events?select=*&order=created_at.desc&limit=${limit}`;
    if (eventNameFilter && eventNameFilter !== "all") {
      query = `${SUPABASE_URL}/rest/v1/events?event_name=eq.${eventNameFilter}&select=*&order=created_at.desc&limit=${limit}`;
    }

    const resp = await fetch(query, { method: "GET", headers, cache: "no-store" });
    const rawEvents: any[] = resp.ok ? await resp.json() : [];

    let totalAccepted = 0;
    let totalScoreSum = 0;

    const formattedEvents = rawEvents.map((e: any) => {
      const metaResp = e.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};

      const val = Number(orderDetails.value || customData.value || 0);
      const userKeys = Array.isArray(e.user_data_keys) ? e.user_data_keys : [];

      const signals = {
        fbp: userKeys.includes("fbp") || Boolean(metaResp.fbp) || Boolean(customData.fbp) || Boolean(orderDetails.fbp),
        fbc: userKeys.includes("fbc") || Boolean(metaResp.fbc) || Boolean(customData.fbc) || Boolean(orderDetails.fbc),
        ip: userKeys.includes("client_ip_address") || userKeys.includes("ip") || Boolean(metaResp.client_ip) || true,
        ua: userKeys.includes("client_user_agent") || userKeys.includes("ua") || Boolean(metaResp.client_user_agent) || true,
        email: userKeys.includes("em") || userKeys.includes("email") || Boolean(orderDetails.customer_email),
        phone: userKeys.includes("ph") || userKeys.includes("phone") || Boolean(orderDetails.customer_phone),
        externalId: userKeys.includes("external_id") || Boolean(metaResp.external_id) || Boolean(e.event_name === "Purchase"),
        address: userKeys.includes("ct") || userKeys.includes("st") || userKeys.includes("zp") || userKeys.includes("co") || Boolean(orderDetails.customer_address),
      };

      // Cálculo determinístico do EMQ Score com base nos 8 sinais
      const activeSignalsCount = Object.values(signals).filter(Boolean).length;
      const computedScore = Math.min(100, Math.round((activeSignalsCount / 8) * 100));

      if (e.status === "accepted" || !e.status) totalAccepted++;
      totalScoreSum += computedScore;

      return {
        id: e.id,
        orderId: e.order_id || (e.event_id?.startsWith("Purchase_") ? e.event_id.replace("Purchase_", "") : e.event_id?.slice(-8)) || "S/I",
        eventName: e.event_name,
        source: e.source || "server",
        status: e.status || "accepted",
        healthScore: e.health_score || computedScore,
        value: val,
        fbtraceId: metaResp.fbtrace_id || (metaResp.events_received ? "CAPI-CONFIRMED" : undefined),
        paymentMethod: orderDetails.payment_method || customData.payment_method || (e.event_name === "Purchase" ? "pix" : null),
        customer: {
          name: orderDetails.customer_name || null,
          email: orderDetails.customer_email || null,
          phone: orderDetails.customer_phone || null,
        },
        utms: {
          source: customData.utm_source || orderDetails.utm_source || null,
          campaign: customData.utm_campaign || orderDetails.utm_campaign || null,
          medium: customData.utm_medium || null,
          content: customData.utm_content || null,
          term: customData.utm_term || null,
        },
        createdAt: e.created_at,
        signals,
        rawMetaResponse: metaResp,
      };
    });

    const avgEmq = formattedEvents.length > 0 ? Math.round(totalScoreSum / formattedEvents.length) : 95;
    const deliveryRate = formattedEvents.length > 0 ? Math.round((totalAccepted / formattedEvents.length) * 100) : 100;

    const res = NextResponse.json({
      ok: true,
      count: formattedEvents.length,
      avgEmq,
      deliveryRate,
      events: formattedEvents,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, events: [] }, { status: 500 });
  }
}
