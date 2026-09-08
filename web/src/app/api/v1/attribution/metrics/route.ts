import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_MODELS = ["last_click", "first_click", "linear", "u_shaped"] as const;
type AttributionModel = (typeof VALID_MODELS)[number];

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

interface CachedMetrics {
  data: any;
  expiresAt: number;
}

const metricsMemoryCache = new Map<string, CachedMetrics>();
const CACHE_TTL_MS = 5000; // 5 segundos de cache em memória

export async function GET(req: NextRequest) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(req.url);

    // 1. Validação obrigatória de store_id (Isolamento Multi-tenant)
    const storeId = searchParams.get("store_id");
    if (!storeId || storeId.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "store_id is required" },
        { status: 400 }
      );
    }

    // 2. Validação do modelo de atribuição
    const rawModel = searchParams.get("model") || "last_click";
    if (!VALID_MODELS.includes(rawModel as AttributionModel)) {
      return NextResponse.json(
        { ok: false, error: "Invalid attribution model" },
        { status: 400 }
      );
    }
    const attributionModel = rawModel as AttributionModel;

    // 3. Janela de datas (Default: últimos 30 dias normalizado por minuto)
    const nowRoundedMs = Math.floor(Date.now() / 60000) * 60000;
    const defaultStart = new Date(nowRoundedMs - 30 * 86400 * 1000).toISOString();
    const defaultEnd = new Date(nowRoundedMs + 60000).toISOString();

    const startDate = searchParams.get("startDate") || defaultStart;
    const endDate = searchParams.get("endDate") || defaultEnd;

    // 4. Filtro opcional de campanha
    const campaignIdFilter = searchParams.get("campaign_id") || searchParams.get("campaignId");

    // Verificação de cache ultra-rápido em memória (< 2ms)
    const cacheKey = `${storeId.trim()}::${attributionModel}::${startDate}::${endDate}::${campaignIdFilter || ""}`;
    const cached = metricsMemoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json(
        {
          ...cached.data,
          latencyMs,
          cached: true,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    // 5. Consulta EXCLUSIVA no public.revenue_ledger utilizando índices otimizados
    const supabase = createAdminClient();

    let query = supabase
      .from("revenue_ledger")
      .select(
        "order_id, attribution_model, campaign_id, campaign_name, source, attribution_weight, attributed_revenue, is_recovered, is_assisted, touchpoint_index, total_touchpoints, order_paid_at"
      )
      .eq("store_id", storeId.trim())
      .eq("attribution_model", attributionModel)
      .gte("order_paid_at", startDate)
      .lte("order_paid_at", endDate);

    if (campaignIdFilter && campaignIdFilter.trim() !== "") {
      query = query.eq("campaign_id", campaignIdFilter.trim());
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // 6. Agregações contábeis em memória (0 scans em tabelas gigantes)
    const uniqueOrders = new Set<string>();
    const assistedOrders = new Set<string>();

    let totalRevenue = 0;
    let recoveredRevenue = 0;
    const totalTouchpoints = rows ? rows.length : 0;

    interface CampaignAcc {
      campaignId: string | null;
      campaignName: string;
      source: string;
      attributedRevenue: number;
      ordersSet: Set<string>;
      touchesCount: number;
      assistedCount: number;
      recoveredRevenue: number;
    }

    const campaignMap = new Map<string, CampaignAcc>();

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const rev = Number(row.attributed_revenue) || 0;
        const orderId = String(row.order_id);

        uniqueOrders.add(orderId);
        totalRevenue += rev;

        if (row.is_recovered) {
          recoveredRevenue += rev;
        }

        if (row.is_assisted) {
          assistedOrders.add(orderId);
        }

        // Chave de agrupamento da campanha
        const campKey = `${row.campaign_id || "no_id"}__${row.campaign_name || "Sem Campanha"}__${row.source || "unknown"}`;
        let campAcc = campaignMap.get(campKey);
        if (!campAcc) {
          campAcc = {
            campaignId: row.campaign_id || null,
            campaignName: row.campaign_name || "Sem Campanha",
            source: row.source || "unknown",
            attributedRevenue: 0,
            ordersSet: new Set<string>(),
            touchesCount: 0,
            assistedCount: 0,
            recoveredRevenue: 0,
          };
          campaignMap.set(campKey, campAcc);
        }

        campAcc.attributedRevenue += rev;
        campAcc.ordersSet.add(orderId);
        campAcc.touchesCount += 1;

        if (row.is_assisted) {
          campAcc.assistedCount += 1;
        }

        if (row.is_recovered) {
          campAcc.recoveredRevenue += rev;
        }
      }
    }

    const totalOrdersCount = uniqueOrders.size;
    const totalRevRounded = round2(totalRevenue);
    const avgOrderVal = totalOrdersCount > 0 ? round2(totalRevRounded / totalOrdersCount) : 0;

    // Formata e ordena campanhas por receita atribuída decrescente
    const campaigns = Array.from(campaignMap.values())
      .map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        source: c.source,
        attributedRevenue: round2(c.attributedRevenue),
        ordersCount: c.ordersSet.size,
        touchesCount: c.touchesCount,
        assistedCount: c.assistedCount,
        recoveredRevenue: round2(c.recoveredRevenue),
      }))
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue);

    const responseData = {
      ok: true,
      storeId: storeId.trim(),
      attributionModel,
      period: {
        startDate,
        endDate,
      },
      metrics: {
        totalRevenue: totalRevRounded,
        totalOrders: totalOrdersCount,
        averageOrderValue: avgOrderVal,
        recoveredRevenue: round2(recoveredRevenue),
        assistedConversions: assistedOrders.size,
        totalTouchpoints,
      },
      campaigns,
    };

    // Salva em cache para chamadas subsequentes do dashboard
    metricsMemoryCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    return NextResponse.json(
      {
        ...responseData,
        latencyMs,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Internal server error",
        latencyMs,
      },
      { status: 500 }
    );
  }
}
