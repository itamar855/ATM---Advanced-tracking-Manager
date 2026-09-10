/**
 * web/src/lib/intelligence/meta-asset-health-engine.ts
 *
 * ATM Asset Intelligence Engine™ (Fase 9.3)
 *
 * Motor de Inteligência de Ativos Meta Ads estruturado em 3 Camadas Reais:
 * - Camada 1 — Asset Trust Score (40%): Confiabilidade da conta, BM, idade, billing, compliance e Risk Recovery.
 * - Camada 2 — Delivery Power Score (30%): Poder de entrega no leilão, estabilidade de CPM, CTR decay, frequência e CAPI/Pixel.
 * - Camada 3 — Scaling Readiness Score (30%): Prontidão financeira e operacional para escala (ROAS, CPA, Margem de Lucro Real, Velocidade de Gasto).
 */

export interface MetaAssetMetricsInput {
  // Camada 1 — Trust & Maturidade
  account_age_days?: number;
  amount_spent_brl?: number;
  capabilities_count?: number;
  has_spend_cap?: boolean;
  account_status?: number; // 1 = Active, 2 = Disabled, 3 = Unsettled, 100 = Restricted
  disabled_reason?: number | boolean;
  payment_failures?: number;
  has_active_payment_method?: boolean;
  has_pending_balance?: boolean;
  disapproved_ads_count?: number;
  bm_verification_status?: "verified" | "unverified" | "not_applicable";
  bm_name?: string;

  // Novo Sinal FASE 9.3: Historical Risk Recovery
  days_without_billing_failures?: number; // Ex: >= 7 dias sem falhas
  days_without_ad_rejections?: number;    // Ex: >= 14 dias sem rejeições
  recent_incident_free_spend_brl?: number;

  // Camada 2 — Delivery Power & Dados
  event_match_quality?: number; // 0 - 100
  has_pixel_active?: boolean;
  has_capi_active?: boolean;
  cpm_historical_brl?: number;
  cpm_current_brl?: number;
  cpm_variation_percent?: number; // Novo Sinal FASE 9.3: <15% excelente, 15-30% alerta, >30% penalidade
  ctr_decay_percent?: number;     // Novo Sinal FASE 9.3: queda <10% saudável, 10-25% atenção, >25% fadiga
  frequency?: number;             // Novo Sinal FASE 9.3: <2.5 saudável, 2.5-4 atenção, >4 risco
  delivery_stability?: number;    // 0 - 100

  // Camada 3 — Scaling Readiness & Performance Real
  current_daily_spend?: number;
  historical_max_spend?: number;
  adtrust_spend_limit?: number;   // Teto diário imposto pela Meta
  recent_roas?: number;
  recent_cpa?: number;
  max_acceptable_cpa?: number;    // Novo Sinal FASE 9.3: CPA máximo tolerado pelo lojista
  unit_profit_brl?: number;       // Novo Sinal FASE 9.3: Margem/Lucro unitário do produto
  conversion_volume?: number;
  daily_spend_velocity_ratio?: number; // Novo Sinal FASE 9.3: Spend atual vs média histórica de 30d
}

export interface MetaAssetInput {
  storeId: string;
  assetType: "business_manager" | "ad_account" | "pixel" | "domain";
  assetId: string;
  assetName?: string;
  metrics: MetaAssetMetricsInput;
}

export type HealthTier = "critical" | "warning" | "healthy" | "excellent";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ScalingDecision = "SAFE_TO_SCALE" | "RESTRICTED_SCALE" | "DO_NOT_SCALE";

export interface MetaAssetHealthResult {
  asset_id: string;
  store_id: string;
  asset_type: string;
  asset_name: string;
  score: number; // Score Global ATM (0 - 100)
  tier: HealthTier;
  risk_level: RiskLevel;
  decision: ScalingDecision;
  layers: {
    trust_score: number;    // Camada 1 (40%)
    delivery_score: number; // Camada 2 (30%)
    scaling_score: number;  // Camada 3 (30%)
  };
  breakdown: {
    account_score: number;
    billing_score: number;
    compliance_score: number;
    risk_recovery_score: number;
    data_quality_score: number;
    cpm_stability_score: number;
    ctr_decay_score: number;
    frequency_pressure_score: number;
    profit_margin_score: number;
    spend_velocity_score: number;
  };
  metrics: {
    account_age_days: number;
    payment_failures: number;
    restrictions: number;
    emq: number;
    adtrust_spend_limit: number;
    recent_roas: number;
    recent_cpa: number;
    frequency: number;
  };
  recommendation: {
    allowed: boolean;
    max_budget_multiplier: number;
    max_daily_budget_percentage_increase: number;
    message: string;
  };
}

/**
 * 1. CAMADA 1 — ASSET TRUST SCORE (PESO 40%)
 * Incorpora: Maturidade (30%) + Billing (35%) + Compliance (30%) + Risk Recovery (5%)
 */
export function calculateTrustScore(metrics: MetaAssetMetricsInput): {
  score: number;
  accountScore: number;
  billingScore: number;
  complianceScore: number;
  riskRecoveryScore: number;
} {
  // A) Idade e Maturidade da Conta / BM (30%)
  const age = metrics.account_age_days || 0;
  const spent = metrics.amount_spent_brl || 0;
  let accountScore = 20;

  if (age >= 180) accountScore = 90;
  else if (age >= 90) accountScore = 75;
  else if (age >= 30) accountScore = 55;
  else if (age >= 7) accountScore = 35;

  if (spent >= 50000) accountScore += 10;
  else if (spent >= 5000) accountScore += 5;

  if (metrics.bm_verification_status === "verified") {
    accountScore = Math.min(100, accountScore + 10);
  }
  accountScore = Math.min(100, Math.max(0, accountScore));

  // B) Integridade de Billing / Pagamento (35%)
  const failures = metrics.payment_failures || 0;
  const hasPaymentMethod = metrics.has_active_payment_method ?? true;
  const hasPendingBalance = metrics.has_pending_balance ?? false;

  let billingScore = 100;
  if (failures >= 3) billingScore = 0;
  else if (failures === 2) billingScore = 30;
  else if (failures === 1) billingScore = 60;

  if (!hasPaymentMethod) billingScore = Math.min(billingScore, 20);
  if (hasPendingBalance) billingScore = Math.max(0, billingScore - 25);

  if (spent === 0 && age < 30) {
    billingScore = Math.min(billingScore, 65);
  }
  billingScore = Math.min(100, Math.max(0, billingScore));

  // C) Compliance & Restrições Meta (30%)
  const status = metrics.account_status ?? 1;
  const disabled = metrics.disabled_reason;
  const disapprovedAds = metrics.disapproved_ads_count || 0;

  let complianceScore = 100;
  if (status !== 1 || Boolean(disabled)) {
    complianceScore = 0;
  } else {
    if (disapprovedAds >= 3) complianceScore -= 50;
    else if (disapprovedAds >= 1) complianceScore -= 20;
  }
  complianceScore = Math.min(100, Math.max(0, complianceScore));

  // D) Historical Risk Recovery Score (5%)
  // Evita penalização eterna caso o ativo tenha operado sem incidentes nos últimos 7/14 dias
  let riskRecoveryScore = 70; // Padrão neutro
  const cleanBillingDays = metrics.days_without_billing_failures !== undefined 
    ? metrics.days_without_billing_failures 
    : Math.min(age, 14);
  const cleanAdDays = metrics.days_without_ad_rejections !== undefined 
    ? metrics.days_without_ad_rejections 
    : Math.min(age, 14);

  if (cleanBillingDays >= 7 && cleanAdDays >= 14 && status === 1 && age >= 14) {
    riskRecoveryScore = 100; // Totalmente recuperado e com maturidade
  } else if (cleanBillingDays < 7 || cleanAdDays < 7 || age < 7) {
    riskRecoveryScore = 40;  // Recuperação ainda frágil ou conta sem histórico mínimo
  }

  // Ponderação da Camada 1: 30% maturidade + 35% billing + 30% compliance + 5% risk recovery
  const trustScore = Math.round(
    accountScore * 0.30 +
    billingScore * 0.35 +
    complianceScore * 0.30 +
    riskRecoveryScore * 0.05
  );

  return {
    score: trustScore,
    accountScore,
    billingScore,
    complianceScore,
    riskRecoveryScore,
  };
}

/**
 * 2. CAMADA 2 — DELIVERY POWER SCORE (PESO 30%)
 * Incorpora: Dados/CAPI (35%) + CPM Stability (25%) + CTR Decay (20%) + Frequency Pressure (20%)
 */
export function calculateDeliveryPowerScore(metrics: MetaAssetMetricsInput): {
  score: number;
  dataQualityScore: number;
  cpmStabilityScore: number;
  ctrDecayScore: number;
  frequencyPressureScore: number;
} {
  // A) Qualidade de Dados (Pixel + CAPI EMQ)
  const emq = metrics.event_match_quality !== undefined ? metrics.event_match_quality : 70;
  const hasPixel = metrics.has_pixel_active ?? true;
  const hasCapi = metrics.has_capi_active ?? true;

  let dataQualityScore = emq;
  if (hasPixel && hasCapi) dataQualityScore = Math.min(100, dataQualityScore + 10);
  if (!hasPixel && !hasCapi) dataQualityScore = Math.max(0, dataQualityScore - 30);
  dataQualityScore = Math.min(100, Math.max(0, Math.round(dataQualityScore)));

  // B) CPM Stability Score: <15% variação = 100, 15-30% = 70, >30% = 35
  const isUntested = (metrics.amount_spent_brl === 0 && (metrics.account_age_days || 0) < 14);
  const cpmVar = metrics.cpm_variation_percent !== undefined ? Math.abs(metrics.cpm_variation_percent) : 10;
  let cpmStabilityScore = isUntested ? 60 : 100;
  if (!isUntested) {
    if (cpmVar > 30) cpmStabilityScore = 35;
    else if (cpmVar >= 15) cpmStabilityScore = 70;
  }

  // C) CTR Decay Score: queda <10% = 100, 10-25% = 60, >25% = 25
  const ctrDecay = metrics.ctr_decay_percent || 0;
  let ctrDecayScore = isUntested ? 60 : 100;
  if (!isUntested) {
    if (ctrDecay > 25) ctrDecayScore = 25;
    else if (ctrDecay >= 10) ctrDecayScore = 60;
  }

  // D) Frequency Pressure Score: <2.5 = 100, 2.5-4.0 = 60, >4.0 = 20
  const freq = metrics.frequency || 1.8;
  let frequencyPressureScore = isUntested ? 60 : 100;
  if (!isUntested) {
    if (freq > 4.0) frequencyPressureScore = 20;
    else if (freq >= 2.5) frequencyPressureScore = 60;
  }

  // Delivery Composto: 35% Dados + 25% CPM + 20% CTR Decay + 20% Frequency
  const deliveryScore = Math.round(
    dataQualityScore * 0.35 +
    cpmStabilityScore * 0.25 +
    ctrDecayScore * 0.20 +
    frequencyPressureScore * 0.20
  );

  return {
    score: deliveryScore,
    dataQualityScore,
    cpmStabilityScore,
    ctrDecayScore,
    frequencyPressureScore,
  };
}

/**
 * 3. CAMADA 3 — SCALING READINESS SCORE (PESO 30%)
 * Incorpora: ROAS/Volume (40%) + Profit Safety Margin (35%) + Spend Velocity (25%)
 */
export function calculateScalingReadinessScore(
  metrics: MetaAssetMetricsInput,
  trustScore: number
): {
  score: number;
  profitMarginScore: number;
  spendVelocityScore: number;
} {
  const currentSpend = metrics.current_daily_spend || 0;
  const historicalMax = metrics.historical_max_spend || currentSpend || 100;
  const adtrustLimit = metrics.adtrust_spend_limit || 0;
  const roas = metrics.recent_roas !== undefined ? metrics.recent_roas : 1.5;
  const age = metrics.account_age_days || 0;
  const spent = metrics.amount_spent_brl || 0;

  // A) ROAS e Volume Base (40%)
  let roasBaseScore = 70;
  if (age < 14 || spent === 0) {
    roasBaseScore = 35;
  } else if (roas >= 2.5) {
    roasBaseScore += 25;
  } else if (roas >= 1.5) {
    roasBaseScore += 10;
  } else if (roas < 1.0 && roas > 0) {
    roasBaseScore -= 40;
  }
  roasBaseScore = Math.min(100, Math.max(0, roasBaseScore));

  // B) Profit Safety Margin Score (35%)
  // Lucro unitário vs CPA atual vs CPA máximo tolerado
  const currentCpa = metrics.recent_cpa || 0;
  const maxCpa = metrics.max_acceptable_cpa || 0;
  let profitMarginScore = 75; // Padrão se CPA máximo não estiver configurado

  if (maxCpa > 0 && currentCpa > 0) {
    if (currentCpa > maxCpa) {
      profitMarginScore = 20; // Prejuízo direto por pedido
    } else if (currentCpa <= maxCpa * 0.7) {
      profitMarginScore = 100; // Margem de segurança excelente (>= 30% folga)
    } else {
      profitMarginScore = 65; // Dentro da margem aceitável
    }
  }

  // C) Historical Spend Velocity Score (25%)
  // Avalia aceleração gradual vs choque de orçamento
  const velocityRatio = metrics.daily_spend_velocity_ratio || (historicalMax > 0 && currentSpend > 0 ? currentSpend / historicalMax : 1.0);
  let spendVelocityScore = 80;

  if (velocityRatio > 2.5) {
    spendVelocityScore = 30; // Choque excessivo de orçamento (tentativa de triplicar gasto de forma abrupta)
  } else if (velocityRatio > 1.5) {
    spendVelocityScore = 60; // Aceleração rápida
  } else {
    spendVelocityScore = 95; // Aceleração suave e madura
  }

  // Limite da Meta (adtrust_spend_limit)
  if (adtrustLimit > 0 && currentSpend >= adtrustLimit * 0.9) {
    roasBaseScore = Math.max(0, roasBaseScore - 30);
  }

  // Trava de segurança: se o Trust é baixo (< 60), Scaling Readiness é limitado
  let finalScaling = Math.round(
    roasBaseScore * 0.40 +
    profitMarginScore * 0.35 +
    spendVelocityScore * 0.25
  );

  if (trustScore < 60) {
    finalScaling = Math.min(finalScaling, 35);
  }

  finalScaling = Math.min(100, Math.max(0, finalScaling));

  return {
    score: finalScaling,
    profitMarginScore,
    spendVelocityScore,
  };
}

/**
 * Função Principal: ATM Asset Intelligence Score™
 */
export function generateAssetHealthScore(input: MetaAssetInput): MetaAssetHealthResult {
  const { storeId, assetType, assetId, assetName, metrics } = input;

  const trustResult = calculateTrustScore(metrics);
  const deliveryResult = calculateDeliveryPowerScore(metrics);
  const scalingResult = calculateScalingReadinessScore(metrics, trustResult.score);

  const trustScore = trustResult.score;
  const deliveryScore = deliveryResult.score;
  const scalingScore = scalingResult.score;

  // Ponderação Global: 40% Trust + 30% Delivery + 30% Scaling
  let finalScore = Math.round(
    trustScore * 0.40 +
    deliveryScore * 0.30 +
    scalingScore * 0.30
  );

  const isRestricted = (metrics.account_status ?? 1) !== 1 || Boolean(metrics.disabled_reason);
  const failures = metrics.payment_failures || 0;
  const isCpaBreached = Boolean(
    metrics.max_acceptable_cpa &&
    metrics.recent_cpa &&
    metrics.recent_cpa > metrics.max_acceptable_cpa
  );
  const isCpmExploding = (metrics.cpm_variation_percent || 0) > 30;

  let tier: HealthTier = "excellent";
  let riskLevel: RiskLevel = "low";
  let decision: ScalingDecision = "SAFE_TO_SCALE";
  let allowed = true;
  let maxMultiplier = 3;
  let maxPercentageIncrease = 30; // +30% diário
  let message = "Asset approved for controlled scaling (+30% daily).";

  // Trava 1: Bloqueio / Restrição Meta
  if (isRestricted) {
    finalScore = Math.min(finalScore, 20);
    tier = "critical";
    riskLevel = "critical";
    decision = "DO_NOT_SCALE";
    allowed = false;
    maxMultiplier = 0;
    maxPercentageIncrease = 0;
    message = "Asset restricted or disabled by Meta. Scaling blocked immediately.";
  }
  // Trava 2: Falhas Críticas de Billing (3+ falhas)
  else if (failures >= 3) {
    finalScore = Math.min(finalScore, 35);
    tier = "critical";
    riskLevel = "critical";
    decision = "DO_NOT_SCALE";
    allowed = false;
    maxMultiplier = 0;
    maxPercentageIncrease = 0;
    message = "Critical billing failures detected (3+ failed payments). Scaling blocked.";
  }
  // Trava 3: Violação de CPA Máximo ou ROAS abaixo de 0.8
  else if (isCpaBreached || (metrics.recent_roas !== undefined && metrics.recent_roas < 0.8 && metrics.recent_roas > 0)) {
    tier = "critical";
    riskLevel = "high";
    decision = "DO_NOT_SCALE";
    allowed = false;
    maxMultiplier = 0;
    maxPercentageIncrease = 0;
    message = "Financial safety threshold breached: CPA above acceptable limit or severe ROAS decay.";
  }
  // Trava 4: CPM Explodindo no Leilão (> 30%) ou Risco Moderado
  else if (isCpmExploding || failures >= 1 || finalScore < 85) {
    tier = finalScore >= 65 ? "healthy" : "warning";
    riskLevel = failures >= 1 ? "high" : "medium";
    decision = "RESTRICTED_SCALE";
    allowed = true;
    maxMultiplier = 1.5;
    maxPercentageIncrease = 15; // Limitado a no máximo +15% diário
    message = isCpmExploding
      ? "Auction CPM spike (>30%) detected. Scaling restricted to max +15% daily."
      : "Asset requires controlled scaling. Capped at max +15% daily.";
  }
  // Aprovado Pleno (SAFE_TO_SCALE)
  else {
    tier = "excellent";
    riskLevel = "low";
    decision = "SAFE_TO_SCALE";
    allowed = true;
    maxMultiplier = 3;
    maxPercentageIncrease = 30;
    message = "Asset in prime health across all 3 layers. Approved for up to +30% daily scaling.";
  }

  return {
    asset_id: assetId,
    store_id: storeId,
    asset_type: assetType,
    asset_name: assetName || assetId,
    score: finalScore,
    tier,
    risk_level: riskLevel,
    decision,
    layers: {
      trust_score: trustScore,
      delivery_score: deliveryScore,
      scaling_score: scalingScore,
    },
    breakdown: {
      account_score: trustResult.accountScore,
      billing_score: trustResult.billingScore,
      compliance_score: trustResult.complianceScore,
      risk_recovery_score: trustResult.riskRecoveryScore,
      data_quality_score: deliveryResult.dataQualityScore,
      cpm_stability_score: deliveryResult.cpmStabilityScore,
      ctr_decay_score: deliveryResult.ctrDecayScore,
      frequency_pressure_score: deliveryResult.frequencyPressureScore,
      profit_margin_score: scalingResult.profitMarginScore,
      spend_velocity_score: scalingResult.spendVelocityScore,
    },
    metrics: {
      account_age_days: metrics.account_age_days || 0,
      payment_failures: failures,
      restrictions: isRestricted ? 1 : 0,
      emq: metrics.event_match_quality || 0,
      adtrust_spend_limit: metrics.adtrust_spend_limit || 0,
      recent_roas: metrics.recent_roas || 0,
      recent_cpa: metrics.recent_cpa || 0,
      frequency: metrics.frequency || 1.8,
    },
    recommendation: {
      allowed,
      max_budget_multiplier: maxMultiplier,
      max_daily_budget_percentage_increase: maxPercentageIncrease,
      message,
    },
  };
}

// Funções legadas preservadas
export function calculateAccountAgeScore(metrics: MetaAssetMetricsInput): number {
  return calculateTrustScore(metrics).accountScore;
}
export function calculateBillingScore(metrics: MetaAssetMetricsInput): number {
  return calculateTrustScore(metrics).billingScore;
}
export function calculateRestrictionScore(metrics: MetaAssetMetricsInput): number {
  return calculateTrustScore(metrics).complianceScore;
}
export function calculateEventQualityScore(metrics: MetaAssetMetricsInput): number {
  return calculateDeliveryPowerScore(metrics).dataQualityScore;
}
export function calculateScalingCapacity(metrics: MetaAssetMetricsInput, baseScore: number): number {
  return calculateScalingReadinessScore(metrics, baseScore).score;
}
