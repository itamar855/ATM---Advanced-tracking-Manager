import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchMetaSpendInsights, persistCampaignCosts } from "@/lib/meta/marketing-api";
import { resolveMetaAccessToken } from "@/lib/meta/token";

/**
 * Rota de trigger para sincronização de custos.
 * Pode ser chamada de forma programática por um Cron Job diário.
 * Query Params: ?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    // Default para o dia anterior se não for fornecido, para capturar o gasto consolidado completo
    const targetDate = dateParam || new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const supabase = createAdminClient();

    // 1. Busca todas as integrações da Meta que estão ativas e possuem ad_account_id configurado
    const { data: integrations, error: intError } = await supabase
      .from("integrations")
      .select(`
        id,
        store_id,
        pixel_id,
        access_token_enc,
        api_version,
        config
      `)
      .eq("platform", "meta")
      .eq("status", "active");

    if (intError) {
      return NextResponse.json({ ok: false, error: intError.message }, { status: 500 });
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma integração Meta ativa localizada", synced: 0 });
    }

    let totalSyncedRecords = 0;
    const errors: any[] = [];

    // 2. Itera em cada integração realizando o sync de forma isolada
    for (const integration of integrations) {
      const adAccountId = integration.config?.ad_account_id;
      
      if (!adAccountId) {
        // Pula se não houver conta de anúncio configurada
        continue;
      }

      try {
        const decryptedToken = resolveMetaAccessToken(integration.access_token_enc);
        if (!decryptedToken) continue;
        
        // 3. Faz o fetch na Graph API
        const apiResult = await fetchMetaSpendInsights(
          decryptedToken,
          adAccountId,
          targetDate,
          integration.api_version || "v23.0"
        );

        if (!apiResult.ok || !apiResult.data) {
          errors.push({ store_id: integration.store_id, error: apiResult.error });
          continue;
        }

        // 4. Salva no banco de dados de forma idempotente
        const saveResult = await persistCampaignCosts(
          integration.store_id,
          integration.id,
          apiResult.data
        );

        if (saveResult.error) {
          errors.push({ store_id: integration.store_id, error: saveResult.error });
        } else {
          totalSyncedRecords += saveResult.count;
        }

      } catch (err: any) {
        errors.push({ store_id: integration.store_id, error: err.message });
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Sync de custos de anúncio finalizado",
      date: targetDate,
      synced_records: totalSyncedRecords,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("[Cost Sync API Critical Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
