import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna dados estruturados em 4 níveis (Contas, Campanhas, Conjuntos/AdSets, Anúncios/Ads)
 * enriquecidos com Ciclo de cobrança, Cartão de crédito, Métricas de Lucro, ROAS, IC, CPI e Margem.
 *
 * v3.1.0 - Fixes:
 *   - Removidos IDs hardcoded; usa exclusivamente contas do token conectado + config
 *   - Busca integração pela integração mais recente ativa (sem depender de store_id específico)
 *   - Adicionado effective_status para refletir status real de veiculação
 *   - Error handling granular por conta (falha numa conta não derruba tudo)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("date_preset") || "today";

    const supabase = createAdminClient();

    // 1. Busca token mestre da Meta — integração ativa mais recente
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

    if (!token) {
      return NextResponse.json({
        ok: false,
        error: "Token da Meta não configurado. Acesse Integrações e conecte sua conta do Facebook.",
        accounts: [], campaigns: [], adsets: [], ads: [],
      });
    }

    const usdBrlRate = await getUsdBrlRate();

    // 2. Mapeia date_preset para a Graph API
    const presetMap: Record<string, string> = {
      today: "today",
      yesterday: "yesterday",
      last_7d: "last_7d",
      last_30d: "last_30d",
      last_60d: "last_60d",
      this_month: "this_month",
    };
    const metaDatePreset = presetMap[datePreset] || "today";

    // 3. Busca TODAS as contas vinculadas ao token via /me/adaccounts
    let metaAccountsRaw: any[] = [];
    let fetchError: string | null = null;
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details&access_token=${token}&limit=50`,
        { cache: "no-store" }
      );
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.data)) {
          metaAccountsRaw = accData.data;
        } else if (accData.error) {
          fetchError = accData.error.message;
          console.error("[Meta /me/adaccounts Error]:", accData.error);
        }
      }
    } catch (e) {
      console.error("[Meta Accounts Fetch Error]:", e);
    }

    // Se a busca /me/adaccounts falhou completamente, usa IDs do config como fallback
    // Mas NÃO usa IDs hardcoded no código — somente o que foi configurado pelo usuário
    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];

    // Consolida lista de contas sem duplicatas
    const accountIdsToProcess = Array.from(
      new Set([
        ...metaAccountsRaw.map((a: any) => a.id),
        ...configuredAccountIds.map((id: string) => (id.startsWith("act_") ? id : `act_${id}`)),
      ])
    );

    if (accountIdsToProcess.length === 0) {
      return NextResponse.json({
        ok: false,
        error: fetchError || "Nenhuma conta de anúncio encontrada. Verifique se o token tem permissão ads_management.",
        accounts: [], campaigns: [], adsets: [], ads: [],
      });
    }

    // 4. Busca todos os eventos reais de conversão do banco (Purchase e InitiateCheckout)
    const { data: dbEvents } = await supabase
      .from("events")
      .select("event_name, meta_response, created_at")
      .in("event_name", ["Purchase", "InitiateCheckout"])
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(2000);

    // Mapeia vendas por UTMs / IDs
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

      const val = Number(orderDetails.value || customData.value || 0);
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

    // 5. Itera pelas contas em paralelo com tratamento de erro granular
    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];
    const allAdsets: any[] = [];
    const allAds: any[] = [];
    const accountErrors: Array<{ id: string; error: string }> = [];

    const accountPromises = accountIdsToProcess.map(async (accId) => {
      const rawAcc = metaAccountsRaw.find((a: any) => a.id === accId) || {};
      const currency = ((rawAcc.currency || "BRL") as string).toUpperCase();
      const isUsd = currency === "USD";

      // Busca conta + hierarquia completa com effective_status para status real de veiculação
      const fields = [
        "name",
        "account_status",
        "balance",
        "amount_spent",
        "funding_source_details",
        `insights.date_preset(${metaDatePreset}){spend,impressions,clicks,actions}`,
        `campaigns{id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,`,
        `insights.date_preset(${metaDatePreset}){spend,actions},`,
        `adsets{id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,`,
        `insights.date_preset(${metaDatePreset}){spend,actions},`,
        `ads{id,name,status,effective_status,updated_time,`,
        `insights.date_preset(${metaDatePreset}){spend,actions}}}}`,
      ].join("");

      const url = `https://graph.facebook.com/v23.0/${accId}?fields=${encodeURIComponent(fields)}&access_token=${token}`;

      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || data.error) {
          const errMsg = data.error?.message || `HTTP ${res.status}`;
          accountErrors.push({ id: accId, error: errMsg });
          console.error(`[Meta Account ${accId} Error]:`, errMsg);
          return; // pula esta conta sem derrubar as outras
        }

        const accName = data.name || rawAcc.name || accId;
        const accStatusCode = data.account_status;
        const accStatus = accStatusCode === 1 ? "Ativo" : accStatusCode === 2 ? "Desabilitado" : accStatusCode === 3 ? "Não Verificado" : "Pendente";

        const cardDisplay = data.funding_source_details?.display_string || rawAcc.funding_source_details?.display_string || "N/A";

        const rawBalance = Number(data.balance || rawAcc.balance || 0) / 100;
        const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

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

        // Processa Campanhas
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

          // Usa effective_status para refletir o status REAL de veiculação
          const isActive = camp.effective_status === "ACTIVE" || (camp.effective_status === undefined && camp.status === "ACTIVE");

          allCampaigns.push({
            id: camp.id,
            name: camp.name,
            account_id: accId,
            account_name: accName,
            status: isActive ? "active" : "paused",
            effective_status: camp.effective_status || camp.status,
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

          // Processa AdSets
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

            const asIsActive = as.effective_status === "ACTIVE" || (as.effective_status === undefined && as.status === "ACTIVE");

            allAdsets.push({
              id: as.id,
              name: as.name,
              campaign_id: camp.id,
              campaign_name: camp.name,
              account_id: accId,
              account_name: accName,
              status: asIsActive ? "active" : "paused",
              effective_status: as.effective_status || as.status,
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

            // Processa Ads
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

              const adIsActive = ad.effective_status === "ACTIVE" || (ad.effective_status === undefined && ad.status === "ACTIVE");

              allAds.push({
                id: ad.id,
                name: ad.name,
                adset_id: as.id,
                adset_name: as.name,
                campaign_id: camp.id,
                campaign_name: camp.name,
                account_id: accId,
                account_name: accName,
                status: adIsActive ? "active" : "paused",
                effective_status: ad.effective_status || ad.status,
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
      } catch (err: any) {
        accountErrors.push({ id: accId, error: err.message });
        console.error(`[Meta Account Process Error] ${accId}:`, err);
      }
    });

    await Promise.all(accountPromises);

    // Ordenação por gasto decrescente
    formattedAccounts.sort((a, b) => b.spend - a.spend);
    allCampaigns.sort((a, b) => b.spend - a.spend);
    allAdsets.sort((a, b) => b.spend - a.spend);
    allAds.sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      ok: true,
      usdBrlRate,
      untracked_sales_count: untrackedSalesCount,
      account_errors: accountErrors,
      accounts: formattedAccounts,
      campaigns: allCampaigns,
      adsets: allAdsets,
      ads: allAds,
    });
  } catch (error: any) {
    console.error("[Campaigns List Multi-Tier API Error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message, accounts: [], campaigns: [], adsets: [], ads: [] },
      { status: 500 }
    );
  }
}
