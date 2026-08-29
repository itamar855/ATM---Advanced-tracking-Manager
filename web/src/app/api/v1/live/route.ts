import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/live
 * Retorna as estatísticas de tráfego ao vivo e clientes no carrinho/checkout
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const now = Date.now();
    const fiveMinutesAgoIso = new Date(now - 5 * 60 * 1000).toISOString();
    const fifteenMinutesAgoIso = new Date(now - 15 * 60 * 1000).toISOString();

    // 1. Busca sessões ativas nos últimos 5 minutos (via updated_at ou created_at) desta loja
    const [{ data: updatedSessions }, { data: createdSessions }, { data: recentEvents }] = await Promise.all([
      supabase
        .from("sessions")
        .select("track_id, client_ip, updated_at")
        .eq("store_id", storeId)
        .gte("updated_at", fiveMinutesAgoIso)
        .limit(500),
      supabase
        .from("sessions")
        .select("track_id, client_ip, created_at")
        .eq("store_id", storeId)
        .gte("created_at", fiveMinutesAgoIso)
        .limit(500),
      supabase
        .from("events")
        .select("id, event_name, order_id, event_id, created_at, source")
        .eq("store_id", storeId)
        .gte("created_at", fifteenMinutesAgoIso)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    // Consolida visitantes online únicos
    const uniqueOnlineVisitors = new Set<string>();

    (updatedSessions || []).forEach((s) => {
      if (s.track_id) uniqueOnlineVisitors.add(s.track_id);
      else if (s.client_ip) uniqueOnlineVisitors.add(s.client_ip);
    });

    (createdSessions || []).forEach((s) => {
      if (s.track_id) uniqueOnlineVisitors.add(s.track_id);
      else if (s.client_ip) uniqueOnlineVisitors.add(s.client_ip);
    });

    // Também inclui visitantes com eventos recentes nos últimos 5 minutos
    (recentEvents || []).forEach((ev) => {
      const evTime = new Date(ev.created_at).getTime();
      if (evTime >= now - 5 * 60 * 1000) {
        uniqueOnlineVisitors.add(ev.event_id || ev.id);
      }
    });

    // Conta carrinhos ativos e checkouts únicos nos últimos 15 minutos
    const uniqueInCart = new Set<string>();
    (recentEvents || []).forEach((ev) => {
      if (ev.event_name === "AddToCart" || ev.event_name === "InitiateCheckout" || ev.event_name === "ViewContent") {
        uniqueInCart.add(ev.order_id || ev.event_id || ev.id);
      }
    });

    const onlineCount = uniqueOnlineVisitors.size;
    const cartCount = uniqueInCart.size;

    const res = NextResponse.json({
      ok: true,
      onlineNow: onlineCount,
      inCartNow: cartCount,
      recentEventsCount: (recentEvents || []).length,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, onlineNow: 0, inCartNow: 0 }, { status: 500 });
  }
}
