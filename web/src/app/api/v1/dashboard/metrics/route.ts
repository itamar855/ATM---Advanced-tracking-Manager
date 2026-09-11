import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";
import { resolveAccountDateRange, AccountDateRange } from "@/lib/date-utils";
import { metaCache } from "@/lib/meta/meta-cache";
import { performanceMonitor } from "@/lib/meta/performance-monitor";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/dashboard/metrics
 * Retorna métricas financeiras completas da Dashboard Resumo.
 * Inclui cache inteligente em memória (TTL 45s), isolamento multi-tenant e logs de tempo.
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const datePreset = searchParams.get("date_preset") || "today";
    const selectedAccountId = searchParams.get("ad_account_id") || "all";
    const refresh = searchParams.get("refresh") === "true";
    
    if (!storeId) {
      return NextResponse.json({ error: "store_id is required" }, { status: 400 });
    }

    const cacheScope = "dashboard_metrics";
    const cacheTokenKey = `${selectedAccountId}:${datePreset}`;

    // Verificação de cache em memória para responder instantaneamente ao polling e navegação
    if (!refresh) {
      const cached = metaCache.get<any>(cacheScope, storeId, cacheTokenKey);
      if (cached.hit && cached.data) {
        const durationMs = Math.round(performance.now() - startTime);

        performanceMonitor.log({
          tenant_id: storeId,
          endpoint: "/api/v1/dashboard/metrics",
          operation: "GET_DASHBOARD_METRICS",
          context: "dashboard",
          criticality: "low",
          duration_ms: durationMs,
          cache_status: "HIT",
          graph_calls_count: 0,
          status_code: 200,
        });

        return NextResponse.json({
          ...cached.data,
          _cache: {
            hit: true,
            ageMs: cached.ageMs,
            ttlRemainingMs: cached.remainingTtlMs,
            durationMs,
          },
        });
      }
    }

    console.log(`[GET /api/v1/dashboard/metrics] [CACHE MISS] store_id=${storeId} preset=${datePreset} acc=${selectedAccountId} (refresh=${refresh}) calculando métricas contábeis...`);

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

    // 3. Consulta Gastos Contábeis em public.campaign_cost_snapshots (Fase 8.3)
    const fallbackRange = resolveAccountDateRange(datePreset, "America/Sao_Paulo");
    const querySinceDate = fallbackRange.since;
    const queryUntilDate = fallbackRange.until;

    const formattedSelectedAccId = selectedAccountId.startsWith("act_") ? selectedAccountId : `act_${selectedAccountId}`;

    let snapshotQuery = supabase
      .from("campaign_cost_snapshots")
      .select("ad_account_id, campaign_id, campaign_name, spend, spend_brl, impressions, clicks, date")
      .eq("store_id", storeId)
      .gte("date", querySinceDate)
      .lte("date", queryUntilDate);

    if (selectedAccountId !== "all") {
      snapshotQuery = snapshotQuery.eq("ad_account_id", formattedSelectedAccId);
    }

    const { data: costSnapshots, error: snapErr } = await snapshotQuery;
    const hasCostSnapshots = !snapErr && Array.isArray(costSnapshots) && costSnapshots.length > 0;

    let metaPermissionError: string | null = null;

    if (hasCostSnapshots) {
      // Popula totais de gasto diretamente da camada contábil
      const accSpendMap = new Map<string, { spend: number; spendBrl: number }>();

      costSnapshots.forEach((s: any) => {
        const accId = s.ad_account_id;
        const prev = accSpendMap.get(accId) || { spend: 0, spendBrl: 0 };
        prev.spend += Number(s.spend || 0);
        prev.spendBrl += Number(s.spend_brl || 0);
        accSpendMap.set(accId, prev);

        totalSpendOriginal += Number(s.spend || 0);
        totalSpendBrl += Number(s.spend_brl || 0);
        totalImpressions += Number(s.impressions || 0);
        totalClicks += Number(s.clicks || 0);
      });

      // Popula contas disponíveis a partir dos metadados da integração e dos snapshots
      const allKnownAccs = configuredAccountIds.length > 0 ? configuredAccountIds : Array.from(accSpendMap.keys());
      allKnownAccs.forEach((accId) => {
        const formattedId = accId.startsWith("act_") ? accId : `act_${accId}`;
        const accStats = accSpendMap.get(formattedId) || { spend: 0, spendBrl: 0 };
        const metaInfo = integration?.config?.ad_accounts_metadata?.[formattedId];
        availableAccounts.push({
          id: formattedId,
          name: metaInfo?.name || formattedId,
          currency: metaInfo?.currency || "BRL",
          status: "active",
          spend: Math.round(accStats.spend * 100) / 100,
          spendBrl: Math.round(accStats.spendBrl * 100) / 100,
        });
      });
    } else {
      // Fallback de Segurança: busca em tempo real via Meta Graph API caso snapshots ainda estejam vazios
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
    }

    // 4. Determina intervalo UTC harmonizado para consulta de pedidos/vendas no Supabase
    const relevantRanges = accountRanges.filter((ar) =>
      selectedAccountId === "all" ? ar.isActive : ar.id === formattedSelectedAccId
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

    const targetCampaignIds = new Set<string>();

    // Mapeia campanhas da conta selecionada via snapshots (ou live Meta API fallback)
    if (selectedAccountId !== "all") {
      const { data: snapCamps } = await supabase
        .from("campaign_cost_snapshots")
        .select("campaign_id")
        .eq("store_id", storeId)
        .eq("ad_account_id", formattedSelectedAccId);

      if (snapCamps && snapCamps.length > 0) {
        snapCamps.forEach((c: any) => {
          if (c.campaign_id) targetCampaignIds.add(String(c.campaign_id));
        });
      } else if (token) {
        try {
          const campRes = await fetch(
            `https://graph.facebook.com/v23.0/${formattedSelectedAccId}/campaigns?fields=id,name&limit=150&access_token=${token}`,
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
          console.warn(`[Dashboard Metrics] Erro ao buscar campanhas da conta ${formattedSelectedAccId}:`, e);
        }
      }
    }

    // 5. Busca Vendas Contábeis em public.revenue_ledger (Fase 8.3)
    const attributionModel = searchParams.get("attribution_model") || "last_click";

    const [ledgerResult, purchasesResult, pendingResult] = await Promise.all([
      supabase
        .from("revenue_ledger")
        .select("id, order_id, order_value, attributed_revenue, payment_method, source, campaign_id, order_paid_at")
        .eq("store_id", storeId)
        .eq("attribution_model", attributionModel)
        .gte("order_paid_at", effectiveStartDate)
        .lte("order_paid_at", queryEndUtc)
        .order("order_paid_at", { ascending: false }),
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
    ]);

    const ledgerRows = ledgerResult.data || [];
    const allPurchases = purchasesResult.data || [];
    const pendingPurchases = pendingResult.data || [];
    const hasLedgerData = ledgerRows.length > 0;

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
    const hasCustomRules = (storeTaxesAndDuties || []).length > 0;

    if (hasLedgerData) {
      // ── FLUXO CONTÁBIL PRINCIPAL: REVENUE LEDGER ─────────────────────────────
      ledgerRows.forEach((row: any) => {
        // Se uma conta específica foi selecionada, só contabiliza vendas atribuídas a ela
        if (selectedAccountId !== "all") {
          const rowCamp = String(row.campaign_id || "").trim();
          if (!rowCamp || !targetCampaignIds.has(rowCamp)) {
            return;
          }
        }

        const orderId = String(row.order_id || "").trim();
        const val = Number(row.attributed_revenue ?? row.order_value ?? 0);

        if (orderId && !seenOrderIds.has(orderId)) {
          seenOrderIds.add(orderId);
          paidSalesCount += 1;

          // Classifica Método de Pagamento do Ledger
          const method = String(row.payment_method || "").toLowerCase();
          const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master");
          const isBoleto = method.includes("boleto");
          const isPix = method.includes("pix") || method === ""; // Default pix

          if (isPix) pixCount++;
          else if (isCard) cardCount++;
          else if (isBoleto) boletoCount++;
          else otherCount++;

          // Classifica Fonte de Tráfego do Ledger
          const src = String(row.source || "").toLowerCase();
          if (src.includes("meta") || src.includes("facebook") || src === "fb" || src.startsWith("fb") || src.includes("insta")) {
            metaSalesCount++;
          } else if (src.includes("iq") || src.startsWith("igj") || src.includes("google") || src.includes("kwai") || src.includes("tiktok")) {
            iqSalesCount++;
          } else {
            naSalesCount++;
          }
        }

        grossRevenue += val;

        // Cálculo de Taxas e Impostos Dinâmicos (Cadastrados pelo Usuário)
        let fee = 0;
        let operationalTax = 0;

        if (hasCustomRules) {
          (storeTaxesAndDuties || []).filter((t: any) => t.type === "tax").forEach((t: any) => {
            operationalTax += val * (Number(t.value || 0) / 100);
          });

          (storeTaxesAndDuties || []).filter((t: any) => t.type === "duty").forEach((t: any) => {
            const method = String(row.payment_method || "").toLowerCase();
            const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit");
            const isBoleto = method.includes("boleto");
            const isPix = method.includes("pix") || method === "";
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
          if (val > 0) {
            const isCard = String(row.payment_method || "").toLowerCase().includes("card");
            fee = isCard ? (val * 0.15) : (val * 0.099);
          }
        }

        totalTaxes += fee;
        totalOperationalTaxes += operationalTax;
      });
    } else {
      // ── FALLBACK RESILIENTE: CONSULTA VIA EVENTS (CASO LEDGER VAZIO) ────────
      (allPurchases || []).forEach((ev) => {
        const metaResp = ev.meta_response || {};
        const orderDetails = metaResp.order_details || {};
        const customData = metaResp.custom_data || {};
        const tracking = orderDetails.tracking_params || {};

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

        if (selectedAccountId !== "all") {
          const matchesAccount =
            (campId && targetCampaignIds.has(campId)) ||
            (targetAccNorm && (normCamp.includes(targetAccNorm) || normSrc.includes(targetAccNorm))) ||
            (rawSrc.includes(targetAccIdNum) || String(customData.ad_account_id || orderDetails.ad_account_id || "").includes(targetAccIdNum));
          if (!matchesAccount) return;
        }

        const val = Number(
          customData.value ||
          orderDetails.value ||
          customData.order_value ||
          0
        );
        grossRevenue += val;

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
        const isPix = method.includes("pix") || method === "";

        let fee = 0;
        let operationalTax = 0;

        if (hasCustomRules) {
          (storeTaxesAndDuties || []).filter((t: any) => t.type === "tax").forEach((t: any) => {
            operationalTax += val * (Number(t.value || 0) / 100);
          });

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
          if (val > 0) {
            fee = isCard ? (val * 0.15) : (val * 0.099);
          }
        }

        const products = orderDetails.products || customData.products || [];
        if (Array.isArray(products) && (storeProductCosts || []).length > 0) {
          products.forEach((p: any) => {
            const pName = String(p.name || p.product_name || "").toLowerCase().trim();
            const pQty = Number(p.quantity || 1);
            const matched = (storeProductCosts || []).find((c: any) =>
              pName && String(c.product_name || "").toLowerCase().trim().includes(pName)
            );
            if (matched && matched.cost_price) {
              totalCogs += Number(matched.cost_price) * pQty;
            }
          });
        }

        totalTaxes += fee;
        totalOperationalTaxes += operationalTax;

        paidSalesCount += 1;

        if (isPix) pixCount++;
        else if (isCard) cardCount++;
        else if (isBoleto) boletoCount++;
        else otherCount++;

        const src = String(
          customData.utm_source ||
          orderDetails.utm_source ||
          (orderDetails.tracking_params || {}).utm_source ||
          ""
        ).toLowerCase();

        if (src.includes("meta") || src.includes("facebook") || src === "fb" || src.startsWith("fb") || src.includes("insta")) {
          metaSalesCount++;
        } else if (src.includes("iq") || src.startsWith("igj") || src.includes("google") || src.includes("kwai") || src.includes("tiktok")) {
          iqSalesCount++;
        } else {
          naSalesCount++;
        }
      });
    }

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

    const responsePayload = {
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
    };

    // Grava no cache por 45 segundos (isolado por loja e preset)
    metaCache.set(cacheScope, storeId, cacheTokenKey, responsePayload, 45 * 1000);

    const totalDurationMs = Math.round(performance.now() - startTime);

    performanceMonitor.log({
      tenant_id: storeId,
      endpoint: "/api/v1/dashboard/metrics",
      operation: "GET_DASHBOARD_METRICS",
      context: "dashboard",
      criticality: totalDurationMs > 2000 ? "high" : totalDurationMs > 800 ? "medium" : "low",
      duration_ms: totalDurationMs,
      cache_status: refresh ? "BYPASS" : "MISS",
      graph_calls_count: hasCostSnapshots ? 0 : availableAccounts.length * 2,
      status_code: 200,
    });

    return NextResponse.json({
      ...responsePayload,
      _cache: {
        hit: false,
        durationMs: totalDurationMs,
      },
    });
  } catch (error: any) {
    const totalDurationMs = Math.round(performance.now() - startTime);
    const storeIdFallback = new URL(request.url).searchParams.get("store_id") || "unknown_store";

    performanceMonitor.log({
      tenant_id: storeIdFallback,
      endpoint: "/api/v1/dashboard/metrics",
      operation: "GET_DASHBOARD_METRICS",
      context: "dashboard",
      criticality: "high",
      duration_ms: totalDurationMs,
      cache_status: "MISS",
      graph_calls_count: 0,
      status_code: 500,
      error_message: error.message,
    });

    console.error(`[Dashboard Metrics API Error] Falhou após ${totalDurationMs}ms:`, error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
