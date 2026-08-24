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
    .select("value, products, order_paid_at")
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
    .select("spend, date")
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

  // 6. Calcula a média de Health Score e os sinalizadores reais
  const { data: healthEvents } = await supabase
    .from("events")
    .select("health_score, user_data_keys, status")
    .eq("store_id", storeId)
    .eq("source", "server")
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  let avgHealthScore = 0;
  let fbpFbcCount = 0;
  let ipUaCount = 0;
  let emailPhoneCount = 0;
  let extIdCount = 0;
  let addressCount = 0;
  let dedupCount = 0;
  const totalEvents = healthEvents?.length || 0;

  if (totalEvents > 0) {
    let sumScore = 0;
    healthEvents!.forEach(e => {
      sumScore += e.health_score || 0;
      
      const keys = e.user_data_keys || [];
      if (keys.includes("fbp") || keys.includes("fbc")) fbpFbcCount++;
      if (keys.includes("client_ip_address") || keys.includes("client_user_agent")) ipUaCount++;
      if (keys.includes("em") || keys.includes("ph")) emailPhoneCount++;
      if (keys.includes("external_id")) extIdCount++;
      if (keys.includes("ct") || keys.includes("st") || keys.includes("zp") || keys.includes("co") || keys.includes("country")) addressCount++;
      if (e.status !== "failed" && e.status !== "rejected") dedupCount++;
    });
    avgHealthScore = Math.round(sumScore / totalEvents);
  }

  const health_signals = {
    fbp_fbc: totalEvents > 0 ? Math.round((fbpFbcCount / totalEvents) * 100) : 0,
    ip_ua: totalEvents > 0 ? Math.round((ipUaCount / totalEvents) * 100) : 0,
    email_phone: totalEvents > 0 ? Math.round((emailPhoneCount / totalEvents) * 100) : 0,
    external_id: totalEvents > 0 ? Math.round((extIdCount / totalEvents) * 100) : 0,
    address: totalEvents > 0 ? Math.round((addressCount / totalEvents) * 100) : 0,
    dedup: totalEvents > 0 ? Math.round((dedupCount / totalEvents) * 100) : 0,
  };

  // 7. Agrupa faturamento e custos diários para o gráfico
  const dailyMap = new Map<string, { revenue: number; spend: number }>();

  const formatDateKey = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}`;
    } catch {
      return "";
    }
  };

  // Popula faturamento diário
  (orders || []).forEach(o => {
    const dateStr = o.order_paid_at;
    if (!dateStr) return;
    const key = formatDateKey(dateStr);
    if (!key) return;
    const current = dailyMap.get(key) || { revenue: 0, spend: 0 };
    current.revenue += Number(o.value || 0);
    dailyMap.set(key, current);
  });

  // Popula custos diários
  (costs || []).forEach(c => {
    if (!c.date) return;
    const key = formatDateKey(c.date);
    if (!key) return;
    const current = dailyMap.get(key) || { revenue: 0, spend: 0 };
    current.spend += Number(c.spend || 0);
    dailyMap.set(key, current);
  });

  const daily_chart_data = Array.from(dailyMap.entries()).map(([date, val]) => ({
    date,
    revenue: Math.round(val.revenue),
    spend: Math.round(val.spend),
    profit: Math.round(val.revenue - val.spend)
  })).sort((a, b) => {
    const [dayA, monthA] = a.date.split('/');
    const [dayB, monthB] = b.date.split('/');
    return new Date(2026, Number(monthA)-1, Number(dayA)).getTime() - new Date(2026, Number(monthB)-1, Number(dayB)).getTime();
  });

  // Garante preenchimento mínimo para o gráfico não quebrar se vazio
  if (daily_chart_data.length === 0) {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      daily_chart_data.push({
        date: `${day}/${month}`,
        revenue: 0,
        spend: 0,
        profit: 0
      });
    }
  }

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
    revenue_change: 0,
    spend_change: 0,
    profit_change: 0,
    orders_change: 0,
    daily_chart_data,
    health_signals
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
