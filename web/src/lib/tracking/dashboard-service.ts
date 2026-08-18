import { createClient } from "../supabase/server";
import { CampaignPL, DashboardMetrics } from "../types";

/**
 * Agrega e calcula as métricas do Dashboard P&L
 */
export async function getDashboardPLMetrics(
  storeId: string,
  startDate: string,
  endDate: string
): Promise<DashboardMetrics> {
  const supabase = await createClient();

  // 1. Busca a receita e pedidos aprovados/pagos na tabela de ordens
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("value, products")
    .eq("store_id", storeId)
    .eq("status", "paid")
    .gte("order_paid_at", startDate)
    .lte("order_paid_at", endDate);

  if (ordersError) throw ordersError;

  const totalRevenue = (orders || []).reduce((acc, order) => acc + Number(order.value || 0), 0);
  const totalOrders = orders?.length || 0;

  // 2. Busca o custo de produto (COGS) para subtrair
  // Em um SaaS real, cada produto vendido seria multiplicado pelo custo dele na tabela `product_costs`
  const { data: productCosts } = await supabase
    .from("product_costs")
    .select("shopify_variant_id, cost_price")
    .eq("store_id", storeId);

  const costMap = new Map<string, number>();
  (productCosts || []).forEach((c) => {
    if (c.shopify_variant_id) {
      costMap.set(c.shopify_variant_id, Number(c.cost_price || 0));
    }
  });

  let totalCogs = 0;
  (orders || []).forEach((order) => {
    const products = (order.products as any[]) || [];
    products.forEach((p) => {
      const cost = costMap.get(p.variant_id || p.id) || 0;
      totalCogs += cost * (p.quantity || 1);
    });
  });

  // 3. Busca o gasto total das campanhas
  const { data: costs, error: costsError } = await supabase
    .from("campaign_costs")
    .select("spend")
    .eq("store_id", storeId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (costsError) throw costsError;

  const totalSpend = (costs || []).reduce((acc, c) => acc + Number(c.spend || 0), 0);

  // 4. Calcula o Lucro Líquido
  // Simplificação: Lucro = Receita - GastoAds - COGS
  const totalProfit = totalRevenue - totalSpend - totalCogs;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // 5. Conta eventos de CAPI com status 'accepted'
  const { count: eventsCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("source", "server")
    .eq("status", "accepted")
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  // 6. Calcula a média de Health Score
  const { data: healthData } = await supabase
    .from("events")
    .select("health_score")
    .eq("store_id", storeId)
    .eq("source", "server")
    .not("health_score", "is", null)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  const avgHealthScore = healthData && healthData.length > 0
    ? Math.round(healthData.reduce((acc, h) => acc + (h.health_score || 0), 0) / healthData.length)
    : 0;

  return {
    total_revenue: totalRevenue,
    total_spend: totalSpend,
    total_profit: totalProfit,
    total_orders: totalOrders,
    roas,
    cpa,
    margin,
    events_sent: eventsCount || 0,
    avg_health_score: avgHealthScore,
    revenue_change: 0, // Calculado comparando período anterior na API se necessário
    spend_change: 0,
    profit_change: 0,
    orders_change: 0,
  };
}

/**
 * Retorna a performance agregada de P&L por Campanha
 */
export async function getCampaignsPL(
  storeId: string,
  startDate: string,
  endDate: string
): Promise<CampaignPL[]> {
  const supabase = await createClient();

  // 1. Puxa os custos por campanha
  const { data: dbCosts } = await supabase
    .from("campaign_costs")
    .select("campaign_id, campaign_name, spend, clicks")
    .eq("store_id", storeId)
    .gte("date", startDate)
    .lte("date", endDate);

  // Agrega gastos por campanha
  const campaignMap = new Map<string, { name: string; spend: number; clicks: number; revenue: number; conversions: number }>();

  (dbCosts || []).forEach((c) => {
    if (!c.campaign_id) return;
    const existing = campaignMap.get(c.campaign_id) || {
      name: c.campaign_name || "Campanha Sem Nome",
      spend: 0,
      clicks: 0,
      revenue: 0,
      conversions: 0,
    };
    existing.spend += Number(c.spend || 0);
    existing.clicks += Number(c.clicks || 0);
    campaignMap.set(c.campaign_id, existing);
  });

  // 2. Associa receita de pedidos com base na utm_campaign
  const { data: dbOrders } = await supabase
    .from("orders")
    .select("value, session_id, sessions(utm_campaign)")
    .eq("store_id", storeId)
    .eq("status", "paid")
    .gte("order_paid_at", startDate)
    .lte("order_paid_at", endDate);

  (dbOrders || []).forEach((order) => {
    // Tenta obter utm_campaign da sessão
    const utmCampaign = (order.sessions as any)?.utm_campaign;
    if (!utmCampaign) return;

    // Procura por ID ou Nome correspondente
    for (const [id, data] of campaignMap.entries()) {
      if (id === utmCampaign || data.name.includes(utmCampaign)) {
        data.revenue += Number(order.value || 0);
        data.conversions += 1;
        break;
      }
    }
  });

  // 3. Formata e calcula métricas
  return Array.from(campaignMap.entries()).map(([id, data]) => {
    const profit = data.revenue - data.spend;
    const roas = data.spend > 0 ? data.revenue / data.spend : 0;
    const cpa = data.conversions > 0 ? data.spend / data.conversions : 0;
    const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;

    return {
      campaign_id: id,
      campaign_name: data.name,
      status: "active", // Seria dinâmico integrando com a Marketing API completo
      spend: data.spend,
      revenue: data.revenue,
      profit,
      roas,
      conversions: data.conversions,
      cpa,
      margin,
      health_score_avg: 90, // Média mocada ou calculada dos eventos desta campanha
    };
  });
}
