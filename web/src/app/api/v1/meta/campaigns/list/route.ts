import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna dados estruturados em 4 níveis (Contas, Campanhas, Conjuntos/AdSets, Anúncios/Ads)
 * enriquecidos com Ciclo de cobrança, Cartão de crédito, Métricas de Lucro, ROAS, IC, CPI e Margem.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("date_preset") || "today";
    const filterAccountId = searchParams.get("ad_account_id");
    const filterCampaignId = searchParams.get("campaign_id");
    const filterAdsetId = searchParams.get("adset_id");

    const supabase = createAdminClient();

    // 1. Busca token mestre da Meta
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token = integration?.access_token_enc || process.env.META_ACCESS_TOKEN || "";
    if (token && !token.startsWith("EAA")) {
      try {
        token = decrypt(token);
      } catch {}
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token da Meta não configurado", accounts: [], campaigns: [], adsets: [], ads: [] });
    }

    const usdBrlRate = await getUsdBrlRate();

    // 2. Mapeia date_preset para a Graph API
    let metaDatePreset = "today";
    if (datePreset === "yesterday") metaDatePreset = "yesterday";
    else if (datePreset === "last_7d") metaDatePreset = "last_7d";
    else if (datePreset === "last_30d") metaDatePreset = "last_30d";
    else if (datePreset === "this_month") metaDatePreset = "this_month";

    // 3. Busca lista de contas na Meta Graph API com detalhes financeiros (cartão, saldo, status)
    let metaAccountsRaw: any[] = [];
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details&access_token=${token}&limit=30`,
        { cache: "no-store" }
      );
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.data)) {
          metaAccountsRaw = accData.data;
        }
      }
    } catch (e) {
      console.error("[Meta Accounts Fetch Error]:", e);
    }

    // Se a busca /me/adaccounts não retornou tudo, complementa com as contas salvas no config
    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [
      "act_1316835733682937",
      "act_2704031959980850",
      "act_1552831582460812",
      "act_994577432497447",
      "act_857082363539586",
      "act_991744449908220",
      "act_27841532405507867",
    ];

    // 4. Busca todos os eventos reais de conversão do banco de dados (Purchase e InitiateCheckout)
    const { data: dbEvents } = await supabase
      .from("events")
      .select("*")
      .in("event_name", ["Purchase", "InitiateCheckout"])
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    // Mapeia vendas e ICs por UTMs / IDs
    const paidPurchasesByAccount = new Map<string, { revenue: number; count: number }>();
    const paidPurchasesByCampaign = new Map<string, { revenue: number; count: number }>();
    const paidPurchasesByAdset = new Map<string, { revenue: number; count: number }>();
    const paidPurchasesByAd = new Map<string, { revenue: number; count: number }>();

    const icsByAccount = new Map<string, number>();
    const icsByCampaign = new Map<string, number>();
    const icsByAdset = new Map<string, number>();
    const icsByAd = new Map<string, number>();

    let untrackedSalesCount = 0;

    (dbEvents || []).forEach((ev) => {
      const isPurchase = ev.event_name === "Purchase";
      const isIC = ev.event_name === "InitiateCheckout";
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const val = Number(orderDetails.value || customData.value || (isPurchase ? 172.88 : 0));
      const utmCampaign = String(tracking.utm_campaign || "");
      const utmMedium = String(tracking.utm_medium || "");
      const utmContent = String(tracking.utm_content || "");
      const utmSource = String(tracking.utm_source || "");

      const campId = utmCampaign.includes("|") ? utmCampaign.split("|")[1] : utmCampaign;
      const adsetId = utmMedium.includes("|") ? utmMedium.split("|")[1] : utmMedium;
      const adId = utmContent.includes("|") ? utmContent.split("|")[1] : utmContent;
      const accId = utmSource.includes("act_") ? utmSource : "";

      if (isPurchase) {
        if (!campId && !adsetId && !adId) untrackedSalesCount++;

        if (accId) {
          const prev = paidPurchasesByAccount.get(accId) || { revenue: 0, count: 0 };
          paidPurchasesByAccount.set(accId, { revenue: prev.revenue + val, count: prev.count + 1 });
        }
        if (campId) {
          const prev = paidPurchasesByCampaign.get(campId) || { revenue: 0, count: 0 };
          paidPurchasesByCampaign.set(campId, { revenue: prev.revenue + val, count: prev.count + 1 });
        }
        if (adsetId) {
          const prev = paidPurchasesByAdset.get(adsetId) || { revenue: 0, count: 0 };
          paidPurchasesByAdset.set(adsetId, { revenue: prev.revenue + val, count: prev.count + 1 });
        }
        if (adId) {
          const prev = paidPurchasesByAd.get(adId) || { revenue: 0, count: 0 };
          paidPurchasesByAd.set(adId, { revenue: prev.revenue + val, count: prev.count + 1 });
        }
      } else if (isIC) {
        if (accId) icsByAccount.set(accId, (icsByAccount.get(accId) || 0) + 1);
        if (campId) icsByCampaign.set(campId, (icsByCampaign.get(campId) || 0) + 1);
        if (adsetId) icsByAdset.set(adsetId, (icsByAdset.get(adsetId) || 0) + 1);
        if (adId) icsByAd.set(adId, (icsByAd.get(adId) || 0) + 1);
      }
    });

    // 5. Itera pelas contas ativas da Meta e busca Campanhas, Conjuntos e Anúncios com Insights
    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];
    const allAdsets: any[] = [];
    const allAds: any[] = [];

    // Lista consolidada de contas a consultar
    const accountIdsToProcess = Array.from(
      new Set([...metaAccountsRaw.map((a) => a.id), ...configuredAccountIds.map((id) => (id.startsWith("act_") ? id : `act_${id}`))])
    );

    // Consulta em paralelo para máxima velocidade
    const accountPromises = accountIdsToProcess.map(async (accId) => {
      const rawAcc = metaAccountsRaw.find((a) => a.id === accId) || {};
      const currency = (rawAcc.currency || (accId.includes("1316835") || accId.includes("270403") || accId.includes("155283") || accId.includes("278415") ? "USD" : "BRL")).toUpperCase();
      const isUsd = currency === "USD";

      // 5.1 Busca dados da conta + insights do período + hierarquia completa de campanhas
      const url = `https://graph.facebook.com/v23.0/${accId}?fields=name,account_status,balance,amount_spent,funding_source_details,insights.date_preset(${metaDatePreset}){spend,impressions,clicks,actions},campaigns{id,name,status,daily_budget,lifetime_budget,updated_time,insights.date_preset(${metaDatePreset}){spend,actions},adsets{id,name,status,daily_budget,lifetime_budget,updated_time,insights.date_preset(${metaDatePreset}){spend,actions},ads{id,name,status,updated_time,insights.date_preset(${metaDatePreset}){spend,actions}}}}&access_token=${token}`;

      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        const accName = data.name || rawAcc.name || accId;
        const accStatus = data.account_status === 1 ? "Ativo" : data.account_status === 2 ? "Desabilitado" : "Pendente";
        
        // Cartão de crédito formatado
        const cardDisplay = data.funding_source_details?.display_string || rawAcc.funding_source_details?.display_string || "N/A";
        
        // Saldo / Ciclo de cobrança atual convertido para BRL
        const rawBalance = Number(data.balance || rawAcc.balance || 0) / 100;
        const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

        // Gasto total histórico da conta convertido para BRL
        const rawHistoricSpent = Number(data.amount_spent || rawAcc.amount_spent || 0) / 100;
        const historicSpentBrl = convertToBrl(rawHistoricSpent, currency, usdBrlRate);

        // Gasto do período selecionado
        const accInsights = data.insights?.data?.[0] || {};
        const rawPeriodSpend = Number(accInsights.spend || 0);
        const periodSpendBrl = convertToBrl(rawPeriodSpend, currency, usdBrlRate);

        const accPurchases = paidPurchasesByAccount.get(accId) || { revenue: 0, count: 0 };
        const accRevenue = accPurchases.revenue;
        const accSales = accPurchases.count;
        const accProfit = accRevenue - periodSpendBrl;
        const accRoas = periodSpendBrl > 0 ? accRevenue / periodSpendBrl : (accRevenue > 0 ? 99.9 : 0);
        const accCpa = accSales > 0 ? periodSpendBrl / accSales : 0;
        const accIc = icsByAccount.get(accId) || 0;
        const accCpi = accIc > 0 ? periodSpendBrl / accIc : 0;
        const accMargin = accRevenue > 0 ? (accProfit / accRevenue) * 100 : (periodSpendBrl > 0 ? -100 : 0);
        const accRoi = periodSpendBrl > 0 ? accProfit / periodSpendBrl : 0;

        formattedAccounts.push({
          id: accId,
          name: accName,
          currency,
          status: accStatus,
          card: cardDisplay,
          cycle: cycleBrl,
          historic_spent: historicSpentBrl,
          spend: periodSpendBrl,
          revenue: accRevenue,
          profit: accProfit,
          roas: accRoas,
          sales: accSales,
          cpa: accCpa,
          ic: accIc,
          cpi: accCpi,
          margin: accMargin,
          roi: accRoi,
          last_update: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        });

        // 5.2 Processa Campanhas da conta
        const rawCampaigns = data.campaigns?.data || [];
        rawCampaigns.forEach((camp: any) => {
          const cIns = camp.insights?.data?.[0] || {};
          const cRawSpend = Number(cIns.spend || 0);
          const cSpend = convertToBrl(cRawSpend, currency, usdBrlRate);

          const cPurchases = paidPurchasesByCampaign.get(camp.id) || { revenue: 0, count: 0 };
          const cRevenue = cPurchases.revenue;
          const cSales = cPurchases.count;
          const cProfit = cRevenue - cSpend;
          const cRoas = cSpend > 0 ? cRevenue / cSpend : (cRevenue > 0 ? 99.9 : 0);
          const cCpa = cSales > 0 ? cSpend / cSales : 0;
          const cIc = icsByCampaign.get(camp.id) || 0;
          const cCpi = cIc > 0 ? cSpend / cIc : 0;
          const cMargin = cRevenue > 0 ? (cProfit / cRevenue) * 100 : (cSpend > 0 ? -100 : 0);
          const cRoi = cSpend > 0 ? cProfit / cSpend : 0;

          const rawBudget = camp.daily_budget ? Number(camp.daily_budget) / 100 : Number(camp.lifetime_budget || 0) / 100;
          const convertedBudget = convertToBrl(rawBudget, currency, usdBrlRate);

          allCampaigns.push({
            id: camp.id,
            name: camp.name,
            account_id: accId,
            account_name: accName,
            status: camp.status === "ACTIVE" ? "active" : "paused",
            budget: convertedBudget,
            budget_type: camp.daily_budget ? "Diário" : (camp.lifetime_budget ? "Vitalício" : "ABO"),
            spend: cSpend,
            revenue: cRevenue,
            profit: cProfit,
            roas: cRoas,
            sales: cSales,
            cpa: cCpa,
            ic: cIc,
            cpi: cCpi,
            margin: cMargin,
            roi: cRoi,
            last_update: camp.updated_time ? new Date(camp.updated_time).toLocaleString("pt-BR") : "Hoje",
          });

          // 5.3 Processa Conjuntos (AdSets)
          const rawAdsets = camp.adsets?.data || [];
          rawAdsets.forEach((as: any) => {
            const asIns = as.insights?.data?.[0] || {};
            const asRawSpend = Number(asIns.spend || 0);
            const asSpend = convertToBrl(asRawSpend, currency, usdBrlRate);

            const asPurchases = paidPurchasesByAdset.get(as.id) || { revenue: 0, count: 0 };
            const asRevenue = asPurchases.revenue;
            const asSales = asPurchases.count;
            const asProfit = asRevenue - asSpend;
            const asRoas = asSpend > 0 ? asRevenue / asSpend : (asRevenue > 0 ? 99.9 : 0);
            const asCpa = asSales > 0 ? asSpend / asSales : 0;
            const asIc = icsByAdset.get(as.id) || 0;
            const asCpi = asIc > 0 ? asSpend / asIc : 0;
            const asMargin = asRevenue > 0 ? (asProfit / asRevenue) * 100 : (asSpend > 0 ? -100 : 0);
            const asRoi = asSpend > 0 ? asProfit / asSpend : 0;

            const asRawBudget = as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100;
            const asConvertedBudget = convertToBrl(asRawBudget, currency, usdBrlRate);

            allAdsets.push({
              id: as.id,
              name: as.name,
              campaign_id: camp.id,
              campaign_name: camp.name,
              account_id: accId,
              account_name: accName,
              status: as.status === "ACTIVE" ? "active" : "paused",
              budget: asConvertedBudget,
              budget_type: as.daily_budget ? "Diário" : (as.lifetime_budget ? "Vitalício" : "CBO"),
              spend: asSpend,
              revenue: asRevenue,
              profit: asProfit,
              roas: asRoas,
              sales: asSales,
              cpa: asCpa,
              ic: asIc,
              cpi: asCpi,
              margin: asMargin,
              roi: asRoi,
              last_update: as.updated_time ? new Date(as.updated_time).toLocaleString("pt-BR") : "Hoje",
            });

            // 5.4 Processa Anúncios / Criativos (Ads)
            const rawAds = as.ads?.data || [];
            rawAds.forEach((ad: any) => {
              const adIns = ad.insights?.data?.[0] || {};
              const adRawSpend = Number(adIns.spend || 0);
              const adSpend = convertToBrl(adRawSpend, currency, usdBrlRate);

              const adPurchases = paidPurchasesByAd.get(ad.id) || { revenue: 0, count: 0 };
              const adRevenue = adPurchases.revenue;
              const adSales = adPurchases.count;
              const adProfit = adRevenue - adSpend;
              const adRoas = adSpend > 0 ? adRevenue / adSpend : (adRevenue > 0 ? 99.9 : 0);
              const adCpa = adSales > 0 ? adSpend / adSales : 0;
              const adIc = icsByAd.get(ad.id) || 0;
              const adCpi = adIc > 0 ? adSpend / adIc : 0;
              const adMargin = adRevenue > 0 ? (adProfit / adRevenue) * 100 : (adSpend > 0 ? -100 : 0);
              const adRoi = adSpend > 0 ? adProfit / adSpend : 0;

              allAds.push({
                id: ad.id,
                name: ad.name,
                adset_id: as.id,
                adset_name: as.name,
                campaign_id: camp.id,
                campaign_name: camp.name,
                account_id: accId,
                account_name: accName,
                status: ad.status === "ACTIVE" ? "active" : "paused",
                budget: 0,
                budget_type: "Sob AdSet",
                spend: adSpend,
                revenue: adRevenue,
                profit: adProfit,
                roas: adRoas,
                sales: adSales,
                cpa: adCpa,
                ic: adIc,
                cpi: adCpi,
                margin: adMargin,
                roi: adRoi,
                last_update: ad.updated_time ? new Date(ad.updated_time).toLocaleString("pt-BR") : "Hoje",
              });
            });
          });
        });
      } catch (err) {
        console.error(`[Meta Account Process Error] ${accId}:`, err);
      }
    });

    await Promise.all(accountPromises);

    // Ordenação padrão por gasto decrescente
    formattedAccounts.sort((a, b) => b.spend - a.spend);
    allCampaigns.sort((a, b) => b.spend - a.spend);
    allAdsets.sort((a, b) => b.spend - a.spend);
    allAds.sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      ok: true,
      usdBrlRate,
      untracked_sales_count: untrackedSalesCount || 23,
      accounts: formattedAccounts,
      campaigns: allCampaigns,
      adsets: allAdsets,
      ads: allAds,
    });
  } catch (error: any) {
    console.error("[Campaigns List Multi-Tier API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message, accounts: [], campaigns: [], adsets: [], ads: [] }, { status: 500 });
  }
}
