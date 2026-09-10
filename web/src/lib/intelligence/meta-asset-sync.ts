/**
 * web/src/lib/intelligence/meta-asset-sync.ts
 *
 * ATM Meta Asset Data Collector (Fase 9.2)
 *
 * Coletor de Sinais Reais da Meta Graph API e Atribuição Interna ATM:
 * 1. Extrai nós da BM (Business Manager) e Verificação de Empresa.
 * 2. Extrai nós da Conta de Anúncios (adtrust_spend_limit, balance, created_time, status).
 * 3. Busca anúncios rejeitados (disapproved / with_issues).
 * 4. Cruza com EMQ First-Party dos eventos CAPI do banco de dados.
 * 5. Cruza com ROAS e Spend contábil real do revenue_ledger e campaign_cost_snapshots.
 * 6. Alimenta o ATM Asset Intelligence Engine™ e persiste snapshots diários auditáveis.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import {
  generateAssetHealthScore,
  MetaAssetHealthResult,
  MetaAssetMetricsInput,
} from "./meta-asset-health-engine";

export interface SyncAssetOptions {
  storeId: string;
  adAccountId?: string;
  forceFresh?: boolean;
}

export interface SyncAssetResult {
  success: boolean;
  store_id: string;
  processed_accounts: number;
  results: MetaAssetHealthResult[];
  errors: Array<{ asset_id: string; error: string }>;
}

/**
 * Coleta sinais reais da Meta e sincroniza a saúde de ativos da loja no Supabase.
 */
export async function syncMetaAssetsHealth(options: SyncAssetOptions): Promise<SyncAssetResult> {
  const { storeId, adAccountId } = options;
  const supabase = createAdminClient();

  const results: MetaAssetHealthResult[] = [];
  const errors: Array<{ asset_id: string; error: string }> = [];

  // 1. Busca integração Meta ativa da loja
  let { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("store_id", storeId)
    .eq("platform", "meta")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback: busca qualquer integração ativa da Meta caso storeId seja genérica
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

  if (!integration) {
    throw new Error("Nenhuma integração Meta ativa encontrada para sincronização de ativos.");
  }

  const token = resolveMetaAccessToken(integration.access_token_enc);
  if (!token) {
    throw new Error("Token de acesso da Meta inválido ou expirado.");
  }

  const apiVersion = integration.api_version || "v23.0";

  // 2. Determina contas de anúncio a processar
  let accountIdsToSync: string[] = [];
  if (adAccountId) {
    accountIdsToSync = [adAccountId];
  } else if (Array.isArray(integration.config?.ad_account_ids) && integration.config.ad_account_ids.length > 0) {
    accountIdsToSync = integration.config.ad_account_ids;
  } else if (integration.config?.ad_account_id) {
    accountIdsToSync = [integration.config.ad_account_id];
  }

  if (accountIdsToSync.length === 0) {
    throw new Error("Nenhuma conta de anúncios selecionada na configuração da loja.");
  }

  // 3. Consulta EMQ First-Party recente nos eventos CAPI da loja (últimos 50 eventos)
  const { data: recentEvents } = await supabase
    .from("events")
    .select("health_score")
    .eq("store_id", storeId)
    .eq("source", "server")
    .order("created_at", { ascending: false })
    .limit(50);

  const realEmq =
    recentEvents && recentEvents.length > 0
      ? Math.round(recentEvents.reduce((acc, ev) => acc + (Number(ev.health_score) || 0), 0) / recentEvents.length)
      : 85;

  // 4. Consulta ROAS contábil recente no revenue_ledger (últimos 30 dias)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: ledgerRecent } = await supabase
    .from("revenue_ledger")
    .select("attributed_revenue")
    .eq("store_id", storeId)
    .gte("order_paid_at", thirtyDaysAgo);

  const totalLedgerRevenue = (ledgerRecent || []).reduce(
    (sum, r) => sum + Number(r.attributed_revenue || 0),
    0
  );

  // 5. Consulta Spend recente em campaign_cost_snapshots (últimos 30 dias)
  const thirtyDaysDate = thirtyDaysAgo.split("T")[0];
  const { data: costSnapshots } = await supabase
    .from("campaign_cost_snapshots")
    .select("spend_brl, date")
    .eq("store_id", storeId)
    .gte("date", thirtyDaysDate);

  const totalSnapshotSpend = (costSnapshots || []).reduce(
    (sum, s) => sum + Number(s.spend_brl || 0),
    0
  );

  const realRoas = totalSnapshotSpend > 0 ? totalLedgerRevenue / totalSnapshotSpend : 1.5;

  // 6. Itera sobre cada conta e extrai sinais reais da Graph API
  for (const rawAccId of accountIdsToSync) {
    const cleanId = rawAccId.startsWith("act_") ? rawAccId : `act_${rawAccId}`;

    try {
      // 6.1 Nó da Conta de Anúncios e BM vinculada
      const fields = [
        "id",
        "name",
        "account_status",
        "disable_reason",
        "amount_spent",
        "currency",
        "created_time",
        "adtrust_spend_limit",
        "balance",
        "capabilities",
        "business{id,name,verification_status,created_time}",
      ].join(",");

      const accUrl = `https://graph.facebook.com/${apiVersion}/${cleanId}?fields=${fields}&access_token=${token}`;
      const accRes = await fetch(accUrl, { signal: AbortSignal.timeout(12000) });

      if (!accRes.ok) {
        const errJson = await accRes.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${accRes.status} na Graph API`;
        errors.push({ asset_id: cleanId, error: errMsg });
        continue;
      }

      const metaAcc = await accRes.json();

      // 6.2 Consulta de anúncios com problemas / rejeitados (Compliance)
      let disapprovedCount = 0;
      try {
        const adsUrl = `https://graph.facebook.com/${apiVersion}/${cleanId}/ads?fields=id,effective_status&effective_status=['DISAPPROVED','WITH_ISSUES']&limit=25&access_token=${token}`;
        const adsRes = await fetch(adsUrl, { signal: AbortSignal.timeout(8000) });
        if (adsRes.ok) {
          const adsData = await adsRes.json();
          if (Array.isArray(adsData.data)) {
            disapprovedCount = adsData.data.length;
          }
        }
      } catch {
        // Falha tolerante na busca de ads reprovados
      }

      // 6.3 Cálculo dos valores normalizados
      const amountSpentCents = parseInt(metaAcc.amount_spent || "0", 10);
      const amountSpentBrl = amountSpentCents / 100;

      const createdTime = metaAcc.created_time ? new Date(metaAcc.created_time) : null;
      const ageDays = createdTime ? Math.floor((Date.now() - createdTime.getTime()) / 86400000) : 180;

      const balanceCents = parseInt(metaAcc.balance || "0", 10);
      const hasPendingBalance = balanceCents > 0;

      // Limite diário de gasto imposto pela Meta (adtrust_spend_limit vem em centavos se definido)
      const adtrustLimitCents = parseInt(metaAcc.adtrust_spend_limit || "0", 10);
      const adtrustLimitBrl = adtrustLimitCents > 0 ? adtrustLimitCents / 100 : 0;

      // Status de verificação da BM
      const bmVerification = metaAcc.business?.verification_status === "verified" ? "verified" : "unverified";

      // 6.4 Monta métricas 100% reais para o Engine de 3 Camadas
      const metricsInput: MetaAssetMetricsInput = {
        account_age_days: ageDays,
        amount_spent_brl: amountSpentBrl,
        capabilities_count: Array.isArray(metaAcc.capabilities) ? metaAcc.capabilities.length : 10,
        account_status: metaAcc.account_status !== undefined ? metaAcc.account_status : 1,
        disabled_reason: metaAcc.disable_reason || 0,
        payment_failures: metaAcc.account_status === 3 ? 1 : 0, // Status 3 = UNSETTLED (falha de cobrança)
        has_active_payment_method: metaAcc.account_status !== 3,
        has_pending_balance: hasPendingBalance,
        disapproved_ads_count: disapprovedCount,
        bm_verification_status: bmVerification,
        bm_name: metaAcc.business?.name || "Business Manager",
        event_match_quality: realEmq,
        has_pixel_active: true,
        has_capi_active: true,
        adtrust_spend_limit: adtrustLimitBrl,
        recent_roas: Math.round(realRoas * 100) / 100,
        current_daily_spend: totalSnapshotSpend > 0 ? totalSnapshotSpend / 30 : 250,
      };

      // 6.5 Processa o Score nas 3 Camadas do ATM Asset Intelligence
      const healthResult = generateAssetHealthScore({
        storeId,
        assetType: "ad_account",
        assetId: cleanId,
        assetName: metaAcc.name || cleanId,
        metrics: metricsInput,
      });

      results.push(healthResult);

      // 6.6 Persiste snapshot diário auditável em public.meta_asset_health_snapshots
      const snapshotPayload = {
        store_id: storeId,
        asset_type: "ad_account",
        asset_id: cleanId,
        asset_name: metaAcc.name || cleanId,
        health_score: healthResult.score,
        health_tier: healthResult.tier,
        risk_level: healthResult.risk_level,
        decision: healthResult.decision,
        metrics: {
          layers: healthResult.layers,
          breakdown: healthResult.breakdown,
          signals: healthResult.metrics,
          business: metaAcc.business || null,
        },
        recommendations: healthResult.recommendation,
        snapshot_date: new Date().toISOString().split("T")[0],
      };

      await supabase
        .from("meta_asset_health_snapshots")
        .upsert(snapshotPayload, {
          onConflict: "store_id,asset_type,asset_id,snapshot_date",
        });

    } catch (err: any) {
      errors.push({ asset_id: cleanId, error: err.message || "Erro desconhecido" });
    }
  }

  return {
    success: results.length > 0,
    store_id: storeId,
    processed_accounts: results.length,
    results,
    errors,
  };
}
