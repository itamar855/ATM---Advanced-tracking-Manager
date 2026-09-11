/**
 * web/src/lib/intelligence/campaign-intelligence-bridge.ts
 *
 * ATM Campaign Intelligence Bridge™ (Fase 10.1 — Copilot Mode)
 *
 * Camada intermediária que conecta a inteligência financeira (Campaign Profit Engine)
 * com a saúde jurídica/operacional dos ativos (Meta Asset Intelligence Guard)
 * para gerar recomendações auditáveis assistidas com requires_approval=true.
 * 
 * Regras Estritas:
 * - Zero chamadas de escrita na Meta Graph API
 * - Zero execução autônoma (Modo Copilot)
 * - Tri-Fator Confidence Score (50% profit + 30% asset + 20% data maturity) com salvamento de componentes em evidence_json
 * - Recommendation Cooldown via recommendation_hash (store_id + campaign_id + action + budget_change + janela 24h)
 * - Governança de Asset Guard via asset_permission (SAFE >= 85, RESTRICTED 70-84, BLOCKED < 70)
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

function getDefaultAdminClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export type BridgeAction =
  | "SCALE_BUDGET_PERCENT"
  | "REDUCE_BUDGET_PERCENT"
  | "PAUSE_CAMPAIGN"
  | "NO_ACTION";

export type AssetPermission = "SAFE" | "RESTRICTED" | "BLOCKED";

export type RecommendationStatus =
  | "created"
  | "pending_review"
  | "approved"
  | "rejected"
  | "executed";

export interface ConfidenceComponents {
  profit_score: number;
  profit_weight: number; // 0.50
  profit_contribution: number;

  asset_health_score: number;
  asset_weight: number; // 0.30
  asset_contribution: number;

  data_maturity_score: 40 | 70 | 100;
  data_maturity_weight: number; // 0.20
  data_maturity_contribution: number;

  total_confidence_score: number;
}

export interface CampaignMetricsInput {
  orders: number;
  spend_brl: number;
  revenue_brl: number;
  cpa: number;
  max_acceptable_cpa: number;
  roas: number;
  roi: number;
  profit: number;
  learning_phase?: boolean;
  cooldown_active?: boolean;
  last_scale_timestamp?: string;
}

export interface AutomationSettingsInput {
  max_daily_budget_change?: number;
  max_budget_increase_percent?: number;
  max_budget_decrease_percent?: number;
  cooldown_hours?: number;
  kill_switch?: boolean;
}

export interface CampaignBridgeInput {
  store_id: string;
  campaign_id: string;
  campaign_name?: string;
  ad_account_id?: string;
  date_window?: string; // YYYY-MM-DD (padrão: hoje)

  profit_score: number; // 0 - 100 (do Campaign Profit Engine)
  recommended_action: "SCALE" | "MAINTAIN" | "REDUCE" | "PAUSE";
  suggested_budget_change?: number; // ex: +30, +20, -20, 0, -100

  asset_health_score: number; // 0 - 100 (do Meta Asset Intelligence Guard)
  asset_tier?: string;        // "excellent" | "healthy" | "warning" | "critical"

  campaign_metrics: CampaignMetricsInput;
  automation_settings?: AutomationSettingsInput;
}

export interface BridgeDecisionResult {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  action: BridgeAction;
  budget_change_percent: number;
  asset_permission: AssetPermission;
  confidence_score: number;
  data_maturity_score: 40 | 70 | 100;
  confidence_components: ConfidenceComponents;
  reason: string;
  recommendation_hash: string;
  dedupe_key: string;
  requires_approval: true;
  status: RecommendationStatus;
  blocked_by_asset_guard: boolean;
  restricted_by_guard: boolean;
  evidence: {
    profit_score: number;
    asset_health_score: number;
    asset_permission: AssetPermission;
    data_maturity_score: number;
    confidence_components: ConfidenceComponents;
    orders: number;
    spend_brl: number;
    revenue_brl: number;
    cpa: number;
    cpa_limit: number;
    roi: number;
    roas: number;
    profit: number;
    learning_phase: boolean;
    cooldown_active: boolean;
    kill_switch_active: boolean;
  };
}

/**
 * 1. Calcula a maturidade estatística com base no volume de conversões
 * orders < 5: 40 pts
 * orders >= 5 e <= 20: 70 pts
 * orders > 20: 100 pts
 */
export function calculateDataMaturityScore(orders: number): 40 | 70 | 100 {
  const safeOrders = Math.max(0, Number(orders) || 0);
  if (safeOrders < 5) return 40;
  if (safeOrders <= 20) return 70;
  return 100;
}

/**
 * 2. Calcula o Confidence Score ponderado Tri-Fator e seus componentes detalhados:
 * 50% profit_score + 30% asset_health_score + 20% data_maturity_score
 */
export function calculateConfidenceDetails(
  profit_score: number,
  asset_health_score: number,
  data_maturity_score: 40 | 70 | 100
): { score: number; components: ConfidenceComponents } {
  const pScore = Math.min(100, Math.max(0, Number(profit_score) || 0));
  const aScore = Math.min(100, Math.max(0, Number(asset_health_score) || 0));
  const dScore = data_maturity_score;

  const profit_contribution = Math.round(pScore * 0.50 * 100) / 100;
  const asset_contribution = Math.round(aScore * 0.30 * 100) / 100;
  const data_maturity_contribution = Math.round(dScore * 0.20 * 100) / 100;

  const total = Math.min(100, Math.max(0, Math.round(profit_contribution + asset_contribution + data_maturity_contribution)));

  return {
    score: total,
    components: {
      profit_score: pScore,
      profit_weight: 0.50,
      profit_contribution,
      asset_health_score: aScore,
      asset_weight: 0.30,
      asset_contribution,
      data_maturity_score: dScore,
      data_maturity_weight: 0.20,
      data_maturity_contribution,
      total_confidence_score: total,
    },
  };
}

/**
 * Atalho conveniente para calcular apenas o valor numérico do Confidence Score (0-100)
 */
export function calculateConfidenceScore(
  profit_score: number,
  asset_health_score: number,
  data_maturity_score: 40 | 70 | 100
): number {
  return calculateConfidenceDetails(profit_score, asset_health_score, data_maturity_score).score;
}

/**
 * 3. Gera hash determinístico único para deduplicação e cooldown de 24h:
 * store_id + campaign_id + action + budget_change_percent + janela de 24 horas
 */
export function generateRecommendationHash(
  storeId: string,
  campaignId: string,
  action: BridgeAction,
  budgetChangePercent: number,
  dateWindow?: string
): string {
  const window = dateWindow || new Date().toISOString().split("T")[0];
  return `${storeId}:${campaignId}:${action}:${budgetChangePercent}:${window}`;
}

/**
 * Alias compatível para dedupe key
 */
export function generateDedupeKey(
  storeId: string,
  campaignId: string,
  action: BridgeAction,
  dateWindow?: string
): string {
  const window = dateWindow || new Date().toISOString().split("T")[0];
  return `${storeId}:${campaignId}:${action}:${window}`;
}

/**
 * 4. Avalia e orquestra a recomendação analítica do Copilot (Campaign Intelligence Bridge)
 */
export function evaluateCampaignBridge(input: CampaignBridgeInput): BridgeDecisionResult {
  const {
    store_id,
    campaign_id,
    campaign_name = `Campaign ${campaign_id}`,
    profit_score,
    recommended_action,
    suggested_budget_change = 0,
    asset_health_score,
    campaign_metrics,
    automation_settings,
    date_window,
  } = input;

  const orders = Math.max(0, Number(campaign_metrics.orders) || 0);
  const spend_brl = Math.max(0, Number(campaign_metrics.spend_brl) || 0);
  const revenue_brl = Math.max(0, Number(campaign_metrics.revenue_brl) || 0);
  const cpa = Math.max(0, Number(campaign_metrics.cpa) || 0);
  const max_cpa = Math.max(1, Number(campaign_metrics.max_acceptable_cpa) || 60);
  const roi = Number(campaign_metrics.roi) || 0;
  const roas = Number(campaign_metrics.roas) || 0;
  const profit = Number(campaign_metrics.profit) || 0;
  const cooldown_active = Boolean(campaign_metrics.cooldown_active);
  const kill_switch_active = Boolean(automation_settings?.kill_switch);

  // 1. Cálculo da Maturidade de Dados e Confidence Score Tri-Fator com Detalhamento
  const data_maturity_score = calculateDataMaturityScore(orders);
  const { score: confidence_score, components: confidence_components } = calculateConfidenceDetails(
    profit_score,
    asset_health_score,
    data_maturity_score
  );

  // 2. Classificação de Segurança do Ativo (Meta Asset Intelligence Guard)
  // SAFE: asset_score >= 85 (permite SCALE normal)
  // RESTRICTED: asset_score 70-84 (permite somente escala conservadora)
  // BLOCKED: asset_score < 70 (impede qualquer escala)
  let asset_permission: AssetPermission = "BLOCKED";
  if (asset_health_score >= 85) {
    asset_permission = "SAFE";
  } else if (asset_health_score >= 70) {
    asset_permission = "RESTRICTED";
  } else {
    asset_permission = "BLOCKED";
  }

  // 3. Verificação de Aprendizado (Learning Phase)
  const isLearningPhase = orders === 0 && spend_brl < 1.5 * max_cpa;

  // Variáveis de decisão final
  let action: BridgeAction = "NO_ACTION";
  let budget_change_percent = 0;
  let reason = "";
  let blocked_by_asset_guard = false;
  let restricted_by_guard = false;

  // -------------------------------------------------------------
  // HIERARQUIA DE PRIORIDADES DO COPILOT
  // -------------------------------------------------------------

  // REGRA ZERO: Kill Switch da Loja
  if (kill_switch_active) {
    action = "NO_ACTION";
    budget_change_percent = 0;
    reason = "KILL_SWITCH_ACTIVE: Botão de emergência acionado para esta loja. Recomendações suspensas.";
  }
  // PRIORIDADE 1: Learning Phase Protection (Sobrescreve qualquer score negativo)
  else if (isLearningPhase) {
    action = "NO_ACTION";
    budget_change_percent = 0;
    reason = `LEARNING_PHASE_PROTECTION: Campanha em fase exploratória de entrega. Gasto atual (R$ ${spend_brl.toFixed(2)}) abaixo de 1.5x CPA alvo (R$ ${(1.5 * max_cpa).toFixed(2)}). Nenhuma alteração recomendada.`;
  }
  // PRIORIDADE 2: Tentativa de Escala (SCALE)
  else if (profit_score >= 85 || recommended_action === "SCALE") {
    // 2.1 Scale Volume Gate: Exigir obrigatoriamente orders >= 5
    if (orders < 5) {
      action = "NO_ACTION";
      budget_change_percent = 0;
      reason = `INSUFFICIENT_CONVERSION_VOLUME: Performance excelente (Score ${profit_score}/100, ROI ${(roi * 100).toFixed(0)}%), porém volume de apenas ${orders} pedido(s). Mínimo de 5 conversões exigido para autorizar escala.`;
    }
    // 2.2 Cooldown Guard: Verificar se está em cooldown algorítmico
    else if (cooldown_active) {
      action = "NO_ACTION";
      budget_change_percent = 0;
      reason = "COOLDOWN_ACTIVE: Campanha já ajustada nas últimas 24 horas. Aguardar consolidação antes de novo aumento.";
    }
    // 2.3 Asset Guard Check: Avaliar permissão do ativo Meta
    else if (asset_permission === "BLOCKED") {
      action = "NO_ACTION";
      budget_change_percent = 0;
      blocked_by_asset_guard = true;
      reason = `BLOCKED_BY_ASSET_GUARD: Campanha lucrativa (Score ${profit_score}/100), mas ativo Meta em estado BLOCKED (Health Score ${asset_health_score}/100 < 70). Escala barrada para proteger a integridade da conta.`;
    } else if (asset_permission === "RESTRICTED") {
      action = "SCALE_BUDGET_PERCENT";
      restricted_by_guard = true;
      // Poda de segurança: permite somente escala conservadora (máximo +15% diário)
      const rawRequested = suggested_budget_change > 0 ? suggested_budget_change : 20;
      budget_change_percent = Math.min(15, rawRequested);
      reason = `RESTRICTED_SCALE: Ativo Meta em permissão RESTRICTED (Health Score ${asset_health_score}/100). Escala autorizada exclusivamente no modo conservador (+${budget_change_percent}% diário).`;
    } else {
      // asset_permission === "SAFE" (Saúde excelente >= 85: permite SCALE normal)
      action = "SCALE_BUDGET_PERCENT";
      const isSuperStar = profit_score >= 92 && cpa <= max_cpa * 0.70 && orders >= 10 && roi >= 0.50;
      budget_change_percent = isSuperStar ? 30 : (suggested_budget_change > 0 ? suggested_budget_change : 20);
      reason = `SCALE_APPROVED: Campanha de alta performance (Score ${profit_score}/100) com ativo em estado SAFE (Health Score ${asset_health_score}/100). Recomendado aumento normal de +${budget_change_percent}% de orçamento.`;
    }
  }
  // PRIORIDADE 3: Tentativa de Redução ou Pausa (RED TIER)
  else if (profit_score < 70 || recommended_action === "REDUCE" || recommended_action === "PAUSE") {
    // 3.1 Verificação estrita de Sangramento Financeiro para PAUSE
    const isConfirmedBleeding =
      (orders === 0 && spend_brl >= 1.5 * max_cpa) ||
      (profit < 0 && (roi <= -0.30 || cpa >= 1.4 * max_cpa));

    if (isConfirmedBleeding && profit_score < 50) {
      action = "PAUSE_CAMPAIGN";
      budget_change_percent = -100;
      reason = `PAUSE_CONFIRMED_BLEEDING: Alerta crítico de sangramento financeiro (Score ${profit_score}/100). Prejuízo de R$ ${Math.abs(profit).toFixed(2)} com CPA ${orders === 0 ? `sem vendas após consumir R$ ${spend_brl.toFixed(2)} (>= 1.5x CPA)` : `descontrolado a R$ ${cpa.toFixed(2)}`}. Pausa recomendada.`;
    } else {
      // Score entre 50 e 69 ou déficit não extremo: REDUCE suave (-20%)
      action = "REDUCE_BUDGET_PERCENT";
      budget_change_percent = -20;
      reason = `REDUCE_BUDGET: Eficiência abaixo da meta (Score ${profit_score}/100, CPA R$ ${cpa.toFixed(2)} vs Teto R$ ${max_cpa.toFixed(2)}). Redução preventiva de 20% no orçamento recomendada para contenção de margem.`;
    }
  }
  // PRIORIDADE 4: Faixa Neutra / Equilíbrio (YELLOW: 70 a 84)
  else {
    action = "NO_ACTION";
    budget_change_percent = 0;
    reason = `MAINTAIN_STABLE: Campanha operando na faixa de estabilidade (Score ${profit_score}/100, ROAS ${roas.toFixed(2)}x). Manter orçamento e continuar observando volume.`;
  }

  // Gera hash e dedupe_key determinísticos de 24h
  const recommendation_hash = generateRecommendationHash(
    store_id,
    campaign_id,
    action,
    budget_change_percent,
    date_window
  );
  const dedupe_key = generateDedupeKey(store_id, campaign_id, action, date_window);

  return {
    store_id,
    campaign_id,
    campaign_name,
    action,
    budget_change_percent,
    asset_permission,
    confidence_score,
    data_maturity_score,
    confidence_components,
    reason,
    recommendation_hash,
    dedupe_key,
    requires_approval: true,
    status: "pending_review",
    blocked_by_asset_guard,
    restricted_by_guard,
    evidence: {
      profit_score,
      asset_health_score,
      asset_permission,
      data_maturity_score,
      confidence_components,
      orders,
      spend_brl,
      revenue_brl,
      cpa,
      cpa_limit: max_cpa,
      roi,
      roas,
      profit,
      learning_phase: isLearningPhase,
      cooldown_active,
      kill_switch_active,
    },
  };
}

/**
 * Persiste a recomendação do Copilot na tabela public.campaign_intelligence_recommendations
 * Bloqueia inserções duplicadas se recommendation_hash já existir dentro da janela de 24h.
 */
export async function persistBridgeRecommendation(
  result: BridgeDecisionResult,
  customSupabase?: any
): Promise<{ success: boolean; id?: string; deduped?: boolean; skipped?: boolean; error?: string }> {
  try {
    const supabase = customSupabase || getDefaultAdminClient();

    // Recommendation Cooldown Check: Se existir recomendação idêntica na janela, NÃO cria novo registro
    // 1. Checagem direta por recommendation_hash
    const { data: existingHash } = await supabase
      .from("campaign_intelligence_recommendations")
      .select("id, status")
      .eq("recommendation_hash", result.recommendation_hash)
      .maybeSingle();

    if (existingHash) {
      return { success: true, id: existingHash.id, deduped: true, skipped: true };
    }

    // 2. Checagem por janela móvel de 24 horas
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing24h } = await supabase
      .from("campaign_intelligence_recommendations")
      .select("id, status")
      .eq("store_id", result.store_id)
      .eq("campaign_id", result.campaign_id)
      .eq("action", result.action)
      .eq("budget_change_percent", result.budget_change_percent)
      .gte("created_at", twentyFourHoursAgo)
      .maybeSingle();

    if (existing24h) {
      return { success: true, id: existing24h.id, deduped: true, skipped: true };
    }

    const payload = {
      store_id: result.store_id,
      campaign_id: result.campaign_id,
      campaign_name: result.campaign_name,
      action: result.action,
      budget_change_percent: result.budget_change_percent,
      asset_permission: result.asset_permission,
      confidence_score: result.confidence_score,
      data_maturity_score: result.data_maturity_score,
      reason: result.reason,
      evidence_json: result.evidence,
      recommendation_hash: result.recommendation_hash,
      dedupe_key: result.dedupe_key,
      status: result.status,
      requires_approval: result.requires_approval,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("campaign_intelligence_recommendations")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error) {
      // Se houver concorrência simultânea colidindo no hash único
      if (error.code === "23505" || error.message?.includes("unique")) {
        return { success: true, deduped: true, skipped: true };
      }
      console.error("[CampaignIntelligenceBridge] Erro ao persistir recomendação:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[CampaignIntelligenceBridge] Exceção ao persistir recomendação:", err?.message);
    return { success: false, error: err?.message || "Unknown error" };
  }
}
