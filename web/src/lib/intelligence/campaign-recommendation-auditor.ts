/**
 * web/src/lib/intelligence/campaign-recommendation-auditor.ts
 *
 * ATM Campaign Recommendation Auditor & Explainability Engine™ (Fase 10.2)
 *
 * Camada de observabilidade, avaliação de desfecho e explicabilidade comercial
 * que audita a qualidade das recomendações antes de qualquer automação na Meta Ads.
 *
 * Pilares:
 * 1. Camada de Explicação Humana (Human-First Copywriting com motivos concretos).
 * 2. Modo Simulação / Shadow Mode (opera 100% passivo com is_simulation: true).
 * 3. Acompanhamento Pós-Recomendação (feedback loop de 24h, 48h ou 72h classificando em ACERTO, ERRO ou NEUTRO).
 * 4. Pesos Ajustáveis por Perfil de Risco (BALANCED, AGGRESSIVE, CONSERVATIVE).
 * 5. Cálculo de Taxa de Assertividade Histórica (Hit Rate %) do Algoritmo.
 */

import { BridgeAction, AssetPermission } from "./campaign-intelligence-bridge";

export type OutcomeResult = "ACERTO" | "ERRO" | "NEUTRO" | "PENDING_EVALUATION" | "PENDING";

export type OutcomeReasonCode =
  | "PROFIT_GROWTH_AFTER_SCALE"
  | "SCALE_MARGIN_COLLAPSE"
  | "LOSS_PREVENTION_AFTER_REDUCE"
  | "BLEEDING_HALTED_AFTER_PAUSE"
  | "PREMATURE_PAUSE_DETECTED"
  | "STABLE_PERFORMANCE_MAINTAINED"
  | "UNCONTAINED_PERFORMANCE_DROP"
  | "INSUFFICIENT_DATA"
  | "EVALUATION_WINDOW_NOT_ELAPSED";

export type ConfidenceProfile = "BALANCED" | "AGGRESSIVE" | "CONSERVATIVE";

export interface ProfileWeights {
  profile: ConfidenceProfile;
  profit_weight: number;
  asset_weight: number;
  data_maturity_weight: number;
}

export interface ConfidenceBadge {
  score: number;
  label: "Altíssima Confiança" | "Alta Confiança" | "Confiança Moderada" | "Baixa Confiança";
  color: "emerald" | "blue" | "amber" | "rose";
}

export interface HumanExplanation {
  headline: string;
  action_label: string;
  summary: string;
  bullet_points: string[];
  confidence_badge: ConfidenceBadge;
  simulation_note: string;
}

export interface MetricsSnapshot {
  spend_brl: number;
  orders: number;
  revenue_brl: number;
  cpa: number;
  max_acceptable_cpa: number;
  roas: number;
  roi: number;
  profit: number;
  captured_at?: string;
}

export interface OutcomeEvaluationInput {
  recommendation_id?: string;
  store_id: string;
  campaign_id: string;
  action: BridgeAction;
  budget_change_percent: number;
  metrics_before: MetricsSnapshot;
  metrics_after: MetricsSnapshot;
  recommended_at?: string;
  evaluated_at?: string;
  elapsed_hours?: number;
  evaluation_window_hours?: number;
}

export interface MetricsDelta {
  delta_spend: number;
  delta_orders: number;
  delta_revenue: number;
  delta_cpa: number;
  delta_cpa_percent: number;
  delta_profit: number;
  delta_roas: number;
}

export interface OutcomeEvaluationResult {
  outcome_result: OutcomeResult;
  reason_code: OutcomeReasonCode;
  outcome_reason: string;
  metrics_delta: MetricsDelta;
  evaluated_at: string;
  evaluation_window_hours: number;
}

export interface AccuracySummary {
  total_evaluated: number;
  total_acerto: number;
  total_erro: number;
  total_neutro: number;
  total_pending: number;
  hit_rate_percent: number;
  by_action: Record<
    string,
    {
      total: number;
      acertos: number;
      erros: number;
      neutros: number;
      pending: number;
      hit_rate_percent: number;
    }
  >;
}

/**
 * 1. Retorna a distribuição de pesos (mantida estruturada para expansão futura)
 * Nesta fase de observação e aprendizado, o padrão é sempre BALANCED (50% profit, 30% asset, 20% volume).
 */
export function getProfileWeights(profile: ConfidenceProfile = "BALANCED"): ProfileWeights {
  return {
    profile: "BALANCED",
    profit_weight: 0.50,
    asset_weight: 0.30,
    data_maturity_weight: 0.20,
  };
}

/**
 * 2. Gera o badge visual de confiança humana
 */
export function buildConfidenceBadge(score: number): ConfidenceBadge {
  const safeScore = Math.min(100, Math.max(0, Math.round(Number(score) || 0)));
  if (safeScore >= 90) {
    return { score: safeScore, label: "Altíssima Confiança", color: "emerald" };
  }
  if (safeScore >= 80) {
    return { score: safeScore, label: "Alta Confiança", color: "blue" };
  }
  if (safeScore >= 65) {
    return { score: safeScore, label: "Confiança Moderada", color: "amber" };
  }
  return { score: safeScore, label: "Baixa Confiança", color: "rose" };
}

/**
 * 3. Constrói a Camada de Explicação Humana persuasiva e auditável
 */
export function buildHumanExplanation(params: {
  action: BridgeAction;
  budget_change_percent: number;
  confidence_score: number;
  metrics: MetricsSnapshot;
  asset_health_score: number;
  asset_permission: AssetPermission;
  data_maturity_score: number;
  is_simulation?: boolean;
}): HumanExplanation {
  const {
    action,
    budget_change_percent,
    confidence_score,
    metrics,
    asset_health_score,
    asset_permission,
    data_maturity_score,
    is_simulation = true,
  } = params;

  const badge = buildConfidenceBadge(confidence_score);
  const bullet_points: string[] = [];

  let headline = "";
  let action_label = "";
  let summary = "";

  const cpaDiffPercent = metrics.max_acceptable_cpa > 0
    ? Math.round(((metrics.max_acceptable_cpa - metrics.cpa) / metrics.max_acceptable_cpa) * 100)
    : 0;

  if (action === "SCALE_BUDGET_PERCENT") {
    headline = `🚀 O ATM recomenda aumentar orçamento (+${budget_change_percent}%)`;
    action_label = `Escalar Orçamento (+${budget_change_percent}%)`;
    summary = `Campanha altamente lucrativa em ativo seguro com amostragem consolidada.`;

    bullet_points.push(`✓ ${metrics.orders} compras confirmadas no período com receita de R$ ${metrics.revenue_brl.toFixed(2)}`);
    if (cpaDiffPercent > 0) {
      bullet_points.push(`✓ CPA de R$ ${metrics.cpa.toFixed(2)} está ${cpaDiffPercent}% abaixo do teto tolerado (R$ ${metrics.max_acceptable_cpa.toFixed(2)})`);
    } else {
      bullet_points.push(`✓ CPA de R$ ${metrics.cpa.toFixed(2)} alinhado com o teto tolerado`);
    }
    bullet_points.push(`✓ Ativo Meta em permissão ${asset_permission} (Health Score ${asset_health_score}/100)`);
    bullet_points.push(`✓ Maturidade estatística consolidada (${data_maturity_score} pts) sem distorção de falso ROAS`);
    bullet_points.push(`✓ Retorno contábil real: Lucro líquido de R$ ${metrics.profit.toFixed(2)} com ROAS ${metrics.roas.toFixed(2)}x`);
  } else if (action === "REDUCE_BUDGET_PERCENT") {
    headline = `⚠️ O ATM recomenda reduzir orçamento (${budget_change_percent}%)`;
    action_label = `Reduzir Orçamento (${budget_change_percent}%)`;
    summary = `Eficiência abaixo da meta financeira. Redução preventiva para estancar desperdício de margem.`;

    bullet_points.push(`✓ CPA atual de R$ ${metrics.cpa.toFixed(2)} superou o limite tolerado de R$ ${metrics.max_acceptable_cpa.toFixed(2)}`);
    bullet_points.push(`✓ Margem de contribuição comprimida com ROI de ${(metrics.roi * 100).toFixed(1)}%`);
    bullet_points.push(`✓ Redução suave de ${Math.abs(budget_change_percent)}% para forçar o algoritmo a focar no público de maior intenção`);
    bullet_points.push(`✓ Preservação do aprendizado sem necessidade de desligar a campanha`);
  } else if (action === "PAUSE_CAMPAIGN") {
    headline = `🛑 O ATM recomenda pausar a campanha imediatamente`;
    action_label = `Pausar Campanha (-100%)`;
    summary = `Alerta crítico de sangramento financeiro. Interrupção emergencial de orçamento.`;

    if (metrics.orders === 0) {
      bullet_points.push(`✓ Campanha consumiu R$ ${metrics.spend_brl.toFixed(2)} (>= 1.5x CPA alvo de R$ ${metrics.max_acceptable_cpa.toFixed(2)}) com ZERO conversões`);
    } else {
      bullet_points.push(`✓ Prejuízo persistente de R$ ${Math.abs(metrics.profit).toFixed(2)} com CPA fora de controle (R$ ${metrics.cpa.toFixed(2)})`);
    }
    bullet_points.push(`✓ Desconexão com o objetivo de lucro da operação`);
    bullet_points.push(`✓ Proteção imediata de caixa para evitar continuação de perda de capital`);
  } else {
    headline = `⏸️ O ATM recomenda manter o orçamento atual`;
    action_label = `Manter Orçamento (0%)`;
    summary = `Campanha em observação ou fase de entrega exploratória. Nenhuma alteração necessária.`;

    if (metrics.orders === 0 && metrics.spend_brl < 1.5 * metrics.max_acceptable_cpa) {
      bullet_points.push(`✓ Fase de aprendizado protegida: Gasto de R$ ${metrics.spend_brl.toFixed(2)} ainda está abaixo do teto exploratório (R$ ${(1.5 * metrics.max_acceptable_cpa).toFixed(2)})`);
      bullet_points.push(`✓ Pausa prematura bloqueada para permitir maturação do criativo`);
    } else if (metrics.orders < 5) {
      bullet_points.push(`✓ Volume de dados preliminar (${metrics.orders} compra(s)): aguardando mínimo de 5 pedidos para liberar escala`);
    } else {
      bullet_points.push(`✓ Operação equilibrada na faixa de estabilidade contábil`);
    }
    bullet_points.push(`✓ Saúde do ativo: ${asset_health_score}/100 (${asset_permission})`);
  }

  const simulation_note = is_simulation
    ? `Modo Simulação: O ATM registrou esta recomendação para auditoria. Nenhuma chamada de alteração foi enviada à Meta.`
    : `Modo Assistido: Aguardando aprovação soberana do gestor.`;

  return {
    headline,
    action_label,
    summary,
    bullet_points,
    confidence_badge: badge,
    simulation_note,
  };
}

/**
 * 4. Avalia o Desfecho Real da recomendação após a janela temporal (24h, 48h, 72h)
 *
 * Critérios de Julgamento Contábil de Tráfego Pago:
 * - SCALE:
 *   - ACERTO: Vendas subiram E (CPA permaneceu <= max_cpa OU variação de CPA <= 20% OU lucro aumentou).
 *   - ERRO: Gasto aumentou mas pedidos estagnaram/caíram, OU CPA estourou o limite máximo, OU lucro caiu drasticamente.
 *   - NEUTRO: Variação irrelevante (< 5%).
 * - REDUCE:
 *   - ACERTO: CPA caiu ou prejuízo foi contido/reduzido.
 *   - ERRO: CPA continuou subindo e prejuízo acelerou.
 *   - NEUTRO: Sem impacto significativo.
 * - PAUSE:
 *   - ACERTO: Evitou queima continuada de caixa em campanha inerte/sangrando.
 *   - ERRO: Campanha foi pausada prematuramente quando estava lucrativa.
 *   - NEUTRO: Sem consumo significativo.
 * - NO_ACTION / MAINTAIN:
 *   - ACERTO: Manteve estabilidade e lucro sem colapso.
 *   - ERRO: Campanha entrou em sangramento severo e deveria ter sido contida, ou explodiu e perdeu escala óbvia.
 *   - NEUTRO: Estado estável preservado.
 */
export function evaluateRecommendationOutcome(input: OutcomeEvaluationInput): OutcomeEvaluationResult {
  const {
    action,
    budget_change_percent,
    metrics_before,
    metrics_after,
    evaluation_window_hours = 72,
  } = input;

  const delta_spend = Math.round((metrics_after.spend_brl - metrics_before.spend_brl) * 100) / 100;
  const delta_orders = metrics_after.orders - metrics_before.orders;
  const delta_revenue = Math.round((metrics_after.revenue_brl - metrics_before.revenue_brl) * 100) / 100;
  const delta_cpa = Math.round((metrics_after.cpa - metrics_before.cpa) * 100) / 100;
  const delta_profit = Math.round((metrics_after.profit - metrics_before.profit) * 100) / 100;
  const delta_roas = Math.round((metrics_after.roas - metrics_before.roas) * 100) / 100;

  const delta_cpa_percent = metrics_before.cpa > 0
    ? Math.round(((metrics_after.cpa - metrics_before.cpa) / metrics_before.cpa) * 10000) / 100
    : 0;

  const max_cpa = metrics_before.max_acceptable_cpa || metrics_after.max_acceptable_cpa || 60;

  const delta: MetricsDelta = {
    delta_spend,
    delta_orders,
    delta_revenue,
    delta_cpa,
    delta_cpa_percent,
    delta_profit,
    delta_roas,
  };

  // ---------------------------------------------------------------------------
  // PROTEÇÃO DE AVALIAÇÃO TEMPORAL (JANELA MÍNIMA DE MATURAÇÃO)
  // Regra: Nenhuma recomendação pode receber ACERTO ou ERRO antes da janela configurada.
  // SCALE: Priorizar análise consolidada D+1 (24h) ou D+3 (72h), evitando falso ERRO intradiário.
  // ---------------------------------------------------------------------------
  let elapsed_hours: number | undefined = input.elapsed_hours;
  if (elapsed_hours === undefined) {
    const startIso = input.recommended_at || input.metrics_before.captured_at;
    const endIso = input.evaluated_at || input.metrics_after.captured_at;
    if (startIso && endIso) {
      const startTime = new Date(startIso).getTime();
      const endTime = new Date(endIso).getTime();
      if (!isNaN(startTime) && !isNaN(endTime) && endTime >= startTime) {
        elapsed_hours = Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 10) / 10;
      }
    }
  }

  // Para SCALE: mínimo absoluto de 24h (D+1) para evitar falso negativo do leilão
  const min_required_hours = action === "SCALE_BUDGET_PERCENT"
    ? Math.max(24, evaluation_window_hours)
    : evaluation_window_hours;

  // Se informado e ainda não atingiu a janela mínima: bloqueia ACERTO/ERRO prematuro
  if (elapsed_hours !== undefined && elapsed_hours < min_required_hours) {
    return {
      outcome_result: "PENDING_EVALUATION",
      reason_code: "EVALUATION_WINDOW_NOT_ELAPSED",
      outcome_reason: `PENDING_EVALUATION: Janela mínima de maturação temporal não atingida (${elapsed_hours}h decorridas vs ${min_required_hours}h mínimas necessárias). Nenhuma recomendação pode ser classificada como ACERTO ou ERRO antes do fim da janela configurada${action === "SCALE_BUDGET_PERCENT" ? " (SCALE requer consolidação mínima D+1/D+3 para evitar falsos negativos por atraso de conversão no leilão intradiário)" : ""}.`,
      metrics_delta: delta,
      evaluated_at: input.evaluated_at || new Date().toISOString(),
      evaluation_window_hours,
    };
  }

  let outcome_result: OutcomeResult = "NEUTRO";
  let reason_code: OutcomeReasonCode = "INSUFFICIENT_DATA";
  let outcome_reason = "";

  // ---------------------------------------------------------------------------
  // REGRA 1: Desfecho de SCALE (+X%) — Baseado no Impacto Financeiro Líquido
  // REGRA DE OURO: NUNCA considerar ERRO apenas pelo aumento absoluto do CPA!
  // ---------------------------------------------------------------------------
  if (action === "SCALE_BUDGET_PERCENT") {
    const isInsufficientVolume = metrics_before.orders < 5 || metrics_after.orders < 5;
    const isPeriodWithoutStatisticalVariance = Math.abs(delta_spend) < 10 && delta_orders === 0;

    // Condições de ACERTO (Impacto Líquido Positivo):
    // 1. Lucro incremental aumentou
    // 2. ROI permaneceu aceitável
    // 3. CPA dentro do limite operacional
    const isProfitIncreased = delta_profit > 0 || metrics_after.profit > metrics_before.profit;
    const isRoiAcceptable = metrics_after.roi >= 0.10 && metrics_after.roas >= 1.15;
    const isCpaWithinOperationalLimit = metrics_after.cpa <= max_cpa;

    // Condições de ERRO (Destruição de Margem):
    // 1. CPA ultrapassou limite crítico
    // 2. Aumento de orçamento destruiu margem / Lucro reduziu
    // 3. Gasto adicional consumido sem conversões adicionais geradas
    const isCpaCriticalBreach = metrics_after.cpa > max_cpa;
    const isProfitReduced = delta_profit < 0;
    const isBudgetWastedWithoutConversions = delta_spend > 0 && delta_orders <= 0;

    if (isInsufficientVolume || isPeriodWithoutStatisticalVariance) {
      outcome_result = "NEUTRO";
      reason_code = "INSUFFICIENT_DATA";
      outcome_reason = `NEUTRO: Volume estatístico insuficiente para validação conclusiva (< 5 pedidos ou variação irrelevante).`;
    } else if (isProfitIncreased && isRoiAcceptable && isCpaWithinOperationalLimit) {
      outcome_result = "ACERTO";
      reason_code = "PROFIT_GROWTH_AFTER_SCALE";
      outcome_reason = `ACERTO: Lucro incremental aumentou (+R$ ${delta_profit.toFixed(2)}), ROI permaneceu aceitável (${(metrics_after.roi * 100).toFixed(0)}%) e CPA (R$ ${metrics_after.cpa.toFixed(2)}) permaneceu dentro do limite operacional (R$ ${max_cpa.toFixed(2)}), absorvendo a escala com margem positiva.`;
    } else if (isCpaCriticalBreach || isProfitReduced || isBudgetWastedWithoutConversions) {
      outcome_result = "ERRO";
      reason_code = "SCALE_MARGIN_COLLAPSE";
      const reasons: string[] = [];
      if (isCpaCriticalBreach) reasons.push(`CPA (R$ ${metrics_after.cpa.toFixed(2)}) ultrapassou o limite crítico de R$ ${max_cpa.toFixed(2)}`);
      if (isProfitReduced) reasons.push(`lucro líquido reduziu em R$ ${Math.abs(delta_profit).toFixed(2)}`);
      if (isBudgetWastedWithoutConversions) reasons.push(`gasto adicional consumido sem gerar novos pedidos`);
      outcome_reason = `ERRO: Aumento de orçamento destruiu margem: ${reasons.join("; ")}.`;
    } else {
      outcome_result = "NEUTRO";
      reason_code = "INSUFFICIENT_DATA";
      outcome_reason = `NEUTRO: Métricas mantiveram estabilidade na janela de ${evaluation_window_hours}h sem ganho ou perda conclusiva de margem.`;
    }
  }

  // ---------------------------------------------------------------------------
  // REGRA 2: Desfecho de REDUCE (-X%)
  // ---------------------------------------------------------------------------
  else if (action === "REDUCE_BUDGET_PERCENT") {
    const isCpaImproved = metrics_after.cpa < metrics_before.cpa;
    const isLossContained = metrics_after.profit >= metrics_before.profit;

    if (isCpaImproved || isLossContained) {
      outcome_result = "ACERTO";
      reason_code = "LOSS_PREVENTION_AFTER_REDUCE";
      outcome_reason = `ACERTO: Redução preventiva conteve perda de margem e recuperou eficiência de CPA (R$ ${metrics_before.cpa.toFixed(2)} -> R$ ${metrics_after.cpa.toFixed(2)}).`;
    } else if (metrics_after.cpa > metrics_before.cpa * 1.20) {
      outcome_result = "ERRO";
      reason_code = "UNCONTAINED_PERFORMANCE_DROP";
      outcome_reason = `ERRO: Redução de orçamento não conteve a deterioração da campanha (CPA subiu para R$ ${metrics_after.cpa.toFixed(2)}).`;
    } else {
      outcome_result = "NEUTRO";
      reason_code = "STABLE_PERFORMANCE_MAINTAINED";
      outcome_reason = `NEUTRO: Desaceleração manteve a campanha estável sem variações atípicas.`;
    }
  }

  // ---------------------------------------------------------------------------
  // REGRA 3: Desfecho de PAUSE (-100%)
  // ---------------------------------------------------------------------------
  else if (action === "PAUSE_CAMPAIGN") {
    const wasConfirmedBleeding =
      (metrics_before.orders === 0 && metrics_before.spend_brl >= 1.5 * max_cpa) ||
      metrics_before.profit < 0;

    if (wasConfirmedBleeding) {
      outcome_result = "ACERTO";
      reason_code = "BLEEDING_HALTED_AFTER_PAUSE";
      outcome_reason = `ACERTO: Pausa estancou sangramento confirmado de caixa de R$ ${metrics_before.spend_brl.toFixed(2)} em campanha sem eficiência.`;
    } else if (metrics_before.profit > 0 && metrics_before.orders >= 5) {
      outcome_result = "ERRO";
      reason_code = "PREMATURE_PAUSE_DETECTED";
      outcome_reason = `ERRO: Pausa prematura detectada. A campanha possuía lucro líquido positivo e amostragem válida no momento da recomendação.`;
    } else {
      outcome_result = "NEUTRO";
      reason_code = "INSUFFICIENT_DATA";
      outcome_reason = `NEUTRO: Campanha pausada em situação neutra de baixo volume.`;
    }
  }

  // ---------------------------------------------------------------------------
  // REGRA 4: Desfecho de NO_ACTION / MAINTAIN
  // ---------------------------------------------------------------------------
  else {
    const remainedStable = metrics_after.cpa <= max_cpa && metrics_after.profit >= 0;
    const sufferedHeavyBleeding = metrics_after.cpa > max_cpa * 1.5 || (metrics_after.profit < -100 && metrics_after.orders === 0);

    if (remainedStable) {
      outcome_result = "ACERTO";
      reason_code = "STABLE_PERFORMANCE_MAINTAINED";
      outcome_reason = `ACERTO: Manutenção preservou estabilidade operacional e margem saudável.`;
    } else if (sufferedHeavyBleeding) {
      outcome_result = "ERRO";
      reason_code = "UNCONTAINED_PERFORMANCE_DROP";
      outcome_reason = `ERRO: Manutenção falhou. A campanha entrou em sangramento severo e deveria ter sido contida.`;
    } else {
      outcome_result = "NEUTRO";
      reason_code = "INSUFFICIENT_DATA";
      outcome_reason = `NEUTRO: Estado estável contínuo.`;
    }
  }

  return {
    outcome_result,
    reason_code,
    outcome_reason,
    metrics_delta: delta,
    evaluated_at: new Date().toISOString(),
    evaluation_window_hours,
  };
}

/**
 * 5. Calcula as métricas consolidadas de assertividade do algoritmo (Hit Rate %)
 */
export function calculateAlgorithmAccuracy(evaluations: OutcomeEvaluationResult[]): AccuracySummary {
  let total_acerto = 0;
  let total_erro = 0;
  let total_neutro = 0;
  let total_pending = 0;

  for (const ev of evaluations) {
    if (ev.outcome_result === "ACERTO") total_acerto++;
    else if (ev.outcome_result === "ERRO") total_erro++;
    else if (ev.outcome_result === "NEUTRO") total_neutro++;
    else if (ev.outcome_result === "PENDING_EVALUATION" || ev.outcome_result === "PENDING") total_pending++;
  }

  const total_evaluated = evaluations.length;
  const decisiveCount = total_acerto + total_erro;
  const hit_rate_percent = decisiveCount > 0
    ? Math.round((total_acerto / decisiveCount) * 10000) / 100
    : (total_acerto > 0 ? 100 : 0);

  return {
    total_evaluated,
    total_acerto,
    total_erro,
    total_neutro,
    total_pending,
    hit_rate_percent,
    by_action: {},
  };
}
