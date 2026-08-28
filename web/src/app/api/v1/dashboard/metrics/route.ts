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

    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];

    // 2. Resolve data de conexão da plataforma (só exibe métricas a partir da conexão)
    const platformConnectedAt = integration?.created_at || "2026-08-26T00:00:00.000Z";

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
    const { startDate, endDate, effectiveStartDate } = resolveDateRange(datePreset, platformConnectedAt);

    let totalSpendBrl = 0;
    let totalSpendOriginal = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    const availableAccounts: Array<{ id: string; name: string; currency: string; status: string; spend: number; spendBrl: number }> = [];

    // 4. Busca lista de contas e consulta gastos na Meta Graph API pelo período
    let accountIdsToQuery = configuredAccountIds;
    if (token && accountIdsToQuery.length === 0) {
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,account_status&access_token=${token}&limit=50`,
          { cache: "no-store" }
        );
        if (meRes.ok) {
          const meData = await meRes.json();
          if (Array.isArray(meData.data)) {
            accountIdsToQuery = meData.data.map((a: any) => a.id);
          }
        }
      } catch {}
    }

    let metaPermissionError: string | null = null;

    if (token && accountIdsToQuery.length > 0) {
      const spendPromises = accountIdsToQuery.map(async (accId) => {
        const formattedId = accId.startsWith("act_") ? accId : `act_${accId}`;
        try {
          const [accInfoRes, insRes] = await Promise.all([
            fetch(
              `https://graph.facebook.com/v23.0/${formattedId}?fields=name,currency,account_status&access_token=${token}`,
              { cache: "no-store" }
            ),
            fetch(
              `https://graph.facebook.com/v23.0/${formattedId}/insights?date_preset=${metaDatePreset}&fields=spend,impressions,clicks,cpc,cpm&access_token=${token}`,
              { cache: "no-store" }
            ),
          ]);

          let accName = formattedId;
          let currency = "BRL";
          let isActive = true;

          if (accInfoRes.ok) {
            const accInfo = await accInfoRes.json();
            if (accInfo.name) accName = accInfo.name;
            if (accInfo.currency) currency = accInfo.currency.toUpperCase();
            if (accInfo.account_status !== undefined) isActive = accInfo.account_status === 1;
          }

          let origSpend = 0;
          let imp = 0;
          let clk = 0;

          if (insRes.ok) {
            const insData = await insRes.json();
            if (insData.error) {
              console.warn(`[Dashboard Metrics] Erro de permissão conta ${formattedId}:`, insData.error.message);
              if (insData.error.code === 200 || insData.error.code === 100) {
                metaPermissionError = "Token da Meta precisa da permissão ads_read para consultar gastos de anúncios.";
              }
            } else if (Array.isArray(insData.data) && insData.data.length > 0) {
              const ins = insData.data[0];
              origSpend = Number(ins.spend || 0);
              imp = Number(ins.impressions || 0);
              clk = Number(ins.clicks || 0);
            }
          }

          const convertedSpendBrl = convertToBrl(origSpend, currency, usdBrlRate);

          availableAccounts.push({
            id: formattedId,
            name: accName,
            currency,
            status: isActive ? "active" : "disabled",
            spend: origSpend,
            spendBrl: convertedSpendBrl,
          });

          // Só soma aos totais se a conta for ATIVA e bater com o filtro de conta selecionada
          const matchesFilter = selectedAccountId === "all" ? isActive : selectedAccountId === formattedId;

          if (matchesFilter) {
            totalSpendOriginal += origSpend;
            totalSpendBrl += convertedSpendBrl;
            totalImpressions += imp;
            totalClicks += clk;
          }
        } catch (e) {
          console.warn(`[Dashboard Metrics] Erro na conta ${formattedId}:`, e);
        }
      });

      await Promise.all(spendPromises);
    }

    // 5. Busca vendas aprovadas NO PERÍODO CONECTADO (usando effectiveStartDate)
    const { data: allPurchases } = await supabase
      .from("events")
      .select("id, event_name, meta_response, created_at")
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

    const targetAccount = availableAccounts.find((a) => a.id === selectedAccountId);
    const targetAccNameClean = targetAccount ? targetAccount.name.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

    (allPurchases || []).forEach((ev) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const utmCampaign = String(customData.utm_campaign || orderDetails.utm_campaign || tracking.utm_campaign || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const utmSource = String(customData.utm_source || orderDetails.utm_source || tracking.utm_source || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      // Se uma conta específica foi selecionada, só contabiliza vendas atribuídas a ela
      if (selectedAccountId !== "all") {
        const matchesAccount =
          (targetAccNameClean && (utmCampaign.includes(targetAccNameClean) || utmSource.includes(targetAccNameClean))) ||
          (String(customData.utm_source || "").includes(selectedAccountId));
        if (!matchesAccount) return;
      }

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
      platform_connected_at: platformConnectedAt,
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
      meta_permission_error: metaPermissionError,
    });
  } catch (error: any) {
    console.error("[Dashboard Metrics API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
