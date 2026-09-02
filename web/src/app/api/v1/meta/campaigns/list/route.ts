import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";

export const dynamic = "force-dynamic";

// Cache em memória para evitar Rate Limit da Meta (code 17) por polling frequente
interface CacheEntry {
  timestamp: number;
  data: any;
}
const MEMORY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60000; // 60 segundos (carregamento ultra-rápido < 50ms)

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna dados estruturados em 4 níveis (Contas, Campanhas, Conjuntos/AdSets, Anúncios/Ads)
 * enriquecidos com Ciclo de cobrança, Cartão de crédito, Métricas de Lucro, ROAS, IC, CPI e Margem.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("date_preset") || "today";

    const storeId = searchParams.get("store_id");
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const cacheKey = `${storeId}_${datePreset}_${searchParams.get("account_id") || "all"}`;
    const nowMs = Date.now();
    const cached = MEMORY_CACHE.get(cacheKey);
    if (cached && (nowMs - cached.timestamp < CACHE_TTL_MS)) {
      return NextResponse.json(cached.data);
    }

    const supabase = createAdminClient();

    // 1. Busca token mestre da Meta — integração ativa desta loja com fallback
    const { data: storeInt } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let integration = storeInt;
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
      case "last_7d":
        startDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "last_30d":
        startDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "last_60d":
        startDate = new Date(startDate.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case "this_month": {
        const [year, month] = brDateStr.split("-");
        startDate = new Date(`${year}-${month}-01T00:00:00-03:00`);
        break;
      }
      default: // "today"
        break;
    }

    // 3. Busca contas vinculadas ao token via /me/adaccounts e /me/businesses
    // Campos seguros: sem funding_source_details e spend_cap (campos privilegiados
    // que causam falha silenciosa ou erro em contas de parceiros/BMs de clientes)
    let metaAccountsRaw: any[] = [];
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,account_id,name,currency,account_status,balance,amount_spent&access_token=${token}&limit=200`,
        { cache: "no-store" }
      );
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.data)) {
          metaAccountsRaw = accData.data;
        } else if (accData.error) {
          console.error("[Campaigns] /me/adaccounts error:", accData.error.message);
        }
      }
    } catch (e) {
      console.error("[Campaigns] /me/adaccounts fetch error:", e);
    }

    // Complementa com contas das Business Managers
    try {
      const bmRes = await fetch(
        `https://graph.facebook.com/v23.0/me/businesses?fields=id,name&access_token=${token}&limit=50`,
        { cache: "no-store" }
      );
      if (bmRes.ok) {
        const bmData = await bmRes.json();
        if (Array.isArray(bmData.data)) {
          for (const bm of bmData.data) {
            try {
              const [ownedRes, clientRes] = await Promise.all([
                fetch(`https://graph.facebook.com/v23.0/${bm.id}/owned_ad_accounts?fields=id,account_id,name,currency,account_status,balance,amount_spent&access_token=${token}&limit=200`, { cache: "no-store" }),
                fetch(`https://graph.facebook.com/v23.0/${bm.id}/client_ad_accounts?fields=id,account_id,name,currency,account_status,balance,amount_spent&access_token=${token}&limit=200`, { cache: "no-store" }),
              ]);
              if (ownedRes.ok) {
                const owned = await ownedRes.json();
                if (Array.isArray(owned.data)) {
                  owned.data.forEach((acc: any) => {
                    if (!metaAccountsRaw.some((ex: any) => ex.id === acc.id)) {
                      metaAccountsRaw.push({ ...acc, _bm_name: bm.name });
                    }
                  });
                }
              }
              if (clientRes.ok) {
                const clients = await clientRes.json();
                if (Array.isArray(clients.data)) {
                  clients.data.forEach((acc: any) => {
                    if (!metaAccountsRaw.some((ex: any) => ex.id === acc.id)) {
                      metaAccountsRaw.push({ ...acc, _bm_name: bm.name });
                    }
                  });
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];
    const requestedAccountId = searchParams.get("account_id");

    // Se account_id foi pedido na URL, filtra apenas ele.
    // Se há contas configuradas, usa elas (com teto seguro de 5 contas simultâneas para evitar timeout no Vercel).
    // Se não há configuradas, seleciona as 3 contas mais relevantes (com maior gasto) em vez de varrer 19 de uma vez.
    let accountIdsToProcess: string[] = [];

    if (requestedAccountId) {
      accountIdsToProcess = [requestedAccountId.startsWith("act_") ? requestedAccountId : `act_${requestedAccountId}`];
    } else if (configuredAccountIds.length > 0) {
      accountIdsToProcess = configuredAccountIds
        .map((id: string) => (id.startsWith("act_") ? id : `act_${id}`))
        .slice(0, 5); // Teto de segurança para tempo de resposta < 3s no Vercel
    } else {
      // Ordena por gasto histórico decrescente e pega as top 3
      const sortedBySpend = [...metaAccountsRaw].sort((a, b) => Number(b.amount_spent || 0) - Number(a.amount_spent || 0));
      accountIdsToProcess = sortedBySpend.slice(0, 3).map((a: any) => a.id);
    }

    if (accountIdsToProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        usdBrlRate,
        untracked_sales_count: 0,
        account_errors: [],
        notice: "Nenhuma conta de anúncio selecionada para esta loja. Acesse Configurações -> Integrações e selecione as contas desejadas.",
        accounts: [], campaigns: [], adsets: [], ads: [],
      });
    }

    // 5. Busca Vendas Aprovadas desta loja
    const { data: dbEvents } = await supabase
      .from("events")
      .select("id, event_name, meta_response, created_at")
      .eq("store_id", storeId)
      .in("event_name", ["Purchase", "InitiateCheckout"])
      .eq("status", "accepted")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    // Busca regras de impostos e taxas configuradas pelo usuário para esta loja
    const { data: storeTaxesAndDuties } = await supabase
      .from("taxes_and_duties")
      .select("*")
      .eq("store_id", storeId);

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
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const isPurchase = ev.event_name === "Purchase";
      const isIC = ev.event_name === "InitiateCheckout";
      
      const method = String(
        orderDetails.payment_method ||
        customData.payment_method ||
        customData.payment_type ||
        orderDetails.payment_type ||
        metaResp.payment_method ||
        ""
      ).toLowerCase();
      
      const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master");
      const isPix = method.includes("pix") || method === "";
      const isBoleto = method.includes("boleto");

      const val = Number(customData.value || orderDetails.value || 0);
      let fee = 0;
      if (val > 0 && isPurchase) {
        const hasCustomRules = (storeTaxesAndDuties || []).length > 0;
        if (hasCustomRules) {
          // 1. Impostos
          (storeTaxesAndDuties || []).filter((t: any) => t.type === "tax").forEach((t: any) => {
            fee += val * (Number(t.value || 0) / 100);
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
          // Fallback seguro alinhado com Pix ~9.9%
          fee = isCard ? (val * 0.15) : (val * 0.099);
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

    // 5. Coleta dados das contas selecionadas com timeout seguro (6s)
    const accountRawResults: Array<{
      accId: string;
      accData: any;
      rawAcc: any;
      currency: string;
      rawCampaigns: any[];
      rawAdsets: any[];
      rawAds: any[];
      campaignInsightsMap: Map<string, any>;
      adsetInsightsMap: Map<string, any>;
      adInsightsMap: Map<string, any>;
      accountInsight: any;
    }> = [];
    const accountErrors: Array<{ id: string; error: string }> = [];

    const fetchPromises = accountIdsToProcess.map(async (accId) => {
      const cleanAccId = accId.startsWith("act_") ? accId : `act_${accId}`;
      const rawAcc = metaAccountsRaw.find((a: any) => a.id === cleanAccId || a.id === accId) || {};
      const currency = ((rawAcc.currency || "BRL") as string).toUpperCase();

      // ── Fetch 1: Metadados puros da Conta (Campos seguros, nunca falham) ──
      const accUrl = `https://graph.facebook.com/v23.0/${cleanAccId}?fields=id,account_id,name,account_status,balance,amount_spent,currency&access_token=${token}`;

      // ── Fetch 2-4: Estrutura de Campanhas, Conjuntos e Anúncios ──
      const campUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,updated_time&access_token=${token}&limit=200`;
      const adsetUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,campaign_id&access_token=${token}&limit=200`;
      const adUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/ads?fields=id,name,status,effective_status,updated_time,adset_id,campaign_id&access_token=${token}&limit=200`;

      // ── Fetch 5-8: Insights em lote por nível ──
      const campInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=campaign&date_preset=${metaDatePreset}&fields=campaign_id,spend,impressions,clicks,actions&access_token=${token}&limit=500`;
      const adsetInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=adset&date_preset=${metaDatePreset}&fields=adset_id,spend,impressions,clicks,actions&access_token=${token}&limit=500`;
      const adInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=ad&date_preset=${metaDatePreset}&fields=ad_id,spend,impressions,clicks,actions&access_token=${token}&limit=500`;
      const accInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=account&date_preset=${metaDatePreset}&fields=spend,impressions,clicks,actions&access_token=${token}`;

      const [accRes, campRes, adsetRes, adRes, cInsRes, asInsRes, aInsRes, acInsRes] = await Promise.all([
        fetch(accUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(campUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(adsetUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(adUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(campInsightsUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(adsetInsightsUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(adInsightsUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
        fetch(accInsightsUrl, { cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null),
      ]);

      let accData: any = {};
      try {
        if (accRes && accRes.ok) {
          const raw = await accRes.json();
          if (!raw.error) {
            accData = raw;
          } else {
            accData = {
              name: rawAcc.name || `Conta ${cleanAccId.replace("act_", "")}`,
              account_status: rawAcc.account_status || 1,
              balance: rawAcc.balance || 0,
              amount_spent: rawAcc.amount_spent || 0,
              currency: rawAcc.currency || "BRL",
            };
          }
        } else {
          accData = {
            name: rawAcc.name || `Conta ${cleanAccId.replace("act_", "")}`,
            account_status: rawAcc.account_status || 1,
            balance: rawAcc.balance || 0,
            amount_spent: rawAcc.amount_spent || 0,
            currency: rawAcc.currency || "BRL",
          };
        }
      } catch {
        accData = {
          name: rawAcc.name || `Conta ${cleanAccId.replace("act_", "")}`,
          account_status: 1,
          balance: 0,
          amount_spent: 0,
          currency: rawAcc.currency || "BRL",
        };
      }

      let rawCampaigns: any[] = [];
      let rawAdsets: any[] = [];
      let rawAds: any[] = [];

      try {
        if (campRes && campRes.ok) {
          const campData = await campRes.json();
          if (campData.error) {
            accountErrors.push({ id: cleanAccId, error: campData.error.message || "Erro ao buscar campanhas" });
          } else {
            rawCampaigns = Array.isArray(campData.data) ? campData.data : [];
          }
        }
      } catch {}

      try {
        if (adsetRes && adsetRes.ok) {
          const adsetData = await adsetRes.json();
          rawAdsets = Array.isArray(adsetData.data) ? adsetData.data : [];
        }
      } catch {}

      try {
        if (adRes && adRes.ok) {
          const adData = await adRes.json();
          rawAds = Array.isArray(adData.data) ? adData.data : [];
        }
      } catch {}

      // Mapeamento de Insights
      const campaignInsightsMap = new Map<string, any>();
      try {
        if (cInsRes && cInsRes.ok) {
          const cInsData = await cInsRes.json();
          if (Array.isArray(cInsData.data)) {
            cInsData.data.forEach((ins: any) => {
              if (ins.campaign_id) campaignInsightsMap.set(ins.campaign_id, ins);
            });
          }
        }
      } catch {}

      const adsetInsightsMap = new Map<string, any>();
      try {
        if (asInsRes && asInsRes.ok) {
          const asInsData = await asInsRes.json();
          if (Array.isArray(asInsData.data)) {
            asInsData.data.forEach((ins: any) => {
              if (ins.adset_id) adsetInsightsMap.set(ins.adset_id, ins);
            });
          }
        }
      } catch {}

      const adInsightsMap = new Map<string, any>();
      try {
        if (aInsRes && aInsRes.ok) {
          const aInsData = await aInsRes.json();
          if (Array.isArray(aInsData.data)) {
            aInsData.data.forEach((ins: any) => {
              if (ins.ad_id) adInsightsMap.set(ins.ad_id, ins);
            });
          }
        }
      } catch {}

      let accountInsight: any = {};
      try {
        if (acInsRes && acInsRes.ok) {
          const acInsData = await acInsRes.json();
          accountInsight = acInsData.data?.[0] || {};
        }
      } catch {}

      accountRawResults.push({
        accId: cleanAccId,
        accData,
        rawAcc,
        currency,
        rawCampaigns,
        rawAdsets,
        rawAds,
        campaignInsightsMap,
        adsetInsightsMap,
        adInsightsMap,
        accountInsight,
      });
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

    // 6.5 Atribuição de InitiateCheckouts (first-party)
    const campaignIcAttribution = new Map<string, number>();
    const adsetIcAttribution = new Map<string, number>();
    const adIcAttribution = new Map<string, number>();
    const accountIcAttribution = new Map<string, number>();

    parsedICs.forEach((ic) => {
      const pCampNameClean = ic.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pAdsetNameClean = ic.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pAdNameClean = ic.adName.toLowerCase().replace(/[^a-z0-9]/g, "");

      let bestCamp = globalCampaignsList.find((c) => ic.campId && c.id === ic.campId);
      if (!bestCamp && pCampNameClean) {
        bestCamp = globalCampaignsList.find((c) => c.cleanName === pCampNameClean);
      }
      if (!bestCamp && pCampNameClean) {
        bestCamp = globalCampaignsList.find(
          (c) => c.cleanName && (c.cleanName.includes(pCampNameClean) || pCampNameClean.includes(c.cleanName))
        );
      }
      if (bestCamp) {
        campaignIcAttribution.set(bestCamp.id, (campaignIcAttribution.get(bestCamp.id) || 0) + 1);
        accountIcAttribution.set(bestCamp.accId, (accountIcAttribution.get(bestCamp.accId) || 0) + 1);
      }

      let bestAdset = globalAdsetsList.find((as) => ic.adsetId && as.id === ic.adsetId);
      if (!bestAdset && pAdsetNameClean) {
        bestAdset = globalAdsetsList.find((as) => as.cleanName === pAdsetNameClean);
      }
      if (!bestAdset && pAdsetNameClean) {
        bestAdset = globalAdsetsList.find(
          (as) => as.cleanName && (as.cleanName.includes(pAdsetNameClean) || pAdsetNameClean.includes(as.cleanName))
        );
      }
      if (bestAdset) {
        adsetIcAttribution.set(bestAdset.id, (adsetIcAttribution.get(bestAdset.id) || 0) + 1);
      }

      let bestAd = globalAdsList.find((ad) => ic.adId && ad.id === ic.adId);
      if (!bestAd && pAdNameClean) {
        bestAd = globalAdsList.find((ad) => ad.cleanName === pAdNameClean);
      }
      if (!bestAd && pAdNameClean) {
        bestAd = globalAdsList.find(
          (ad) => ad.cleanName && (ad.cleanName.includes(pAdNameClean) || pAdNameClean.includes(ad.cleanName))
        );
      }
      if (bestAd) {
        adIcAttribution.set(bestAd.id, (adIcAttribution.get(bestAd.id) || 0) + 1);
      }
    });

    const extractMetaIc = (actions: any[]): number => {
      if (!Array.isArray(actions)) return 0;
      const act = actions.find((a: any) =>
        a.action_type === "initiate_checkout" ||
        a.action_type === "omni_initiated_checkout" ||
        a.action_type === "offsite_conversion.fb_pixel_initiate_checkout"
      );
      return act ? Number(act.value || 0) : 0;
    };

    // 7. Montagem das respostas estruturadas com métricas completas
    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];
    const allAdsets: any[] = [];
    const allAds: any[] = [];

    accountRawResults.forEach((acc) => {
      const {
        accId,
        accData,
        rawAcc,
        currency,
        rawCampaigns,
        rawAdsets,
        rawAds,
        campaignInsightsMap,
        adsetInsightsMap,
        adInsightsMap,
        accountInsight,
      } = acc;

      const accName = accData.name || rawAcc.name || `Conta ${accId.replace("act_", "")}`;
      const accStatusCode = accData.account_status;
      const accStatus = accStatusCode === 1 ? "Ativo" : accStatusCode === 2 ? "Desabilitado" : accStatusCode === 3 ? "Não Verificado" : "Pendente";
      const cardDisplay = "N/A";

      const rawBalance = Number(accData.balance || rawAcc.balance || 0) / 100;
      const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

      const rawPeriodSpend = Number(accountInsight?.spend || 0);
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

      const metaAccIc = extractMetaIc(accountInsight?.actions);
      const fpAccIc = accountIcAttribution.get(accId) || 0;
      const accIc = Math.max(metaAccIc, fpAccIc);
      const accCpi = accIc > 0 ? periodSpendBrl / accIc : 0;

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
        ic: accIc,
        cpi: accCpi,
        margin: accMargin,
        roi: accRoi,
        last_update: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      });

      // Processa Campanhas
      rawCampaigns.forEach((camp: any) => {
        const cIns = campaignInsightsMap.get(camp.id) || {};
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

        const metaCampIc = extractMetaIc(cIns.actions);
        const fpCampIc = campaignIcAttribution.get(camp.id) || 0;
        const cIc = Math.max(metaCampIc, fpCampIc);
        const cCpi = cIc > 0 ? cSpend / cIc : 0;

        // Identifica se a campanha é CBO (Advantage) ou ABO
        const matchingAdsets = rawAdsets.filter((s: any) => s.campaign_id === camp.id);
        const isCBO = Boolean(camp.daily_budget || camp.lifetime_budget);
        
        let rawBudget = 0;
        if (isCBO) {
          rawBudget = camp.daily_budget ? Number(camp.daily_budget) / 100 : Number(camp.lifetime_budget || 0) / 100;
        } else {
          // Em campanhas ABO, soma o orçamento de todos os conjuntos ativos daquela campanha
          rawBudget = matchingAdsets.reduce((sum: number, s: any) => {
            const b = s.daily_budget ? Number(s.daily_budget) / 100 : Number(s.lifetime_budget || 0) / 100;
            return sum + b;
          }, 0);
        }

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
          budget_type: isCBO ? (camp.daily_budget ? "CBO" : "CBO (Vitalício)") : "ABO",
          is_cbo: isCBO,
          adset_count: matchingAdsets.length,
          spend: cSpend,
          revenue: cNetRevenue,
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

      // Processa AdSets
      rawAdsets.forEach((as: any) => {
        const asIns = adsetInsightsMap.get(as.id) || {};
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

        const asIsCBO = !as.daily_budget && !as.lifetime_budget;
        const asRawBudget = as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100;
        const asConvertedBudget = convertToBrl(asRawBudget, currency, usdBrlRate);
        const asIsActive = as.effective_status === "ACTIVE" || (as.effective_status === undefined && as.status === "ACTIVE");

        const metaAdsetIc = extractMetaIc(asIns.actions);
        const fpAdsetIc = adsetIcAttribution.get(as.id) || 0;
        const asIc = Math.max(metaAdsetIc, fpAdsetIc);
        const asCpi = asIc > 0 ? asSpend / asIc : 0;

        allAdsets.push({
          id: as.id,
          name: as.name,
          campaign_id: as.campaign_id,
          campaign_name: rawCampaigns.find((c: any) => c.id === as.campaign_id)?.name || as.campaign_id,
          account_id: accId,
          account_name: accName,
          status: asIsActive ? "active" : "paused",
          effective_status: as.effective_status || as.status,
          budget: asConvertedBudget,
          budget_type: asIsCBO ? "CBO" : (as.daily_budget ? "Diário" : "Vitalício"),
          is_cbo: asIsCBO,
          spend: asSpend,
          revenue: asNetRevenue,
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

      // Processa Ads
      rawAds.forEach((ad: any) => {
        const adIns = adInsightsMap.get(ad.id) || {};
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

        const metaAdIc = extractMetaIc(adIns.actions);
        const fpAdIc = adIcAttribution.get(ad.id) || 0;
        const aIc = Math.max(metaAdIc, fpAdIc);
        const aCpi = aIc > 0 ? adSpend / aIc : 0;

        allAds.push({
          id: ad.id,
          name: ad.name,
          adset_id: ad.adset_id,
          adset_name: rawAdsets.find((s: any) => s.id === ad.adset_id)?.name || ad.adset_id,
          campaign_id: ad.campaign_id,
          campaign_name: rawCampaigns.find((c: any) => c.id === ad.campaign_id)?.name || ad.campaign_id,
          account_id: accId,
          account_name: accName,
          status: adIsActive ? "active" : "paused",
          effective_status: ad.effective_status || ad.status,
          budget: 0,
          budget_type: "AdSet/Campanha",
          spend: adSpend,
          revenue: adNetRevenue,
          profit: adProfit,
          roas: adRoas,
          sales: adSales,
          cpa: adCpa,
          ic: aIc,
          cpi: aCpi,
          margin: adMargin,
          roi: adRoi,
          last_update: ad.updated_time ? new Date(ad.updated_time).toLocaleString("pt-BR") : "Hoje",
        });
      });
    });

    const untrackedSalesCount = Math.max(parsedPurchases.length - matchedPurchaseIds.size, 0);

    // Ordenação estrita: Ativas > Com Lucro (maior lucro) > Desativadas
    const sortByActiveProfit = (a: any, b: any) => {
      const aActive = a.status === "active" || a.status === "Ativo" ? 1 : 0;
      const bActive = b.status === "active" || b.status === "Ativo" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aProfit = Number(a.profit || 0);
      const bProfit = Number(b.profit || 0);
      if (bProfit !== aProfit) return bProfit - aProfit;
      return Number(b.spend || 0) - Number(a.spend || 0);
    };

    formattedAccounts.sort(sortByActiveProfit);
    allCampaigns.sort(sortByActiveProfit);
    allAdsets.sort(sortByActiveProfit);
    allAds.sort(sortByActiveProfit);

    // Se nenhuma conta retornou dados e houve erros, expõe o aviso para a UI sem derrubar a tela
    if (formattedAccounts.length === 0 && accountErrors.length > 0) {
      return NextResponse.json({
        ok: true,
        usdBrlRate,
        untracked_sales_count: untrackedSalesCount,
        account_errors: accountErrors,
        warning: `Falha ao acessar as contas selecionadas (${accountErrors[0].error}). Verifique se o token possui acesso concedido a essas contas no Facebook Business Manager ou selecione outras contas em Integrações.`,
        accounts: [],
        campaigns: [],
        adsets: [],
        ads: [],
      });
    }

    const finalResponse = {
      ok: true,
      usdBrlRate,
      untracked_sales_count: untrackedSalesCount,
      account_errors: accountErrors,
      accounts: formattedAccounts,
      campaigns: allCampaigns,
      adsets: allAdsets,
      ads: allAds,
    };

    MEMORY_CACHE.set(cacheKey, { timestamp: nowMs, data: finalResponse });
    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error("[Campaigns List Multi-Tier API Error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message, accounts: [], campaigns: [], adsets: [], ads: [] },
      { status: 500 }
    );
  }
}
