import { NextRequest, NextResponse } from "next/server";
import { getDashboardPLMetrics, getCampaignsPL } from "@/lib/tracking/dashboard-service";

/**
 * GET /api/v1/dashboard/metrics
 * Retorna as métricas e o P&L do lojista
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!storeId || !startDate || !endDate) {
      return NextResponse.json({ ok: false, error: "Parâmetros ausentes" }, { status: 400 });
    }

    const metrics = await getDashboardPLMetrics(storeId, startDate, endDate);
    const campaigns = await getCampaignsPL(storeId, startDate, endDate);

    return NextResponse.json({
      ok: true,
      metrics,
      campaigns
    });
  } catch (error: any) {
    console.error("[Dashboard Metrics API Route Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
