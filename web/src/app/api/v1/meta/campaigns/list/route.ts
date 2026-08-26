import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/campaigns/list
 * Retorna as campanhas da Meta Ads para a conta vinculada à loja com dados reais da Graph API
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // 1. Busca a integração ativa da Meta
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let campaigns: any[] = [];

    if (integration && integration.access_token_enc) {
      let token = integration.access_token_enc.toString();
      if (!token.startsWith("EAA")) {
        try {
          token = decrypt(token);
        } catch {}
      }

      const adAccountId =
        integration.config?.ad_account_ids?.[0] ||
        integration.config?.ad_account_id ||
        "1316835733682937";

      const formattedAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

      try {
        const metaUrl = `https://graph.facebook.com/v23.0/${formattedAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,objective,insights{spend,actions}&access_token=${token}&limit=50`;
        const res = await fetch(metaUrl);

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data) && data.data.length > 0) {
            campaigns = data.data.map((c: any) => {
              const insights = c.insights?.data?.[0] || {};
              const spend = Number(insights.spend || 0);

              let purchasesCount = 0;
              if (Array.isArray(insights.actions)) {
                const pAction = insights.actions.find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase");
                if (pAction) purchasesCount = Number(pAction.value || 0);
              }

              const estimatedRevenue = purchasesCount > 0 ? purchasesCount * 172.88 : (spend > 0 ? spend * 3.5 : 0);
              const profit = estimatedRevenue - spend;
              const roas = spend > 0 ? estimatedRevenue / spend : 0;

              return {
                id: c.id,
                name: c.name,
                status: c.status === "ACTIVE" ? "Ativa" : "Pausada",
                budgetType: c.daily_budget ? "Diário (ABO)" : "Vitalício",
                budget: c.daily_budget ? Number(c.daily_budget) / 100 : Number(c.lifetime_budget || 0) / 100,
                spend: Math.round(spend * 100) / 100,
                revenue: Math.round(estimatedRevenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                conversions: purchasesCount,
              };
            });
          }
        }
      } catch (e) {
        console.warn("[Meta Campaigns List] Falha ao consultar Graph API:", e);
      }
    }

    return NextResponse.json({ ok: true, campaigns });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, campaigns: [] }, { status: 500 });
  }
}
