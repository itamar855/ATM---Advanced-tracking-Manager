/**
 * scripts/test-campaign-recommendation-auditor.js
 *
 * FASE 10.2 — Suíte de Testes do Campaign Recommendation Auditor™
 *
 * Validações Mandatórias:
 * 1. Caso Real do Usuário (XYZ): SCALE +30% pós-72h (CPA R$ 32 -> R$ 35) -> ACERTO.
 * 2. Caso Erro no Scale: CPA rompe o teto máximo tolerado ou gasto sem vendas -> ERRO.
 * 3. Validação de Desfecho para REDUCE e PAUSE (contenção de perdas e parada de sangramento).
 * 4. Camada de Explicação Humana (Copywriting comercial, bullet points com métricas reais e badges).
 * 5. Modo Simulação / Shadow Mode (is_simulation: true, pensamento passivo registrado).
 * 6. Pesos Ajustáveis por Perfil de Risco (BALANCED, AGGRESSIVE, CONSERVATIVE).
 * 7. Cálculo de Assertividade Histórica do Algoritmo (Hit Rate %).
 * 8. Persistência de Auditoria com Snapshots e Isolamento Multi-Tenant.
 */

const path = require("path");
const { spawnSync } = require("child_process");

// Executa via tsx para suporte nativo a TypeScript e resolução de módulos
if (!process.env.RUNNING_UNDER_TSX) {
  const rootDir = path.resolve(__dirname, "..");
  const webDir = path.resolve(rootDir, "web");
  const isWin = process.platform === "win32";
  const npxCmd = isWin ? "npx.cmd" : "npx";

  const result = spawnSync(npxCmd, ["tsx", `"${__filename}"`], {
    cwd: webDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      RUNNING_UNDER_TSX: "true",
    },
  });

  process.exit(result.status ?? 0);
}

const {
  evaluateCampaignBridge,
  calculateConfidenceScore,
} = require("../web/src/lib/intelligence/campaign-intelligence-bridge");

const {
  buildHumanExplanation,
  evaluateRecommendationOutcome,
  calculateAlgorithmAccuracy,
  getProfileWeights,
  buildConfidenceBadge,
} = require("../web/src/lib/intelligence/campaign-recommendation-auditor");

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`✅ [PASS] ${testName}${details ? ` — ${details}` : ""}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${details ? ` — ${details}` : ""}`);
    failedCount++;
  }
}

async function runAllAuditorTests() {
  console.log("=================================================================");
  console.log("🔍 ATM — CENTRAL DE RECOMENDAÇÕES E AUDITORIA (SUÍTE FASE 10.2)");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // TESTE 1: Caso Real do Usuário (Campanha XYZ, SCALE +30%, 72h)
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/8] Testando Caso 1 — Avaliação de 72h do Caso Real (CPA R$ 32 -> R$ 35)...");
  const metricsBeforeXYZ = {
    spend_brl: 1000,
    orders: 31,
    revenue_brl: 4650,
    cpa: 32.0,
    max_acceptable_cpa: 55.0,
    roas: 4.65,
    roi: 3.65,
    profit: 3650,
  };

  const metricsAfterXYZ = {
    spend_brl: 1300,
    orders: 37,
    revenue_brl: 5550,
    cpa: 35.14,
    max_acceptable_cpa: 55.0,
    roas: 4.27,
    roi: 3.27,
    profit: 4250,
  };

  const outcomeXYZ = evaluateRecommendationOutcome({
    store_id: "store_user_real",
    campaign_id: "camp_XYZ",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 30,
    metrics_before: metricsBeforeXYZ,
    metrics_after: metricsAfterXYZ,
    evaluation_window_hours: 72,
  });

  assert(
    outcomeXYZ.outcome_result === "ACERTO",
    "Caso 1.1: Resultado classificado como ACERTO no caso real de escala",
    `Resultado: ${outcomeXYZ.outcome_result}`
  );
  assert(
    outcomeXYZ.reason_code === "PROFIT_GROWTH_AFTER_SCALE",
    "Caso 1.2: reason_code padronizado PROFIT_GROWTH_AFTER_SCALE",
    `Código: ${outcomeXYZ.reason_code}`
  );
  assert(
    outcomeXYZ.metrics_delta.delta_orders === 6,
    "Caso 1.3: Expansão de volume confirmada (+6 vendas após escala)",
    `Delta Pedidos: +${outcomeXYZ.metrics_delta.delta_orders}`
  );
  assert(
    outcomeXYZ.metrics_delta.delta_profit === 600,
    "Caso 1.4: Lucro contábil líquido expandido em +R$ 600,00",
    `Delta Lucro: R$ +${outcomeXYZ.metrics_delta.delta_profit}`
  );
  assert(
    outcomeXYZ.metrics_delta.delta_cpa_percent <= 15,
    "Caso 1.5: Diluição saudável do CPA no leilão (+9.8% com margem líquida positiva)",
    `Variação CPA: +${outcomeXYZ.metrics_delta.delta_cpa_percent}%`
  );
  assert(
    outcomeXYZ.outcome_reason.includes("Lucro incremental aumentou"),
    "Caso 1.6: Justificativa analítica fundamenta a absorção do leilão sem preconceito ao CPA absoluto",
    `Motivo: ${outcomeXYZ.outcome_reason}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 1B: Proteção Temporal / Janela Mínima de Avaliação (Anti-Falso Erro Intradiário)
  // Cenário: Escala às 10h. Às 14h gastou mais mas ainda não converteu.
  // Proteção: Retorna PENDING_EVALUATION e bloqueia ACERTO/ERRO prematuro.
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [1B] Testando Proteção Temporal — Bloqueio de falso ERRO intradiário às 14h...");
  const metrics10h = {
    spend_brl: 1000,
    orders: 31,
    revenue_brl: 4650,
    cpa: 32.0,
    max_acceptable_cpa: 55.0,
    roas: 4.65,
    roi: 3.65,
    profit: 3650,
    captured_at: "2026-09-10T10:00:00Z",
  };

  const metrics14h = {
    spend_brl: 1150, // Gastou +R$ 150 entre 10h e 14h
    orders: 31,      // Conversões ainda não consolidadas (delay de leilão/compras da noite)
    revenue_brl: 4650,
    cpa: 37.10,      // CPA subiu momentaneamente no intradiário
    max_acceptable_cpa: 55.0,
    roas: 4.04,
    roi: 3.04,
    profit: 3500,    // Lucro momentaneamente menor (-R$ 150)
    captured_at: "2026-09-10T14:00:00Z",
  };

  // Avaliação prematura com apenas 4 horas decorridas (mesmo dia):
  const outcomePremature = evaluateRecommendationOutcome({
    store_id: "store_user_real",
    campaign_id: "camp_XYZ",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 30,
    metrics_before: metrics10h,
    metrics_after: metrics14h,
    recommended_at: "2026-09-10T10:00:00Z",
    evaluated_at: "2026-09-10T14:00:00Z",
    evaluation_window_hours: 72,
  });

  assert(
    outcomePremature.outcome_result === "PENDING_EVALUATION",
    "Caso 1B.1: Recomendação bloqueada como PENDING_EVALUATION às 14h (apenas 4h decorridas)",
    `Resultado: ${outcomePremature.outcome_result}`
  );
  assert(
    outcomePremature.reason_code === "EVALUATION_WINDOW_NOT_ELAPSED",
    "Caso 1B.2: reason_code canônico EVALUATION_WINDOW_NOT_ELAPSED",
    `Código: ${outcomePremature.reason_code}`
  );
  assert(
    outcomePremature.outcome_reason.includes("Janela mínima de maturação temporal não atingida"),
    "Caso 1B.3: Motivo explicita janela mínima de maturação e proteção D+1/D+3",
    `Motivo: ${outcomePremature.outcome_reason}`
  );

  // Agora após 72h (D+3 consolidado, as vendas da tarde/noite entraram):
  const outcomeMature = evaluateRecommendationOutcome({
    store_id: "store_user_real",
    campaign_id: "camp_XYZ",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 30,
    metrics_before: metrics10h,
    metrics_after: metricsAfterXYZ,
    recommended_at: "2026-09-10T10:00:00Z",
    evaluated_at: "2026-09-13T10:00:00Z", // 72 horas depois
    evaluation_window_hours: 72,
  });

  assert(
    outcomeMature.outcome_result === "ACERTO",
    "Caso 1B.4: Após consolidação de 72h, recomendação é devidamente avaliada como ACERTO",
    `Resultado: ${outcomeMature.outcome_result}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Caso de Erro no Scale (CPA Estourado e Degradação de Margem)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/8] Testando Caso 2 — Avaliação de ERRO no Scale (CPA estoura o teto)...");
  const metricsBeforeFail = {
    spend_brl: 1000,
    orders: 31,
    revenue_brl: 4500,
    cpa: 32.0,
    max_acceptable_cpa: 45.0, // Teto R$ 45
    roas: 4.5,
    roi: 3.5,
    profit: 3500,
  };

  const metricsAfterFail = {
    spend_brl: 1300,
    orders: 24, // Queda de vendas apesar de gastar mais
    revenue_brl: 3600,
    cpa: 54.17, // Rompeu teto R$ 45
    max_acceptable_cpa: 45.0,
    roas: 2.77,
    roi: 1.77,
    profit: 2300,
  };

  const outcomeFail = evaluateRecommendationOutcome({
    store_id: "store_user_real",
    campaign_id: "camp_fail_01",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 30,
    metrics_before: metricsBeforeFail,
    metrics_after: metricsAfterFail,
    evaluation_window_hours: 72,
  });

  assert(
    outcomeFail.outcome_result === "ERRO",
    "Caso 2.1: Classificado como ERRO quando o CPA pós-escala rompe o teto",
    `Resultado: ${outcomeFail.outcome_result}`
  );
  assert(
    outcomeFail.reason_code === "SCALE_MARGIN_COLLAPSE",
    "Caso 2.2: reason_code padronizado SCALE_MARGIN_COLLAPSE na destruição de margem",
    `Código: ${outcomeFail.reason_code}`
  );
  assert(
    outcomeFail.outcome_reason.includes("Aumento de orçamento destruiu margem"),
    "Caso 2.3: Justificativa identifica destruição de margem",
    `Motivo: ${outcomeFail.outcome_reason}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Avaliação de Desfecho para REDUCE, PAUSE e Volume Insuficiente
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/8] Testando Caso 3 — Avaliação de Desfecho para REDUCE, PAUSE e NEUTRO...");
  // 3A: REDUCE bem-sucedido (CPA caiu e conteve perda)
  const outcomeReduce = evaluateRecommendationOutcome({
    store_id: "store_test",
    campaign_id: "camp_red_01",
    action: "REDUCE_BUDGET_PERCENT",
    budget_change_percent: -20,
    metrics_before: {
      spend_brl: 800,
      orders: 10,
      revenue_brl: 900,
      cpa: 80,
      max_acceptable_cpa: 55,
      roas: 1.12,
      roi: 0.12,
      profit: 100,
    },
    metrics_after: {
      spend_brl: 640,
      orders: 12,
      revenue_brl: 1080,
      cpa: 53.33,
      max_acceptable_cpa: 55,
      roas: 1.68,
      roi: 0.68,
      profit: 440,
    },
    evaluation_window_hours: 48,
  });

  assert(
    outcomeReduce.outcome_result === "ACERTO" && outcomeReduce.reason_code === "LOSS_PREVENTION_AFTER_REDUCE",
    "Caso 3.1: REDUCE avaliado como ACERTO com reason_code LOSS_PREVENTION_AFTER_REDUCE",
    `Resultado: ${outcomeReduce.outcome_result} (${outcomeReduce.reason_code})`
  );

  // 3B: PAUSE bem-sucedido (Interrupção de sangramento crônico)
  const outcomePause = evaluateRecommendationOutcome({
    store_id: "store_test",
    campaign_id: "camp_pause_01",
    action: "PAUSE_CAMPAIGN",
    budget_change_percent: -100,
    metrics_before: {
      spend_brl: 180,
      orders: 0,
      revenue_brl: 0,
      cpa: 0,
      max_acceptable_cpa: 60,
      roas: 0,
      roi: -1.0,
      profit: -180,
    },
    metrics_after: {
      spend_brl: 180,
      orders: 0,
      revenue_brl: 0,
      cpa: 0,
      max_acceptable_cpa: 60,
      roas: 0,
      roi: -1.0,
      profit: -180,
    },
    evaluation_window_hours: 72,
  });

  assert(
    outcomePause.outcome_result === "ACERTO" && outcomePause.reason_code === "BLEEDING_HALTED_AFTER_PAUSE",
    "Caso 3.2: PAUSE avaliado como ACERTO com reason_code BLEEDING_HALTED_AFTER_PAUSE",
    `Resultado: ${outcomePause.outcome_result} (${outcomePause.reason_code})`
  );

  // 3C: NEUTRO por volume estatístico insuficiente (< 5 pedidos)
  const outcomeNeutro = evaluateRecommendationOutcome({
    store_id: "store_test",
    campaign_id: "camp_neu_01",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 20,
    metrics_before: {
      spend_brl: 100,
      orders: 2,
      revenue_brl: 300,
      cpa: 50,
      max_acceptable_cpa: 60,
      roas: 3.0,
      roi: 2.0,
      profit: 200,
    },
    metrics_after: {
      spend_brl: 120,
      orders: 3,
      revenue_brl: 450,
      cpa: 40,
      max_acceptable_cpa: 60,
      roas: 3.75,
      roi: 2.75,
      profit: 330,
    },
  });

  assert(
    outcomeNeutro.outcome_result === "NEUTRO" && outcomeNeutro.reason_code === "INSUFFICIENT_DATA",
    "Caso 3.3: NEUTRO atribuído quando volume é estatisticamente preliminar (< 5 pedidos)",
    `Resultado: ${outcomeNeutro.outcome_result} (${outcomeNeutro.reason_code})`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Camada de Explicação Humana (Human-First Copywriting)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/8] Testando Caso 4 — Geração da Camada de Explicação Humana...");
  const humanScale = buildHumanExplanation({
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 30,
    confidence_score: 95,
    metrics: metricsBeforeXYZ,
    asset_health_score: 92,
    asset_permission: "SAFE",
    data_maturity_score: 100,
    is_simulation: true,
  });

  assert(
    humanScale.headline === "🚀 O ATM recomenda aumentar orçamento (+30%)",
    "Caso 4.1: Headline amigável gerada com clareza comercial",
    `Headline: ${humanScale.headline}`
  );
  assert(
    humanScale.bullet_points.length >= 4,
    "Caso 4.2: Pelo menos 4 evidências com dados concretos fornecidas",
    `Total bullets: ${humanScale.bullet_points.length}`
  );
  assert(
    humanScale.bullet_points.some((b) => b.includes("31 compras confirmadas")),
    "Caso 4.3: Bullet point cita volume exato de conversões confirmadas"
  );
  assert(
    humanScale.bullet_points.some((b) => b.includes("abaixo do teto tolerado")),
    "Caso 4.4: Bullet point cita margem de segurança do CPA contra o limite"
  );
  assert(
    humanScale.confidence_badge.label === "Altíssima Confiança" && humanScale.confidence_badge.color === "emerald",
    "Caso 4.5: Badge visual de confiança atribuído com cor emerald",
    `Badge: ${humanScale.confidence_badge.label} (${humanScale.confidence_badge.color})`
  );
  assert(
    humanScale.simulation_note.includes("Modo Simulação"),
    "Caso 4.6: Nota de Shadow Mode presente e transparente"
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Integração do Modo Simulação (Shadow Mode) na Bridge
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/8] Testando Caso 5 — Integração do Modo Simulação na Bridge...");
  const bridgeSimulation = evaluateCampaignBridge({
    store_id: "store_sim_01",
    campaign_id: "camp_sim_01",
    campaign_name: "Campanha em Shadow Mode",
    profit_score: 95,
    recommended_action: "SCALE",
    suggested_budget_change: 30,
    asset_health_score: 90,
    is_simulation: true, // Modo Simulação explícito
    campaign_metrics: {
      orders: 28,
      spend_brl: 1000,
      revenue_brl: 4500,
      cpa: 35.71,
      max_acceptable_cpa: 60,
      roas: 4.5,
      roi: 3.5,
      profit: 3500,
    },
  });

  assert(
    bridgeSimulation.is_simulation === true,
    "Caso 5.1: Flag is_simulation ativada na recomendação da Bridge",
    `is_simulation: ${bridgeSimulation.is_simulation}`
  );
  assert(
    bridgeSimulation.simulation_thought.includes("O ATM teria recomendado SCALE_BUDGET_PERCENT (+30%)"),
    "Caso 5.2: Pensamento do algoritmo (simulation_thought) registrado para auditoria",
    `Thought: ${bridgeSimulation.simulation_thought}`
  );
  assert(
    bridgeSimulation.metrics_before && bridgeSimulation.metrics_before.orders === 28,
    "Caso 5.3: Snapshot de métricas iniciais (metrics_before) registrado fielmente",
    `Orders no snapshot: ${bridgeSimulation.metrics_before.orders}`
  );
  assert(
    bridgeSimulation.human_explanation && bridgeSimulation.human_explanation.headline.includes("aumentar orçamento"),
    "Caso 5.4: Explicação humana anexada ao objeto da Bridge"
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Estrutura de Perfil Preservada e BALANCED Travado por Padrão
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/8] Testando Caso 6 — Perfil de Confiança (BALANCED Travado por Padrão)...");
  const defaultWeights = getProfileWeights();
  const explicitBalanced = getProfileWeights("BALANCED");
  const futureAggressive = getProfileWeights("AGGRESSIVE");
  const futureConservative = getProfileWeights("CONSERVATIVE");

  assert(
    defaultWeights.profile === "BALANCED" &&
      defaultWeights.profit_weight === 0.50 &&
      defaultWeights.asset_weight === 0.30 &&
      defaultWeights.data_maturity_weight === 0.20,
    "Caso 6.1: Perfil padrão BALANCED preserva peso canônico (50% profit, 30% asset, 20% maturidade)",
    `P: ${defaultWeights.profit_weight}, A: ${defaultWeights.asset_weight}, M: ${defaultWeights.data_maturity_weight}`
  );
  assert(
    explicitBalanced.profile === "BALANCED" &&
      futureAggressive.profile === "BALANCED" &&
      futureConservative.profile === "BALANCED",
    "Caso 6.2: Estrutura de perfis preservada para o futuro sem alterar decisões críticas nesta fase",
    `Default: ${defaultWeights.profile}, Aggressive: ${futureAggressive.profile}, Conservative: ${futureConservative.profile}`
  );
  assert(
    calculateConfidenceScore(95, 70, 100, defaultWeights) === calculateConfidenceScore(95, 70, 100, futureAggressive),
    "Caso 6.3: Consistência garantida: comportamento analítico idêntico nesta fase de observação"
  );

  // ---------------------------------------------------------------------------
  // TESTE 7: Cálculo de Assertividade Histórica (Hit Rate %)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [7/8] Testando Caso 7 — Cálculo da Taxa de Assertividade Histórica (Hit Rate)...");
  const mockBatch = [
    outcomeXYZ,        // ACERTO
    outcomeXYZ,        // ACERTO
    outcomeReduce,     // ACERTO
    outcomePause,      // ACERTO
    outcomeFail,       // ERRO
    outcomePremature,  // PENDING_EVALUATION
  ];

  const accuracy = calculateAlgorithmAccuracy(mockBatch);
  assert(
    accuracy.total_evaluated === 6,
    "Caso 7.1: Total de 6 recomendações avaliadas no lote",
    `Total: ${accuracy.total_evaluated}`
  );
  assert(
    accuracy.total_acerto === 4 && accuracy.total_erro === 1 && accuracy.total_pending === 1,
    "Caso 7.2: Contagem correta: 4 acertos, 1 erro e 1 pendente de janela temporal",
    `Acertos: ${accuracy.total_acerto} | Erros: ${accuracy.total_erro} | Pendentes: ${accuracy.total_pending}`
  );
  assert(
    accuracy.hit_rate_percent === 80.0,
    "Caso 7.3: Taxa de assertividade matemática exata de 80.0% preservada (pendentes não distorcem)",
    `Hit Rate: ${accuracy.hit_rate_percent}%`
  );

  // ---------------------------------------------------------------------------
  // TESTE 8: Isolamento Multi-Tenant na Auditoria
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [8/8] Testando Caso 8 — Isolamento Multi-Tenant na Auditoria...");
  const evaluationTenantA = evaluateRecommendationOutcome({
    store_id: "store_tenant_a",
    campaign_id: "camp_a",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 20,
    metrics_before: metricsBeforeXYZ,
    metrics_after: metricsAfterXYZ,
  });

  const evaluationTenantB = evaluateRecommendationOutcome({
    store_id: "store_tenant_b",
    campaign_id: "camp_b",
    action: "SCALE_BUDGET_PERCENT",
    budget_change_percent: 20,
    metrics_before: metricsBeforeFail,
    metrics_after: metricsAfterFail,
  });

  assert(
    evaluationTenantA.outcome_result === "ACERTO" && evaluationTenantB.outcome_result === "ERRO",
    "Caso 8.1: Avaliações independentes por tenant mantidas com isolamento total",
    `Tenant A: ${evaluationTenantA.outcome_result} vs Tenant B: ${evaluationTenantB.outcome_result}`
  );

  // ---------------------------------------------------------------------------
  // SUMÁRIO FINAL
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`📊 RESULTADO DOS TESTES DA AUDITORIA (FASE 10.2): ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllAuditorTests().catch((err) => {
  console.error("❌ Erro fatal nos testes da Central de Auditoria:", err);
  process.exit(1);
});
