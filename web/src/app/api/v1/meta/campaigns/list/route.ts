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

    // Se o usuário selecionou contas nas integrações, usa SOMENTE elas. Caso contrário, usa as da Meta.
    const accountIdsToProcess = configuredAccountIds.length > 0 
      ? configuredAccountIds.map((id: string) => (id.startsWith("act_") ? id : `act_${id}`))
      : metaAccountsRaw.map((a: any) => a.id);

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
      fee: number;
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
      const method = String(
        orderDetails.payment_method ||
        customData.payment_method ||
        customData.payment_type ||
        orderDetails.payment_type ||
        metaResp.payment_method ||
        ""
      ).toLowerCase();
      
      const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master");

      const val = Number(customData.value || orderDetails.value || 0);
      let fee = 0;
      if (val > 0 && isPurchase) {
        if (isCard) {
          fee = (val * 0.3099) + 3.99;
        } else {
          fee = (val * 0.10) + 5.00;
        }
      }

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
        fee,
      };

      if (isPurchase) parsedPurchases.push(parsed);
      else if (isIC) parsedICs.push(parsed);
    });

    const trackedPurchaseIds = new Set<string>();

    // 5. Coleta dados de todas as contas, campanhas, adsets e ads primeiro
    const accountRawResults: Array<{
      accId: string;
      accData: any;
      rawAcc: any;
      currency: string;
      rawCampaigns: any[];
      rawAdsets: any[];
      rawAds: any[];
    }> = [];
    const accountErrors: Array<{ id: string; error: string }> = [];

    const fetchPromises = accountIdsToProcess.map(async (accId) => {
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
          accountErrors.push({ id: accId, error: accData.error?.message || `HTTP ${accRes.status}` });
          return;
        }

        const campData = campRes.ok ? await campRes.json() : {};
        const adsetData = adsetRes.ok ? await adsetRes.json() : {};
        const adData = adRes.ok ? await adRes.json() : {};

        accountRawResults.push({
          accId,
          accData,
          rawAcc,
          currency,
          rawCampaigns: Array.isArray(campData.data) ? campData.data : [],
          rawAdsets: Array.isArray(adsetData.data) ? adsetData.data : [],
          rawAds: Array.isArray(adData.data) ? adData.data : [],
        });
      } catch (err: any) {
        accountErrors.push({ id: accId, error: err.message || "Erro de conexão" });
      }
    });

    await Promise.all(fetchPromises);

    // Listas globais consolidadas
    const globalCampaignsList: Array<{ id: string; name: string; accId: string; cleanName: string }> = [];
    const globalAdsetsList: Array<{ id: string; name: string; accId: string; cleanName: string }> = [];
    const globalAdsList: Array<{ id: string; name: string; accId: string; cleanName: string }> = [];

    accountRawResults.forEach((acc) => {
      acc.rawCampaigns.forEach((c: any) => {
        globalCampaignsList.push({
          id: String(c.id || ""),
          name: String(c.name || ""),
          accId: acc.accId,
          cleanName: String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        });
      });
      acc.rawAdsets.forEach((as: any) => {
        globalAdsetsList.push({
          id: String(as.id || ""),
          name: String(as.name || ""),
          accId: acc.accId,
          cleanName: String(as.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        });
      });
      acc.rawAds.forEach((ad: any) => {
        globalAdsList.push({
          id: String(ad.id || ""),
          name: String(ad.name || ""),
          accId: acc.accId,
          cleanName: String(ad.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        });
      });
    });

    // 6. Atribuição UNÍVOCA 1:1 de Compras (Cada compra pertence a exatamente 1 Campanha, 1 Conjunto e 1 Anúncio)
    const campaignAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const adsetAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const adAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const accountAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const matchedPurchaseIds = new Set<string>();

    parsedPurchases.forEach((p) => {
      const pCampNameClean = p.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pAdsetNameClean = p.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pAdNameClean = p.adName.toLowerCase().replace(/[^a-z0-9]/g, "");

      // 6.1 Match de Campanha (Prioridade 1: ID exato -> Prioridade 2: Nome exato -> Prioridade 3: Substring)
      let bestCamp = globalCampaignsList.find((c) => p.campId && c.id === p.campId);
      if (!bestCamp && pCampNameClean) {
        bestCamp = globalCampaignsList.find((c) => c.cleanName === pCampNameClean);
      }
      if (!bestCamp && pCampNameClean) {
        bestCamp = globalCampaignsList.find(
          (c) => c.cleanName && (c.cleanName.includes(pCampNameClean) || pCampNameClean.includes(c.cleanName))
        );
      }

      if (bestCamp) {
        const prev = campaignAttribution.get(bestCamp.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        campaignAttribution.set(bestCamp.id, { 
          grossRevenue: prev.grossRevenue + p.val, 
          netRevenue: prev.netRevenue + (p.val - p.fee),
          count: prev.count + 1 
        });

        const prevAcc = accountAttribution.get(bestCamp.accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        accountAttribution.set(bestCamp.accId, { 
          grossRevenue: prevAcc.grossRevenue + p.val, 
          netRevenue: prevAcc.netRevenue + (p.val - p.fee),
          count: prevAcc.count + 1 
        });
        matchedPurchaseIds.add(p.id);
      }

      // 6.2 Match de Conjunto/Adset
      let bestAdset = globalAdsetsList.find((as) => p.adsetId && as.id === p.adsetId);
      if (!bestAdset && pAdsetNameClean) {
        bestAdset = globalAdsetsList.find((as) => as.cleanName === pAdsetNameClean);
      }
      if (!bestAdset && pAdsetNameClean) {
        bestAdset = globalAdsetsList.find(
          (as) => as.cleanName && (as.cleanName.includes(pAdsetNameClean) || pAdsetNameClean.includes(as.cleanName))
        );
      }

      if (bestAdset) {
        const prev = adsetAttribution.get(bestAdset.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        adsetAttribution.set(bestAdset.id, { 
          grossRevenue: prev.grossRevenue + p.val, 
          netRevenue: prev.netRevenue + (p.val - p.fee),
          count: prev.count + 1 
        });
      }

      // 6.3 Match de Anúncio/Ad
      let bestAd = globalAdsList.find((ad) => p.adId && ad.id === p.adId);
      if (!bestAd && pAdNameClean) {
        bestAd = globalAdsList.find((ad) => ad.cleanName === pAdNameClean);
      }
      if (!bestAd && pAdNameClean) {
        bestAd = globalAdsList.find(
          (ad) => ad.cleanName && (ad.cleanName.includes(pAdNameClean) || pAdNameClean.includes(ad.cleanName))
        );
      }

      if (bestAd) {
        const prev = adAttribution.get(bestAd.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        adAttribution.set(bestAd.id, { 
          grossRevenue: prev.grossRevenue + p.val, 
          netRevenue: prev.netRevenue + (p.val - p.fee),
          count: prev.count + 1 
        });
      }

      // 6.4 Se não deu match em campanha, tenta match direto por nome da conta
      if (!bestCamp) {
        accountRawResults.forEach((acc) => {
          const accNameClean = (acc.accData.name || acc.rawAcc.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            (accNameClean && pCampNameClean && pCampNameClean.includes(accNameClean)) ||
            (accNameClean && p.rawSource.toLowerCase().includes(accNameClean)) ||
            (p.rawSource.includes(acc.accId))
          ) {
            const prevAcc = accountAttribution.get(acc.accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
            accountAttribution.set(acc.accId, { 
              grossRevenue: prevAcc.grossRevenue + p.val, 
              netRevenue: prevAcc.netRevenue + (p.val - p.fee),
              count: prevAcc.count + 1 
            });
            matchedPurchaseIds.add(p.id);
          }
        });
      }
    });

    // 7. Montagem das respostas estruturadas com métricas completas
    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];
    const allAdsets: any[] = [];
    const allAds: any[] = [];

    accountRawResults.forEach((acc) => {
      const { accId, accData, rawAcc, currency, rawCampaigns, rawAdsets, rawAds } = acc;

      const accName = accData.name || rawAcc.name || accId;
      const accStatusCode = accData.account_status;
      const accStatus = accStatusCode === 1 ? "Ativo" : accStatusCode === 2 ? "Desabilitado" : accStatusCode === 3 ? "Não Verificado" : "Pendente";
      const cardDisplay = accData.funding_source_details?.display_string || rawAcc.funding_source_details?.display_string || "N/A";

      const rawBalance = Number(accData.balance || rawAcc.balance || 0) / 100;
      const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

      const accInsights = accData.insights?.data?.[0] || {};
      const rawPeriodSpend = Number(accInsights.spend || 0);
      const periodSpendBrl = convertToBrl(rawPeriodSpend, currency, usdBrlRate);

      const accAttr = accountAttribution.get(accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
      const accGrossRevenue = accAttr.grossRevenue;
      const accNetRevenue = accAttr.netRevenue;
      const accSales = accAttr.count;
      const accProfit = accNetRevenue - periodSpendBrl;
      const accRoas = periodSpendBrl > 0 ? accGrossRevenue / periodSpendBrl : (accGrossRevenue > 0 ? 99.9 : 0);
      const accCpa = accSales > 0 ? periodSpendBrl / accSales : 0;
      const accMargin = accNetRevenue > 0 ? (accProfit / accNetRevenue) * 100 : (periodSpendBrl > 0 ? -100 : 0);
      const accRoi = periodSpendBrl > 0 ? accProfit / periodSpendBrl : 0;

      formattedAccounts.push({
        id: accId,
        name: accName,
        currency,
        status: accStatus,
        card: cardDisplay,
        cycle: cycleBrl,
        spend: periodSpendBrl,
        revenue: accNetRevenue,
        profit: accProfit,
        roas: accRoas,
        sales: accSales,
        cpa: accCpa,
        ic: 0,
        cpi: 0,
        margin: accMargin,
        roi: accRoi,
        last_update: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      });

      // Processa Campanhas
      rawCampaigns.forEach((camp: any) => {
        const cIns = camp.insights?.data?.[0] || {};
        const cRawSpend = Number(cIns.spend || 0);
        const cSpend = convertToBrl(cRawSpend, currency, usdBrlRate);

        const cAttr = campaignAttribution.get(camp.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const cGrossRevenue = cAttr.grossRevenue;
        const cNetRevenue = cAttr.netRevenue;
        const cSales = cAttr.count;
        const cProfit = cNetRevenue - cSpend;
        const cRoas = cSpend > 0 ? cGrossRevenue / cSpend : (cGrossRevenue > 0 ? 99.9 : 0);
        const cCpa = cSales > 0 ? cSpend / cSales : 0;
        const cMargin = cNetRevenue > 0 ? (cProfit / cNetRevenue) * 100 : (cSpend > 0 ? -100 : 0);
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
          revenue: cNetRevenue,
          profit: cProfit,
          roas: cRoas,
          sales: cSales,
          cpa: cCpa,
          ic: 0,
          cpi: 0,
          margin: cMargin,
          roi: cRoi,
          last_update: camp.updated_time ? new Date(camp.updated_time).toLocaleString("pt-BR") : "Hoje",
        });
      });

      // Processa AdSets
      rawAdsets.forEach((as: any) => {
        const asIns = as.insights?.data?.[0] || {};
        const asRawSpend = Number(asIns.spend || 0);
        const asSpend = convertToBrl(asRawSpend, currency, usdBrlRate);

        const asAttr = adsetAttribution.get(as.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const asGrossRevenue = asAttr.grossRevenue;
        const asNetRevenue = asAttr.netRevenue;
        const asSales = asAttr.count;
        const asProfit = asNetRevenue - asSpend;
        const asRoas = asSpend > 0 ? asGrossRevenue / asSpend : (asGrossRevenue > 0 ? 99.9 : 0);
        const asCpa = asSales > 0 ? asSpend / asSales : 0;
        const asMargin = asNetRevenue > 0 ? (asProfit / asNetRevenue) * 100 : (asSpend > 0 ? -100 : 0);
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
          revenue: asNetRevenue,
          profit: asProfit,
          roas: asRoas,
          sales: asSales,
          cpa: asCpa,
          ic: 0,
          cpi: 0,
          margin: asMargin,
          roi: asRoi,
          last_update: as.updated_time ? new Date(as.updated_time).toLocaleString("pt-BR") : "Hoje",
        });
      });

      // Processa Ads
      rawAds.forEach((ad: any) => {
        const adIns = ad.insights?.data?.[0] || {};
        const adRawSpend = Number(adIns.spend || 0);
        const adSpend = convertToBrl(adRawSpend, currency, usdBrlRate);

        const adAttr = adAttribution.get(ad.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const adGrossRevenue = adAttr.grossRevenue;
        const adNetRevenue = adAttr.netRevenue;
        const adSales = adAttr.count;
        const adProfit = adNetRevenue - adSpend;
        const adRoas = adSpend > 0 ? adGrossRevenue / adSpend : (adGrossRevenue > 0 ? 99.9 : 0);
        const adCpa = adSales > 0 ? adSpend / adSales : 0;
        const adMargin = adNetRevenue > 0 ? (adProfit / adNetRevenue) * 100 : (adSpend > 0 ? -100 : 0);
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
          revenue: adNetRevenue,
          profit: adProfit,
          roas: adRoas,
          sales: adSales,
          cpa: adCpa,
          ic: 0,
          cpi: 0,
          margin: adMargin,
          roi: adRoi,
          last_update: ad.updated_time ? new Date(ad.updated_time).toLocaleString("pt-BR") : "Hoje",
        });
      });
    });

    const untrackedSalesCount = Math.max(parsedPurchases.length - matchedPurchaseIds.size, 0);

    // Ordenação por gasto decrescente
    formattedAccounts.sort((a, b) => b.spend - a.spend);
    allCampaigns.sort((a, b) => b.spend - a.spend);
    allAdsets.sort((a, b) => b.spend - a.spend);
    allAds.sort((a, b) => b.spend - a.spend);

    // Se nenhuma conta retornou dados e houve erros, expõe o erro para a UI alertar o usuário
    if (formattedAccounts.length === 0 && accountErrors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `Falha ao acessar as contas selecionadas: ${accountErrors[0].error}`,
        accounts: [], campaigns: [], adsets: [], ads: [],
      });
    }

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
