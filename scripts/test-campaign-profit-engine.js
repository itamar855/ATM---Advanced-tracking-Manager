/**
 * scripts/test-campaign-profit-engine.js
 *
 * FASE 10 — Suíte de Testes Automatizada do Campaign Profit Intelligence Layer™
 *
 * Valida os 5 casos de teste mandatórios:
 * 1. Campanha altamente lucrativa -> Score >= 85, Tier GREEN, Ação SCALE (+20% ou +30%)
 * 2. CPA acima do limite -> Score < 70, Tier RED, Ação REDUCE ou PAUSE
 * 3. ROAS falso por moeda errada (USD spend vs BRL revenue) -> Detecção de falso ROAS, Score < 70, Tier RED
 * 4. Isolamento multi-tenant -> Store A e Store B totalmente desacopladas
 * 5. Campanha sem dados / pouco volume -> Tratamento gracioso contra divisão por zero, MAINTAIN
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
  normalizeCurrencySync,
  calculateProfitPillars,
  evaluateCampaignProfitSync,
  persistCampaignProfitSnapshot,
} = require("../web/src/lib/intelligence/campaign-profit-engine");

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

async function runAllTests() {
  console.log("=================================================================");
  console.log("🧠 ATM — CAMPAIGN PROFIT INTELLIGENCE LAYER (SUÍTE FASE 10)");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // TESTE 1: Campanha Altamente Lucrativa
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/5] Testando Caso 1 — Campanha Altamente Lucrativa (Green / Scale)...");
  const winningCampaign = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_winner_101",
    campaign_name: "Campanha Escala Top Funil",
    spend_original: 1000.0,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 3500.0,
    orders: 28,
    max_acceptable_cpa: 60.0,
    target_roas: 2.0,
  });

  assert(
    winningCampaign.profit_score >= 85,
    "Caso 1.1: Score >= 85",
    `Score obtido: ${winningCampaign.profit_score}/100`
  );
  assert(
    winningCampaign.tier === "GREEN",
    "Caso 1.2: Tier GREEN",
    `Tier obtido: ${winningCampaign.tier}`
  );
  assert(
    winningCampaign.recommended_action === "SCALE",
    "Caso 1.3: Ação recomendada SCALE",
    `Ação: ${winningCampaign.recommended_action}`
  );
  assert(
    winningCampaign.recommended_budget_change >= 20,
    "Caso 1.4: Aumento de orçamento >= +20%",
    `Orçamento recomendado: +${winningCampaign.recommended_budget_change}%`
  );
  assert(
    winningCampaign.profit === 2500 && winningCampaign.roas === 3.5,
    "Caso 1.5: Métricas contábeis exatas",
    `Lucro: R$ ${winningCampaign.profit} | ROAS: ${winningCampaign.roas}x`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: CPA Acima do Limite Aceitável
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/5] Testando Caso 2 — CPA Acima do Limite (Red / Reduce ou Pause)...");
  // Spend R$ 1500, Pedidos 20 -> CPA = R$ 75 (50% acima do teto de R$ 50!)
  // Receita R$ 1600 -> Lucro de apenas R$ 100 (quase breakeven, margem destruída)
  const highCpaCampaign = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_high_cpa_202",
    campaign_name: "Campanha CPA Estourado",
    spend_original: 1500.0,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 1600.0,
    orders: 20,
    max_acceptable_cpa: 50.0, // Teto R$ 50, CPA real = R$ 75
    target_roas: 2.0,
  });

  assert(
    highCpaCampaign.profit_score < 70,
    "Caso 2.1: Score < 70",
    `Score obtido: ${highCpaCampaign.profit_score}/100`
  );
  assert(
    highCpaCampaign.tier === "RED",
    "Caso 2.2: Tier RED",
    `Tier obtido: ${highCpaCampaign.tier}`
  );
  assert(
    highCpaCampaign.recommended_action === "REDUCE" || highCpaCampaign.recommended_action === "PAUSE",
    "Caso 2.3: Ação defensiva REDUCE ou PAUSE",
    `Ação: ${highCpaCampaign.recommended_action} (${highCpaCampaign.recommended_budget_change}%)`
  );
  assert(
    highCpaCampaign.cpa === 75 && highCpaCampaign.cpa > 50,
    "Caso 2.4: CPA acima do limite registrado corretamente",
    `CPA real: R$ ${highCpaCampaign.cpa} vs Teto: R$ 50.00`
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: ROAS Falso por Moeda Errada (USD Spend vs BRL Revenue)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/5] Testando Caso 3 — Detecção de Falso ROAS por Distorção USD/BRL...");
  // Gasto Meta: $ 100 USD
  // Receita Loja: R$ 350 BRL
  // Sem normalização: Pareceria ROAS 3.5x!
  // Normalizado (USD/BRL = 5.40): Spend real = R$ 540 BRL -> ROAS real = 0.65x -> Prejuízo = -R$ 190 BRL!
  const falseRoasCampaign = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_usd_illusion_303",
    campaign_name: "Campanha Meta USD Falso ROAS",
    spend_original: 100.0,
    currency_original: "USD",
    exchange_rate: 5.40,
    revenue_brl: 350.0,
    orders: 5,
    max_acceptable_cpa: 60.0,
    target_roas: 2.0,
  });

  assert(
    falseRoasCampaign.spend_original === 100 && falseRoasCampaign.currency_original === "USD",
    "Caso 3.1: Preserva spend original e moeda USD",
    `Original: ${falseRoasCampaign.spend_original} ${falseRoasCampaign.currency_original}`
  );
  assert(
    falseRoasCampaign.spend_brl === 540.0,
    "Caso 3.2: Converte e audita spend_brl a R$ 540,00",
    `Spend BRL: R$ ${falseRoasCampaign.spend_brl} (Taxa: ${falseRoasCampaign.exchange_rate})`
  );
  assert(
    falseRoasCampaign.false_roas_detected === true,
    "Caso 3.3: Flag false_roas_detected acionada",
    `Falso ROAS superficial: ${falseRoasCampaign.metrics.fake_unnormalized_roas}x vs Real: ${falseRoasCampaign.roas}x`
  );
  assert(
    falseRoasCampaign.profit === -190.0 && falseRoasCampaign.roas < 1.0,
    "Caso 3.4: Prejuízo e ROAS real deficitário identificados",
    `Lucro real: R$ ${falseRoasCampaign.profit} | ROAS real: ${falseRoasCampaign.roas}x`
  );
  assert(
    falseRoasCampaign.tier === "RED" && (falseRoasCampaign.recommended_action === "PAUSE" || falseRoasCampaign.recommended_action === "REDUCE"),
    "Caso 3.5: Proteção contábil acionada contra ilusão de ROAS",
    `Ação: ${falseRoasCampaign.recommended_action} (${falseRoasCampaign.recommended_budget_change}%)`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Isolamento Multi-Tenant Estrito
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/5] Testando Caso 4 — Isolamento Multi-Tenant Estrito...");
  const tenantA = evaluateCampaignProfitSync({
    store_id: "store_alpha",
    campaign_id: "camp_alpha_01",
    spend_original: 500,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 2000,
    orders: 15,
    max_acceptable_cpa: 60,
  });

  const tenantB = evaluateCampaignProfitSync({
    store_id: "store_beta",
    campaign_id: "camp_beta_01",
    spend_original: 2000,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 500,
    orders: 2,
    max_acceptable_cpa: 40,
  });

  assert(
    tenantA.store_id === "store_alpha" && tenantB.store_id === "store_beta",
    "Caso 4.1: IDs de loja preservados com integridade",
    `Tenant A: ${tenantA.store_id} | Tenant B: ${tenantB.store_id}`
  );
  assert(
    tenantA.profit_score >= 85 && tenantB.profit_score < 70,
    "Caso 4.2: Scores de performance independentes sem interferência cruzada",
    `Alpha: ${tenantA.profit_score} pts (GREEN) vs Beta: ${tenantB.profit_score} pts (RED)`
  );
  assert(
    tenantA.recommended_action === "SCALE" && (tenantB.recommended_action === "PAUSE" || tenantB.recommended_action === "REDUCE"),
    "Caso 4.3: Decisões financeiras isoladas por tenant",
    `Alpha: ${tenantA.recommended_action} | Beta: ${tenantB.recommended_action}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Campanha Sem Dados / Pouco Volume (Divisão por Zero Prevenida)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/5] Testando Caso 5 — Campanha Sem Dados / Baixo Volume...");
  // Caso A: Totalmente zerada
  const zeroCampaign = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_zero_501",
    spend_original: 0,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 0,
    orders: 0,
  });

  assert(
    !isNaN(zeroCampaign.profit_score) && !isNaN(zeroCampaign.cpa) && !isNaN(zeroCampaign.roas),
    "Caso 5.1: Proteção matemática contra NaN e divisão por zero",
    `Score: ${zeroCampaign.profit_score} | CPA: ${zeroCampaign.cpa} | ROAS: ${zeroCampaign.roas}`
  );
  assert(
    zeroCampaign.tier === "YELLOW" && zeroCampaign.recommended_action === "MAINTAIN",
    "Caso 5.2: Campanha zerada tratada como MAINTAIN neutro",
    `Ação: ${zeroCampaign.recommended_action} (${zeroCampaign.recommended_budget_change}%)`
  );

  // Caso B: Gasto exploratório inicial (Spend R$ 25, 0 pedidos, teto R$ 60)
  const earlyLearningCampaign = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_learning_502",
    spend_original: 25,
    currency_original: "BRL",
    exchange_rate: 1.0,
    revenue_brl: 0,
    orders: 0,
    max_acceptable_cpa: 60,
  });

  assert(
    earlyLearningCampaign.recommended_action === "MAINTAIN" &&
    earlyLearningCampaign.recommended_budget_change === 0 &&
    earlyLearningCampaign.reason.includes("LEARNING_PHASE_PROTECTION"),
    "Caso 5.3: Trava LEARNING_PHASE_PROTECTION impede pausa prematura com gasto < 1.5x CPA",
    `Ação: ${earlyLearningCampaign.recommended_action} | Motivo: ${earlyLearningCampaign.reason}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Validação de Guardrails e Hierarquia de Decisão (Fase 10 Final)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/6] Testando Guardrails Analíticos e Hierarquia de Prioridades...");

  // a) Campanha nova sem venda (Spend R$ 45, Orders 0, CPA máx R$ 60 -> spend < 90)
  const testA_newNoSales = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_new_test_a",
    spend_original: 45,
    currency_original: "BRL",
    revenue_brl: 0,
    orders: 0,
    max_acceptable_cpa: 60,
  });

  assert(
    testA_newNoSales.recommended_action === "MAINTAIN" &&
    testA_newNoSales.recommended_budget_change === 0 &&
    testA_newNoSales.reason.includes("LEARNING_PHASE_PROTECTION"),
    "Guardrail A: Campanha nova sem venda protegida contra pausa precoce (LEARNING_PHASE_PROTECTION)",
    `Ação: ${testA_newNoSales.recommended_action} (0%)`
  );

  // b) Campanha com 1 venda alta (Spend R$ 35, Revenue R$ 600, Orders 1, CPA máx R$ 60 -> Score >= 85)
  const testB_singleHighSale = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_single_sale_b",
    spend_original: 35,
    currency_original: "BRL",
    revenue_brl: 600,
    orders: 1,
    max_acceptable_cpa: 60,
  });

  assert(
    testB_singleHighSale.recommended_action === "MAINTAIN" &&
    testB_singleHighSale.reason.includes("INSUFFICIENT_CONVERSION_VOLUME"),
    "Guardrail B: Campanha com 1 venda alta barrada de SCALE precoce (INSUFFICIENT_CONVERSION_VOLUME)",
    `Ação: ${testB_singleHighSale.recommended_action} (Pedidos: ${testB_singleHighSale.orders})`
  );

  // c) Campanha vencedora com menos de 5 pedidos (Spend R$ 150, Revenue R$ 750, Orders 4, CPA máx R$ 60)
  const testC_winningUnder5 = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_under5_orders_c",
    spend_original: 150,
    currency_original: "BRL",
    revenue_brl: 750,
    orders: 4,
    max_acceptable_cpa: 60,
  });

  assert(
    testC_winningUnder5.profit_score >= 85 &&
    testC_winningUnder5.recommended_action === "MAINTAIN" &&
    testC_winningUnder5.reason.includes("INSUFFICIENT_CONVERSION_VOLUME"),
    "Guardrail C: Campanha com score >= 85 mas apenas 4 pedidos contida em MAINTAIN (INSUFFICIENT_CONVERSION_VOLUME)",
    `Score: ${testC_winningUnder5.profit_score} | Ação: ${testC_winningUnder5.recommended_action}`
  );

  // d) Campanha madura autorizada para escala (Spend R$ 1200, Revenue R$ 4200, Orders 24, CPA máx R$ 60)
  const testD_matureScale = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_mature_scale_d",
    spend_original: 1200,
    currency_original: "BRL",
    revenue_brl: 4200,
    orders: 24,
    max_acceptable_cpa: 60,
  });

  assert(
    testD_matureScale.profit_score >= 85 &&
    testD_matureScale.recommended_action === "SCALE" &&
    testD_matureScale.recommended_budget_change >= 20 &&
    testD_matureScale.tier === "GREEN",
    "Guardrail D: Campanha madura com volume consolidado (24 pedidos) plenamente autorizada para SCALE (+30%)",
    `Score: ${testD_matureScale.profit_score} | Ação: ${testD_matureScale.recommended_action} (+${testD_matureScale.recommended_budget_change}%)`
  );

  // e) Sangramento real confirmado (Spend R$ 150 >= 1.5x CPA máx R$ 60 = 90, Orders 0)
  const testE_confirmedBleed = evaluateCampaignProfitSync({
    store_id: "store_ecommerce_01",
    campaign_id: "camp_bleed_test_e",
    spend_original: 150,
    currency_original: "BRL",
    revenue_brl: 0,
    orders: 0,
    max_acceptable_cpa: 60,
  });

  assert(
    testE_confirmedBleed.recommended_action === "PAUSE" &&
    testE_confirmedBleed.recommended_budget_change === -100 &&
    testE_confirmedBleed.tier === "RED",
    "Guardrail E: Sangramento confirmado (Spend >= 1.5x CPA sem conversões) aciona PAUSE (-100%)",
    `Ação: ${testE_confirmedBleed.recommended_action} (-100%) | Spend: R$ ${testE_confirmedBleed.spend_brl}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Teste de Persistência Mock / Payload Schema
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [BÔNUS] Testando Contrato de Persistência no Supabase...");
  let capturedPayload = null;
  const mockSupabase = {
    from: (table) => {
      assert(table === "campaign_profit_snapshots", "Tabela alvo é campaign_profit_snapshots");
      return {
        upsert: (payload, options) => {
          capturedPayload = payload;
          assert(options.onConflict === "store_id,campaign_id,date", "onConflict composto configurado");
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "mock-snap-uuid-123" }, error: null }),
            }),
          };
        },
      };
    },
  };

  const persistResult = await persistCampaignProfitSnapshot(winningCampaign, mockSupabase);
  assert(
    persistResult.success === true && persistResult.id === "mock-snap-uuid-123",
    "Persistência mock completada com sucesso",
    `Snapshot ID: ${persistResult.id}`
  );
  assert(
    capturedPayload &&
    capturedPayload.store_id === "store_ecommerce_01" &&
    capturedPayload.spend_original === 1000 &&
    capturedPayload.currency_original === "BRL" &&
    capturedPayload.spend_brl === 1000 &&
    capturedPayload.profit_score >= 85,
    "Payload contábil contém todos os campos normalizados e originais"
  );

  // ---------------------------------------------------------------------------
  // SUMÁRIO FINAL
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`📊 RESULTADO FINAL DOS TESTES: ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

function earlyCampaignSafe(c) {
  return typeof c.profit_score === "number" && !isNaN(c.profit_score) && typeof c.reason === "string";
}

runAllTests().catch((err) => {
  console.error("❌ Erro fatal na execução dos testes:", err);
  process.exit(1);
});
