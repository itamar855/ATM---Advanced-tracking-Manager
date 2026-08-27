import { NextRequest, NextResponse } from "next/server";
import { processEventQueue } from "@/lib/tracking/queue-engine";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/events/queue
 * Retorna as estatísticas de saúde da fila de eventos
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // 1. Contadores por status
    const { data: statusCounts, error } = await supabase
      .from("events")
      .select("status, count")
      .limit(1);

    const now = Date.now();
    const twentyFourHoursAgoIso = new Date(now - 24 * 3600 * 1000).toISOString();

    const [
      { count: totalAccepted },
      { count: totalPending },
      { count: totalFailed },
      { count: totalRejected },
    ] = await Promise.all([
      supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "accepted").gte("created_at", twentyFourHoursAgoIso),
      supabase.from("events").select("*", { count: "exact", head: true }).in("status", ["pending", "processing"]),
      supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    const total = (totalAccepted || 0) + (totalPending || 0) + (totalFailed || 0) + (totalRejected || 0);
    const deliveryRate = total > 0 ? (((totalAccepted || 0) / total) * 100).toFixed(1) : "100.0";

    return NextResponse.json({
      ok: true,
      queue_stats: {
        accepted_24h: totalAccepted || 0,
        pending: totalPending || 0,
        retrying_failed: totalFailed || 0,
        dead_letter_rejected: totalRejected || 0,
        delivery_rate_percent: Number(deliveryRate),
        health_status: (totalPending || 0) === 0 && (totalFailed || 0) === 0 ? "healthy" : "processing",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/events/queue
 * Executa o reprocessamento imediato da fila
 */
export async function POST(request: NextRequest) {
  try {
    const result = await processEventQueue(100);
    return NextResponse.json({
      ok: true,
      message: `Fila processada com sucesso: ${result.succeeded} entregues, ${result.failed} com falha.`,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
