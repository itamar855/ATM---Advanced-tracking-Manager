import { NextRequest, NextResponse } from "next/server";
import { requireStoreAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/server";
import { computeSubscriptionMetrics, type ChargeRow, type SpendRow, type SubscriptionRow } from "@/lib/subscriptions/metrics";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90, 365];
const MAX_ROWS = 20000;

/**
 * GET /api/v1/subscriptions/metrics?store_id=<uuid>&days=30
 * MRR, churn, LTV, CAC e payback das assinaturas da loja, também por campanha.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const access = await requireStoreAccess(sp.get("store_id"));
  if (!access.ok) return access.response;

  const daysParam = Number(sp.get("days") || 30);
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const supabase = createAdminClient();

  const [subsRes, chargesRes, spendRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("subscription_id, status, mrr, plan, utm_source, utm_campaign, campaign_id, trial_started_at, started_at, canceled_at, payments_count, total_revenue")
      .eq("store_id", access.storeId)
      .limit(MAX_ROWS),
    supabase
      .from("orders")
      .select("value, status, refund_value, order_paid_at, refunded_at")
      .eq("store_id", access.storeId)
      .not("subscription_id", "is", null)
      .or(`order_paid_at.gte.${start.toISOString()},refunded_at.gte.${start.toISOString()}`)
      .limit(MAX_ROWS),
    supabase
      .from("campaign_cost_snapshots")
      .select("campaign_id, campaign_name, spend_brl")
      .eq("store_id", access.storeId)
      .gte("date", start.toISOString().slice(0, 10))
      .limit(MAX_ROWS),
  ]);

  if (subsRes.error) {
    const missing = /subscriptions|relation|schema cache/i.test(subsRes.error.message);
    console.error("[Subscriptions Metrics] Falha ao ler assinaturas:", subsRes.error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "A tabela de assinaturas ainda não existe. Rode a migration 029 no Supabase."
          : "Não foi possível carregar as assinaturas.",
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 }
    );
  }
  if (chargesRes.error) console.warn("[Subscriptions Metrics] Cobranças indisponíveis:", chargesRes.error.message);
  if (spendRes.error) console.warn("[Subscriptions Metrics] Gasto por campanha indisponível:", spendRes.error.message);

  const metrics = computeSubscriptionMetrics(
    (subsRes.data || []) as SubscriptionRow[],
    (chargesRes.data || []) as ChargeRow[],
    (spendRes.data || []) as SpendRow[],
    { start, end }
  );

  return NextResponse.json({
    ok: true,
    metrics,
    truncated: (subsRes.data?.length || 0) >= MAX_ROWS,
    spendAvailable: !spendRes.error,
  });
}
