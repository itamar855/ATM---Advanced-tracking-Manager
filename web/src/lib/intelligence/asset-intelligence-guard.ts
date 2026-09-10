/**
 * web/src/lib/intelligence/asset-intelligence-guard.ts
 *
 * ATM Asset Intelligence Guard™ (Fase 9.3)
 *
 * Camada Obrigatória de Proteção e Autorização de Ações de Escala
 *
 * Governança:
 * 1. O Guard NÃO impede o registro de ações recomendadas pelo Campaign Action Engine;
 *    ele atua antes da execução (Execution Layer).
 * 2. Se APPROVED: Ação autorizada com teto de até +30% diário.
 * 3. Se RESTRICTED: Ação autorizada com poda de segurança para no máximo +15% diário.
 * 4. Se BLOCKED: Ação bloqueada para proteger capital, com motivos auditáveis registrados.
 */

import { createClient } from "@supabase/supabase-js";
import {
  generateAssetHealthScore,
  type MetaAssetHealthResult,
  type MetaAssetMetricsInput,
} from "./meta-asset-health-engine";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export interface AssetGuardActionInput {
  store_id: string;
  campaign_id: string;
  campaign_name?: string;
  action_type: string;
  ad_account_id?: string;
  requested_increase_percent?: number;
  // Opcional: Métricas fornecidas diretamente (para testes e simulação direta)
  simulated_metrics?: MetaAssetMetricsInput;
}

export interface AssetGuardDecision {
  allowed: boolean;
  decision: "APPROVED" | "RESTRICTED" | "BLOCKED";
  max_allowed_increase: number;
  reasons: string[];
  health_summary: {
    asset_id: string;
    score: number;
    tier: string;
    trust_score: number;
    delivery_score: number;
    scaling_score: number;
  };
}

/**
 * Avalia se uma ação de campanha (aumento de orçamento, escala) tem autorização do Guard.
 */
export async function evaluateAssetGuardAction(
  input: AssetGuardActionInput
): Promise<AssetGuardDecision> {
  const {
    store_id,
    campaign_id,
    action_type,
    ad_account_id = "default_account",
    requested_increase_percent = 20,
    simulated_metrics,
  } = input;

  let healthResult: MetaAssetHealthResult;

  if (simulated_metrics) {
    // Modo simulação / teste direto
    healthResult = generateAssetHealthScore({
      storeId: store_id,
      assetType: "ad_account",
      assetId: ad_account_id,
      metrics: simulated_metrics,
    });
  } else {
    // Consulta snapshot mais recente em public.meta_asset_health_snapshots
    const supabase = getAdminClient();
    const today = new Date().toISOString().split("T")[0];

    let { data: snapshot } = await supabase
      .from("meta_asset_health_snapshots")
      .select("*")
      .eq("store_id", store_id)
      .eq("asset_id", ad_account_id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshot && snapshot.metrics?.layers) {
      healthResult = {
        asset_id: snapshot.asset_id,
        store_id: snapshot.store_id,
        asset_type: snapshot.asset_type,
        asset_name: snapshot.asset_name || ad_account_id,
        score: snapshot.health_score,
        tier: snapshot.health_tier,
        risk_level: snapshot.risk_level,
        decision: snapshot.decision,
        layers: snapshot.metrics.layers,
        breakdown: snapshot.metrics.breakdown,
        metrics: snapshot.metrics.signals,
        recommendation: snapshot.recommendations,
      };
    } else {
      // Fallback seguro: computa score padrão conservador caso ainda não haja snapshot sincronizado
      healthResult = generateAssetHealthScore({
        storeId: store_id,
        assetType: "ad_account",
        assetId: ad_account_id,
        metrics: {
          account_age_days: 120,
          account_status: 1,
          event_match_quality: 85,
          recent_roas: 1.8,
        },
      });
    }
  }

  const reasons: string[] = [];
  const score = healthResult.score;
  const trust = healthResult.layers.trust_score;
  const delivery = healthResult.layers.delivery_score;
  const scaling = healthResult.layers.scaling_score;
  const failures = healthResult.metrics.payment_failures;
  const restrictions = healthResult.metrics.restrictions;

  // Se não for ação de aumento/escala de orçamento (ex: PAUSE, REDUCE), o Guard libera
  const isScalingAction =
    action_type === "SCALE_BUDGET_PERCENT" ||
    action_type === "INCREASE_BUDGET" ||
    action_type === "SET_EXACT_BUDGET";

  if (!isScalingAction) {
    return {
      allowed: true,
      decision: "APPROVED",
      max_allowed_increase: 0,
      reasons: ["Non-scaling action (protection or reduction) automatically permitted."],
      health_summary: {
        asset_id: healthResult.asset_id,
        score,
        tier: healthResult.tier,
        trust_score: trust,
        delivery_score: delivery,
        scaling_score: scaling,
      },
    };
  }

  // REGRAS OBRIGATÓRIAS DO ASSET INTELLIGENCE GUARD

  // 1. Condições de Bloqueio (DO_NOT_SCALE / BLOCKED)
  if (failures > 0) {
    reasons.push(`Billing risk detected: ${failures} payment failure(s) on record.`);
  }
  if (restrictions > 0) {
    reasons.push("Account restricted or disabled by Meta policy violation.");
  }
  if (score < 65) {
    reasons.push(`Asset Intelligence Score (${score}) is below safe scaling threshold (65).`);
  }
  if (scaling < 50) {
    reasons.push(`Scaling Readiness Score (${scaling}) indicates weak unit economics or negative margin.`);
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      decision: "BLOCKED",
      max_allowed_increase: 0,
      reasons,
      health_summary: {
        asset_id: healthResult.asset_id,
        score,
        tier: healthResult.tier,
        trust_score: trust,
        delivery_score: delivery,
        scaling_score: scaling,
      },
    };
  }

  // 2. Condições de Escala Restrita (RESTRICTED_SCALE: 65 - 84 pontos ou alerta de leilão)
  const isCpmSpike = healthResult.breakdown.cpm_stability_score <= 35;
  const isRestrictedRange = score >= 65 && score < 85;
  const isTrustMarginal = trust < 80;
  const isScalingMarginal = scaling < 80;

  if (isCpmSpike || isRestrictedRange || isTrustMarginal || isScalingMarginal) {
    if (isCpmSpike) {
      reasons.push("Auction CPM spike (>30%) detected. Scale restricted to max +15% daily.");
    }
    if (isRestrictedRange) {
      reasons.push(`Asset score (${score}) within observation range (65-84). Budget increase capped at +15%.`);
    }
    if (isTrustMarginal || isScalingMarginal) {
      reasons.push("Trust or Scaling score below 80. Restricted scale enforced.");
    }

    return {
      allowed: true,
      decision: "RESTRICTED",
      max_allowed_increase: 15,
      reasons,
      health_summary: {
        asset_id: healthResult.asset_id,
        score,
        tier: healthResult.tier,
        trust_score: trust,
        delivery_score: delivery,
        scaling_score: scaling,
      },
    };
  }

  // 3. Condições de Escala Segura (SAFE_TO_SCALE: Score >= 85, Trust >= 80, Scaling >= 80)
  return {
    allowed: true,
    decision: "APPROVED",
    max_allowed_increase: 30,
    reasons: ["Asset meets all prime health criteria (Score >= 85, Trust >= 80, Scaling >= 80). Full scale approved (+30% daily)."],
    health_summary: {
      asset_id: healthResult.asset_id,
      score,
      tier: healthResult.tier,
      trust_score: trust,
      delivery_score: delivery,
      scaling_score: scaling,
    },
  };
}
