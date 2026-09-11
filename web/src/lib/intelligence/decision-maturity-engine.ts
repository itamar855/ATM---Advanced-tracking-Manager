/**
 * web/src/lib/intelligence/decision-maturity-engine.ts
 *
 * Motor de Maturidade das Decisões do ATM™ (Fase 10.3)
 *
 * Camada analítica executiva que avalia a maturidade, a assertividade histórica
 * e o valor econômico gerado pelas decisões do ATM, respondendo com rigor contábil:
 * "O ATM está tomando boas decisões?"
 *
 * Refinamentos Mandatórios:
 * 1. Nomenclatura executiva em Português Brasileiro (Veredito Executivo, Ação Mais Assertiva).
 * 2. Validação Estrita de Maturidade Estatística:
 *    HIGH_PERFORMANCE_MATURE exige:
 *    - total_evaluated >= 20
 *    - decisive_hit_rate_percent >= 75
 *    - no mínimo 5 recomendações de SCALE avaliadas
 * 3. Categorização Contábil do Impacto das Decisões (decision_impact_type):
 *    - PROFIT_GENERATION: Lucro incremental gerado por escala (SCALE).
 *    - LOSS_PREVENTION: Prejuízo evitado por redução ou pausa (REDUCE/PAUSE).
 *    - STABILITY_MAINTENANCE: Estabilidade operacional preservada por manutenção (NO_ACTION).
 * 4. Idade da Inteligência (intelligence_age_days):
 *    - 0 a 7 dias: EARLY_LEARNING
 *    - 8 a 30 dias: INITIAL_CALIBRATION
 *    - 31 a 90 dias: OPERATIONAL_LEARNING
 *    - 90+ dias: MATURE_MODEL
 */

import { BridgeAction } from "./campaign-intelligence-bridge";
import { OutcomeResult, OutcomeReasonCode } from "./campaign-recommendation-auditor";

export type MaturityStatus =
  | "HIGH_PERFORMANCE_MATURE" // >= 20 avaliadas, Hit Rate >= 75%, >= 5 SCALE avaliados
  | "PROMISING_ACCUMULATION"  // 5 a 19 avaliadas, Hit Rate >= 70%
  | "CALIBRATION_REQUIRED"   // >= 5 avaliadas, Hit Rate < 60%
  | "INSUFFICIENT_DATA";       // < 5 avaliadas ou sem amostragem estatística

export type DecisionImpactType =
  | "PROFIT_GENERATION"
  | "LOSS_PREVENTION"
  | "STABILITY_MAINTENANCE";

export type IntelligenceStage =
  | "EARLY_LEARNING"         // 0 a 7 dias
  | "INITIAL_CALIBRATION"    // 8 a 30 dias
  | "OPERATIONAL_LEARNING"   // 31 a 90 dias
  | "MATURE_MODEL";          // 90+ dias

export interface RecommendationAuditRecord {
  id?: string;
  store_id: string;
  campaign_id: string;
  campaign_name?: string;
  action: BridgeAction;
  budget_change_percent?: number;
  confidence_score?: number;
  data_maturity_score?: number;
  outcome_result: OutcomeResult;
  outcome_reason_code?: OutcomeReasonCode;
  outcome_metrics_delta?: {
    delta_spend?: number;
    delta_orders?: number;
    delta_revenue?: number;
    delta_cpa?: number;
    delta_profit?: number;
    delta_roas?: number;
  } | null;
  metrics_before?: {
    spend_brl?: number;
    orders?: number;
    profit?: number;
    cpa?: number;
  } | null;
  metrics_after?: {
    spend_brl?: number;
    orders?: number;
    profit?: number;
    cpa?: number;
  } | null;
  is_simulation?: boolean;
  created_at?: string;
  evaluated_at?: string;
}

export interface ImpactBreakdown {
  profit_generation: {
    total_actions: number;
    acertos: number;
    incremental_profit_generated_brl: number;
  };
  loss_prevention: {
    total_actions: number;
    acertos: number;
    loss_prevented_brl: number;
  };
  stability_maintenance: {
    total_actions: number;
    acertos: number;
    stability_preserved_count: number;
  };
  total_value_delivered_brl: number;
}

export interface IntelligenceAgeInfo {
  intelligence_age_days: number;
  stage: IntelligenceStage;
  stage_label: string;
  description: string;
  oldest_recommendation_at?: string;
}

export interface ConsolidatedMaturityMetrics {
  total_recommendations: number;
  total_evaluated: number;
  total_pending_evaluation: number;
  total_acerto: number;
  total_erro: number;
  total_neutro: number;
  acerto_percent: number;             // (acertos / total_avaliadas) * 100
  erro_percent: number;               // (erros / total_avaliadas) * 100
  neutro_percent: number;             // (neutros / total_avaliadas) * 100
  pending_percent: number;            // (pending / total_recommendations) * 100
  decisive_hit_rate_percent: number;  // (acertos / (acertos + erros)) * 100
  total_scale_evaluated: number;      // Mínimo de 5 exigido para HIGH_PERFORMANCE_MATURE
  impact_breakdown: ImpactBreakdown;
  intelligence_age: IntelligenceAgeInfo;
}

export interface ActionMaturityMetrics {
  action: BridgeAction;
  action_label: string;
  impact_type: DecisionImpactType;
  total_recommendations: number;
  total_evaluated: number;
  total_pending_evaluation: number;
  total_acerto: number;
  total_erro: number;
  total_neutro: number;
  acerto_percent: number;
  erro_percent: number;
  neutro_percent: number;
  decisive_hit_rate_percent: number;
  financial_impact_brl: number;
}

export interface VereditoExecutivo {
  status: MaturityStatus;
  headline: string;
  summary: string;
  acao_mais_assertiva?: string;
  areas_de_atencao?: string;
  indice_confiabilidade: number;
  pontos_chave: string[];
}

export interface DecisionMaturityAnalysis {
  store_id: string;
  period_days: number;
  generated_at: string;
  consolidated: ConsolidatedMaturityMetrics;
  by_action: Record<BridgeAction, ActionMaturityMetrics>;
  veredito: VereditoExecutivo;
}

const ACTION_METADATA: Record<BridgeAction, { label: string; impact_type: DecisionImpactType }> = {
  SCALE_BUDGET_PERCENT: {
    label: "Escalar Orçamento (SCALE)",
    impact_type: "PROFIT_GENERATION",
  },
  REDUCE_BUDGET_PERCENT: {
    label: "Reduzir Orçamento (REDUCE)",
    impact_type: "LOSS_PREVENTION",
  },
  PAUSE_CAMPAIGN: {
    label: "Pausar Campanha (PAUSE)",
    impact_type: "LOSS_PREVENTION",
  },
  NO_ACTION: {
    label: "Manter Estável (NO_ACTION)",
    impact_type: "STABILITY_MAINTENANCE",
  },
};

/**
 * 1. Calcula a Idade da Inteligência da loja e o seu estágio evolutivo
 */
export function calculateIntelligenceAge(
  records: RecommendationAuditRecord[],
  referenceDate: Date = new Date()
): IntelligenceAgeInfo {
  if (records.length === 0) {
    return {
      intelligence_age_days: 0,
      stage: "EARLY_LEARNING",
      stage_label: "Aprendizado Inicial (0-7 dias)",
      description: "Nenhuma recomendação registrada ainda. O modelo aguarda os primeiros dados de tráfego.",
    };
  }

  // Encontra a recomendação mais antiga
  let oldestTimestamp = Infinity;
  let oldestIso = "";

  for (const r of records) {
    if (r.created_at) {
      const ts = new Date(r.created_at).getTime();
      if (!isNaN(ts) && ts < oldestTimestamp) {
        oldestTimestamp = ts;
        oldestIso = r.created_at;
      }
    }
  }

  if (oldestTimestamp === Infinity) {
    return {
      intelligence_age_days: 0,
      stage: "EARLY_LEARNING",
      stage_label: "Aprendizado Inicial (0-7 dias)",
      description: "Primeiros registros sem carimbo de data válido. Estágio preliminar.",
    };
  }

  const diffMs = referenceDate.getTime() - oldestTimestamp;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  let stage: IntelligenceStage = "EARLY_LEARNING";
  let stage_label = "Aprendizado Inicial (0-7 dias)";
  let description = "Modelo coletando os primeiros padrões de tráfego e conversão da loja.";

  if (days >= 90) {
    stage = "MATURE_MODEL";
    stage_label = "Modelo Maduro (90+ dias)";
    description = "Modelo com histórico amplo consolidado, alta resiliência e calibragem refinada.";
  } else if (days >= 31) {
    stage = "OPERATIONAL_LEARNING";
    stage_label = "Aprendizado Operacional (31-90 dias)";
    description = "Modelo operando com estabilidade e padrões consistentes de aprendizado.";
  } else if (days >= 8) {
    stage = "INITIAL_CALIBRATION";
    stage_label = "Calibração Inicial (8-30 dias)";
    description = "Modelo identificando curvas de elasticidade e calibrando tetos de CPA.";
  }

  return {
    intelligence_age_days: days,
    stage,
    stage_label,
    description,
    oldest_recommendation_at: oldestIso,
  };
}

/**
 * 2. Calcula as métricas consolidadas e por ação do Motor de Maturidade das Decisões
 */
export function computeDecisionMaturityMetrics(
  records: RecommendationAuditRecord[],
  storeId: string,
  periodDays: number = 30,
  referenceDate: Date = new Date()
): DecisionMaturityAnalysis {
  // Filtra estritamente pelo tenant
  const tenantRecords = records.filter((r) => r.store_id === storeId);

  const intelligence_age = calculateIntelligenceAge(tenantRecords, referenceDate);

  let total_recommendations = tenantRecords.length;
  let total_evaluated = 0;
  let total_pending_evaluation = 0;
  let total_acerto = 0;
  let total_erro = 0;
  let total_neutro = 0;
  let total_scale_evaluated = 0;

  // Estrutura de Impacto Contábil
  const impact_breakdown: ImpactBreakdown = {
    profit_generation: {
      total_actions: 0,
      acertos: 0,
      incremental_profit_generated_brl: 0,
    },
    loss_prevention: {
      total_actions: 0,
      acertos: 0,
      loss_prevented_brl: 0,
    },
    stability_maintenance: {
      total_actions: 0,
      acertos: 0,
      stability_preserved_count: 0,
    },
    total_value_delivered_brl: 0,
  };

  // Inicializa mapa por ação
  const actionsList: BridgeAction[] = [
    "SCALE_BUDGET_PERCENT",
    "REDUCE_BUDGET_PERCENT",
    "PAUSE_CAMPAIGN",
    "NO_ACTION",
  ];

  const by_action: Record<BridgeAction, ActionMaturityMetrics> = {} as any;

  for (const act of actionsList) {
    const meta = ACTION_METADATA[act];
    by_action[act] = {
      action: act,
      action_label: meta.label,
      impact_type: meta.impact_type,
      total_recommendations: 0,
      total_evaluated: 0,
      total_pending_evaluation: 0,
      total_acerto: 0,
      total_erro: 0,
      total_neutro: 0,
      acerto_percent: 0,
      erro_percent: 0,
      neutro_percent: 0,
      decisive_hit_rate_percent: 0,
      financial_impact_brl: 0,
    };
  }

  // Processa cada recomendação
  for (const rec of tenantRecords) {
    const act = rec.action || "NO_ACTION";
    const actMetrics = by_action[act] || by_action["NO_ACTION"];

    actMetrics.total_recommendations++;

    const isPending =
      rec.outcome_result === "PENDING_EVALUATION" ||
      rec.outcome_result === "PENDING" ||
      !rec.outcome_result;

    if (isPending) {
      total_pending_evaluation++;
      actMetrics.total_pending_evaluation++;
    } else {
      total_evaluated++;
      actMetrics.total_evaluated++;

      if (act === "SCALE_BUDGET_PERCENT") {
        total_scale_evaluated++;
      }

      const isAcerto = rec.outcome_result === "ACERTO";
      const isErro = rec.outcome_result === "ERRO";
      const isNeutro = rec.outcome_result === "NEUTRO";

      if (isAcerto) {
        total_acerto++;
        actMetrics.total_acerto++;
      } else if (isErro) {
        total_erro++;
        actMetrics.total_erro++;
      } else if (isNeutro) {
        total_neutro++;
        actMetrics.total_neutro++;
      }

      // -----------------------------------------------------------------------
      // CÁLCULO CONTÁBIL DE IMPACTO (PROFIT, LOSS PREVENTED, STABILITY)
      // -----------------------------------------------------------------------
      const profitDelta = Number(rec.outcome_metrics_delta?.delta_profit) || 0;

      if (act === "SCALE_BUDGET_PERCENT") {
        impact_breakdown.profit_generation.total_actions++;
        if (isAcerto) {
          impact_breakdown.profit_generation.acertos++;
          // Lucro incremental gerado pela escala
          const gained = profitDelta > 0 ? profitDelta : 0;
          impact_breakdown.profit_generation.incremental_profit_generated_brl += gained;
          actMetrics.financial_impact_brl += gained;
        } else if (isErro) {
          // Destruição de margem registrada
          actMetrics.financial_impact_brl += profitDelta; // negativo
        }
      } else if (act === "REDUCE_BUDGET_PERCENT" || act === "PAUSE_CAMPAIGN") {
        impact_breakdown.loss_prevention.total_actions++;
        if (isAcerto) {
          impact_breakdown.loss_prevention.acertos++;
          // Prejuízo evitado: gasto que teria ocorrido sem conversão ou melhora contábil
          const spendBefore = Number(rec.metrics_before?.spend_brl) || 0;
          const lossAvoided = Math.max(0, profitDelta >= 0 ? profitDelta : spendBefore * 0.2);
          impact_breakdown.loss_prevention.loss_prevented_brl += lossAvoided;
          actMetrics.financial_impact_brl += lossAvoided;
        }
      } else {
        // NO_ACTION
        impact_breakdown.stability_maintenance.total_actions++;
        if (isAcerto) {
          impact_breakdown.stability_maintenance.acertos++;
          impact_breakdown.stability_maintenance.stability_preserved_count++;
        }
      }
    }
  }

  // Consolidação final do valor contábil entregue
  impact_breakdown.profit_generation.incremental_profit_generated_brl =
    Math.round(impact_breakdown.profit_generation.incremental_profit_generated_brl * 100) / 100;
  impact_breakdown.loss_prevention.loss_prevented_brl =
    Math.round(impact_breakdown.loss_prevention.loss_prevented_brl * 100) / 100;

  impact_breakdown.total_value_delivered_brl =
    Math.round(
      (impact_breakdown.profit_generation.incremental_profit_generated_brl +
        impact_breakdown.loss_prevention.loss_prevented_brl) *
        100
    ) / 100;

  // Percentuais consolidados
  const acerto_percent = total_evaluated > 0
    ? Math.round((total_acerto / total_evaluated) * 10000) / 100
    : 0;
  const erro_percent = total_evaluated > 0
    ? Math.round((total_erro / total_evaluated) * 10000) / 100
    : 0;
  const neutro_percent = total_evaluated > 0
    ? Math.round((total_neutro / total_evaluated) * 10000) / 100
    : 0;
  const pending_percent = total_recommendations > 0
    ? Math.round((total_pending_evaluation / total_recommendations) * 10000) / 100
    : 0;

  const decisiveCount = total_acerto + total_erro;
  const decisive_hit_rate_percent = decisiveCount > 0
    ? Math.round((total_acerto / decisiveCount) * 10000) / 100
    : (total_acerto > 0 ? 100 : 0);

  const consolidated: ConsolidatedMaturityMetrics = {
    total_recommendations,
    total_evaluated,
    total_pending_evaluation,
    total_acerto,
    total_erro,
    total_neutro,
    acerto_percent,
    erro_percent,
    neutro_percent,
    pending_percent,
    decisive_hit_rate_percent,
    total_scale_evaluated,
    impact_breakdown,
    intelligence_age,
  };

  // Percentuais individuais por ação
  for (const act of actionsList) {
    const a = by_action[act];
    a.financial_impact_brl = Math.round(a.financial_impact_brl * 100) / 100;

    if (a.total_evaluated > 0) {
      a.acerto_percent = Math.round((a.total_acerto / a.total_evaluated) * 10000) / 100;
      a.erro_percent = Math.round((a.total_erro / a.total_evaluated) * 10000) / 100;
      a.neutro_percent = Math.round((a.total_neutro / a.total_evaluated) * 10000) / 100;

      const actDecisive = a.total_acerto + a.total_erro;
      a.decisive_hit_rate_percent = actDecisive > 0
        ? Math.round((a.total_acerto / actDecisive) * 10000) / 100
        : (a.total_acerto > 0 ? 100 : 0);
    }
  }

  // Constrói o Veredito Executivo em Português Brasileiro com as travas estritas
  const veredito = generateVereditoExecutivo(consolidated, by_action, tenantRecords);

  return {
    store_id: storeId,
    period_days: periodDays,
    generated_at: new Date().toISOString(),
    consolidated,
    by_action,
    veredito,
  };
}

/**
 * 3. Constrói o Veredito Executivo com a trava estrita de escala para HIGH_PERFORMANCE_MATURE
 */
export function generateVereditoExecutivo(
  consolidated: ConsolidatedMaturityMetrics,
  by_action: Record<BridgeAction, ActionMaturityMetrics>,
  rawRecords?: RecommendationAuditRecord[]
): VereditoExecutivo {
  const {
    total_evaluated,
    decisive_hit_rate_percent,
    total_pending_evaluation,
    total_scale_evaluated,
    impact_breakdown,
    intelligence_age,
  } = consolidated;

  let status: MaturityStatus = "INSUFFICIENT_DATA";
  let headline = "";
  let summary = "";

  // ---------------------------------------------------------------------------
  // REGRA REFINADA: HIGH_PERFORMANCE_MATURE
  // Exige CUMULATIVAMENTE:
  // 1. total_evaluated >= 20
  // 2. decisive_hit_rate_percent >= 75
  // 3. total_scale_evaluated >= 5 (mínimo de 5 escalas avaliadas comprovadas!)
  // ---------------------------------------------------------------------------
  const isScaleMature = total_scale_evaluated >= 5;

  if (total_evaluated >= 20 && decisive_hit_rate_percent >= 75 && isScaleMature) {
    status = "HIGH_PERFORMANCE_MATURE";
    headline = "🚀 Sim. O ATM demonstra alta assertividade executiva com expansão comprovada de lucro líquido.";
    summary = `Com ${total_evaluated} decisões auditadas (incluindo ${total_scale_evaluated} escalas validadas), o ATM atinge ${decisive_hit_rate_percent}% de assertividade decisiva e entregou R$ ${impact_breakdown.total_value_delivered_brl.toFixed(2)} de valor econômico líquido acumulado.`;
  } else if (total_evaluated >= 5 && decisive_hit_rate_percent >= 70) {
    status = "PROMISING_ACCUMULATION";
    headline = "📈 Padrão Promissor. O ATM está acertando a grande maioria das decisões na fase de amostragem.";
    summary = `Com ${total_evaluated} decisões consolidadas, o algoritmo mantém ${decisive_hit_rate_percent}% de acerto decisivo. ${!isScaleMature ? `Ainda em maturação de volume de escala (${total_scale_evaluated}/5 escalas avaliadas).` : "Histórico em trajetória sólida de maturação."}`;
  } else if (total_evaluated >= 5 && decisive_hit_rate_percent < 60) {
    status = "CALIBRATION_REQUIRED";
    headline = "⚠️ Calibração Necessária. Recomendações requerem ajuste de limites operacionais de CPA.";
    summary = `Taxa de assertividade decisiva de ${decisive_hit_rate_percent}% em ${total_evaluated} avaliações indica que algumas campanhas sofreram destruição de margem. Recomenda-se revisar tetos de CPA e saúde dos ativos Meta.`;
  } else {
    status = "INSUFFICIENT_DATA";
    headline = "⏳ Amostragem em Formação. Aguardando conclusão das primeiras janelas temporais de maturação.";
    summary = `Apenas ${total_evaluated} recomendação(ões) concluíram a janela temporal completa de auditoria. Existem ${total_pending_evaluation} recomendação(ões) protegidas em maturação temporal (PENDING_EVALUATION).`;
  }

  // ---------------------------------------------------------------------------
  // Ação Mais Assertiva (Strongest Action)
  // Pondera taxa de acerto, volume de vitórias e impacto financeiro gerado
  // ---------------------------------------------------------------------------
  let acao_mais_assertiva: string | undefined = undefined;
  let bestScore = -1;

  for (const act of Object.keys(by_action) as BridgeAction[]) {
    const a = by_action[act];
    if (a.total_evaluated >= 2 && a.decisive_hit_rate_percent >= 70) {
      const volumeBonus = Math.min(25, a.total_acerto * 4);
      const financialBonus = Math.min(35, Math.max(0, Math.floor(a.financial_impact_brl / 100)));
      const score = a.decisive_hit_rate_percent + volumeBonus + financialBonus;

      if (score > bestScore) {
        bestScore = score;
        acao_mais_assertiva = `${a.action_label}: ${a.decisive_hit_rate_percent}% de acerto decisivo (${a.total_acerto} acertos em ${a.total_evaluated} avaliadas)${a.financial_impact_brl > 0 ? ` gerando/poupando R$ ${a.financial_impact_brl.toFixed(2)}` : ""}.`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Áreas de Atenção (Consolida alertas de escala, erros residuais e pendências)
  // ---------------------------------------------------------------------------
  let areas_de_atencao: string | undefined = undefined;
  const attentionItems: string[] = [];

  if (!isScaleMature && total_evaluated >= 10) {
    attentionItems.push(`Volume de escala ainda preliminar (${total_scale_evaluated} de 5 necessárias para maturidade plena HIGH_PERFORMANCE_MATURE).`);
  }

  const actionsWithErrors = (Object.keys(by_action) as BridgeAction[])
    .map((act) => by_action[act])
    .filter((a) => a.total_erro > 0);

  if (actionsWithErrors.length > 0) {
    const highestErrorAction = actionsWithErrors.sort((a, b) => b.total_erro - a.total_erro)[0];
    attentionItems.push(`${highestErrorAction.action_label} registrou ${highestErrorAction.total_erro} desfecho(s) de erro. Calibrar sensibilidade e margem operacional.`);
  }

  if (total_pending_evaluation > 0) {
    attentionItems.push(`${total_pending_evaluation} recomendação(ões) retidas em PENDING_EVALUATION aguardando janela D+1/D+3 para evitar falso erro intradiário.`);
  }

  if (attentionItems.length > 0) {
    areas_de_atencao = attentionItems.join(" | ");
  }

  // ---------------------------------------------------------------------------
  // Índice de Confiabilidade Estatística (0 a 100)
  // ---------------------------------------------------------------------------
  let indice_confiabilidade = 0;
  if (total_evaluated >= 20 && isScaleMature) {
    indice_confiabilidade = 95;
  } else if (total_evaluated >= 10) {
    indice_confiabilidade = 80;
  } else if (total_evaluated >= 5) {
    indice_confiabilidade = 65;
  } else if (total_evaluated >= 1) {
    indice_confiabilidade = 40;
  } else {
    indice_confiabilidade = 15;
  }

  if (rawRecords && rawRecords.length > 0) {
    const totalDataMaturity = rawRecords.reduce((acc, r) => acc + (Number(r.data_maturity_score) || 70), 0);
    const avgDataMaturity = totalDataMaturity / rawRecords.length;
    indice_confiabilidade = Math.min(100, Math.round(indice_confiabilidade * 0.6 + avgDataMaturity * 0.4));
  }

  // ---------------------------------------------------------------------------
  // Pontos Chave (Key Takeaways em Português)
  // ---------------------------------------------------------------------------
  const pontos_chave: string[] = [];

  pontos_chave.push(
    `Decisões Auditadas: ${total_evaluated} finalizadas de ${consolidated.total_recommendations} recomendações no pipeline.`
  );

  if (total_evaluated > 0) {
    pontos_chave.push(
      `Assertividade Decisiva: ${decisive_hit_rate_percent}% de acertos contra ${consolidated.erro_percent}% de taxa de erro.`
    );
  }

  if (impact_breakdown.total_value_delivered_brl > 0) {
    pontos_chave.push(
      `Valor Contábil Entregue: R$ +${impact_breakdown.total_value_delivered_brl.toFixed(2)} (Lucro Gerado: R$ ${impact_breakdown.profit_generation.incremental_profit_generated_brl.toFixed(2)} | Prejuízo Evitado: R$ ${impact_breakdown.loss_prevention.loss_prevented_brl.toFixed(2)}).`
    );
  }

  if (impact_breakdown.stability_maintenance.stability_preserved_count > 0) {
    pontos_chave.push(
      `Estabilidade Operacional: ${impact_breakdown.stability_maintenance.stability_preserved_count} campanha(s) mantida(s) em equilíbrio contábil sem oscilações desnecessárias.`
    );
  }

  pontos_chave.push(
    `Idade da Inteligência: ${intelligence_age.intelligence_age_days} dia(s) (${intelligence_age.stage_label}).`
  );

  return {
    status,
    headline,
    summary,
    acao_mais_assertiva,
    areas_de_atencao,
    indice_confiabilidade,
    pontos_chave,
  };
}
