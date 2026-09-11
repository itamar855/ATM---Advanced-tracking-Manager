/**
 * scripts/test-decision-maturity-engine.js
 *
 * FASE 10.3 — Suíte de Testes do Motor de Maturidade das Decisões do ATM™
 *
 * Validações Mandatórias:
 * 1. Cálculo consolidado de métricas globais (Total, Avaliadas, Acerto %, Erro %, Neutro %, Pending %, Hit Rate %).
 * 2. Trava estrita de maturidade estatística para HIGH_PERFORMANCE_MATURE (exige >= 5 escalas avaliadas).
 * 3. Categorização Contábil de Impacto (PROFIT_GENERATION, LOSS_PREVENTION, STABILITY_MAINTENANCE).
 * 4. Cálculo da Idade da Inteligência (intelligence_age_days) e seus estágios evolutivos.
 * 5. Quebra granular e isolamento por ação (SCALE, REDUCE, PAUSE, NO_ACTION).
 * 6. Veredito Executivo em Português Brasileiro e transições de status.
 * 7. Isolamento multi-tenant estrito (Store Alpha vs Store Beta).
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
  computeDecisionMaturityMetrics,
  calculateIntelligenceAge,
} = require("../web/src/lib/intelligence/decision-maturity-engine");

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

async function runMaturityTests() {
  console.log("=================================================================");
  console.log("🧠 ATM — MOTOR DE MATURIDADE DAS DECISÕES (SUÍTE FASE 10.3)");
  console.log("=================================================================\n");

  const now = new Date("2026-09-11T12:00:00Z");

  // ---------------------------------------------------------------------------
  // TESTE 1: Cálculo Consolidado Global de Métricas
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/7] Testando Cálculo Consolidado de Métricas Globais...");
  const mockDataset = [
    // 4 Acertos em Scale (+R$ 600 cada)
    { store_id: "store_01", campaign_id: "c1", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 600 }, created_at: "2026-09-01T10:00:00Z" },
    { store_id: "store_01", campaign_id: "c2", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 600 }, created_at: "2026-09-02T10:00:00Z" },
    { store_id: "store_01", campaign_id: "c3", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 600 }, created_at: "2026-09-03T10:00:00Z" },
    { store_id: "store_01", campaign_id: "c4", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 600 }, created_at: "2026-09-04T10:00:00Z" },
    // 1 Erro em Scale (-R$ 300)
    { store_id: "store_01", campaign_id: "c5", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", outcome_metrics_delta: { delta_profit: -300 }, created_at: "2026-09-05T10:00:00Z" },
    // 2 Acertos em Reduce (evitou R$ 150 de sangramento cada)
    { store_id: "store_01", campaign_id: "c6", action: "REDUCE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 150 }, created_at: "2026-09-06T10:00:00Z" },
    { store_id: "store_01", campaign_id: "c7", action: "REDUCE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 150 }, created_at: "2026-09-07T10:00:00Z" },
    // 1 Acerto em Pause (evitou R$ 200 de queima)
    { store_id: "store_01", campaign_id: "c8", action: "PAUSE_CAMPAIGN", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 200 }, created_at: "2026-09-08T10:00:00Z" },
    // 1 Neutro em Maintain
    { store_id: "store_01", campaign_id: "c9", action: "NO_ACTION", outcome_result: "NEUTRO", outcome_metrics_delta: { delta_profit: 0 }, created_at: "2026-09-09T10:00:00Z" },
    // 1 Acerto em Maintain (estabilidade preservada)
    { store_id: "store_01", campaign_id: "c10", action: "NO_ACTION", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 0 }, created_at: "2026-09-09T12:00:00Z" },
    // 2 Pendentes em Maturação D+1/D+3
    { store_id: "store_01", campaign_id: "c11", action: "SCALE_BUDGET_PERCENT", outcome_result: "PENDING_EVALUATION", created_at: "2026-09-11T09:00:00Z" },
    { store_id: "store_01", campaign_id: "c12", action: "REDUCE_BUDGET_PERCENT", outcome_result: "PENDING_EVALUATION", created_at: "2026-09-11T10:00:00Z" },
  ];

  const analysis1 = computeDecisionMaturityMetrics(mockDataset, "store_01", 30, now);
  const c = analysis1.consolidated;

  assert(c.total_recommendations === 12, "Caso 1.1: Total bruto de 12 recomendações registradas", `Total: ${c.total_recommendations}`);
  assert(c.total_evaluated === 10, "Caso 1.2: Total de 10 recomendações avaliadas pós-janela", `Avaliadas: ${c.total_evaluated}`);
  assert(c.total_pending_evaluation === 2, "Caso 1.3: Total de 2 recomendações pendentes de maturação temporal", `Pendentes: ${c.total_pending_evaluation}`);
  assert(c.total_acerto === 8, "Caso 1.4: Contagem correta de 8 acertos (4 scale, 2 reduce, 1 pause, 1 maintain)", `Acertos: ${c.total_acerto}`);
  assert(c.total_erro === 1, "Caso 1.5: Contagem correta de 1 erro", `Erros: ${c.total_erro}`);
  assert(c.total_neutro === 1, "Caso 1.6: Contagem correta de 1 neutro", `Neutros: ${c.total_neutro}`);
  assert(c.acerto_percent === 80.0, "Caso 1.7: Percentual de acerto sobre avaliadas é 80.0%", `Acerto %: ${c.acerto_percent}%`);
  assert(c.erro_percent === 10.0, "Caso 1.8: Percentual de erro sobre avaliadas é 10.0%", `Erro %: ${c.erro_percent}%`);
  assert(c.neutro_percent === 10.0, "Caso 1.9: Percentual de neutro sobre avaliadas é 10.0%", `Neutro %: ${c.neutro_percent}%`);
  assert(c.pending_percent === 16.67, "Caso 1.10: Percentual pendente sobre total é 16.67%", `Pending %: ${c.pending_percent}%`);
  assert(c.decisive_hit_rate_percent === 88.89, "Caso 1.11: Assertividade decisiva purificada é 88.89% (8 acertos em 9 conclusivas)", `Hit Rate: ${c.decisive_hit_rate_percent}%`);

  // ---------------------------------------------------------------------------
  // TESTE 2: Trava Estrita de Maturidade Estatística para HIGH_PERFORMANCE_MATURE
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/7] Testando Trava de Maturidade (Exigência de >= 5 Escalas Avaliadas)...");
  // Cenário 2A: 20 avaliações com Hit Rate 90%, mas apenas 4 escalas avaliadas
  const dataset20With4Scales = [];
  for (let i = 1; i <= 4; i++) {
    dataset20With4Scales.push({
      store_id: "store_gate",
      campaign_id: `scale_${i}`,
      action: "SCALE_BUDGET_PERCENT",
      outcome_result: "ACERTO",
      outcome_metrics_delta: { delta_profit: 500 },
      created_at: "2026-08-01T10:00:00Z",
    });
  }
  for (let i = 1; i <= 16; i++) {
    dataset20With4Scales.push({
      store_id: "store_gate",
      campaign_id: `reduce_${i}`,
      action: "REDUCE_BUDGET_PERCENT",
      outcome_result: i <= 14 ? "ACERTO" : "ERRO",
      outcome_metrics_delta: { delta_profit: 100 },
      created_at: "2026-08-05T10:00:00Z",
    });
  }

  const analysisGate = computeDecisionMaturityMetrics(dataset20With4Scales, "store_gate", 30, now);
  assert(
    analysisGate.consolidated.total_evaluated === 20,
    "Caso 2.1: Volume total de 20 avaliações atingido",
    `Total avaliado: ${analysisGate.consolidated.total_evaluated}`
  );
  assert(
    analysisGate.consolidated.decisive_hit_rate_percent >= 75,
    "Caso 2.2: Hit rate decisivo excelente (90%)",
    `Hit rate: ${analysisGate.consolidated.decisive_hit_rate_percent}%`
  );
  assert(
    analysisGate.consolidated.total_scale_evaluated === 4,
    "Caso 2.3: Total de escalas avaliadas é 4 (abaixo do teto exigido de 5)",
    `Escalas avaliadas: ${analysisGate.consolidated.total_scale_evaluated}`
  );
  assert(
    analysisGate.veredito.status === "PROMISING_ACCUMULATION",
    "Caso 2.4: Status bloqueado em PROMISING_ACCUMULATION devido à falta de 5 escalas avaliadas",
    `Status obtido: ${analysisGate.veredito.status}`
  );
  assert(
    analysisGate.veredito.areas_de_atencao.includes("Volume de escala ainda preliminar (4 de 5"),
    "Caso 2.5: Áreas de atenção alertam explicitamente a necessidade de mais 1 escala avaliada para maturidade plena",
    `Alerta: ${analysisGate.veredito.areas_de_atencao}`
  );

  // Cenário 2B: Adiciona a 5ª escala avaliada como ACERTO
  dataset20With4Scales.push({
    store_id: "store_gate",
    campaign_id: "scale_5",
    action: "SCALE_BUDGET_PERCENT",
    outcome_result: "ACERTO",
    outcome_metrics_delta: { delta_profit: 600 },
    created_at: "2026-08-10T10:00:00Z",
  });

  const analysisGatePassed = computeDecisionMaturityMetrics(dataset20With4Scales, "store_gate", 30, now);
  assert(
    analysisGatePassed.consolidated.total_scale_evaluated === 5,
    "Caso 2.6: 5 escalas avaliadas confirmadas",
    `Escalas avaliadas: ${analysisGatePassed.consolidated.total_scale_evaluated}`
  );
  assert(
    analysisGatePassed.veredito.status === "HIGH_PERFORMANCE_MATURE",
    "Caso 2.7: Promovido com sucesso para HIGH_PERFORMANCE_MATURE após comprovar 5 escalas avaliadas",
    `Status: ${analysisGatePassed.veredito.status}`
  );
  assert(
    analysisGatePassed.veredito.headline.includes("Sim. O ATM demonstra alta assertividade"),
    "Caso 2.8: Headline executivo afirmativo emitido com segurança contábil"
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Categorização e Cálculo Contábil do Impacto das Decisões
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/7] Testando Separação do Impacto Contábil (PROFIT, LOSS, STABILITY)...");
  const ib = analysis1.consolidated.impact_breakdown;

  assert(
    ib.profit_generation.total_actions === 5 && ib.profit_generation.acertos === 4,
    "Caso 3.1: Geração de lucro (PROFIT_GENERATION) registrou 5 escalas e 4 acertos",
    `Total: ${ib.profit_generation.total_actions}, Acertos: ${ib.profit_generation.acertos}`
  );
  assert(
    ib.profit_generation.incremental_profit_generated_brl === 2400.0,
    "Caso 3.2: Lucro incremental gerado por escala somou exatamente R$ 2.400,00 (4 x 600)",
    `Lucro Gerado: R$ ${ib.profit_generation.incremental_profit_generated_brl}`
  );
  assert(
    ib.loss_prevention.total_actions === 3 && ib.loss_prevention.acertos === 3,
    "Caso 3.3: Prevenção de prejuízo (LOSS_PREVENTION) registrou 3 ações (2 reduce, 1 pause) e 3 acertos",
    `Total: ${ib.loss_prevention.total_actions}, Acertos: ${ib.loss_prevention.acertos}`
  );
  assert(
    ib.loss_prevention.loss_prevented_brl === 500.0,
    "Caso 3.4: Prejuízo evitado somou exatamente R$ 500,00 (150 + 150 + 200)",
    `Prejuízo Evitado: R$ ${ib.loss_prevention.loss_prevented_brl}`
  );
  assert(
    ib.stability_maintenance.stability_preserved_count === 1,
    "Caso 3.5: Estabilidade operacional preservada (STABILITY_MAINTENANCE) confirmada em 1 campanha",
    `Estabilidade Preservada: ${ib.stability_maintenance.stability_preserved_count}`
  );
  assert(
    ib.total_value_delivered_brl === 2900.0,
    "Caso 3.6: Valor econômico total entregue soma R$ 2.900,00 (Lucro Gerado + Prejuízo Evitado)",
    `Valor Total: R$ ${ib.total_value_delivered_brl}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Idade da Inteligência (intelligence_age_days) e Estágios
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/7] Testando Idade da Inteligência e Estágios Evolutivos...");
  // 4A: 5 dias atrás -> EARLY_LEARNING
  const age5Days = calculateIntelligenceAge(
    [{ created_at: "2026-09-06T12:00:00Z" }],
    now
  );
  assert(
    age5Days.intelligence_age_days === 5 && age5Days.stage === "EARLY_LEARNING",
    "Caso 4.1: 5 dias classificado como EARLY_LEARNING (0-7 dias)",
    `Idade: ${age5Days.intelligence_age_days} dias | Estágio: ${age5Days.stage}`
  );

  // 4B: 20 dias atrás -> INITIAL_CALIBRATION
  const age20Days = calculateIntelligenceAge(
    [{ created_at: "2026-08-22T12:00:00Z" }],
    now
  );
  assert(
    age20Days.intelligence_age_days === 20 && age20Days.stage === "INITIAL_CALIBRATION",
    "Caso 4.2: 20 dias classificado como INITIAL_CALIBRATION (8-30 dias)",
    `Idade: ${age20Days.intelligence_age_days} dias | Estágio: ${age20Days.stage}`
  );

  // 4C: 45 dias atrás -> OPERATIONAL_LEARNING
  const age45Days = calculateIntelligenceAge(
    [{ created_at: "2026-07-28T12:00:00Z" }],
    now
  );
  assert(
    age45Days.intelligence_age_days === 45 && age45Days.stage === "OPERATIONAL_LEARNING",
    "Caso 4.3: 45 dias classificado como OPERATIONAL_LEARNING (31-90 dias)",
    `Idade: ${age45Days.intelligence_age_days} dias | Estágio: ${age45Days.stage}`
  );

  // 4D: 100 dias atrás -> MATURE_MODEL
  const age100Days = calculateIntelligenceAge(
    [{ created_at: "2026-06-03T12:00:00Z" }],
    now
  );
  assert(
    age100Days.intelligence_age_days === 100 && age100Days.stage === "MATURE_MODEL",
    "Caso 4.4: 100 dias classificado como MATURE_MODEL (90+ dias)",
    `Idade: ${age100Days.intelligence_age_days} dias | Estágio: ${age100Days.stage}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Quebra Granular por Ação (by_action)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/7] Testando Quebra Granular por Ação...");
  const byAct = analysis1.by_action;

  const scaleMetrics = byAct["SCALE_BUDGET_PERCENT"];
  assert(
    scaleMetrics.total_evaluated === 5 &&
      scaleMetrics.total_acerto === 4 &&
      scaleMetrics.total_erro === 1 &&
      scaleMetrics.decisive_hit_rate_percent === 80.0,
    "Caso 5.1: Métricas de SCALE calculadas com 80.0% de assertividade decisiva",
    `Escala: ${scaleMetrics.total_acerto}/${scaleMetrics.total_evaluated} (${scaleMetrics.decisive_hit_rate_percent}%)`
  );
  assert(
    scaleMetrics.impact_type === "PROFIT_GENERATION",
    "Caso 5.2: Tipo de impacto de SCALE mapeado como PROFIT_GENERATION",
    `Tipo: ${scaleMetrics.impact_type}`
  );

  const reduceMetrics = byAct["REDUCE_BUDGET_PERCENT"];
  assert(
    reduceMetrics.total_acerto === 2 && reduceMetrics.impact_type === "LOSS_PREVENTION",
    "Caso 5.3: Tipo de impacto de REDUCE mapeado como LOSS_PREVENTION com 2 acertos"
  );

  const pauseMetrics = byAct["PAUSE_CAMPAIGN"];
  assert(
    pauseMetrics.total_acerto === 1 && pauseMetrics.financial_impact_brl === 200.0,
    "Caso 5.4: PAUSE registrou impacto financeiro de R$ 200,00 poupados"
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Veredito Executivo em Português e Outros Status
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/7] Testando Veredito Executivo e Transições de Status...");
  // Cenário 6A: Ação mais assertiva identificada
  assert(
    analysis1.veredito.acao_mais_assertiva && analysis1.veredito.acao_mais_assertiva.includes("SCALE"),
    "Caso 6.1: Ação Mais Assertiva (SCALE) destacada no Veredito Executivo",
    `Ação: ${analysis1.veredito.acao_mais_assertiva}`
  );

  // Cenário 6B: CALIBRATION_REQUIRED (quando taxa de erro for alta)
  const datasetHighError = [
    { store_id: "store_err", campaign_id: "e1", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", created_at: "2026-09-01T10:00:00Z" },
    { store_id: "store_err", campaign_id: "e2", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", created_at: "2026-09-02T10:00:00Z" },
    { store_id: "store_err", campaign_id: "e3", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", created_at: "2026-09-03T10:00:00Z" },
    { store_id: "store_err", campaign_id: "e4", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", created_at: "2026-09-04T10:00:00Z" },
    { store_id: "store_err", campaign_id: "e5", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", created_at: "2026-09-05T10:00:00Z" },
  ];
  const analysisError = computeDecisionMaturityMetrics(datasetHighError, "store_err", 30, now);
  assert(
    analysisError.veredito.status === "CALIBRATION_REQUIRED",
    "Caso 6.2: Status classificado como CALIBRATION_REQUIRED quando Hit Rate decisivo cai para 20%",
    `Status: ${analysisError.veredito.status}`
  );
  assert(
    analysisError.veredito.headline.includes("Calibração Necessária"),
    "Caso 6.3: Headline adverte sobre necessidade de calibração operacional"
  );

  // Cenário 6C: INSUFFICIENT_DATA (< 5 avaliações)
  const datasetFew = [
    { store_id: "store_few", campaign_id: "f1", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", created_at: "2026-09-10T10:00:00Z" },
    { store_id: "store_few", campaign_id: "f2", action: "SCALE_BUDGET_PERCENT", outcome_result: "PENDING_EVALUATION", created_at: "2026-09-11T10:00:00Z" },
  ];
  const analysisFew = computeDecisionMaturityMetrics(datasetFew, "store_few", 30, now);
  assert(
    analysisFew.veredito.status === "INSUFFICIENT_DATA",
    "Caso 6.4: Status classificado como INSUFFICIENT_DATA para histórico em formação (< 5 avaliações)",
    `Status: ${analysisFew.veredito.status}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 7: Isolamento Multi-Tenant Estrito
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [7/7] Testando Isolamento Multi-Tenant Estrito...");
  const multiTenantData = [
    { store_id: "tenant_alpha", campaign_id: "ta1", action: "SCALE_BUDGET_PERCENT", outcome_result: "ACERTO", outcome_metrics_delta: { delta_profit: 1000 }, created_at: "2026-09-01T10:00:00Z" },
    { store_id: "tenant_beta", campaign_id: "tb1", action: "SCALE_BUDGET_PERCENT", outcome_result: "ERRO", outcome_metrics_delta: { delta_profit: -500 }, created_at: "2026-09-01T10:00:00Z" },
  ];

  const analysisAlpha = computeDecisionMaturityMetrics(multiTenantData, "tenant_alpha", 30, now);
  const analysisBeta = computeDecisionMaturityMetrics(multiTenantData, "tenant_beta", 30, now);

  assert(
    analysisAlpha.consolidated.total_recommendations === 1 && analysisAlpha.consolidated.total_acerto === 1,
    "Caso 7.1: Tenant Alpha contém exclusivamente suas métricas com 1 acerto",
    `Alpha: ${analysisAlpha.consolidated.total_acerto} acerto`
  );
  assert(
    analysisBeta.consolidated.total_recommendations === 1 && analysisBeta.consolidated.total_erro === 1,
    "Caso 7.2: Tenant Beta contém exclusivamente suas métricas com 1 erro",
    `Beta: ${analysisBeta.consolidated.total_erro} erro`
  );
  assert(
    analysisAlpha.consolidated.impact_breakdown.total_value_delivered_brl === 1000 &&
      analysisBeta.consolidated.impact_breakdown.total_value_delivered_brl === 0,
    "Caso 7.3: Valores contábeis em R$ perfeitamente segregados entre tenants",
    `Alpha: R$ ${analysisAlpha.consolidated.impact_breakdown.total_value_delivered_brl} vs Beta: R$ ${analysisBeta.consolidated.impact_breakdown.total_value_delivered_brl}`
  );

  console.log("\n=================================================================");
  console.log(`📊 RESULTADO DOS TESTES DA MATURIDADE (FASE 10.3): ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMaturityTests().catch((err) => {
  console.error("Erro fatal na execução dos testes de maturidade:", err);
  process.exit(1);
});
