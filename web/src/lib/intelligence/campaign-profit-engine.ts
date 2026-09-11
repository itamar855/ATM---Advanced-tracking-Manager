/**
 * web/src/lib/intelligence/campaign-profit-engine.ts
 *
 * ATM Campaign Profit Intelligence Layer™ (Fase 10)
 *
 * Motor contábil e de inteligência para normalização cambial e auditoria
 * de rentabilidade por campanha publicitária:
 * 
 * - CAMADA 1: Currency Normalization Engine (USD/Moedas -> BRL com câmbio congelado)
 * - CAMADA 2: Campaign Profit Score (5 Pilares Contábeis Ponderados: 0 a 100)
 * - CAMADA 3: Financial Decision Ready API (SCALE, MAINTAIN, REDUCE, PAUSE + % Orçamento)
 */

import { getUsdBrlRate, convertToBrl } from "@/lib/currency";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

function getDefaultAdminClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export type ProfitTier = "GREEN" | "YELLOW" | "RED";
export type RecommendedAction = "SCALE" | "MAINTAIN" | "REDUCE" | "PAUSE";

export interface NormalizedSpendResult {
  spend_original: number;
  currency_original: string;
  spend_usd: number;
  spend_brl: number;
  exchange_rate: number;
  conversion_timestamp: string;
}

export interface CampaignProfitInput {
  store_id: string;
  campaign_id: string;
  campaign_name?: string;
  date?: string; // YYYY-MM-DD (padrão: hoje)

  // Mídia e Moeda Original
  spend_original: number;
  currency_original?: string; // "USD", "BRL", etc. (padrão: "BRL")
  exchange_rate?: number;     // Taxa opcional fixa; se ausente e for USD, busca tempo real

  // Performance Operacional
  revenue_brl: number;
  orders: number;

  // Parâmetros Contábeis de Negócio (Configuráveis ou Defaults)
  max_acceptable_cpa?: number;  // CPA máximo tolerado (default: 60.00 BRL)
  target_roas?: number;         // ROAS alvo operacional (default: 2.0x)
  product_cogs_percent?: number;// % de Custo do Produto/Impostos/Taxas (default: 0)
  fixed_cost_per_order?: number;// Custo fixo por envio/pedido (default: 0)

  // Histórico de Estabilidade de ROAS (ex: últimos 3 a 7 dias)
  historical_daily_roas?: number[];
}

export interface PillarBreakdown {
  profitability_score: number; // 40%
  cpa_score: number;           // 25%
  roas_score: number;          // 15%
  volume_score: number;        // 10%
  spend_score: number;         // 10%
}

export interface CampaignProfitResult {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  date: string;

  // Camada 1: Normalização Cambial Auditável
  spend_original: number;
  currency_original: string;
  spend_usd: number;
  spend_brl: number;
  exchange_rate: number;
  conversion_timestamp: string;

  // Performance Operacional e Contábil em BRL
  revenue_brl: number;
  orders: number;
  cpa: number;
  roas: number;
  roi: number;
  profit: number;

  // Camada 2: Score Composto
  profit_score: number;
  tier: ProfitTier;
  pillars: PillarBreakdown;

  // Camada 3: Recomendações Prescritivas
  recommended_action: RecommendedAction;
  recommended_budget_change: number; // ex: +30, +20, 0, -20, -100
  reason: string;
  false_roas_detected: boolean;

  // Métricas detalhadas para auditoria em JSONB
  metrics: {
    cpa_target: number;
    cpa_ratio: number;
    cogs_deducted: number;
    fake_unnormalized_roas?: number;
    historical_roas_variance?: number;
  };
}

/**
 * CAMADA 1: Currency Normalization Engine
 * Converte moedas estrangeiras para BRL operacional sem sobrescrever os valores originais.
 */
export async function normalizeCurrency(
  spend_original: number,
  currency_original: string = "BRL",
  explicit_rate?: number
): Promise<NormalizedSpendResult> {
  const safeSpend = Math.max(0, Number(spend_original) || 0);
  const currency = (currency_original || "BRL").toUpperCase();
  const timestamp = new Date().toISOString();

  let rate = 1.0;
  if (currency === "USD") {
    rate = explicit_rate && explicit_rate > 0 ? explicit_rate : await getUsdBrlRate();
  } else if (currency !== "BRL" && explicit_rate && explicit_rate > 0) {
    rate = explicit_rate;
  }

  const spend_brl = convertToBrl(safeSpend, currency, rate);
  const spend_usd = currency === "USD" 
    ? safeSpend 
    : (rate > 0 ? Math.round((spend_brl / rate) * 100) / 100 : 0);

  return {
    spend_original: safeSpend,
    currency_original: currency,
    spend_usd,
    spend_brl,
    exchange_rate: rate,
    conversion_timestamp: timestamp,
  };
}

/**
 * Versão síncrona do normalizador cambial (quando a taxa já é conhecida ou fornecida)
 */
export function normalizeCurrencySync(
  spend_original: number,
  currency_original: string = "BRL",
  exchange_rate: number = 1.0
): NormalizedSpendResult {
  const safeSpend = Math.max(0, Number(spend_original) || 0);
  const currency = (currency_original || "BRL").toUpperCase();
  const rate = currency === "USD" || currency !== "BRL" ? Math.max(0.0001, exchange_rate) : 1.0;
  const timestamp = new Date().toISOString();

  const spend_brl = convertToBrl(safeSpend, currency, rate);
  const spend_usd = currency === "USD" 
    ? safeSpend 
    : (rate > 0 ? Math.round((spend_brl / rate) * 100) / 100 : 0);

  return {
    spend_original: safeSpend,
    currency_original: currency,
    spend_usd,
    spend_brl,
    exchange_rate: rate,
    conversion_timestamp: timestamp,
  };
}

/**
 * CAMADA 2: Ponderação dos 5 Pilares do Campaign Profit Score™
 */
export function calculateProfitPillars(params: {
  spend_brl: number;
  revenue_brl: number;
  orders: number;
  profit: number;
  roi: number;
  cpa: number;
  roas: number;
  max_acceptable_cpa: number;
  target_roas: number;
  historical_daily_roas?: number[];
}): { pillars: PillarBreakdown; profit_score: number } {
  const {
    spend_brl,
    revenue_brl,
    orders,
    profit,
    roi,
    cpa,
    roas,
    max_acceptable_cpa,
    target_roas,
    historical_daily_roas,
  } = params;

  // -------------------------------------------------------------
  // PILAR 1: Profitability Score (Peso: 40%)
  // Lucro líquido real, margem contábil e ROI em BRL
  // -------------------------------------------------------------
  let profitability_score = 50; // neutro padrão
  if (spend_brl === 0 && revenue_brl === 0) {
    profitability_score = 50;
  } else if (profit > 0) {
    // ROI >= 1.0 (100% de lucro sobre o spend) atinge 100 pontos
    // ROI entre 0.0 e 1.0 escala linearmente de 65 a 100
    const baseScore = Math.min(100, 65 + roi * 35);
    // Bônus se margem líquida da receita for robusta (>= 30%)
    const margin = revenue_brl > 0 ? profit / revenue_brl : 0;
    const marginBonus = margin >= 0.30 ? 5 : 0;
    profitability_score = Math.min(100, Math.round(baseScore + marginBonus));
  } else {
    // Lucro negativo ou zero
    if (spend_brl > 0) {
      // Se ROI <= -0.50 (perda de mais de metade do spend), score colapsa para 0
      // Se ROI entre -0.50 e 0, escala linearmente de 0 a 55
      const penalty = Math.max(-0.50, roi);
      profitability_score = Math.max(0, Math.round(55 + (penalty / 0.50) * 55));
    } else {
      profitability_score = 50;
    }
  }

  // -------------------------------------------------------------
  // PILAR 2: CPA Efficiency Score (Peso: 25%)
  // CPA atual vs CPA máximo tolerado pelo lojista
  // -------------------------------------------------------------
  let cpa_score = 50;
  const cpa_limit = Math.max(1, max_acceptable_cpa || 60);

  if (orders === 0) {
    if (spend_brl === 0) {
      cpa_score = 50;
    } else if (spend_brl >= cpa_limit * 1.5) {
      cpa_score = 0; // Gastou mais que 1.5x o CPA máximo sem nenhuma venda
    } else if (spend_brl >= cpa_limit) {
      cpa_score = 15;
    } else {
      cpa_score = 40; // Gasto exploratório abaixo do limite
    }
  } else {
    const cpa_ratio = cpa / cpa_limit;
    if (cpa_ratio <= 0.60) {
      cpa_score = 100; // CPA 40%+ abaixo do limite
    } else if (cpa_ratio <= 0.75) {
      cpa_score = 90;
    } else if (cpa_ratio <= 0.90) {
      cpa_score = 80;
    } else if (cpa_ratio <= 1.00) {
      cpa_score = 70; // Dentro do teto aceitável
    } else if (cpa_ratio <= 1.15) {
      cpa_score = 45; // Ultrapassou moderadamente
    } else if (cpa_ratio <= 1.35) {
      cpa_score = 25;
    } else {
      cpa_score = 5;  // CPA descontrolado
    }
  }

  // -------------------------------------------------------------
  // PILAR 3: ROAS Stability Score (Peso: 15%)
  // Consistência recente ou alinhamento com ROAS target
  // -------------------------------------------------------------
  let roas_score = 50;
  const target = Math.max(0.1, target_roas || 2.0);

  if (historical_daily_roas && historical_daily_roas.length >= 3) {
    // Avalia média e consistência (baixo desvio)
    const validRoas = historical_daily_roas.filter(r => typeof r === "number" && !isNaN(r));
    if (validRoas.length >= 3) {
      const avg = validRoas.reduce((a, b) => a + b, 0) / validRoas.length;
      const variance = validRoas.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / validRoas.length;
      const stdDev = Math.sqrt(variance);
      
      const avgScore = avg >= target * 1.3 ? 95 : (avg >= target ? 80 : (avg >= 1.0 ? 50 : 20));
      // Baixa variância ganha bônus de consistência
      const stabilityBonus = stdDev < 0.5 ? 5 : (stdDev > 1.5 ? -15 : 0);
      roas_score = Math.min(100, Math.max(0, Math.round(avgScore + stabilityBonus)));
    }
  } else {
    // Cálculo pontual baseado no ROAS real do período
    if (spend_brl === 0) {
      roas_score = revenue_brl > 0 ? 100 : 50;
    } else if (roas >= target * 1.5) {
      roas_score = 100;
    } else if (roas >= target) {
      roas_score = 85;
    } else if (roas >= 1.2) {
      roas_score = 65;
    } else if (roas >= 1.0) {
      roas_score = 50; // Breakeven bruto
    } else if (roas >= 0.7) {
      roas_score = 25;
    } else {
      roas_score = 0;
    }
  }

  // -------------------------------------------------------------
  // PILAR 4: Conversion Volume Score (Peso: 10%)
  // Significância estatística contra flukes/pedidos isolados de sorte
  // -------------------------------------------------------------
  let volume_score = 10;
  if (orders >= 30) {
    volume_score = 100; // Alta maturidade estatística
  } else if (orders >= 20) {
    volume_score = 90;
  } else if (orders >= 12) {
    volume_score = 80;
  } else if (orders >= 6) {
    volume_score = 65;
  } else if (orders >= 3) {
    volume_score = 45;
  } else if (orders >= 1) {
    volume_score = 25;
  } else {
    volume_score = spend_brl === 0 ? 50 : 0;
  }

  // -------------------------------------------------------------
  // PILAR 5: Spend Efficiency Score (Peso: 10%)
  // Capacidade de tracionar capital mantendo lucratividade
  // -------------------------------------------------------------
  let spend_score = 50;
  if (spend_brl === 0) {
    spend_score = 50;
  } else if (profit > 0) {
    if (spend_brl >= 1000 && roi >= 0.3) {
      spend_score = 100;
    } else if (spend_brl >= 500 && roi >= 0.2) {
      spend_score = 85;
    } else if (spend_brl >= 200 && roi >= 0.1) {
      spend_score = 75;
    } else {
      spend_score = 65;
    }
  } else {
    // Prejuízo: quanto mais gastou sem retorno, pior a eficiência de gasto
    if (spend_brl > 1000) {
      spend_score = 0;
    } else if (spend_brl > 300) {
      spend_score = 15;
    } else {
      spend_score = 30;
    }
  }

  // -------------------------------------------------------------
  // CÁLCULO FINAL PONDERADO (0 a 100)
  // -------------------------------------------------------------
  const weighted = 
    profitability_score * 0.40 +
    cpa_score * 0.25 +
    roas_score * 0.15 +
    volume_score * 0.10 +
    spend_score * 0.10;

  const profit_score = Math.min(100, Math.max(0, Math.round(weighted)));

  return {
    pillars: {
      profitability_score,
      cpa_score,
      roas_score,
      volume_score,
      spend_score,
    },
    profit_score,
  };
}

/**
 * CAMADA 3: Financial Decision Engine
 * Determina ação prescritiva e recomendação de orçamento baseada no score e limites contábeis.
 */
export function determineDecision(params: {
  profit_score: number;
  cpa: number;
  max_acceptable_cpa: number;
  roi: number;
  profit: number;
  orders: number;
  spend_brl: number;
  revenue_brl: number;
  false_roas_detected: boolean;
  currency_original: string;
  fake_unnormalized_roas?: number;
  real_roas: number;
  exchange_rate: number;
}): {
  tier: ProfitTier;
  recommended_action: RecommendedAction;
  recommended_budget_change: number;
  reason: string;
} {
  const {
    profit_score,
    cpa,
    max_acceptable_cpa,
    roi,
    profit,
    orders,
    spend_brl,
    revenue_brl,
    false_roas_detected,
    currency_original,
    fake_unnormalized_roas,
    real_roas,
    exchange_rate,
  } = params;

  const cpa_limit = Math.max(1, max_acceptable_cpa || 60);
  const cpa_ratio = cpa / cpa_limit;

  // Interceptação de alerta crítico cambial
  if (false_roas_detected) {
    return {
      tier: "RED",
      recommended_action: profit < 0 ? "PAUSE" : "REDUCE",
      recommended_budget_change: profit < 0 ? -100 : -20,
      reason: `Falso ROAS detectado devido à moeda ${currency_original}! Superficialmente parecia ${fake_unnormalized_roas?.toFixed(2)}x, mas em BRL real (câmbio ${exchange_rate.toFixed(2)}) o ROAS é de apenas ${real_roas.toFixed(2)}x com lucro de R$ ${profit.toFixed(2)}. Ação imediata requerida.`,
    };
  }

  // Campanha sem atividade ou sem dados (não deve sofrer penalidade punitiva)
  if (spend_brl === 0 && revenue_brl === 0 && orders === 0) {
    return {
      tier: "YELLOW",
      recommended_action: "MAINTAIN",
      recommended_budget_change: 0,
      reason: `Campanha sem histórico de veiculação no período (Score neutro ${profit_score}/100). Manter configuração e aguardar entrega.`,
    };
  }

  // LEARNING PHASE PROTECTION:
  // Se orders === 0 e spend_brl < (1.5 * max_acceptable_cpa) -> MAINTAIN, não permitir PAUSE
  if (orders === 0 && spend_brl < 1.5 * cpa_limit) {
    return {
      tier: "YELLOW",
      recommended_action: "MAINTAIN",
      recommended_budget_change: 0,
      reason: `LEARNING_PHASE_PROTECTION: Campanha em fase inicial de veiculação ou teste de criativo. Gasto atual de R$ ${spend_brl.toFixed(2)} ainda está abaixo do teto de aprendizado (1.5x CPA alvo = R$ ${(1.5 * cpa_limit).toFixed(2)}). Pausa prematura bloqueada.`,
    };
  }

  // 🟢 GREEN: SCORE >= 85 (Pode receber escala)
  // SCALE VOLUME GATE: Nenhuma recomendação SCALE pode ocorrer se orders < 5
  if (profit_score >= 85) {
    if (orders < 5) {
      return {
        tier: "YELLOW",
        recommended_action: "MAINTAIN",
        recommended_budget_change: 0,
        reason: `INSUFFICIENT_CONVERSION_VOLUME: Performance excelente (Score ${profit_score}/100, ROI ${(roi * 100).toFixed(0)}%), porém volume de apenas ${orders} pedido(s). Mínimo de 5 conversões exigido para autorizar escala de orçamento.`,
      };
    }

    const isSuperStar = profit_score >= 92 && cpa_ratio <= 0.70 && orders >= 10 && roi >= 0.50;
    const change = isSuperStar ? 30 : 20;
    const discount = Math.round((1 - cpa_ratio) * 100);
    const reason = `Excelente lucratividade com volume maduro (Score ${profit_score}/100). CPA R$ ${cpa.toFixed(2)} está ${discount > 0 ? `${discount}% abaixo` : "dentro"} do teto (R$ ${cpa_limit.toFixed(2)}) com ROI real de ${(roi * 100).toFixed(0)}% e ${orders} pedidos. Recomendada escala agressiva de +${change}%.`;

    return {
      tier: "GREEN",
      recommended_action: "SCALE",
      recommended_budget_change: change,
      reason,
    };
  }

  // 🟡 YELLOW: 70 a 84 (Manter e observar)
  if (profit_score >= 70) {
    return {
      tier: "YELLOW",
      recommended_action: "MAINTAIN",
      recommended_budget_change: 0,
      reason: `Margem estável e sob controle (Score ${profit_score}/100). CPA R$ ${cpa.toFixed(2)} e ROAS ${real_roas.toFixed(2)}x adequados. Manter orçamento atual e continuar monitorando volume.`,
    };
  }

  // 🔴 RED: < 70 (Refinamento da regra RED)
  // Score 50 a 69: REDUCE (-20%)
  if (profit_score >= 50) {
    return {
      tier: "RED",
      recommended_action: "REDUCE",
      recommended_budget_change: -20,
      reason: `Eficiência abaixo do ideal (Score ${profit_score}/100). CPA R$ ${cpa.toFixed(2)} ultrapassou a margem ótima em relação ao teto de R$ ${cpa_limit.toFixed(2)}. Reduzir orçamento em 20% para restabelecer o equilíbrio financeiro.`,
    };
  }

  // Score < 50: PAUSE somente se:
  // - spend_brl >= 1.5x CPA alvo e orders === 0
  // OU
  // - prejuízo persistente confirmado (profit < 0 e (roi <= -0.30 || cpa_ratio >= 1.40))
  const isConfirmedBleeding = 
    (orders === 0 && spend_brl >= 1.5 * cpa_limit) ||
    (profit < 0 && (roi <= -0.30 || cpa_ratio >= 1.40));

  if (isConfirmedBleeding) {
    return {
      tier: "RED",
      recommended_action: "PAUSE",
      recommended_budget_change: -100,
      reason: `Alerta crítico de sangramento financeiro (Score ${profit_score}/100). Prejuízo de R$ ${Math.abs(profit).toFixed(2)} com CPA ${orders === 0 ? `sem conversões após consumir R$ ${spend_brl.toFixed(2)} (>= 1.5x CPA alvo)` : `descontrolado a R$ ${cpa.toFixed(2)}`}. Recomendada pausa imediata da veiculação.`,
    };
  }

  // Caso padrão para Score < 50 sem os gatilhos estritos de sangramento
  return {
    tier: "RED",
    recommended_action: "REDUCE",
    recommended_budget_change: -20,
    reason: `Desempenho insatisfatório (Score ${profit_score}/100). Redução preventiva de 20% no orçamento recomendada para contenção de margem.`,
  };
}

/**
 * Avaliação Completa de Lucratividade e Decisão Financeira de Campanha
 */
export async function evaluateCampaignProfit(input: CampaignProfitInput): Promise<CampaignProfitResult> {
  const normalized = await normalizeCurrency(
    input.spend_original,
    input.currency_original,
    input.exchange_rate
  );

  return evaluateCampaignProfitWithNormalized(input, normalized);
}

/**
 * Avaliação Síncrona com taxa de câmbio conhecida
 */
export function evaluateCampaignProfitSync(
  input: CampaignProfitInput & { exchange_rate: number }
): CampaignProfitResult {
  const normalized = normalizeCurrencySync(
    input.spend_original,
    input.currency_original,
    input.exchange_rate
  );

  return evaluateCampaignProfitWithNormalized(input, normalized);
}

/**
 * Motor Interno de Consolidação
 */
function evaluateCampaignProfitWithNormalized(
  input: CampaignProfitInput,
  normalized: NormalizedSpendResult
): CampaignProfitResult {
  const revenue_brl = Math.max(0, Number(input.revenue_brl) || 0);
  const orders = Math.max(0, Number(input.orders) || 0);
  const spend_brl = normalized.spend_brl;
  const max_cpa = input.max_acceptable_cpa || 60.0;
  const target_roas = input.target_roas || 2.0;

  // 1. Custos de Produto / Operacionais adicionais
  const cogs_percent = Math.max(0, input.product_cogs_percent || 0);
  const fixed_cost = Math.max(0, input.fixed_cost_per_order || 0);
  const cogs_deducted = Math.round((revenue_brl * (cogs_percent / 100) + orders * fixed_cost) * 100) / 100;

  // 2. Lucro Líquido Real e Métricas Derivadas
  const profit = Math.round((revenue_brl - spend_brl - cogs_deducted) * 100) / 100;
  const cpa = orders > 0 ? Math.round((spend_brl / orders) * 100) / 100 : spend_brl;
  const roas = spend_brl > 0 ? Math.round((revenue_brl / spend_brl) * 100) / 100 : (revenue_brl > 0 ? 99 : 0);
  const roi = spend_brl > 0 ? Math.round((profit / spend_brl) * 100) / 100 : 0;

  // 3. Detecção de Ilusão Cambial / Falso ROAS
  let false_roas_detected = false;
  let fake_unnormalized_roas: number | undefined;

  if (normalized.currency_original === "USD" && normalized.spend_original > 0) {
    fake_unnormalized_roas = Math.round((revenue_brl / normalized.spend_original) * 100) / 100;
    // Falso positivo: Se o ROAS superficial em USD parece >= 1.0 (ou >= target_roas),
    // mas o ROAS real em BRL é < 1.0 (ou prejuízo)
    if (fake_unnormalized_roas >= 1.0 && (roas < 1.0 || profit < 0)) {
      false_roas_detected = true;
    }
  }

  // 4. Cálculo dos 5 Pilares
  const { pillars, profit_score } = calculateProfitPillars({
    spend_brl,
    revenue_brl,
    orders,
    profit,
    roi,
    cpa,
    roas,
    max_acceptable_cpa: max_cpa,
    target_roas,
    historical_daily_roas: input.historical_daily_roas,
  });

  // 5. Decisão Prescritiva
  const decision = determineDecision({
    profit_score,
    cpa,
    max_acceptable_cpa: max_cpa,
    roi,
    profit,
    orders,
    spend_brl,
    revenue_brl,
    false_roas_detected,
    currency_original: normalized.currency_original,
    fake_unnormalized_roas,
    real_roas: roas,
    exchange_rate: normalized.exchange_rate,
  });

  const dateStr = input.date || new Date().toISOString().split("T")[0];

  return {
    store_id: input.store_id,
    campaign_id: input.campaign_id,
    campaign_name: input.campaign_name || `Campaign ${input.campaign_id}`,
    date: dateStr,

    // Camada 1: Normalização
    spend_original: normalized.spend_original,
    currency_original: normalized.currency_original,
    spend_usd: normalized.spend_usd,
    spend_brl: normalized.spend_brl,
    exchange_rate: normalized.exchange_rate,
    conversion_timestamp: normalized.conversion_timestamp,

    // Performance BRL
    revenue_brl,
    orders,
    cpa,
    roas,
    roi,
    profit,

    // Camada 2: Score e Pilares
    profit_score,
    tier: decision.tier,
    pillars,

    // Camada 3: Recomendações
    recommended_action: decision.recommended_action,
    recommended_budget_change: decision.recommended_budget_change,
    reason: decision.reason,
    false_roas_detected,

    // Métricas para JSONB
    metrics: {
      cpa_target: max_cpa,
      cpa_ratio: Math.round((cpa / max_cpa) * 100) / 100,
      cogs_deducted,
      fake_unnormalized_roas,
    },
  };
}

/**
 * Persiste o snapshot auditável diário da campanha no Supabase
 */
export async function persistCampaignProfitSnapshot(
  result: CampaignProfitResult,
  customSupabase?: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = customSupabase || getDefaultAdminClient();

    const snapshotPayload = {
      store_id: result.store_id,
      campaign_id: result.campaign_id,
      campaign_name: result.campaign_name,
      date: result.date,
      spend_original: result.spend_original,
      currency_original: result.currency_original,
      spend_usd: result.spend_usd,
      spend_brl: result.spend_brl,
      exchange_rate: result.exchange_rate,
      revenue_brl: result.revenue_brl,
      orders: result.orders,
      cpa: result.cpa,
      roas: result.roas,
      roi: result.roi,
      profit: result.profit,
      profit_score: result.profit_score,
      tier: result.tier,
      recommended_action: result.recommended_action,
      recommended_budget_change: result.recommended_budget_change,
      reason: result.reason,
      metrics: {
        ...result.metrics,
        pillars: result.pillars,
        conversion_timestamp: result.conversion_timestamp,
        false_roas_detected: result.false_roas_detected,
      },
    };

    const { data, error } = await supabase
      .from("campaign_profit_snapshots")
      .upsert(snapshotPayload, {
        onConflict: "store_id,campaign_id,date",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[CampaignProfitEngine] Erro ao persistir snapshot:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[CampaignProfitEngine] Exceção ao persistir snapshot:", err?.message);
    return { success: false, error: err?.message || "Unknown error" };
  }
}
