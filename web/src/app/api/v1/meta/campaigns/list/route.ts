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

    // 2. Mapeia date_preset para a Graph API e resolve intervalo
    const presetMap: Record<string, string> = {
      today: "today",
      yesterday: "yesterday",
      last_7d: "last_7d",
      last_30d: "last_30d",
      last_60d: "last_60d",
      this_month: "this_month",
    };
    const metaDatePreset = presetMap[datePreset] || "today";

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

    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];

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

    // 4. Busca eventos reais de conversão do banco no período selecionado
    const { data: dbEvents } = await supabase
      .from("events")
      .select("id, event_name, meta_response, created_at")
      .in("event_name", ["Purchase", "InitiateCheckout"])
      .eq("status", "accepted")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    // Estrutura normalizada de eventos com UTMs extraídas em cascata
    interface ParsedEvent {
      id: string;
      isPurchase: boolean;
      isIC: boolean;
      val: number;
      campId: string;
      campName: string;
      adsetId: string;
      adsetName: string;
      adId: string;
      adName: string;
      rawCampaign: string;
      rawMedium: string;
      rawContent: string;
      rawSource: string;
    }

    const parsedPurchases: ParsedEvent[] = [];
    const parsedICs: ParsedEvent[] = [];

    (dbEvents || []).forEach((ev) => {
      const isPurchase = ev.event_name === "Purchase";
      const isIC = ev.event_name === "InitiateCheckout";
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const val = Number(customData.value || orderDetails.value || 0);

      const rawCampaign = String(customData.utm_campaign || orderDetails.utm_campaign || tracking.utm_campaign || "").trim();
      const rawMedium = String(customData.utm_medium || orderDetails.utm_medium || tracking.utm_medium || "").trim();
      const rawContent = String(customData.utm_content || orderDetails.utm_content || tracking.utm_content || "").trim();
      const rawSource = String(customData.utm_source || orderDetails.utm_source || tracking.utm_source || "").trim();

      // Formato Nome|ID
      const campId = rawCampaign.includes("|") ? rawCampaign.split("|")[1].trim() : rawCampaign;
      const campName = rawCampaign.includes("|") ? rawCampaign.split("|")[0].trim() : rawCampaign;

      const adsetId = rawMedium.includes("|") ? rawMedium.split("|")[1].trim() : rawMedium;
      const adsetName = rawMedium.includes("|") ? rawMedium.split("|")[0].trim() : rawMedium;

      const cleanContent = rawContent.includes("::") ? rawContent.split("::")[0].trim() : rawContent;
      const adId = cleanContent.includes("|") ? cleanContent.split("|")[1].trim() : cleanContent;
      const adName = cleanContent.includes("|") ? cleanContent.split("|")[0].trim() : cleanContent;

      const parsed: ParsedEvent = {
        id: ev.id,
        isPurchase,
        isIC,
        val,
        campId,
        campName,
        adsetId,
        adsetName,
        adId,
        adName,
        rawCampaign,
        rawMedium,
        rawContent,
        rawSource,
      };

      if (isPurchase) parsedPurchases.push(parsed);
      else if (isIC) parsedICs.push(parsed);
    });

    const trackedPurchaseIds = new Set<string>();

    // 5. Itera pelas contas em paralelo com tratamento de erro granular
    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];
    const allAdsets: any[] = [];
    const allAds: any[] = [];
    const accountErrors: Array<{ id: string; error: string }> = [];

    const accountPromises = accountIdsToProcess.map(async (accId) => {
      const rawAcc = metaAccountsRaw.find((a: any) => a.id === accId) || {};
      const currency = ((rawAcc.currency || "BRL") as string).toUpperCase();

      const accFields = "name,account_status,balance,amount_spent,currency,funding_source_details,insights.date_preset(" + metaDatePreset + "){spend,impressions,clicks,actions}";
      const accUrl = `https://graph.facebook.com/v23.0/${accId}?fields=${encodeURIComponent(accFields)}&access_token=${token}`;

      try {
        const [accRes, campRes, adsetRes, adRes] = await Promise.all([
          fetch(accUrl, { cache: "no-store" }),
          fetch(`https://graph.facebook.com/v23.0/${accId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,insights.date_preset(${metaDatePreset}){spend,actions}&access_token=${token}&limit=100`, { cache: "no-store" }),
          fetch(`https://graph.facebook.com/v23.0/${accId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,campaign_id,insights.date_preset(${metaDatePreset}){spend,actions}&access_token=${token}&limit=100`, { cache: "no-store" }),
          fetch(`https://graph.facebook.com/v23.0/${accId}/ads?fields=id,name,status,effective_status,updated_time,adset_id,campaign_id,insights.date_preset(${metaDatePreset}){spend,actions}&access_token=${token}&limit=100`, { cache: "no-store" }),
        ]);

        const accData = await accRes.json();

        if (!accRes.ok || accData.error) {
          const errMsg = accData.error?.message || `HTTP ${accRes.status}`;
          accountErrors.push({ id: accId, error: errMsg });
          console.error(`[Meta Account ${accId} Error]:`, errMsg);
          return;
        }

        const accName = accData.name || rawAcc.name || accId;
        const accStatusCode = accData.account_status;
        const accStatus = accStatusCode === 1 ? "Ativo" : accStatusCode === 2 ? "Desabilitado" : accStatusCode === 3 ? "Não Verificado" : "Pendente";
        const cardDisplay = accData.funding_source_details?.display_string || rawAcc.funding_source_details?.display_string || "N/A";

        const rawBalance = Number(accData.balance || rawAcc.balance || 0) / 100;
        const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

        const accInsights = accData.insights?.data?.[0] || {};
        const rawPeriodSpend = Number(accInsights.spend || 0);
        const periodSpendBrl = convertToBrl(rawPeriodSpend, currency, usdBrlRate);

        // Processa Campanhas da conta
        const campData = campRes.ok ? await campRes.json() : {};
        const rawCampaigns = Array.isArray(campData.data) ? campData.data : [];

        let accRevenue = 0;
        let accSales = 0;
        let accIc = 0;

        // Identificadores para match inteligente de conta (ex: "USD 1", "USD 01", "USD 3")
        const accNameLower = accName.toLowerCase().replace(/[^a-z0-9]/g, "");

        rawCampaigns.forEach((camp: any) => {
          const cIns = camp.insights?.data?.[0] || {};
          const cRawSpend = Number(cIns.spend || 0);
          const cSpend = convertToBrl(cRawSpend, currency, usdBrlRate);

          const cNameLower = String(camp.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const cId = String(camp.id || "");

          // Match de compras da campanha
          let cRevenue = 0;
          let cSales = 0;

          parsedPurchases.forEach((p) => {
            const pCampNameLower = p.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const isMatch =
              (p.campId && p.campId === cId) ||
              (cNameLower && pCampNameLower && (cNameLower.includes(pCampNameLower) || pCampNameLower.includes(cNameLower)));

            if (isMatch) {
              cRevenue += p.val;
              cSales += 1;
              trackedPurchaseIds.add(p.id);
            }
          });

          // Match de ICs
          let cIc = 0;
          parsedICs.forEach((ic) => {
            const icCampNameLower = ic.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (ic.campId && ic.campId === cId) ||
              (cNameLower && icCampNameLower && (cNameLower.includes(icCampNameLower) || icCampNameLower.includes(cNameLower)))
            ) {
              cIc++;
            }
          });

          accRevenue += cRevenue;
          accSales += cSales;
          accIc += cIc;

          const cProfit = cRevenue - cSpend;
          const cRoas = cSpend > 0 ? cRevenue / cSpend : (cRevenue > 0 ? 99.9 : 0);
          const cCpa = cSales > 0 ? cSpend / cSales : 0;
          const cCpi = cIc > 0 ? cSpend / cIc : 0;
          const cMargin = cRevenue > 0 ? (cProfit / cRevenue) * 100 : (cSpend > 0 ? -100 : 0);
          const cRoi = cSpend > 0 ? cProfit / cSpend : 0;

          const rawBudget = camp.daily_budget ? Number(camp.daily_budget) / 100 : Number(camp.lifetime_budget || 0) / 100;
          const convertedBudget = convertToBrl(rawBudget, currency, usdBrlRate);
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
        });

        // Match direto de compras órfãs vinculadas ao nome da conta (ex: USD 1, USD 2, USD 3)
        parsedPurchases.forEach((p) => {
          if (!trackedPurchaseIds.has(p.id)) {
            const pCampNameLower = p.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const pSourceLower = p.rawSource.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (accNameLower && pCampNameLower.includes(accNameLower)) ||
              (accNameLower && pSourceLower.includes(accNameLower)) ||
              (p.rawSource.includes(accId))
            ) {
              accRevenue += p.val;
              accSales += 1;
              trackedPurchaseIds.add(p.id);
            }
          }
        });

        const accProfit = accRevenue - periodSpendBrl;
        const accRoas = periodSpendBrl > 0 ? accRevenue / periodSpendBrl : (accRevenue > 0 ? 99.9 : 0);
        const accCpa = accSales > 0 ? periodSpendBrl / accSales : 0;
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

        // 5.3 Processa AdSets (Conjuntos)
        const adsetData = adsetRes.ok ? await adsetRes.json() : {};
        const rawAdsets = Array.isArray(adsetData.data) ? adsetData.data : [];

        rawAdsets.forEach((as: any) => {
          const asIns = as.insights?.data?.[0] || {};
          const asRawSpend = Number(asIns.spend || 0);
          const asSpend = convertToBrl(asRawSpend, currency, usdBrlRate);

          const asNameLower = String(as.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const asId = String(as.id || "");

          let asRevenue = 0;
          let asSales = 0;
          let asIc = 0;

          parsedPurchases.forEach((p) => {
            const pAdsetNameLower = p.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (p.adsetId && p.adsetId === asId) ||
              (asNameLower && pAdsetNameLower && (asNameLower.includes(pAdsetNameLower) || pAdsetNameLower.includes(asNameLower)))
            ) {
              asRevenue += p.val;
              asSales += 1;
            }
          });

          parsedICs.forEach((ic) => {
            const icAdsetNameLower = ic.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (ic.adsetId && ic.adsetId === asId) ||
              (asNameLower && icAdsetNameLower && (asNameLower.includes(icAdsetNameLower) || icAdsetNameLower.includes(asNameLower)))
            ) {
              asIc++;
            }
          });

          const asProfit = asRevenue - asSpend;
          const asRoas = asSpend > 0 ? asRevenue / asSpend : (asRevenue > 0 ? 99.9 : 0);
          const asCpa = asSales > 0 ? asSpend / asSales : 0;
          const asCpi = asIc > 0 ? asSpend / asIc : 0;
          const asMargin = asRevenue > 0 ? (asProfit / asRevenue) * 100 : (asSpend > 0 ? -100 : 0);
          const asRoi = asSpend > 0 ? asProfit / asSpend : 0;

          const asRawBudget = as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100;
          const asConvertedBudget = convertToBrl(asRawBudget, currency, usdBrlRate);
          const asIsActive = as.effective_status === "ACTIVE" || (as.effective_status === undefined && as.status === "ACTIVE");
          const parentCamp = allCampaigns.find((c) => c.id === as.campaign_id);

          allAdsets.push({
            id: as.id,
            name: as.name,
            campaign_id: as.campaign_id || (parentCamp?.id || ""),
            campaign_name: parentCamp?.name || "Campanha",
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
        });

        // 5.4 Processa Ads (Anúncios)
        const adData = adRes.ok ? await adRes.json() : {};
        const rawAds = Array.isArray(adData.data) ? adData.data : [];

        rawAds.forEach((ad: any) => {
          const adIns = ad.insights?.data?.[0] || {};
          const adRawSpend = Number(adIns.spend || 0);
          const adSpend = convertToBrl(adRawSpend, currency, usdBrlRate);

          const adNameLower = String(ad.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const adId = String(ad.id || "");

          let adRevenue = 0;
          let adSales = 0;
          let adIc = 0;

          parsedPurchases.forEach((p) => {
            const pAdNameLower = p.adName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (p.adId && p.adId === adId) ||
              (adNameLower && pAdNameLower && (adNameLower.includes(pAdNameLower) || pAdNameLower.includes(adNameLower)))
            ) {
              adRevenue += p.val;
              adSales += 1;
            }
          });

          parsedICs.forEach((ic) => {
            const icAdNameLower = ic.adName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (
              (ic.adId && ic.adId === adId) ||
              (adNameLower && icAdNameLower && (adNameLower.includes(icAdNameLower) || icAdNameLower.includes(adNameLower)))
            ) {
              adIc++;
            }
          });

          const adProfit = adRevenue - adSpend;
          const adRoas = adSpend > 0 ? adRevenue / adSpend : (adRevenue > 0 ? 99.9 : 0);
          const adCpa = adSales > 0 ? adSpend / adSales : 0;
          const adCpi = adIc > 0 ? adSpend / adIc : 0;
          const adMargin = adRevenue > 0 ? (adProfit / adRevenue) * 100 : (adSpend > 0 ? -100 : 0);
          const adRoi = adSpend > 0 ? adProfit / adSpend : 0;

          const adIsActive = ad.effective_status === "ACTIVE" || (ad.effective_status === undefined && ad.status === "ACTIVE");
          const parentCamp = allCampaigns.find((c) => c.id === ad.campaign_id);
          const parentAdset = allAdsets.find((as) => as.id === ad.adset_id);

          allAds.push({
            id: ad.id,
            name: ad.name,
            adset_id: ad.adset_id || (parentAdset?.id || ""),
            adset_name: parentAdset?.name || "Conjunto",
            campaign_id: ad.campaign_id || (parentCamp?.id || ""),
            campaign_name: parentCamp?.name || "Campanha",
            account_id: accId,
            account_name: accName,
            status: adIsActive ? "active" : "paused",
            effective_status: ad.effective_status || ad.status,
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
      } catch (err: any) {
        accountErrors.push({ id: accId, error: err.message || "Erro de processamento" });
        console.error(`[Account Processing ${accId} Error]:`, err);
      }
    });

    await Promise.all(accountPromises);

    const untrackedSalesCount = Math.max(parsedPurchases.length - trackedPurchaseIds.size, 0);

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
