import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna hierarquia completa (Campanhas -> Conjuntos -> Anúncios) da conta de anúncios
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

    if (!integration || !integration.access_token_enc) {
      return NextResponse.json({ ok: false, error: "Integração da Meta não encontrada", campaigns: [] });
    }

    let token = integration.access_token_enc.toString();
    if (!token.startsWith("EAA")) {
      try {
        token = decrypt(token);
      } catch {}
    }

    // 2. Determina a conta de anúncios alvo
    const adAccountId =
      paramAccountId ||
      integration.config?.ad_account_ids?.[0] ||
      integration.config?.ad_account_id ||
      "1316835733682937";

    const formattedAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    // 3. Busca lista de todas as contas vinculadas para o seletor rápido
    let availableAccounts: Array<{ id: string; name: string }> = [];
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name,currency,amount_spent&access_token=${token}&limit=30`
      );
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.data)) {
          availableAccounts = accData.data.map((a: any) => ({
            id: a.id,
            name: a.name || a.id,
          }));
        }
      }
    } catch {}

    // 4. Chamada de Hierarquia Completa de 3 Níveis na Graph API da Meta
    const metaUrl = `https://graph.facebook.com/v23.0/${formattedAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,objective,insights{spend,actions},adsets{id,name,status,daily_budget,lifetime_budget,insights{spend,actions},ads{id,name,status,insights{spend,actions}}}&access_token=${token}&limit=30`;

    // 5. Busca todas as compras pagas reais no banco para atribuição de receita
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
          const cSpend = Number(cInsights.spend || 0);

          // Receita e conversões REAIS pagas do checkout
          const cPaidData = paidPurchasesByCampaign.get(c.id) || { totalValue: 0, count: 0 };
          const cRevenue = cPaidData.totalValue;
          const cPurchases = cPaidData.count;

          const cProfit = cRevenue - cSpend;
          const cRoas = cSpend > 0 ? cRevenue / cSpend : (cRevenue > 0 ? 99.9 : 0);
          const cCpa = cPurchases > 0 ? cSpend / cPurchases : 0;

          // Processa Adsets (Conjuntos)
          const adsets = (c.adsets?.data || []).map((as: any) => {
            const asInsights = as.insights?.data?.[0] || {};
            const asSpend = Number(asInsights.spend || 0);

            const asPaidData = paidPurchasesByAdset.get(as.id) || { totalValue: 0, count: 0 };
            const asRevenue = asPaidData.totalValue;
            const asPurchases = asPaidData.count;

            const asProfit = asRevenue - asSpend;
            const asRoas = asSpend > 0 ? asRevenue / asSpend : (asRevenue > 0 ? 99.9 : 0);
            const asCpa = asPurchases > 0 ? asSpend / asPurchases : 0;

            // Processa Ads (Anúncios/Criativos)
            const ads = (as.ads?.data || []).map((ad: any) => {
              const adInsights = ad.insights?.data?.[0] || {};
              const adSpend = Number(adInsights.spend || 0);

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
              budget: as.daily_budget ? Number(as.daily_budget) / 100 : Number(as.lifetime_budget || 0) / 100,
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
            budget: c.daily_budget ? Number(c.daily_budget) / 100 : Number(c.lifetime_budget || 0) / 100,
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
      selectedAccountId: formattedAccountId,
      availableAccounts,
      campaigns,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, campaigns: [] }, { status: 500 });
  }
}
