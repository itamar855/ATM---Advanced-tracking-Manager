import { NextRequest, NextResponse } from "next/server";
import { getCampaignCosts, calculateReconciledMetrics } from "@/lib/tracking/campaign-cost-sync";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/campaigns/costs
 *
 * Retorna os custos históricos consolidados da tabela campaign_cost_snapshots.
 * Parâmetros:
 * - store_id (obrigatório)
 * - startDate (opcional, YYYY-MM-DD)
 * - endDate (opcional, YYYY-MM-DD)
 * - campaign_id (opcional)
 * - ad_account_id (opcional)
 * - attribution_model (opcional, default: last_click - para cálculo de Real ROAS/CPA/ROI)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro 'store_id' é obrigatório" },
        { status: 400 }
      );
    }

    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const campaignId = searchParams.get("campaign_id") || undefined;
    const adAccountId = searchParams.get("ad_account_id") || undefined;
    const attributionModel = searchParams.get("attribution_model") || "last_click";

    // 1. Busca os custos na camada de snapshots históricos
    const costResult = await getCampaignCosts(storeId, {
      storeId,
      startDate,
      endDate,
      campaignId,
      adAccountId,
    });

    // 2. Consulta a receita correspondente no revenue_ledger para conciliação de métricas reais
    const supabase = createAdminClient();
    let ledgerQuery = supabase
      .from("revenue_ledger")
      .select("order_id, attributed_revenue, campaign_id")
      .eq("store_id", storeId)
      .eq("attribution_model", attributionModel);

    if (startDate) {
      ledgerQuery = ledgerQuery.gte("order_paid_at", `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      ledgerQuery = ledgerQuery.lte("order_paid_at", `${endDate}T23:59:59.999Z`);
    }
    if (campaignId) {
      ledgerQuery = ledgerQuery.eq("campaign_id", campaignId);
    }

    const { data: ledgerRows } = await ledgerQuery;

    let totalAttributedRevenue = 0;
    const uniqueOrders = new Set<string>();

    for (const row of ledgerRows || []) {
      totalAttributedRevenue += Number(row.attributed_revenue || 0);
      if (row.order_id) uniqueOrders.add(row.order_id);
    }

    // 3. Calcula as métricas reais conciliadas
    const reconciled = calculateReconciledMetrics(
      totalAttributedRevenue,
      costResult.summary.totalSpendBrl,
      uniqueOrders.size
    );

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      data: costResult.snapshots,
      summary: {
        spend: costResult.summary.totalSpend,
        spend_brl: costResult.summary.totalSpendBrl,
        impressions: costResult.summary.totalImpressions,
        clicks: costResult.summary.totalClicks,
        cpc: costResult.summary.avgCpc,
        cpm: costResult.summary.avgCpm,
        ctr: costResult.summary.avgCtr,
        campaignsCount: costResult.summary.campaignsCount,
      },
      reconciled_metrics: {
        attribution_model: attributionModel,
        attributed_revenue: reconciled.revenue,
        spend_brl: reconciled.spend,
        orders: reconciled.orders,
        real_roas: reconciled.roas,
        real_cpa: reconciled.cpa,
        real_roi: reconciled.roi,
        net_profit: reconciled.profit,
      },
      meta: {
        store_id: storeId,
        startDate: startDate || null,
        endDate: endDate || null,
        campaign_id: campaignId || null,
        latency_ms: latencyMs,
      },
    });
  } catch (error: any) {
    console.error("[API /api/v1/campaigns/costs Error]:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Erro interno ao processar custos de campanhas",
      },
      { status: 500 }
    );
  }
}
