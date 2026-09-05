import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";
import { resolveAccountDateRange, AccountDateRange } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

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
    let { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) {
      const { data: fallbackInt } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = fallbackInt;
    }

    let token = resolveMetaAccessToken(integration?.access_token_enc) || resolveMetaAccessToken(process.env.META_ACCESS_TOKEN) || "";

    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];

    // 2. Resolve data de conexão da plataforma (só exibe métricas a partir da conexão)
    const platformConnectedAt = integration?.created_at || "2026-08-26T00:00:00.000Z";

    let totalSpendBrl = 0;
    let totalSpendOriginal = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    const availableAccounts: Array<{ id: string; name: string; currency: string; status: string; spend: number; spendBrl: number }> = [];
    const accountRanges: Array<{ id: string; range: AccountDateRange; isActive: boolean }> = [];

    // 3. Busca lista de contas e consulta gastos na Meta Graph API pelo período
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
          // 1. Metadados da Conta (incluindo timezone)
          const accInfoRes = await fetch(
            `https://graph.facebook.com/v23.0/${formattedId}?fields=name,currency,account_status,timezone_name,timezone_offset_hours_utc&access_token=${token}`,
            { cache: "no-store" }
          );

          let accName = formattedId;
          let currency = "BRL";
          let isActive = true;
          let tzName: string | null = integration?.config?.ad_accounts_metadata?.[formattedId]?.timezone_name || null;

          if (accInfoRes.ok) {
            const accInfo = await accInfoRes.json();
            if (accInfo.name) accName = accInfo.name;
            if (accInfo.currency) currency = accInfo.currency.toUpperCase();
            if (accInfo.account_status !== undefined) isActive = accInfo.account_status === 1;
            if (accInfo.timezone_name) tzName = accInfo.timezone_name;
          }

          // 2. Resolve janela de datas exata no fuso da conta
          const accDateRange = resolveAccountDateRange(datePreset, tzName);
          accountRanges.push({ id: formattedId, range: accDateRange, isActive });

          // 3. Consulta Insights usando time_range={since, until}
          const timeRangeParam = encodeURIComponent(
            JSON.stringify({ since: accDateRange.since, until: accDateRange.until })
          );
          const insRes = await fetch(
            `https://graph.facebook.com/v23.0/${formattedId}/insights?time_range=${timeRangeParam}&fields=spend,impressions,clicks,cpc,cpm&access_token=${token}`,
            { cache: "no-store" }
          );

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

    // 4. Determina intervalo UTC harmonizado para consulta de pedidos/vendas no Supabase
    const relevantRanges = accountRanges.filter((ar) =>
      selectedAccountId === "all" ? ar.isActive : ar.id === (selectedAccountId.startsWith("act_") ? selectedAccountId : `act_${selectedAccountId}`)
    );

    let queryStartUtc: string;
    let queryEndUtc: string;

    if (relevantRanges.length > 0) {
      queryStartUtc = relevantRanges.reduce(
        (min, r) => (r.range.startUtc < min ? r.range.startUtc : min),
        relevantRanges[0].range.startUtc
      );
      queryEndUtc = relevantRanges.reduce(
        (max, r) => (r.range.endUtc > max ? r.range.endUtc : max),
        relevantRanges[0].range.endUtc
      );
    } else {
      const fallbackRange = resolveAccountDateRange(datePreset, "America/Sao_Paulo");
      queryStartUtc = fallbackRange.startUtc;
      queryEndUtc = fallbackRange.endUtc;
    }

    // effectiveStartDate = MAX(platformConnectedAt, queryStartUtc)
    let effectiveStartDate = queryStartUtc;
    if (platformConnectedAt) {
      const coDate = new Date(platformConnectedAt);
      if (coDate > new Date(queryStartUtc)) {
        effectiveStartDate = coDate.toISOString();
      }
    }

    // Normalizador tolerante a zeros à esquerda (ex: USD 01 = USD 1, USD 02 = USD 2, USD 03 = USD 3)
    const normalizeMeta = (str: string): string => {
      return String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/([a-z])0+(\d)/g, "$1$2");
    };

    const targetAccount = availableAccounts.find((a) => a.id === selectedAccountId);
    const targetAccNorm = targetAccount ? normalizeMeta(targetAccount.name) : "";
    const targetAccIdNum = selectedAccountId.replace(/^act_/, "");
    const formattedTargetId = selectedAccountId.startsWith("act_") ? selectedAccountId : `act_${selectedAccountId}`;

    const targetCampaignIds = new Set<string>();
    const campPromise = (selectedAccountId !== "all" && token)
      ? (async () => {
          try {
            const campRes = await fetch(
              `https://graph.facebook.com/v23.0/${formattedTargetId}/campaigns?fields=id,name&limit=150&access_token=${token}`,
              { cache: "no-store" }
            );
            if (campRes.ok) {
              const campData = await campRes.json();
              if (Array.isArray(campData.data)) {
                campData.data.forEach((c: any) => {
                  if (c.id) targetCampaignIds.add(String(c.id));
                });
              }
            }
          } catch (e) {
            console.warn(`[Dashboard Metrics] Erro ao buscar campanhas da conta ${formattedTargetId}:`, e);
          }
        })()
      : Promise.resolve();

    // 5. Busca vendas aprovadas NO PERÍODO HARMONIZADO (usando effectiveStartDate e queryEndUtc)
    const [purchasesResult, pendingResult] = await Promise.all([
      supabase
        .from("events")
        .select("id, event_name, meta_response, created_at")
        .eq("store_id", storeId)
        .eq("event_name", "Purchase")
        .eq("status", "accepted")
        .gte("created_at", effectiveStartDate)
        .lte("created_at", queryEndUtc)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("meta_response")
        .eq("store_id", storeId)
        .eq("event_name", "Purchase")
        .eq("status", "pending")
        .gte("created_at", effectiveStartDate)
        .lte("created_at", queryEndUtc),
      campPromise,
    ]);

    const allPurchases = purchasesResult.data || [];
    const pendingPurchases = pendingResult.data || [];

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

      const rawCamp = String(customData.utm_campaign || orderDetails.utm_campaign || tracking.utm_campaign || "").trim();
      const rawSrc = String(customData.utm_source || orderDetails.utm_source || tracking.utm_source || "").trim();
      const campId = rawCamp.includes("|") ? rawCamp.split("|")[1].trim() : (customData.campaign_id || orderDetails.campaign_id || "");

      const normCamp = normalizeMeta(rawCamp);
      const normSrc = normalizeMeta(rawSrc);

      // Se uma conta específica foi selecionada, só contabiliza vendas atribuídas a ela
      if (selectedAccountId !== "all") {
        const matchesAccount =
          (campId && targetCampaignIds.has(campId)) ||
          (targetAccNorm && (normCamp.includes(targetAccNorm) || normSrc.includes(targetAccNorm))) ||
          (rawSrc.includes(targetAccIdNum) || String(customData.ad_account_id || orderDetails.ad_account_id || "").includes(targetAccIdNum));
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
      const tracking = orderDetails.tracking_params || {};

      if (selectedAccountId !== "all") {
        const rawCamp = String(customData.utm_campaign || orderDetails.utm_campaign || tracking.utm_campaign || "").trim();
        const rawSrc = String(customData.utm_source || orderDetails.utm_source || tracking.utm_source || "").trim();
        const campId = rawCamp.includes("|") ? rawCamp.split("|")[1].trim() : (customData.campaign_id || orderDetails.campaign_id || "");
        const normCamp = normalizeMeta(rawCamp);
        const normSrc = normalizeMeta(rawSrc);

        const matchesAccount =
          (campId && targetCampaignIds.has(campId)) ||
          (targetAccNorm && (normCamp.includes(targetAccNorm) || normSrc.includes(targetAccNorm))) ||
          (rawSrc.includes(targetAccIdNum) || String(customData.ad_account_id || orderDetails.ad_account_id || "").includes(targetAccIdNum));
        if (!matchesAccount) return;
      }

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
        gross_revenue: Math.round(grossRevenue * 100) / 100,
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
