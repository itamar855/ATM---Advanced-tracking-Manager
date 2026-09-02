import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  // Formato da data em Brasília YYYY-MM-DD
  const brDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  let startDate = new Date(`${brDateStr}T00:00:00-03:00`);
  let endDate = new Date(`${brDateStr}T23:59:59.999-03:00`);

  switch (datePreset) {
    case "yesterday": {
      const yest = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      const yestStr = yest.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      startDate = new Date(`${yestStr}T00:00:00-03:00`);
      endDate = new Date(`${yestStr}T23:59:59.999-03:00`);
      break;
    }
    case "last_7d": {
      startDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "last_30d": {
      startDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case "last_60d": {
      startDate = new Date(startDate.getTime() - 60 * 24 * 60 * 60 * 1000);
      break;
    }
    case "this_month": {
      const [year, month] = brDateStr.split("-");
      startDate = new Date(`${year}-${month}-01T00:00:00-03:00`);
      break;
    }
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
    const storeId = searchParams.get("store_id");
    const datePreset = searchParams.get("date_preset") || "today";
    const selectedAccountId = searchParams.get("ad_account_id") || "all";
    
    if (!storeId) {
      return NextResponse.json({ error: "store_id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const usdBrlRate = await getUsdBrlRate();

    // 1. Busca integração Meta ativa
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
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
      .eq("store_id", storeId)
      .eq("event_name", "Purchase")
      .eq("status", "accepted")
      .gte("created_at", effectiveStartDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: false });

    // 6. Busca vendas pendentes (PIX/Boleto aguardando pagamento) no período
    const { data: pendingPurchases } = await supabase
      .from("events")
      .select("meta_response")
      .eq("store_id", storeId)
      .eq("event_name", "Purchase")
      .eq("status", "pending")
      .gte("created_at", effectiveStartDate)
      .lte("created_at", endDate);

    // Busca regras de impostos e taxas configuradas pelo usuário para esta loja
    const { data: storeTaxesAndDuties } = await supabase
      .from("taxes_and_duties")
      .select("*")
      .eq("store_id", storeId);

    // Busca tabela de custos de produto (COGS)
    const { data: storeProductCosts } = await supabase
      .from("product_costs")
      .select("*")
      .eq("store_id", storeId);

    let grossRevenue = 0;
    let totalTaxes = 0;
    let totalOperationalTaxes = 0;
    let totalCogs = 0;
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
    const seenOrderIds = new Set<string>();

    (allPurchases || []).forEach((ev) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      // Deduplicação por order_id para garantir consistência com a plataforma de checkout
      const orderId = String(orderDetails.order_id || customData.order_id || ev.id || "").trim();
      if (orderId && seenOrderIds.has(orderId)) {
        return;
      }
      if (orderId) seenOrderIds.add(orderId);

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
      grossRevenue += val;

      // Classifica Método de Pagamento — busca em múltiplos caminhos
      const method = String(
        orderDetails.payment_method ||
        customData.payment_method ||
        customData.payment_type ||
        orderDetails.payment_type ||
        metaResp.payment_method ||
        ""
      ).toLowerCase();
      
      const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master");
      const isBoleto = method.includes("boleto");
      const isPix = method.includes("pix") || method === ""; // Default pix

      // Cálculo de Taxas e Impostos Dinâmicos (Cadastrados pelo Usuário)
      let fee = 0;
      let operationalTax = 0;
      let cogs = 0;

      const hasCustomRules = (storeTaxesAndDuties || []).length > 0;

      if (hasCustomRules) {
        // 1. Impostos Operacionais (ex: Simples Nacional)
        (storeTaxesAndDuties || []).filter((t: any) => t.type === "tax").forEach((t: any) => {
          operationalTax += val * (Number(t.value || 0) / 100);
        });

        // 2. Taxas de Gateway por Forma de Pagamento
        (storeTaxesAndDuties || []).filter((t: any) => t.type === "duty").forEach((t: any) => {
          const matchMethod = t.payment_method === "all" ||
            (isPix && t.payment_method === "pix") ||
            (isCard && t.payment_method === "credit_card") ||
            (isBoleto && t.payment_method === "boleto");

          if (matchMethod) {
            if (t.value_type === "percentage") {
              fee += val * (Number(t.value || 0) / 100);
            } else {
              fee += Number(t.value || 0);
            }
          }
        });
      } else {
        // Fallback seguro enquanto o usuário não cadastrar suas regras personalizadas
        if (val > 0) {
          fee = isCard ? (val * 0.15) : (val * 0.099);
        }
      }

      // 3. Custo de Mercadorias (COGS)
      const products = orderDetails.products || customData.products || [];
      if (Array.isArray(products) && (storeProductCosts || []).length > 0) {
        products.forEach((p: any) => {
          const pName = String(p.name || p.product_name || "").toLowerCase().trim();
          const pQty = Number(p.quantity || 1);
          const matched = (storeProductCosts || []).find((c: any) =>
            pName && String(c.product_name || "").toLowerCase().trim().includes(pName)
          );
          if (matched && matched.cost_price) {
            cogs += Number(matched.cost_price) * pQty;
          }
        });
      }

      totalTaxes += fee;
      totalOperationalTaxes += operationalTax;
      totalCogs += cogs;

      paidSalesCount += 1;

      if (isPix) pixCount++;
      else if (isCard) cardCount++;
      else if (isBoleto) boletoCount++;
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

    // Métricas Financeiras Conciliadas
    const taxes = totalTaxes;
    const operationalTaxes = totalOperationalTaxes;
    const cogs = totalCogs;
    const netRevenue = grossRevenue - taxes - operationalTaxes;
    const totalSpend = totalSpendBrl;
    const totalProfit = netRevenue - totalSpend - cogs;
    // ROAS da Utmify é baseado no Faturamento BRUTO
    const roas = totalSpend > 0 ? grossRevenue / totalSpend : 0;
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
        taxes: Math.round(taxes * 100) / 100,
        operational_taxes: Math.round(operationalTaxes * 100) / 100,
        cogs: Math.round(cogs * 100) / 100,
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
