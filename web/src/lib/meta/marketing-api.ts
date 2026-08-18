import { createClient } from "../supabase/server";

export interface CampaignAdSpend {
  date: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
}

/**
 * Consulta os dados de entrega e custo (spend) na Meta Marketing API
 * Endpoint: /act_{ad_account_id}/insights
 */
export async function fetchMetaSpendInsights(
  accessToken: string,
  adAccountId: string,
  date: string, // YYYY-MM-DD
  apiVersion = "v23.0"
): Promise<{ ok: boolean; data?: CampaignAdSpend[]; error?: string }> {
  try {
    // Adiciona o prefixo 'act_' caso o usuário não tenha inserido
    const formattedAccountId = adAccountId.startsWith("act_")
      ? adAccountId
      : `act_${adAccountId}`;

    const url = new URL(`https://graph.facebook.com/${apiVersion}/${formattedAccountId}/insights`);
    
    // Parâmetros para puxar os gastos detalhados no nível de anúncio (ad)
    url.searchParams.append("access_token", accessToken);
    url.searchParams.append("level", "ad");
    url.searchParams.append("time_range", JSON.stringify({ since: date, until: date }));
    url.searchParams.append(
      "fields",
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,reach"
    );
    url.searchParams.append("filtering", JSON.stringify([{ field: "impressions", operator: "GREATER_THAN", value: 0 }]));
    url.searchParams.append("limit", "500");

    console.log(`[Meta Marketing API] Sincronizando custos de ${date} para a conta ${formattedAccountId}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(15000), // Timeout de 15 segundos
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Meta Marketing API Error Response]:", result);
      return {
        ok: false,
        error: result.error?.message || `Erro da API de Marketing com status ${response.status}`,
      };
    }

    const insights = (result.data || []).map((item: any) => ({
      date,
      campaignId: item.campaign_id,
      campaignName: item.campaign_name,
      adsetId: item.adset_id,
      adsetName: item.adset_name,
      adId: item.ad_id,
      adName: item.ad_name,
      spend: parseFloat(item.spend || "0"),
      impressions: parseInt(item.impressions || "0", 10),
      clicks: parseInt(item.clicks || "0", 10),
      reach: parseInt(item.reach || "0", 10),
    }));

    return { ok: true, data: insights };
  } catch (error: any) {
    console.error("[Meta Marketing API Catch Exception]:", error);
    return {
      ok: false,
      error: error.message || "Falha de rede ao conectar com a API de Marketing",
    };
  }
}

/**
 * Salva ou atualiza os custos de campanha no Supabase de forma idempotente
 */
export async function persistCampaignCosts(
  storeId: string,
  integrationId: string,
  insights: CampaignAdSpend[]
): Promise<{ count: number; error?: string }> {
  const supabase = await createClient();

  try {
    let count = 0;
    
    for (const item of insights) {
      const { error } = await supabase
        .from("campaign_costs")
        .upsert(
          {
            store_id: storeId,
            integration_id: integrationId,
            date: item.date,
            campaign_id: item.campaignId,
            campaign_name: item.campaignName,
            adset_id: item.adsetId,
            adset_name: item.adsetName,
            ad_id: item.adId,
            ad_name: item.adName,
            spend: item.spend,
            impressions: item.impressions,
            clicks: item.clicks,
            reach: item.reach,
            synced_at: new Date().toISOString(),
          },
          {
            onConflict: "store_id,date,campaign_id,adset_id,ad_id",
          }
        );

      if (error) throw error;
      count++;
    }

    return { count };
  } catch (error: any) {
    console.error("[Database Cost Sync Error]:", error);
    return { count: 0, error: error.message };
  }
}
