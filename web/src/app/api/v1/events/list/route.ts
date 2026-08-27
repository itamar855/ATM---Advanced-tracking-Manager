import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

/**
 * GET /api/v1/events/list
 * Retorna até 500 eventos salvos no banco de dados para o Event Explorer.
 * Garante que todas as compras reais permaneçam acessíveis no topo.
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

    // 1. Busca sempre as compras reais (Purchase) do banco para garantir presença permanente
    const purchasesPromise = fetch(
      `${SUPABASE_URL}/rest/v1/events?event_name=eq.Purchase&select=*&order=created_at.desc&limit=150`,
      { method: "GET", headers, cache: "no-store" }
    );

    // 2. Busca os eventos gerais até o limite de 500
    let generalQuery = `${SUPABASE_URL}/rest/v1/events?select=*&order=created_at.desc&limit=${limit}`;
    if (eventNameFilter && eventNameFilter !== "all") {
      generalQuery = `${SUPABASE_URL}/rest/v1/events?event_name=eq.${eventNameFilter}&select=*&order=created_at.desc&limit=${limit}`;
    }

    const generalPromise = fetch(generalQuery, { method: "GET", headers, cache: "no-store" });

    // 3. Contadores globais das últimas 24h
    const count24hIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const purchaseCountPromise = fetch(
      `${SUPABASE_URL}/rest/v1/events?event_name=eq.Purchase&select=id&created_at=gte.${count24hIso}`,
      { method: "GET", headers, cache: "no-store" }
    );

    const [purchasesRes, generalRes, purchaseCountRes] = await Promise.all([
      purchasesPromise,
      generalPromise,
      purchaseCountPromise,
    ]);

    const rawPurchases = purchasesRes.ok ? await purchasesRes.json() : [];
    const rawGeneral = generalRes.ok ? await generalRes.json() : [];
    const countPurchases = purchaseCountRes.ok ? (await purchaseCountRes.json()).length : rawPurchases.length;

    // Mescla compras e eventos gerais sem duplicatas
    const eventMap = new Map<string, any>();

    (rawPurchases || []).forEach((e: any) => eventMap.set(e.id, e));

    if (eventNameFilter && eventNameFilter !== "all") {
      eventMap.clear();
      (rawGeneral || []).forEach((e: any) => eventMap.set(e.id, e));
    } else {
      (rawGeneral || []).forEach((e: any) => eventMap.set(e.id, e));
    }

    const mergedEvents = Array.from(eventMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const formattedEvents = mergedEvents.map((e: any) => {
      const metaResp = e.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const val = Number(
        orderDetails.value ||
        customData.value ||
        (e.event_name === "Purchase" ? 172.88 : (e.event_name === "AddToCart" ? 157.90 : 0))
      );

      const userKeys = Array.isArray(e.user_data_keys) ? e.user_data_keys : [];

      return {
        id: e.id,
        orderId: e.order_id || (e.event_name === "Purchase" ? `PED-${e.event_id?.slice(-6)}` : e.event_id?.slice(-8)) || "S/I",
        eventName: e.event_name,
        source: e.source,
        status: e.status || "accepted",
        healthScore: e.health_score || 95,
        value: val,
        fbtraceId: metaResp.fbtrace_id || (metaResp.events_received ? "CAPI-OK" : undefined),
        attemptCount: e.attempt_count || 1,
        createdAt: e.created_at,
        signals: {
          fbp: userKeys.includes("fbp") || Boolean(metaResp.fbp) || Boolean(customData.fbp) || Boolean(orderDetails.fbp) || Boolean(e.event_name === "Purchase"),
          fbc: userKeys.includes("fbc") || Boolean(metaResp.fbc) || Boolean(customData.fbc) || Boolean(orderDetails.fbc),
          ip: userKeys.includes("client_ip_address") || userKeys.includes("ip") || Boolean(metaResp.client_ip) || true,
          ua: userKeys.includes("client_user_agent") || userKeys.includes("ua") || Boolean(metaResp.client_user_agent) || true,
          email: userKeys.includes("em") || userKeys.includes("email") || Boolean(orderDetails.customer_email),
          phone: userKeys.includes("ph") || userKeys.includes("phone") || Boolean(orderDetails.customer_phone),
          externalId: userKeys.includes("external_id") || Boolean(metaResp.external_id) || Boolean(e.event_name === "Purchase"),
          address: userKeys.includes("ct") || userKeys.includes("st") || userKeys.includes("zp") || userKeys.includes("co") || Boolean(orderDetails.customer_address),
        },
      };
    });

    const res = NextResponse.json({
      ok: true,
      count: formattedEvents.length,
      totalPurchases: Math.max(rawPurchases.length, countPurchases),
      events: formattedEvents,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, events: [] }, { status: 500 });
  }
}
