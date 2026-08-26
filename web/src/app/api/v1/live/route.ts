import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/live
 * Retorna as estatísticas de tráfego ao vivo e clientes no carrinho/checkout
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // 1. Busca os últimos 50 eventos recentes
    const { data: recentEvents, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Agrupa sessões únicas
    const activeVisitorsMap = new Map<string, any>();
    let inCartCount = 0;

    (recentEvents || []).forEach((ev) => {
      const eventTime = new Date(ev.created_at).getTime();
      const visitorKey = ev.event_id || ev.id;

      if (eventTime >= fiveMinutesAgo) {
        if (!activeVisitorsMap.has(visitorKey)) {
          activeVisitorsMap.set(visitorKey, {
            id: ev.id,
            eventName: ev.event_name,
            source: ev.source,
            status: ev.status,
            createdAt: ev.created_at,
            timeAgoSeconds: Math.max(1, Math.floor((now - eventTime) / 1000)),
            isInCart: ev.event_name === "AddToCart" || ev.event_name === "InitiateCheckout",
          });
        }
      }

      if (
        (ev.event_name === "AddToCart" || ev.event_name === "InitiateCheckout") &&
        eventTime >= fifteenMinutesAgo
      ) {
        inCartCount++;
      }
    });

    const activeVisitors = Array.from(activeVisitorsMap.values());

    return NextResponse.json({
      ok: true,
      onlineNow: Math.max(activeVisitors.length, (recentEvents && recentEvents.length > 0 ? 1 : 0)),
      inCartNow: inCartCount,
      visitors: activeVisitors.slice(0, 20),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
