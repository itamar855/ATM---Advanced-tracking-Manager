import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { getUsdBrlRate, convertToBrl } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna a hierarquia completa de 3 níveis das contas ativadas no momento
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paramAccountId = searchParams.get("ad_account_id");

    const supabase = createAdminClient();

    // 1. Busca a integração ativa da Meta
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
      return NextResponse.json({ ok: false, error: "Token da Meta não encontrado", campaigns: [] });
    }

    const usdBrlRate = await getUsdBrlRate();

    // 2. Lista de contas ATIVADAS no momento (apenas as ativadas)
    const selectedAccountIds: string[] =
      integration?.config?.selected_account_ids ||
      integration?.config?.ad_account_ids ||
      ["act_1316835733682937", "act_2704031959980850", "act_1552831582460812"];

    // 3. Monta a lista de contas ativadas com nomes e moedas
    const availableAccounts: Array<{ id: string; name: string; currency: string }> = [];

    const accountNamesMap: Record<string, string> = {
      "act_1316835733682937": "USD 1 - Cultura 420",
      "act_2704031959980850": "USD 2 - Escala",
      "act_1552831582460812": "USD 3 - Escala",
      "act_994577432497447": "CONTA 01 - Restaura Phone",
      "act_857082363539586": "CONTA 02 - Restaura Phone",
      "act_991744449908220": "CONTA 03 - Energisa",
    };

    for (const accId of selectedAccountIds) {
      const formatted = accId.startsWith("act_") ? accId : `act_${accId}`;
      const defaultName = accountNamesMap[formatted] || formatted;
      availableAccounts.push({
        id: formatted,
        name: defaultName,
        currency: formatted.includes("1316835") || formatted.includes("270403") || formatted.includes("155283") ? "USD" : "BRL",
      });
    }

    // 4. Determina qual conta carregar (default: USD 2 ou USD 1)
    const targetAccountId =
      paramAccountId && paramAccountId !== "all"
        ? (paramAccountId.startsWith("act_") ? paramAccountId : `act_${paramAccountId}`)
        : (availableAccounts[1]?.id || availableAccounts[0]?.id || "act_2704031959980850");

    const targetAccountInfo = availableAccounts.find((a) => a.id === targetAccountId);
    const accountCurrency = targetAccountInfo?.currency || "USD";

    // 5. Chamada de Hierarquia Completa de 3 Níveis na Graph API da Meta
    const metaUrl = `https://graph.facebook.com/v23.0/${targetAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,objective,insights{spend,actions},adsets{id,name,status,daily_budget,lifetime_budget,insights{spend,actions},ads{id,name,status,insights{spend,actions}}}&access_token=${token}&limit=30`;

    // 6. Busca todas as compras pagas reais no banco para atribuição de receita
    const { data: dbPurchases } = await supabase
      .from("events")
      .select("*")
      .eq("event_name", "Purchase")
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    const paidPurchasesByCampaign = new Map<string, { totalValue: number; count: number }>();
    const paidPurchasesByAdset = new Map<string, { totalValue: number; count: number }>();
    const paidPurchasesByAd = new Map<string, { totalValue: number; count: number }>();

    (dbPurchases || []).forEach((ev) => {
      const metaResp = ev.meta_response || {};
      const orderDetails = metaResp.order_details || {};
      const customData = metaResp.custom_data || {};
      const tracking = orderDetails.tracking_params || {};

      const val = Number(orderDetails.value || customData.value || 0);
      const campId = String(tracking.utm_id || tracking.utm_campaign || "").split("|")[1] || String(tracking.utm_campaign || "");
      const adsetId = String(tracking.utm_medium || "").split("|")[1] || String(tracking.utm_medium || "");
      const adId = String(tracking.utm_content || "").split("|")[1] || String(tracking.utm_content || "");

      if (val > 0) {
        if (campId) {
          const prev = paidPurchasesByCampaign.get(campId) || { totalValue: 0, count: 0 };
          paidPurchasesByCampaign.set(campId, { totalValue: prev.totalValue + val, count: prev.count + 1 });
        }
        if (adsetId) {
          const prev = paidPurchasesByAdset.get(adsetId) || { totalValue: 0, count: 0 };
          paidPurchasesByAdset.set(adsetId, { totalValue: prev.totalValue + val, count: prev.count + 1 });
        }
        if (adId) {
          const prev = paidPurchasesByAd.get(adId) || { totalValue: 0, count: 0 };
          paidPurchasesByAd.set(adId, { totalValue: prev.totalValue + val, count: prev.count + 1 });
        }
      }
    });

    const res = await fetch(metaUrl);
    let campaigns: any[] = [];

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        campaigns = data.data.map((c: any) => {
          const cInsights = c.insights?.data?.[0] || {};
          const rawSpend = Number(cInsights.spend || 0);
          const cSpend = convertToBrl(rawSpend, accountCurrency, usdBrlRate);

          const cPaidData = paidPurchasesByCampaign.get(c.id) || { totalValue: 0, count: 0 };
          const cRevenue = cPaidData.totalValue;
          const cPurchases = cPaidData.count;

          const cProfit = cRevenue - cSpend;
          const cRoas = cSpend > 0 ? cRevenue / cSpend : (cRevenue > 0 ? 99.9 : 0);
          const cCpa = cPurchases > 0 ? cSpend / cPurchases : 0;

          const rawBudget = c.daily_budget ? Number(c.daily_budget) / 100 : Number(c.lifetime_budget || 0) / 100;
          const convertedBudget = convertToBrl(rawBudget, accountCurrency, usdBrlRate);

          // Processa Adsets (Conjuntos)
          const adsets = (c.adsets?.data || []).map((as: any) => {
            const asInsights = as.insights?.data?.[0] || {};
            const asRawSpend = Number(asInsights.spend || 0);
            const asSpend = convertToBrl(asRawSpend, accountCurrency, usdBrlRate);

            const asPaidData = paidPurchasesByAdset.get(as.id) || { totalValue: 0, count: 0 };
            const asRevenue = asPaidData.totalValue;
            const asPurchases = asPaidData.count;

            const asProfit = asRevenue - asSpend;
            const asRoas = asSpend > 0 ? asRevenue / asSpend : (asRevenue > 0 ? 99.9 : 0);
            const asCpa = asPurchases > 0 ? asSpend / asPurchases : 0;

            const asRawBudget = as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100;
            const asConvertedBudget = convertToBrl(asRawBudget, accountCurrency, usdBrlRate);

            // Processa Ads (Anúncios/Criativos)
            const ads = (as.ads?.data || []).map((ad: any) => {
              const adInsights = ad.insights?.data?.[0] || {};
              const adRawSpend = Number(adInsights.spend || 0);
              const adSpend = convertToBrl(adRawSpend, accountCurrency, usdBrlRate);

              const adPaidData = paidPurchasesByAd.get(ad.id) || { totalValue: 0, count: 0 };
              const adRevenue = adPaidData.totalValue;
              const adPurchases = adPaidData.count;

              const adProfit = adRevenue - adSpend;
              const adRoas = adSpend > 0 ? adRevenue / adSpend : (adRevenue > 0 ? 99.9 : 0);
              const adCpa = adPurchases > 0 ? adSpend / adPurchases : 0;

              return {
                id: ad.id,
                name: ad.name || `Criativo #${ad.id.slice(-6)}`,
                status: ad.status === "ACTIVE" ? "active" : "paused",
                spend: Math.round(adSpend * 100) / 100,
                revenue: Math.round(adRevenue * 100) / 100,
                profit: Math.round(adProfit * 100) / 100,
                roas: Math.round(adRoas * 100) / 100,
                conversions: adPurchases,
                cpa: Math.round(adCpa * 100) / 100,
              };
            });

            return {
              id: as.id,
              name: as.name || `Conjunto #${as.id.slice(-6)}`,
              status: as.status === "ACTIVE" ? "active" : "paused",
              budgetType: as.daily_budget ? "ABO" : "CBO",
              budget: Math.round(asConvertedBudget * 100) / 100,
              spend: Math.round(asSpend * 100) / 100,
              revenue: Math.round(asRevenue * 100) / 100,
              profit: Math.round(asProfit * 100) / 100,
              roas: Math.round(asRoas * 100) / 100,
              conversions: asPurchases,
              cpa: Math.round(asCpa * 100) / 100,
              ads,
            };
          });

          return {
            campaign_id: c.id,
            campaign_name: c.name,
            status: c.status === "ACTIVE" ? "active" : "paused",
            budgetType: c.daily_budget ? "CBO" : "ABO",
            budget: Math.round(convertedBudget * 100) / 100,
            spend: Math.round(cSpend * 100) / 100,
            revenue: Math.round(cRevenue * 100) / 100,
            profit: Math.round(cProfit * 100) / 100,
            roas: Math.round(cRoas * 100) / 100,
            conversions: cPurchases,
            cpa: Math.round(cCpa * 100) / 100,
            healthScore: 95,
            adsets,
          };
        });
      }
    }

    return NextResponse.json({
      ok: true,
      selectedAccountId: targetAccountId,
      accountCurrency,
      usdBrlRate,
      availableAccounts,
      campaigns,
    });
  } catch (error: any) {
    console.error("[Meta Campaigns API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message, campaigns: [] }, { status: 500 });
  }
}
