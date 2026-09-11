import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";
import { resolveAccountDateRange, AccountDateRange } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

// Cache em memória para evitar Rate Limit da Meta (code 17) por polling frequente
interface CacheEntry {
  timestamp: number;
  data: any;
  datePreset?: string;
  timezoneName?: string;
}
const MEMORY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60000; // 60 segundos (carregamento ultra-rápido < 50ms)

export function clearCampaignsMemoryCache(storeId?: string) {
  if (!storeId) {
    MEMORY_CACHE.clear();
    return;
  }
  for (const key of Array.from(MEMORY_CACHE.keys())) {
    if (key.startsWith(`${storeId}_`)) {
      MEMORY_CACHE.delete(key);
    }
  }
}

/**
 * Retorna o snapshot operacional recente de uma entidade Meta (Campanha ou AdSet)
 * a partir do cache em memória com mesma timezone, janela temporal e atribuição.
 */
export function getCachedEntityMetrics(storeId: string, entityId: string, level: "campaign" | "adset") {
  for (const [key, entry] of MEMORY_CACHE.entries()) {
    if (key.startsWith(`${storeId}_`)) {
      const items = level === "campaign" ? entry.data?.campaigns : entry.data?.adsets;
      const found = items?.find((item: any) => item.id === entityId);
      if (found) {
        const acc = entry.data?.accounts?.find((a: any) => a.id === found.account_id);
        return {
          name: found.name || "",
          budget: Number(found.budget || 0),
          sales: Number(found.sales || 0),
          revenue: Number(found.revenue || 0),
          spend: Number(found.spend || 0),
          profit: Number(found.profit || 0),
          roas: Number(found.roas || 0),
          cpa: Number(found.cpa || 0),
          date_preset: entry.datePreset || "today",
          timezone: acc?.timezone_name || entry.timezoneName || "America/Sao_Paulo",
          snapshot_source: "cache" as const,
        };
      }
    }
  }
  return null;
}

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

const extractMetaIc = (actions: any[]): number => {
  if (!Array.isArray(actions)) return 0;
  const act = actions.find(
    (a: any) =>
      a.action_type === "initiate_checkout" ||
      a.action_type === "omni_initiated_checkout" ||
      a.action_type === "offsite_conversion.fb_pixel_initiate_checkout"
  );
  return act ? Number(act.value || 0) : 0;
};

/**
 * GET /api/v1/meta/campaigns/list
 * Suporta Lazy Loading:
 * - Sem parâmetros: Retorna Accounts e Campaigns com adsets: [] e ads: [] (lazy_loading: true).
 * - campaign_id=X: Retorna somente os AdSets daquela campanha com métricas completas e histórico.
 * - adset_id=X: Retorna somente os Ads daquele adset com métricas completas.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("date_preset") || "today";
    const isRefresh = searchParams.get("refresh") === "true";

    const storeId = searchParams.get("store_id");
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const isObservabilityEnabled = process.env.META_OBSERVABILITY_ENABLED === "true";
    const isLazyObsEnabled = process.env.META_LAZY_OBSERVABILITY_ENABLED === "true" || isObservabilityEnabled;
    const obsStartTime = Date.now();
    let obsPagesFetched = 0;
    let obsRetriesCode17 = 0;

    const logLazyObservability = (
      mode: "initial" | "campaign" | "adset",
      entityId: string | null,
      durationMs: number,
      itemsLoaded: number,
      success: boolean,
      errorType: string | null = null
    ) => {
      if (!isLazyObsEnabled) return;
      console.log(
        JSON.stringify({
          event: "meta_lazy_load",
          mode,
          entity_id: entityId,
          duration_ms: durationMs,
          items_loaded: itemsLoaded,
          success,
          error_type: errorType,
        })
      );
    };

    const requestedCampaignId = searchParams.get("campaign_id");
    const requestedAdsetId = searchParams.get("adset_id");
    const requestedAccountId = searchParams.get("account_id");

    // Cache isolado por entidade conforme regra do usuário:
    // store_date_campaign_ID / store_date_adset_ID / store_date_account_all
    const cacheKey = requestedCampaignId
      ? `${storeId}_${datePreset}_campaign_${requestedCampaignId}`
      : requestedAdsetId
      ? `${storeId}_${datePreset}_adset_${requestedAdsetId}`
      : `${storeId}_${datePreset}_${requestedAccountId || "all"}`;

    const nowMs = Date.now();
    if (isRefresh) {
      clearCampaignsMemoryCache(storeId);
    }
    const cached = MEMORY_CACHE.get(cacheKey);
    if (!isRefresh && cached && nowMs - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      });
    }

    const supabase = createAdminClient();

    // 1. Executa consultas base no banco em paralelo
    const [storeIntResult, usdBrlRate, storeTaxesResult] = await Promise.all([
      supabase
        .from("integrations")
        .select("*")
        .eq("store_id", storeId)
        .eq("platform", "meta")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getUsdBrlRate(),
      supabase.from("taxes_and_duties").select("*").eq("store_id", storeId),
    ]);

    const storeInt = storeIntResult.data;
    const storeTaxesAndDuties = storeTaxesResult.data || [];

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

    const token =
      resolveMetaAccessToken(integration?.access_token_enc) ||
      resolveMetaAccessToken(process.env.META_ACCESS_TOKEN) ||
      "";

    if (!token) {
      return NextResponse.json({
        ok: false,
        error: "Token da Meta não configurado. Acesse Integrações e conecte sua conta do Facebook.",
        accounts: [],
        campaigns: [],
        adsets: [],
        ads: [],
      });
    }

    // Funções utilitárias resilientes para chamadas Meta Graph API
    const fetchWithResilience = async (url: string, label: string, timeoutMs = 12000) => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) {
          const errSnippet = await res.text().catch(() => "");
          console.warn(`[Meta API Error] ${label} status ${res.status}: ${errSnippet.slice(0, 200)}`);
        }
        return res;
      } catch (err: any) {
        console.warn(`[Meta API Network/Timeout Error] ${label}: ${err?.message || err}`);
        return null;
      }
    };

    const fetchMetaPaged = async (
      initialUrl: string,
      label: string,
      maxPages = 25,
      maxItems = 10000,
      timeoutMs = 12000
    ): Promise<{ data: any[]; hasFailure: boolean; error?: string }> => {
      let allData: any[] = [];
      let currentUrl: string | null = initialUrl;
      let page = 0;
      let hasFailure = false;
      let lastError: string | undefined;

      while (currentUrl && page < maxPages && allData.length < maxItems) {
        page++;
        obsPagesFetched++;
        const targetUrl: string = currentUrl;
        let attempts = 0;
        const maxAttempts = 2; // Tentativa inicial + no máximo 1 retry controlado
        let success = false;

        while (attempts < maxAttempts && !success) {
          attempts++;
          try {
            const res: Response = await fetch(targetUrl, {
              cache: "no-store",
              signal: AbortSignal.timeout(timeoutMs),
            });

            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              let isCode17 = res.status === 429;
              let parsedErrorMsg = `Status ${res.status}: ${errText.slice(0, 150)}`;

              try {
                const errJson = JSON.parse(errText);
                if (
                  errJson.error?.code === 17 ||
                  errJson.error?.type === "OAuthException" ||
                  errJson.error?.is_transient === true
                ) {
                  isCode17 = true;
                  parsedErrorMsg = errJson.error.message || parsedErrorMsg;
                }
              } catch {}

              if (isCode17 && attempts < maxAttempts) {
                obsRetriesCode17++;
                const backoffMs = 6000;
                console.warn(
                  `[Meta API Code 17] ${label} pág ${page}. Backoff controlado de ${backoffMs}ms antes da retentativa...`
                );
                await new Promise((r) => setTimeout(r, backoffMs));
                continue;
              }

              hasFailure = true;
              lastError = parsedErrorMsg;
              console.warn(`[Meta API Error] ${label} page ${page}: ${lastError}`);
              break;
            }

            const json: any = await res.json();
            if (json.error) {
              const isCode17 =
                json.error.code === 17 ||
                json.error.type === "OAuthException" ||
                json.error.is_transient === true;

              if (isCode17 && attempts < maxAttempts) {
                obsRetriesCode17++;
                const backoffMs = 6000;
                console.warn(
                  `[Meta API Code 17] ${label} pág ${page}. Backoff de ${backoffMs}ms antes da retentativa...`
                );
                await new Promise((r) => setTimeout(r, backoffMs));
                continue;
              }

              hasFailure = true;
              lastError = json.error.message || "Erro na Meta API";
              console.warn(`[Meta API Error] ${label} page ${page}: ${lastError}`);
              break;
            }

            if (Array.isArray(json.data)) {
              allData.push(...json.data);
            }

            if (json.paging?.next && json.data?.length > 0) {
              currentUrl = json.paging.next;
              await new Promise((r) => setTimeout(r, 100)); // micro pausa de 100ms
            } else {
              currentUrl = null;
            }
            success = true;
          } catch (err: any) {
            if (attempts < maxAttempts) {
              const backoffMs = 6000;
              console.warn(`[Meta API Timeout] ${label} tentativa ${attempts}/${maxAttempts}. Aguardando ${backoffMs}ms...`);
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            hasFailure = true;
            lastError = err?.message || String(err);
            console.warn(`[Meta API Timeout Error] ${label} page ${page}: ${lastError}`);
            break;
          }
        }

        if (!success) {
          break;
        }
      }

      return { data: allData, hasFailure, error: lastError };
    };

    // Parser universal de eventos de conversão e taxas
    const parseDbEvents = (events: any[]) => {
      const parsedPurchases: ParsedEvent[] = [];
      const parsedICs: ParsedEvent[] = [];

      (events || []).forEach((ev) => {
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

        const isCard =
          method.includes("card") ||
          method.includes("cartao") ||
          method.includes("credit") ||
          method.includes("visa") ||
          method.includes("master");
        const isPix = method.includes("pix") || method === "";
        const isBoleto = method.includes("boleto");

        const val = Number(customData.value || orderDetails.value || 0);
        let fee = 0;
        if (val > 0 && isPurchase) {
          const hasCustomRules = (storeTaxesAndDuties || []).length > 0;
          if (hasCustomRules) {
            (storeTaxesAndDuties || [])
              .filter((t: any) => t.type === "tax")
              .forEach((t: any) => {
                fee += val * (Number(t.value || 0) / 100);
              });
            (storeTaxesAndDuties || [])
              .filter((t: any) => t.type === "duty")
              .forEach((t: any) => {
                const matchMethod =
                  t.payment_method === "all" ||
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
            fee = isCard ? val * 0.15 : val * 0.099;
          }
        }

        const rawCampaign = String(
          customData.utm_campaign || orderDetails.utm_campaign || tracking.utm_campaign || ""
        ).trim();
        const rawMedium = String(
          customData.utm_medium || orderDetails.utm_medium || tracking.utm_medium || ""
        ).trim();
        const rawContent = String(
          customData.utm_content || orderDetails.utm_content || tracking.utm_content || ""
        ).trim();
        const rawSource = String(
          customData.utm_source || orderDetails.utm_source || tracking.utm_source || ""
        ).trim();

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

      return { parsedPurchases, parsedICs };
    };

    // =========================================================================
    // CASO 1: CARREGAMENTO SOB DEMANDA DE ADSETS DE UMA CAMPANHA (campaign_id)
    // =========================================================================
    if (requestedCampaignId) {
      let campMeta: any = null;
      try {
        const campMetaRes = await fetchWithResilience(
          `https://graph.facebook.com/v23.0/${requestedCampaignId}?fields=id,name,account_id&access_token=${token}`,
          `camp_meta_${requestedCampaignId}`,
          6000
        );
        if (campMetaRes && campMetaRes.ok) {
          campMeta = await campMetaRes.json();
        }
      } catch {}

      const cleanAccId = campMeta?.account_id
        ? campMeta.account_id.startsWith("act_")
          ? campMeta.account_id
          : `act_${campMeta.account_id}`
        : "";

      const tzName =
        (cleanAccId && integration?.config?.ad_accounts_metadata?.[cleanAccId]?.timezone_name) ||
        "America/Sao_Paulo";
      const dateRange = resolveAccountDateRange(datePreset, tzName);
      const timeRangeParam = encodeURIComponent(
        JSON.stringify({ since: dateRange.since, until: dateRange.until })
      );

      // 1. Busca os metadados da campanha, adsets e insights em chamada direta resiliente (isenta de Code 17)
      const fields = "id,name,account_id,adsets.limit(250){id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,campaign_id},insights.level(adset).limit(250){adset_id,spend,impressions,clicks,actions}";
      const nestedUrl = `https://graph.facebook.com/v23.0/${requestedCampaignId}?fields=${fields}&access_token=${token}`;

      const [campNestedRes, dbEventsResult, entityHistoryResult] = await Promise.all([
        fetchWithResilience(nestedUrl, `camp_nested_${requestedCampaignId}`, 10000),
        supabase
          .from("events")
          .select("id, event_name, meta_response, created_at")
          .eq("store_id", storeId)
          .in("event_name", ["Purchase", "InitiateCheckout"])
          .eq("status", "accepted")
          .gte("created_at", dateRange.startUtc)
          .lte("created_at", dateRange.endUtc)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("meta_entity_history")
          .select(
            "entity_id, action, previous_budget, new_budget, sales_at_update, revenue_at_update, spend_at_update, profit_at_update, roas_at_update, cpa_at_update, user_email, created_at, source, metadata"
          )
          .eq("store_id", storeId)
          .eq("action", "budget")
          .order("created_at", { ascending: false }),
      ]);

      let campData: any = null;
      if (campNestedRes && campNestedRes.ok) {
        campData = await campNestedRes.json();
      }

      let rawAdsets: any[] = campData?.adsets?.data || [];
      const asInsData: any[] = campData?.insights?.data || [];

      // Tratamento de Falhas da Meta (Fase 1 e Fase 3)
      if (!campNestedRes || !campNestedRes.ok) {
        const status = campNestedRes?.status || 500;
        const errSnippet = campNestedRes ? await campNestedRes.text().catch(() => "") : "";
        let errorType = "meta_error";
        if (status === 429 || errSnippet.includes("limit") || errSnippet.includes("2446079") || errSnippet.includes("17")) {
          errorType = "rate_limit";
        } else if (status === 408 || status === 504 || errSnippet.includes("timeout")) {
          errorType = "timeout";
        } else if (status === 404) {
          errorType = "not_found";
        }

        logLazyObservability("campaign", requestedCampaignId, Date.now() - obsStartTime, 0, false, errorType);

        if (cached && cached.data?.adsets?.length > 0) {
          console.warn(
            `[Campaigns Lazy] Falha na Meta API (${errorType}) para campanha ${requestedCampaignId}. Preservando cache saudável.`
          );
          return NextResponse.json({
            ...cached.data,
            warning: "Falha temporária ao consultar a Meta Ads. Exibindo dados em cache.",
            error_type: errorType,
          }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
          });
        }

        return NextResponse.json({
          ok: false,
          campaign_id: requestedCampaignId,
          adsets: [],
          ads: [],
          error_type: errorType,
          error_message: "Falha temporária ao consultar Meta Ads para esta campanha.",
        }, { status: 200 });
      }

      const { parsedPurchases, parsedICs } = parseDbEvents(dbEventsResult.data || []);

      const budgetHistoryMap = new Map<string, any>();
      if (Array.isArray(entityHistoryResult.data)) {
        for (const h of entityHistoryResult.data) {
          if (!budgetHistoryMap.has(h.entity_id)) {
            budgetHistoryMap.set(h.entity_id, h);
          }
        }
      }

      const adsetInsightsMap = new Map<string, any>();
      asInsData.forEach((ins: any) => {
        if (ins.adset_id) adsetInsightsMap.set(ins.adset_id, ins);
      });

      // Atribuição de compras nos adsets
      const adsetAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
      const adsetIcAttribution = new Map<string, number>();

      const normalizedAdsets = rawAdsets.map((as: any) => ({
        id: String(as.id || ""),
        name: String(as.name || ""),
        cleanName: String(as.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
      }));

      parsedPurchases.forEach((p) => {
        const pAdsetNameClean = p.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
        let bestAdset = normalizedAdsets.find((as) => p.adsetId && as.id === p.adsetId);
        if (!bestAdset && pAdsetNameClean) {
          bestAdset = normalizedAdsets.find((as) => as.cleanName === pAdsetNameClean);
        }
        if (!bestAdset && pAdsetNameClean) {
          bestAdset = normalizedAdsets.find(
            (as) => as.cleanName && (as.cleanName.includes(pAdsetNameClean) || pAdsetNameClean.includes(as.cleanName))
          );
        }
        if (bestAdset) {
          const prev = adsetAttribution.get(bestAdset.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
          adsetAttribution.set(bestAdset.id, {
            grossRevenue: prev.grossRevenue + p.val,
            netRevenue: prev.netRevenue + (p.val - p.fee),
            count: prev.count + 1,
          });
        }
      });

      parsedICs.forEach((ic) => {
        const pAdsetNameClean = ic.adsetName.toLowerCase().replace(/[^a-z0-9]/g, "");
        let bestAdset = normalizedAdsets.find((as) => ic.adsetId && as.id === ic.adsetId);
        if (!bestAdset && pAdsetNameClean) {
          bestAdset = normalizedAdsets.find((as) => as.cleanName === pAdsetNameClean);
        }
        if (!bestAdset && pAdsetNameClean) {
          bestAdset = normalizedAdsets.find(
            (as) => as.cleanName && (as.cleanName.includes(pAdsetNameClean) || pAdsetNameClean.includes(as.cleanName))
          );
        }
        if (bestAdset) {
          adsetIcAttribution.set(bestAdset.id, (adsetIcAttribution.get(bestAdset.id) || 0) + 1);
        }
      });

      const currency = "BRL";
      const campName = campMeta?.name || requestedCampaignId;

      const allAdsets = rawAdsets.map((as: any) => {
        const asIns = adsetInsightsMap.get(as.id) || {};
        const asRawSpend = Number(asIns.spend || 0);
        const asSpend = convertToBrl(asRawSpend, currency, usdBrlRate);

        const asAttr = adsetAttribution.get(as.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const asGrossRevenue = asAttr.grossRevenue;
        const asNetRevenue = asAttr.netRevenue;
        const asSales = asAttr.count;
        const asProfit = asNetRevenue - asSpend;
        const asRoas = asSpend > 0 ? asGrossRevenue / asSpend : asGrossRevenue > 0 ? 99.9 : 0;
        const asCpa = asSales > 0 ? asSpend / asSales : 0;
        const asMargin = asNetRevenue > 0 ? (asProfit / asNetRevenue) * 100 : asSpend > 0 ? -100 : 0;
        const asRoi = asSpend > 0 ? asProfit / asSpend : 0;

        const asIsCBO = !as.daily_budget && !as.lifetime_budget;
        const asRawBudget = as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100;
        const asConvertedBudget = convertToBrl(asRawBudget, currency, usdBrlRate);
        const asIsActive =
          as.effective_status === "ACTIVE" || (as.effective_status === undefined && as.status === "ACTIVE");

        const metaAdsetIc = extractMetaIc(asIns.actions);
        const fpAdsetIc = adsetIcAttribution.get(as.id) || 0;
        const asIc = Math.max(metaAdsetIc, fpAdsetIc);
        const asCpi = asIc > 0 ? asSpend / asIc : 0;

        const asHist = budgetHistoryMap.get(as.id);

        return {
          id: as.id,
          name: as.name,
          campaign_id: as.campaign_id || requestedCampaignId,
          campaign_name: campName,
          account_id: cleanAccId,
          account_name: `Conta ${cleanAccId.replace("act_", "")}`,
          status: asIsActive ? "active" : "paused",
          effective_status: as.effective_status || as.status,
          budget: asConvertedBudget,
          budget_type: asIsCBO ? "CBO" : as.daily_budget ? "Diário" : "Vitalício",
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
          budget_history: asHist
            ? {
                previous_budget: asHist.previous_budget !== null ? Number(asHist.previous_budget) : null,
                new_budget: asHist.new_budget !== null ? Number(asHist.new_budget) : null,
                sales: asHist.sales_at_update,
                revenue: asHist.revenue_at_update !== null ? Number(asHist.revenue_at_update) : null,
                spend: asHist.spend_at_update !== null ? Number(asHist.spend_at_update) : null,
                profit: asHist.profit_at_update !== null ? Number(asHist.profit_at_update) : null,
                roas: asHist.roas_at_update !== null ? Number(asHist.roas_at_update) : null,
                cpa: asHist.cpa_at_update !== null ? Number(asHist.cpa_at_update) : null,
                user_email: asHist.user_email,
                source: asHist.source,
                metadata: asHist.metadata,
                updated_at: asHist.created_at,
              }
            : null,
        };
      });

      // Ordena por Ativos > Lucro > Spend
      allAdsets.sort((a, b) => {
        const aActive = a.status === "active" ? 1 : 0;
        const bActive = b.status === "active" ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aProfit = Number(a.profit || 0);
        const bProfit = Number(b.profit || 0);
        if (bProfit !== aProfit) return bProfit - aProfit;
        return Number(b.spend || 0) - Number(a.spend || 0);
      });

      logLazyObservability("campaign", requestedCampaignId, Date.now() - obsStartTime, allAdsets.length, true, null);

      const responsePayload = {
        ok: true,
        mode: "campaign",
        campaign_id: requestedCampaignId,
        adsets: allAdsets,
        ads: [],
        error_type: null,
      };

      if (allAdsets.length > 0) {
        MEMORY_CACHE.set(cacheKey, {
          timestamp: nowMs,
          data: responsePayload,
          datePreset,
          timezoneName: tzName,
        });
      }

      const responseHeaders: Record<string, string> = isRefresh
        ? { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
        : { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" };

      return NextResponse.json(responsePayload, {
        headers: responseHeaders,
      });
    }

    // =========================================================================
    // CASO 2: CARREGAMENTO SOB DEMANDA DE ANÚNCIOS DE UM ADSET (adset_id)
    // =========================================================================
    if (requestedAdsetId) {
      let adsetMeta: any = null;
      try {
        const adsetMetaRes = await fetchWithResilience(
          `https://graph.facebook.com/v23.0/${requestedAdsetId}?fields=id,name,campaign_id,account_id&access_token=${token}`,
          `adset_meta_${requestedAdsetId}`,
          6000
        );
        if (adsetMetaRes && adsetMetaRes.ok) {
          adsetMeta = await adsetMetaRes.json();
        }
      } catch {}

      const cleanAccId = adsetMeta?.account_id
        ? adsetMeta.account_id.startsWith("act_")
          ? adsetMeta.account_id
          : `act_${adsetMeta.account_id}`
        : "";

      const tzName =
        (cleanAccId && integration?.config?.ad_accounts_metadata?.[cleanAccId]?.timezone_name) ||
        "America/Sao_Paulo";
      const dateRange = resolveAccountDateRange(datePreset, tzName);
      const timeRangeParam = encodeURIComponent(
        JSON.stringify({ since: dateRange.since, until: dateRange.until })
      );

      // 1. Busca os metadados do adset, anúncios e insights em chamada direta resiliente (isenta de Code 17)
      const fields = "id,name,campaign_id,account_id,ads.limit(250){id,name,status,effective_status,updated_time,adset_id,campaign_id},insights.level(ad).limit(250){ad_id,spend,impressions,clicks,actions}";
      const nestedUrl = `https://graph.facebook.com/v23.0/${requestedAdsetId}?fields=${fields}&access_token=${token}`;

      const [adsetNestedRes, dbEventsResult] = await Promise.all([
        fetchWithResilience(nestedUrl, `adset_nested_${requestedAdsetId}`, 10000),
        supabase
          .from("events")
          .select("id, event_name, meta_response, created_at")
          .eq("store_id", storeId)
          .in("event_name", ["Purchase", "InitiateCheckout"])
          .eq("status", "accepted")
          .gte("created_at", dateRange.startUtc)
          .lte("created_at", dateRange.endUtc)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      let adsetData: any = null;
      if (adsetNestedRes && adsetNestedRes.ok) {
        adsetData = await adsetNestedRes.json();
      }

      let rawAds: any[] = adsetData?.ads?.data || [];
      const aInsData: any[] = adsetData?.insights?.data || [];

      // Tratamento de Falhas da Meta (Fase 1 e Fase 3)
      if (!adsetNestedRes || !adsetNestedRes.ok) {
        const status = adsetNestedRes?.status || 500;
        const errSnippet = adsetNestedRes ? await adsetNestedRes.text().catch(() => "") : "";
        let errorType = "meta_error";
        if (status === 429 || errSnippet.includes("limit") || errSnippet.includes("2446079") || errSnippet.includes("17")) {
          errorType = "rate_limit";
        } else if (status === 408 || status === 504 || errSnippet.includes("timeout")) {
          errorType = "timeout";
        } else if (status === 404) {
          errorType = "not_found";
        }

        logLazyObservability("adset", requestedAdsetId, Date.now() - obsStartTime, 0, false, errorType);

        if (cached && cached.data?.ads?.length > 0) {
          console.warn(
            `[Campaigns Lazy] Falha na Meta API (${errorType}) para adset ${requestedAdsetId}. Preservando cache saudável.`
          );
          return NextResponse.json({
            ...cached.data,
            warning: "Falha temporária ao consultar a Meta Ads. Exibindo dados em cache.",
            error_type: errorType,
          }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
          });
        }

        return NextResponse.json({
          ok: false,
          adset_id: requestedAdsetId,
          adsets: [],
          ads: [],
          error_type: errorType,
          error_message: "Falha temporária ao consultar Meta Ads para este conjunto de anúncios.",
        }, { status: 200 });
      }

      const { parsedPurchases, parsedICs } = parseDbEvents(dbEventsResult.data || []);

      const adInsightsMap = new Map<string, any>();
      aInsData.forEach((ins: any) => {
        if (ins.ad_id) adInsightsMap.set(ins.ad_id, ins);
      });

      const adAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
      const adIcAttribution = new Map<string, number>();

      const normalizedAds = rawAds.map((ad: any) => ({
        id: String(ad.id || ""),
        name: String(ad.name || ""),
        cleanName: String(ad.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
      }));

      parsedPurchases.forEach((p) => {
        const pAdNameClean = p.adName.toLowerCase().replace(/[^a-z0-9]/g, "");
        let bestAd = normalizedAds.find((ad) => p.adId && ad.id === p.adId);
        if (!bestAd && pAdNameClean) {
          bestAd = normalizedAds.find((ad) => ad.cleanName === pAdNameClean);
        }
        if (!bestAd && pAdNameClean) {
          bestAd = normalizedAds.find(
            (ad) => ad.cleanName && (ad.cleanName.includes(pAdNameClean) || pAdNameClean.includes(ad.cleanName))
          );
        }
        if (bestAd) {
          const prev = adAttribution.get(bestAd.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
          adAttribution.set(bestAd.id, {
            grossRevenue: prev.grossRevenue + p.val,
            netRevenue: prev.netRevenue + (p.val - p.fee),
            count: prev.count + 1,
          });
        }
      });

      parsedICs.forEach((ic) => {
        const pAdNameClean = ic.adName.toLowerCase().replace(/[^a-z0-9]/g, "");
        let bestAd = normalizedAds.find((ad) => ic.adId && ad.id === ic.adId);
        if (!bestAd && pAdNameClean) {
          bestAd = normalizedAds.find((ad) => ad.cleanName === pAdNameClean);
        }
        if (!bestAd && pAdNameClean) {
          bestAd = normalizedAds.find(
            (ad) => ad.cleanName && (ad.cleanName.includes(pAdNameClean) || pAdNameClean.includes(ad.cleanName))
          );
        }
        if (bestAd) {
          adIcAttribution.set(bestAd.id, (adIcAttribution.get(bestAd.id) || 0) + 1);
        }
      });

      const currency = "BRL";
      const adsetName = adsetMeta?.name || requestedAdsetId;
      const campaignId = adsetMeta?.campaign_id || "";

      const allAds = rawAds.map((ad: any) => {
        const adIns = adInsightsMap.get(ad.id) || {};
        const adRawSpend = Number(adIns.spend || 0);
        const adSpend = convertToBrl(adRawSpend, currency, usdBrlRate);

        const adAttr = adAttribution.get(ad.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const adGrossRevenue = adAttr.grossRevenue;
        const adNetRevenue = adAttr.netRevenue;
        const adSales = adAttr.count;
        const adProfit = adNetRevenue - adSpend;
        const adRoas = adSpend > 0 ? adGrossRevenue / adSpend : adGrossRevenue > 0 ? 99.9 : 0;
        const adCpa = adSales > 0 ? adSpend / adSales : 0;
        const adMargin = adNetRevenue > 0 ? (adProfit / adNetRevenue) * 100 : adSpend > 0 ? -100 : 0;
        const adRoi = adSpend > 0 ? adProfit / adSpend : 0;

        const adIsActive =
          ad.effective_status === "ACTIVE" || (ad.effective_status === undefined && ad.status === "ACTIVE");

        const metaAdIc = extractMetaIc(adIns.actions);
        const fpAdIc = adIcAttribution.get(ad.id) || 0;
        const aIc = Math.max(metaAdIc, fpAdIc);
        const aCpi = aIc > 0 ? adSpend / aIc : 0;

        return {
          id: ad.id,
          name: ad.name,
          adset_id: ad.adset_id || requestedAdsetId,
          adset_name: adsetName,
          campaign_id: ad.campaign_id || campaignId,
          campaign_name: `Campanha ${campaignId}`,
          account_id: cleanAccId,
          account_name: `Conta ${cleanAccId.replace("act_", "")}`,
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
        };
      });

      // Ordena por Ativos > Lucro > Spend
      allAds.sort((a, b) => {
        const aActive = a.status === "active" ? 1 : 0;
        const bActive = b.status === "active" ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aProfit = Number(a.profit || 0);
        const bProfit = Number(b.profit || 0);
        if (bProfit !== aProfit) return bProfit - aProfit;
        return Number(b.spend || 0) - Number(a.spend || 0);
      });

      logLazyObservability("adset", requestedAdsetId, Date.now() - obsStartTime, allAds.length, true, null);

      const responsePayload = {
        ok: true,
        mode: "adset",
        adset_id: requestedAdsetId,
        adsets: [],
        ads: allAds,
        error_type: null,
      };

      if (allAds.length > 0) {
        MEMORY_CACHE.set(cacheKey, {
          timestamp: nowMs,
          data: responsePayload,
          datePreset,
          timezoneName: tzName,
        });
      }

      const responseHeaders: Record<string, string> = isRefresh
        ? { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
        : { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" };

      return NextResponse.json(responsePayload, {
        headers: responseHeaders,
      });
    }

    // =========================================================================
    // CASO 3: CARREGAMENTO INICIAL LEVE (Apenas Contas + Campanhas)
    // =========================================================================
    const configuredAccountIds: string[] = integration?.config?.ad_account_ids || [];

    let accountIdsToProcess: string[] = [];
    if (requestedAccountId) {
      accountIdsToProcess = [
        requestedAccountId.startsWith("act_") ? requestedAccountId : `act_${requestedAccountId}`,
      ];
    } else if (configuredAccountIds.length > 0) {
      accountIdsToProcess = configuredAccountIds
        .map((id: string) => (id.startsWith("act_") ? id : `act_${id}`))
        .slice(0, 10);
    }

    let metaAccountsRaw: any[] = [];
    if (accountIdsToProcess.length === 0) {
      try {
        const accRes = await fetch(
          `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,account_id,name,currency,account_status,balance,amount_spent&access_token=${token}&limit=100`,
          { cache: "no-store", signal: AbortSignal.timeout(5000) }
        );
        if (accRes.ok) {
          const accData = await accRes.json();
          if (Array.isArray(accData.data)) {
            metaAccountsRaw = accData.data;
          }
        }
      } catch (e) {
        console.error("[Campaigns] /me/adaccounts fetch error:", e);
      }

      if (metaAccountsRaw.length === 0) {
        try {
          const bmRes = await fetch(
            `https://graph.facebook.com/v23.0/me/businesses?fields=id,name&access_token=${token}&limit=20`,
            { cache: "no-store", signal: AbortSignal.timeout(5000) }
          );
          if (bmRes.ok) {
            const bmData = await bmRes.json();
            if (Array.isArray(bmData.data)) {
              for (const bm of bmData.data.slice(0, 3)) {
                try {
                  const ownedRes = await fetch(
                    `https://graph.facebook.com/v23.0/${bm.id}/owned_ad_accounts?fields=id,account_id,name,currency,account_status,balance,amount_spent&access_token=${token}&limit=50`,
                    { cache: "no-store", signal: AbortSignal.timeout(4000) }
                  );
                  if (ownedRes.ok) {
                    const owned = await ownedRes.json();
                    if (Array.isArray(owned.data)) {
                      metaAccountsRaw.push(...owned.data);
                    }
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      const sortedBySpend = [...metaAccountsRaw].sort(
        (a, b) => Number(b.amount_spent || 0) - Number(a.amount_spent || 0)
      );
      accountIdsToProcess = sortedBySpend.slice(0, 3).map((a: any) => a.id);
    }

    if (accountIdsToProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        lazy_loading: true,
        usdBrlRate,
        untracked_sales_count: 0,
        account_errors: [],
        notice:
          "Nenhuma conta de anúncio selecionada para esta loja. Acesse Configurações -> Integrações e selecione as contas desejadas.",
        accounts: [],
        campaigns: [],
        adsets: [],
        ads: [],
      });
    }

    const accountsMeta = await Promise.all(
      accountIdsToProcess.map(async (accId) => {
        const cleanAccId = accId.startsWith("act_") ? accId : `act_${accId}`;
        const rawAcc = metaAccountsRaw.find((a: any) => a.id === cleanAccId || a.id === accId) || {};
        let tzName =
          integration?.config?.ad_accounts_metadata?.[cleanAccId]?.timezone_name ||
          rawAcc.timezone_name ||
          null;
        let accData: any = null;

        try {
          const accRes = await fetch(
            `https://graph.facebook.com/v23.0/${cleanAccId}?fields=id,account_id,name,account_status,balance,amount_spent,currency,timezone_name,timezone_offset_hours_utc&access_token=${token}`,
            { cache: "no-store", signal: AbortSignal.timeout(6000) }
          );
          if (accRes.ok) {
            const data = await accRes.json();
            if (!data.error) {
              accData = data;
              if (data.timezone_name) tzName = data.timezone_name;
            }
          }
        } catch (e) {
          console.warn(`[Campaigns] Erro ao buscar metadados da conta ${cleanAccId}:`, e);
        }

        if (!accData) {
          accData = {
            name: rawAcc.name || `Conta ${cleanAccId.replace("act_", "")}`,
            account_status: rawAcc.account_status || 1,
            balance: rawAcc.balance || 0,
            amount_spent: rawAcc.amount_spent || 0,
            currency: rawAcc.currency || "BRL",
          };
        }

        const dateRange = resolveAccountDateRange(datePreset, tzName);

        return {
          cleanAccId,
          rawAcc,
          accData,
          timezoneName: tzName,
          dateRange,
        };
      })
    );

    let queryStartUtc: string;
    let queryEndUtc: string;

    if (accountsMeta.length > 0) {
      queryStartUtc = accountsMeta.reduce(
        (min, a) => (a.dateRange.startUtc < min ? a.dateRange.startUtc : min),
        accountsMeta[0].dateRange.startUtc
      );
      queryEndUtc = accountsMeta.reduce(
        (max, a) => (a.dateRange.endUtc > max ? a.dateRange.endUtc : max),
        accountsMeta[0].dateRange.endUtc
      );
    } else {
      const fallbackRange = resolveAccountDateRange(datePreset, "America/Sao_Paulo");
      queryStartUtc = fallbackRange.startUtc;
      queryEndUtc = fallbackRange.endUtc;
    }

    const accountRawResults: Array<{
      accId: string;
      accData: any;
      rawAcc: any;
      currency: string;
      rawCampaigns: any[];
      campaignInsightsMap: Map<string, any>;
      accountInsight: any;
    }> = [];
    const accountErrors: Array<{ id: string; error: string }> = [];

    const dbEventsPromise = supabase
      .from("events")
      .select("id, event_name, meta_response, created_at")
      .eq("store_id", storeId)
      .in("event_name", ["Purchase", "InitiateCheckout"])
      .eq("status", "accepted")
      .gte("created_at", queryStartUtc)
      .lte("created_at", queryEndUtc)
      .order("created_at", { ascending: false })
      .limit(2000);

    const entityHistoryPromise = supabase
      .from("meta_entity_history")
      .select(
        "entity_id, action, previous_budget, new_budget, sales_at_update, revenue_at_update, spend_at_update, profit_at_update, roas_at_update, cpa_at_update, user_email, created_at, source, metadata"
      )
      .eq("store_id", storeId)
      .eq("action", "budget")
      .order("created_at", { ascending: false });

    // Processamento sequencial por conta: apenas Campanhas e Insights de Conta (Sem AdSets e Sem Ads)
    for (const acc of accountsMeta) {
      const { cleanAccId, rawAcc, accData, dateRange } = acc;

      const timeRangeParam = encodeURIComponent(
        JSON.stringify({ since: dateRange.since, until: dateRange.until })
      );

      const allowedCampStatuses = isRefresh
        ? ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"]
        : ["ACTIVE", "PAUSED"];

      const campStatusFilter = encodeURIComponent(
        JSON.stringify([{ field: "effective_status", operator: "IN", value: allowedCampStatuses }])
      );

      const campUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,updated_time&filtering=${campStatusFilter}&access_token=${token}&limit=100`;
      const campInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=campaign&time_range=${timeRangeParam}&fields=campaign_id,spend,impressions,clicks,actions&access_token=${token}&limit=100`;
      const accInsightsUrl = `https://graph.facebook.com/v23.0/${cleanAccId}/insights?level=account&time_range=${timeRangeParam}&fields=spend,impressions,clicks,actions&access_token=${token}`;

      // Busca somente campanhas e seus insights
      const campResult = await fetchMetaPaged(campUrl, `campaigns_${cleanAccId}`, 20, 5000, 12000);
      const cInsResult = await fetchMetaPaged(campInsightsUrl, `campInsights_${cleanAccId}`, 20, 5000, 10000);
      const acInsRes = await fetchWithResilience(accInsightsUrl, `accInsights_${cleanAccId}`, 10000);

      const rawCampaigns: any[] = campResult.data;

      if (campResult.error) {
        accountErrors.push({ id: cleanAccId, error: campResult.error });
      }

      const campaignInsightsMap = new Map<string, any>();
      cInsResult.data.forEach((ins: any) => {
        if (ins.campaign_id) campaignInsightsMap.set(ins.campaign_id, ins);
      });

      let accountInsight: any = {};
      try {
        if (acInsRes && acInsRes.ok) {
          const acInsData = await acInsRes.json();
          accountInsight = acInsData.data?.[0] || {};
        }
      } catch {}

      const resolvedCurrency = String(accData?.currency || rawAcc?.currency || "BRL")
        .trim()
        .toUpperCase();

      accountRawResults.push({
        accId: cleanAccId,
        accData,
        rawAcc,
        currency: resolvedCurrency,
        rawCampaigns,
        campaignInsightsMap,
        accountInsight,
      });
    }

    const [dbEventsResult, entityHistoryResult] = await Promise.all([
      dbEventsPromise,
      entityHistoryPromise,
    ]);

    const { parsedPurchases, parsedICs } = parseDbEvents(dbEventsResult.data || []);

    const budgetHistoryMap = new Map<string, any>();
    if (Array.isArray(entityHistoryResult.data)) {
      for (const h of entityHistoryResult.data) {
        if (!budgetHistoryMap.has(h.entity_id)) {
          budgetHistoryMap.set(h.entity_id, h);
        }
      }
    }

    const globalCampaignsList: Array<{ id: string; name: string; accId: string; cleanName: string }> = [];
    accountRawResults.forEach((acc) => {
      acc.rawCampaigns.forEach((c: any) => {
        globalCampaignsList.push({
          id: String(c.id || ""),
          name: String(c.name || ""),
          accId: acc.accId,
          cleanName: String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        });
      });
    });

    const campaignAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const accountAttribution = new Map<string, { grossRevenue: number; netRevenue: number; count: number }>();
    const matchedPurchaseIds = new Set<string>();

    parsedPurchases.forEach((p) => {
      const pCampNameClean = p.campName.toLowerCase().replace(/[^a-z0-9]/g, "");

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
          count: prev.count + 1,
        });

        const prevAcc = accountAttribution.get(bestCamp.accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        accountAttribution.set(bestCamp.accId, {
          grossRevenue: prevAcc.grossRevenue + p.val,
          netRevenue: prevAcc.netRevenue + (p.val - p.fee),
          count: prevAcc.count + 1,
        });
        matchedPurchaseIds.add(p.id);
      } else {
        accountRawResults.forEach((acc) => {
          const accNameClean = (acc.accData.name || acc.rawAcc.name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          if (
            (accNameClean && pCampNameClean && pCampNameClean.includes(accNameClean)) ||
            (accNameClean && p.rawSource.toLowerCase().includes(accNameClean)) ||
            p.rawSource.includes(acc.accId)
          ) {
            const prevAcc = accountAttribution.get(acc.accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
            accountAttribution.set(acc.accId, {
              grossRevenue: prevAcc.grossRevenue + p.val,
              netRevenue: prevAcc.netRevenue + (p.val - p.fee),
              count: prevAcc.count + 1,
            });
            matchedPurchaseIds.add(p.id);
          }
        });
      }
    });

    const campaignIcAttribution = new Map<string, number>();
    const accountIcAttribution = new Map<string, number>();

    parsedICs.forEach((ic) => {
      const pCampNameClean = ic.campName.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    });

    const formattedAccounts: any[] = [];
    const allCampaigns: any[] = [];

    accountRawResults.forEach((acc) => {
      const {
        accId,
        accData,
        rawAcc,
        currency: accCurrency,
        rawCampaigns,
        campaignInsightsMap,
        accountInsight,
      } = acc;

      const currency = String(accData?.currency || accCurrency || rawAcc?.currency || "BRL")
        .trim()
        .toUpperCase();

      const accName = accData.name || rawAcc.name || `Conta ${accId.replace("act_", "")}`;
      const accStatusCode = accData.account_status;
      const accStatus =
        accStatusCode === 1
          ? "Ativo"
          : accStatusCode === 2
          ? "Desabilitado"
          : accStatusCode === 3
          ? "Não Verificado"
          : "Pendente";

      const rawBalance = Number(accData.balance || rawAcc.balance || 0) / 100;
      const cycleBrl = convertToBrl(rawBalance, currency, usdBrlRate);

      const rawPeriodSpend = Number(accountInsight?.spend || 0);
      const periodSpendBrl = convertToBrl(rawPeriodSpend, currency, usdBrlRate);

      const rawAmountSpent = Number(accData?.amount_spent || 0) / 100;
      const historicSpentBrl = convertToBrl(rawAmountSpent, currency, usdBrlRate);

      const accAttr = accountAttribution.get(accId) || { grossRevenue: 0, netRevenue: 0, count: 0 };
      const accGrossRevenue = accAttr.grossRevenue;
      const accNetRevenue = accAttr.netRevenue;
      const accSales = accAttr.count;
      const accProfit = accNetRevenue - periodSpendBrl;
      const accRoas =
        periodSpendBrl > 0 ? accGrossRevenue / periodSpendBrl : accGrossRevenue > 0 ? 99.9 : 0;
      const accCpa = accSales > 0 ? periodSpendBrl / accSales : 0;
      const accMargin = accNetRevenue > 0 ? (accProfit / accNetRevenue) * 100 : periodSpendBrl > 0 ? -100 : 0;
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
        card: "N/A",
        cycle: cycleBrl,
        spend: periodSpendBrl,
        historic_spent: historicSpentBrl,
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

      rawCampaigns.forEach((camp: any) => {
        const cIns = campaignInsightsMap.get(camp.id) || {};
        const cRawSpend = Number(cIns.spend || 0);
        const cSpend = convertToBrl(cRawSpend, currency, usdBrlRate);

        const cAttr = campaignAttribution.get(camp.id) || { grossRevenue: 0, netRevenue: 0, count: 0 };
        const cGrossRevenue = cAttr.grossRevenue;
        const cNetRevenue = cAttr.netRevenue;
        const cSales = cAttr.count;
        const cProfit = cNetRevenue - cSpend;
        const cRoas = cSpend > 0 ? cGrossRevenue / cSpend : cGrossRevenue > 0 ? 99.9 : 0;
        const cCpa = cSales > 0 ? cSpend / cSales : 0;
        const cMargin = cNetRevenue > 0 ? (cProfit / cNetRevenue) * 100 : cSpend > 0 ? -100 : 0;
        const cRoi = cSpend > 0 ? cProfit / cSpend : 0;

        const metaCampIc = extractMetaIc(cIns.actions);
        const fpCampIc = campaignIcAttribution.get(camp.id) || 0;
        const cIc = Math.max(metaCampIc, fpCampIc);
        const cCpi = cIc > 0 ? cSpend / cIc : 0;

        const isCBO = Boolean(camp.daily_budget || camp.lifetime_budget);
        const rawBudget = isCBO
          ? camp.daily_budget
            ? Number(camp.daily_budget) / 100
            : Number(camp.lifetime_budget || 0) / 100
          : 0;

        const convertedBudget = convertToBrl(rawBudget, currency, usdBrlRate);
        const isActive =
          camp.effective_status === "ACTIVE" || (camp.effective_status === undefined && camp.status === "ACTIVE");

        const cHist = budgetHistoryMap.get(camp.id);

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
          adset_count: 0,
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
          budget_history: cHist
            ? {
                previous_budget: cHist.previous_budget !== null ? Number(cHist.previous_budget) : null,
                new_budget: cHist.new_budget !== null ? Number(cHist.new_budget) : null,
                sales: cHist.sales_at_update,
                revenue: cHist.revenue_at_update !== null ? Number(cHist.revenue_at_update) : null,
                spend: cHist.spend_at_update !== null ? Number(cHist.spend_at_update) : null,
                profit: cHist.profit_at_update !== null ? Number(cHist.profit_at_update) : null,
                roas: cHist.roas_at_update !== null ? Number(cHist.roas_at_update) : null,
                cpa: cHist.cpa_at_update !== null ? Number(cHist.cpa_at_update) : null,
                user_email: cHist.user_email,
                source: cHist.source,
                metadata: cHist.metadata,
                updated_at: cHist.created_at,
              }
            : null,
        });
      });
    });

    const untrackedSalesCount = Math.max(parsedPurchases.length - matchedPurchaseIds.size, 0);

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

    const finalResponse = {
      ok: true,
      mode: "initial",
      lazy_loading: true,
      usdBrlRate,
      untracked_sales_count: untrackedSalesCount,
      account_errors: accountErrors,
      accounts: formattedAccounts,
      campaigns: allCampaigns,
      adsets: [],
      ads: [],
      error_type: null,
    };

    // Cacheia se tiver campanhas e contas sem erros graves
    if (accountErrors.length === 0 && (formattedAccounts.length > 0 || allCampaigns.length > 0)) {
      MEMORY_CACHE.set(cacheKey, {
        timestamp: nowMs,
        data: finalResponse,
        datePreset,
        timezoneName: accountsMeta[0]?.timezoneName || "America/Sao_Paulo",
      });
    }

    logLazyObservability("initial", null, Date.now() - obsStartTime, allCampaigns.length, true, null);

    if (isObservabilityEnabled) {
      console.log(
        JSON.stringify({
          event: "meta_ads_observability",
          duration_ms: Date.now() - obsStartTime,
          accounts_processed: accountsMeta.length,
          pages_fetched: obsPagesFetched,
          retries_code17: obsRetriesCode17,
          account_errors: accountErrors.length,
          entities_loaded: {
            accounts: formattedAccounts.length,
            campaigns: allCampaigns.length,
            adsets: 0,
            ads: 0,
          },
        })
      );
    }

    const responseHeaders: Record<string, string> = isRefresh
      ? { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
      : { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" };

    return NextResponse.json(finalResponse, {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[Campaigns List Multi-Tier API Error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message, accounts: [], campaigns: [], adsets: [], ads: [] },
      { status: 500 }
    );
  }
}
