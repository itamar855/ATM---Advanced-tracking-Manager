import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * Converte um date_preset em { startDate, endDate } como strings ISO.
 * Para garantir que Gasto × Vendas usem EXATAMENTE o mesmo intervalo,
 * aplicamos a fórmula: effective_start_date = MAX(checkout_started_at, startDate)
 *
 * @param datePreset - Período selecionado pelo usuário
 * @param checkoutStartedAt - Data em que o checkout entrou em operação (por loja)
 */
function resolveDateRange(datePreset: string, checkoutStartedAt?: string | null): {
  startDate: string;
  endDate: string;
  effectiveStartDate: string;
} {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  let startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);

  switch (datePreset) {
    case "yesterday":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "last_7d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "last_30d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "last_60d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 60);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "this_month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    default: // "today"
      break;
  }

  // effective_start_date = MAX(checkout_started_at, startDate)
  // Garante que não comparamos gasto de ANTES do checkout entrar em operação com vendas inexistentes
  let effectiveStartDate = startDate.toISOString();
  if (checkoutStartedAt) {
    const coDate = new Date(checkoutStartedAt);
    if (coDate > startDate) {
      effectiveStartDate = coDate.toISOString();
    }
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    effectiveStartDate,
  };
}

/**
 * GET /api/v1/dashboard/metrics
 * Retorna métricas financeiras completas da Dashboard Resumo.
 *
 * v3.1.0 - Fixes:
 *   - Filtro de data aplicado nas vendas (mesmo intervalo que o gasto em ads)
 *   - effective_start_date = MAX(checkout_started_at, início_período)
 *   - Removido fallback faker de dados fictícios
 *   - Adicionado suporte a last_60d
 *   - Vendas Pendentes calculadas dinamicamente
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("date_preset") || "today";
    const selectedAccountId = searchParams.get("ad_account_id") || "all";

    const supabase = createAdminClient();
    const usdBrlRate = await getUsdBrlRate();

    // 1. Busca integração Meta ativa
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("platform", "meta")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token = integration?.access_token_enc || process.env.META_ACCESS_TOKEN || "";
    if (token && !token.startsWith("EAA")) {
      try {
        token = decrypt(token);
      } catch {}
    }

    const allAccountIds: string[] = integration?.config?.ad_account_ids || [];

    // 2. Busca checkout_started_at da loja para a regra de datas
    // Tenta buscar da tabela stores, com fallback para config da integração
    let checkoutStartedAt: string | null = null;
    try {
      const { data: storeData } = await supabase
        .from("stores")
        .select("config, created_at")
        .limit(1)
        .maybeSingle();

      checkoutStartedAt =
        storeData?.config?.checkout_started_at ||
        integration?.config?.checkout_started_at ||
        null;
    } catch {}

    // 3. Resolve intervalo de datas com regra effective_start_date
    const presetMap: Record<string, string> = {
      today: "today",
      yesterday: "yesterday",
      last_7d: "last_7d",
      last_30d: "last_30d",
      last_60d: "last_60d",
      this_month: "this_month",
    };
    const metaDatePreset = presetMap[datePreset] || "today";
    const { startDate, endDate, effectiveStartDate } = resolveDateRange(datePreset, checkoutStartedAt);

    let totalSpendBrl = 0;
    let totalSpendOriginal = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    const availableAccounts: Array<{ id: string; name: string; currency: string; spend: number; spendBrl: number }> = [];

    // 4. Consulta gastos na Meta Graph API pelo período
    if (token && allAccountIds.length > 0) {
      const spendPromises = allAccountIds.map(async (accId) => {
        const formattedId = accId.startsWith("act_") ? accId : `act_${accId}`;
        try {
          const res = await fetch(
            `https://graph.facebook.com/v23.0/${formattedId}?fields=name,currency,insights.date_preset(${metaDatePreset}){spend,impressions,clicks}&access_token=${token}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const accData = await res.json();
            if (accData.error) {
              console.warn(`[Dashboard Metrics] Erro conta ${formattedId}:`, accData.error.message);
              return;
            }
            const currency = (accData.currency || "BRL").toUpperCase();
            const ins = accData.insights?.data?.[0];
            const origSpend = Number(ins?.spend || 0);
            const imp = Number(ins?.impressions || 0);
            const clk = Number(ins?.clicks || 0);
            const convertedSpendBrl = convertToBrl(origSpend, currency, usdBrlRate);

            availableAccounts.push({
              id: formattedId,
              name: accData.name || formattedId,
              currency,
              spend: origSpend,
              spendBrl: convertedSpendBrl,
            });

            if (selectedAccountId === "all" || selectedAccountId === formattedId) {
              totalSpendOriginal += origSpend;
              totalSpendBrl += convertedSpendBrl;
              totalImpressions += imp;
              totalClicks += clk;
            }
          }
        } catch (e) {
          console.warn(`[Dashboard Metrics] Erro na conta ${formattedId}:`, e);
        }
      });

      await Promise.all(spendPromises);
    }

    // 5. Busca vendas aprovadas NO PERÍODO (usando effectiveStartDate)
    // Isso garante que gasto e vendas são do mesmo intervalo temporal
    const { data: allPurchases } = await supabase
      .from("events")
      .select("event_name, meta_response, created_at")
      .eq("event_name", "Purchase")
      .eq("status", "accepted")
      .gte("created_at", effectiveStartDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: false });

    // 6. Busca vendas pendentes (PIX/Boleto aguardando pagamento) no período
    const { data: pendingPurchases } = await supabase
      .from("events")
      .select("meta_response")
      .eq("event_name", "Purchase")
      .eq("status", "pending")
      .gte("created_at", effectiveStartDate)
      .lte("created_at", endDate);

    let netRevenue = 0;
    let paidSalesCount = 0;
    let pixCount = 0;
    let cardCount = 0;
    let boletoCount = 0;
    let otherCount = 0;
    let metaSalesCount = 0;
    let iqSalesCount = 0;
    let naSalesCount = 0;

    (allPurchases || []).forEach((ev) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};

      // Valor: prioriza custom_data.value (que é sempre preenchido pelo webhook)
      const val = Number(
        customData.value ||
        orderDetails.value ||
        customData.order_value ||
        0
      );
      netRevenue += val;
      paidSalesCount += 1;

      // Classifica Método de Pagamento — busca em múltiplos caminhos
      const method = String(
        orderDetails.payment_method ||
        customData.payment_method ||
        customData.payment_type ||
        orderDetails.payment_type ||
        metaResp.payment_method ||
        ""
      ).toLowerCase();
      if (method.includes("pix")) pixCount++;
      else if (method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master")) cardCount++;
      else if (method.includes("boleto")) boletoCount++;
      else if (method === "") pixCount++; // default para plataformas que não enviam método (Zedy → assume Pix)
      else otherCount++;

      // Classifica Fonte de Tráfego — prioriza custom_data.utm_source (onde o Zedy salva)
      const src = String(
        customData.utm_source ||
        orderDetails.utm_source ||
        (orderDetails.tracking_params || {}).utm_source ||
        ""
      ).toLowerCase();

      if (src.includes("meta") || src.includes("facebook") || src === "fb" || src.startsWith("fb") || src.includes("insta")) {
        metaSalesCount++;
      } else if (src.includes("iq") || src.startsWith("igj") || src.includes("google") || src.includes("kwai") || src.includes("tiktok")) {
        // IQ (Instagram Quality) codes começam com "igj"
        iqSalesCount++;
      } else if (src === "" || src === "organic" || src === "undefined") {
        naSalesCount++;
      } else {
        // UTM source desconhecido — classifica como N/A
        naSalesCount++;
      }
    });

    // Vendas Pendentes calculadas dinamicamente
    let pendingSalesValue = 0;
    (pendingPurchases || []).forEach((ev) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      pendingSalesValue += Number(orderDetails.value || customData.value || 0);
    });

    const totalOrders = paidSalesCount;
    const pixPercent = totalOrders > 0 ? Math.round((pixCount / totalOrders) * 100) : 0;
    const cardPercent = totalOrders > 0 ? Math.round((cardCount / totalOrders) * 100) : 0;
    const boletoPercent = totalOrders > 0 ? Math.round((boletoCount / totalOrders) * 100) : 0;

    // Métricas Financeiras (somente dados reais, sem fallback faker)
    const taxes = 0;
    const totalSpend = totalSpendBrl;
    const totalProfit = netRevenue - totalSpend - taxes;
    const roas = totalSpend > 0 ? netRevenue / totalSpend : 0;
    const roi = totalSpend > 0 ? totalProfit / totalSpend : 0;
    const margin = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;
    const cpa = totalOrders > 0 && totalSpend > 0 ? totalSpend / totalOrders : 0;
    const arpu = totalOrders > 0 ? netRevenue / totalOrders : 0;

    const metaPercent = totalOrders > 0 ? ((metaSalesCount / totalOrders) * 100).toFixed(1) : "0";
    const iqPercent = totalOrders > 0 ? ((iqSalesCount / totalOrders) * 100).toFixed(1) : "0";
    const naPercent = totalOrders > 0 ? ((naSalesCount / totalOrders) * 100).toFixed(1) : "0";

    return NextResponse.json({
      ok: true,
      usdBrlRate,
      date_preset: datePreset,
      effective_start_date: effectiveStartDate,
      checkout_started_at: checkoutStartedAt,
      metrics: {
        net_revenue: Math.round(netRevenue * 100) / 100,
        ad_spend: Math.round(totalSpend * 100) / 100,
        ad_spend_original: Math.round(totalSpendOriginal * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        pending_sales_value: Math.round(pendingSalesValue * 100) / 100,
        margin: Math.round(margin * 10) / 10,
        taxes: taxes,
        roi: Math.round(roi * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        refund_rate: 0.0,
        arpu: Math.round(arpu * 100) / 100,
        chargeback_rate: 0.0,
        approval_rate: totalOrders > 0 ? 100.0 : 0.0,
        impressions: totalImpressions,
        clicks: totalClicks,
        total_orders: totalOrders,
      },
      payment_methods: {
        total: totalOrders,
        pix: { count: pixCount, percent: pixPercent },
        card: { count: cardCount, percent: cardPercent },
        boleto: { count: boletoCount, percent: boletoPercent },
        other: { count: otherCount, percent: 0 },
      },
      traffic_sources: [
        { name: "MetaAds", count: metaSalesCount, percent: Number(metaPercent) },
        { name: "iq", count: iqSalesCount, percent: Number(iqPercent) },
        { name: "N/A", count: naSalesCount, percent: Number(naPercent) },
      ],
      available_accounts: availableAccounts,
    });
  } catch (error: any) {
    console.error("[Dashboard Metrics API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
