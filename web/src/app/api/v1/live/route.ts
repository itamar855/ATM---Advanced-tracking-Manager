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

    const now = Date.now();
    const threeMinutesAgoIso = new Date(now - 3 * 60 * 1000).toISOString();
    const tenMinutesAgoIso = new Date(now - 10 * 60 * 1000).toISOString();

    // 1. Busca sessões ativas nos últimos 3 minutos da tabela sessions
    const { data: recentSessions, error: sErr } = await supabase
      .from("sessions")
      .select("track_id, created_at, updated_at, client_ip, utm_campaign")
      .gte("created_at", threeMinutesAgoIso);

    // 2. Busca eventos nos últimos 10 minutos para detectar carrinhos e compras
    const { data: recentEvents, error: eErr } = await supabase
      .from("events")
      .select("id, event_name, order_id, event_id, created_at, source")
      .gte("created_at", tenMinutesAgoIso)
      .order("created_at", { ascending: false });

    // Conta visitantes online únicos (por track_id ou client_ip ou eventos recentes)
    const uniqueOnlineVisitors = new Set<string>();
    (recentSessions || []).forEach((s) => {
      if (s.track_id) uniqueOnlineVisitors.add(s.track_id);
      else if (s.client_ip) uniqueOnlineVisitors.add(s.client_ip);
    });

    // Também verifica eventos dos últimos 3 minutos
    (recentEvents || []).forEach((ev) => {
      const evTime = new Date(ev.created_at).getTime();
      if (evTime >= now - 3 * 60 * 1000) {
        uniqueOnlineVisitors.add(ev.event_id || ev.id);
      }
    });

    // Conta carrinhos ativos únicos nos últimos 10 minutos
    const uniqueInCart = new Set<string>();
    (recentEvents || []).forEach((ev) => {
      if (ev.event_name === "AddToCart" || ev.event_name === "InitiateCheckout") {
        uniqueInCart.add(ev.order_id || ev.event_id || ev.id);
      }
    });

    const onlineCount = Math.max(uniqueOnlineVisitors.size, 1);
    const cartCount = uniqueInCart.size;

    return NextResponse.json({
      ok: true,
      onlineNow: onlineCount,
      inCartNow: cartCount,
      recentEventsCount: (recentEvents || []).length,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, onlineNow: 1, inCartNow: 0 }, { status: 500 });
  }
}
