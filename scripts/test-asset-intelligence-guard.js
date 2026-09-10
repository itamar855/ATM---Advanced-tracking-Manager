/**
 * scripts/test-asset-intelligence-guard.js
 *
 * FASE 9.3 — Suíte de Testes Automatizada do ATM Asset Intelligence Guard™
 *
 * Validações Obrigatórias:
 * 1. Caso 1 — Conta Premium -> PASS APPROVED (+30% diário autorizado)
 * 2. Caso 2 — Conta Boa mas CPM Explodindo (>30%) -> RESTRICTED (máx +15% diário)
 * 3. Caso 3 — Billing Quebrado (Falhas de pagamento) -> BLOCKED (0%)
 * 4. Caso 4 — CPA Acima do Limite Máximo -> BLOCKED (0%)
 * 5. Caso 5 — Historical Risk Recovery (Ativo recuperado não sofre penalização eterna)
 * 6. Caso 6 — Isolamento Multi-Tenant (Loja A isolada de Loja B)
 */

const path = require("path");
const { spawnSync } = require("child_process");

// Se executado diretamente pelo Node sem loader TS, executa via npx tsx para resolução nativa de TypeScript
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

const { evaluateAssetGuardAction } = require("../web/src/lib/intelligence/asset-intelligence-guard");

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

async function runGuardTests() {
  console.log("=================================================================");
  console.log("🛡️ ATM — ASSET INTELLIGENCE GUARD™ (SUÍTE DE TESTES FASE 9.3)");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // TESTE 1: Conta Premium -> APPROVED (+30% autorizado)
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/6] Testando Caso 1 — Conta Premium (Alta Maturidade e Margem)...");
  const premiumDecision = await evaluateAssetGuardAction({
    store_id: "store_premium",
    campaign_id: "camp_prem_1",
    action_type: "SCALE_BUDGET_PERCENT",
    requested_increase_percent: 30,
    simulated_metrics: {
      account_age_days: 250,
      amount_spent_brl: 120000,
      bm_verification_status: "verified",
      payment_failures: 0,
      account_status: 1,
      event_match_quality: 94,
      cpm_variation_percent: 8,
      ctr_decay_percent: 5,
      frequency: 1.9,
      recent_roas: 2.8,
      recent_cpa: 35,
      max_acceptable_cpa: 60,
      current_daily_spend: 1500,
    },
  });

  assert(
    premiumDecision.allowed === true &&
    premiumDecision.decision === "APPROVED" &&
    premiumDecision.max_allowed_increase === 30,
    "Caso 1 — Conta Premium",
    `Decisão: ${premiumDecision.decision} | Aumento Autorizado: +${premiumDecision.max_allowed_increase}% diário`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Conta Boa mas CPM Explodindo -> RESTRICTED (máx +15%)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/6] Testando Caso 2 — Conta Boa com CPM Explodindo (>30%)...");
  const cpmSpikeDecision = await evaluateAssetGuardAction({
    store_id: "store_cpm_spike",
    campaign_id: "camp_spike_2",
    action_type: "SCALE_BUDGET_PERCENT",
    requested_increase_percent: 30,
    simulated_metrics: {
      account_age_days: 180,
      amount_spent_brl: 50000,
      payment_failures: 0,
      account_status: 1,
      event_match_quality: 85,
      cpm_variation_percent: 45, // CPM explodindo no leilão (+45%)
      recent_roas: 1.9,
      recent_cpa: 42,
      max_acceptable_cpa: 55,
      current_daily_spend: 800,
    },
  });

  assert(
    cpmSpikeDecision.allowed === true &&
    cpmSpikeDecision.decision === "RESTRICTED" &&
    cpmSpikeDecision.max_allowed_increase === 15,
    "Caso 2 — CPM Explodindo (Poda de Segurança)",
    `Decisão: ${cpmSpikeDecision.decision} | Teto Reduzido para: +${cpmSpikeDecision.max_allowed_increase}%`
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Billing Quebrado -> BLOCKED (0%)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/6] Testando Caso 3 — Billing Quebrado (Falhas de Pagamento)...");
  const billingBlocked = await evaluateAssetGuardAction({
    store_id: "store_billing_fail",
    campaign_id: "camp_fail_3",
    action_type: "SCALE_BUDGET_PERCENT",
    requested_increase_percent: 20,
    simulated_metrics: {
      account_age_days: 120,
      payment_failures: 2, // Falha de cobrança registrada
      has_pending_balance: true,
      account_status: 1,
      recent_roas: 2.0,
    },
  });

  assert(
    billingBlocked.allowed === false &&
    billingBlocked.decision === "BLOCKED" &&
    billingBlocked.max_allowed_increase === 0,
    "Caso 3 — Billing Quebrado",
    `Decisão: ${billingBlocked.decision} | Motivo: ${billingBlocked.reasons[0]}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: CPA Acima do Limite Máximo -> BLOCKED (0%)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/6] Testando Caso 4 — CPA Acima do Limite Aceitável...");
  const cpaBreachDecision = await evaluateAssetGuardAction({
    store_id: "store_cpa_breach",
    campaign_id: "camp_breach_4",
    action_type: "SCALE_BUDGET_PERCENT",
    requested_increase_percent: 20,
    simulated_metrics: {
      account_age_days: 150,
      amount_spent_brl: 40000,
      account_status: 1,
      recent_cpa: 95.0, // CPA Real = R$ 95
      max_acceptable_cpa: 60.0, // CPA Teto = R$ 60 (Estourado)
      recent_roas: 0.9,
    },
  });

  assert(
    cpaBreachDecision.allowed === false &&
    cpaBreachDecision.decision === "BLOCKED" &&
    cpaBreachDecision.max_allowed_increase === 0,
    "Caso 4 — CPA Acima do Limite",
    `Decisão: ${cpaBreachDecision.decision} | Bloqueado: ${!cpaBreachDecision.allowed}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Historical Risk Recovery (Ativo recuperado)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/6] Testando Caso 5 — Historical Risk Recovery (Sem penalização eterna)...");
  const recoveredDecision = await evaluateAssetGuardAction({
    store_id: "store_recovered",
    campaign_id: "camp_rec_5",
    action_type: "SCALE_BUDGET_PERCENT",
    requested_increase_percent: 30,
    simulated_metrics: {
      account_age_days: 220,
      amount_spent_brl: 80000,
      payment_failures: 0,
      account_status: 1,
      days_without_billing_failures: 14, // 14 dias sem nenhum incidente
      days_without_ad_rejections: 20,    // 20 dias sem rejeições
      event_match_quality: 90,
      cpm_variation_percent: 10,
      recent_roas: 2.6,
      recent_cpa: 40,
      max_acceptable_cpa: 60,
    },
  });

  assert(
    recoveredDecision.allowed === true &&
    recoveredDecision.decision === "APPROVED" &&
    recoveredDecision.health_summary.trust_score >= 80,
    "Caso 5 — Historical Risk Recovery",
    `Decisão: ${recoveredDecision.decision} | Trust Score: ${recoveredDecision.health_summary.trust_score} (Recuperado)`
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Isolamento Multi-Tenant
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/6] Testando Caso 6 — Isolamento Multi-Tenant...");
  const decA = await evaluateAssetGuardAction({
    store_id: "tenant_store_a",
    campaign_id: "camp_a_1",
    action_type: "SCALE_BUDGET_PERCENT",
    simulated_metrics: { account_age_days: 200, amount_spent_brl: 60000, recent_roas: 2.5 },
  });

  const decB = await evaluateAssetGuardAction({
    store_id: "tenant_store_b",
    campaign_id: "camp_b_2",
    action_type: "SCALE_BUDGET_PERCENT",
    simulated_metrics: { account_age_days: 10, amount_spent_brl: 200, recent_roas: 0.8 },
  });

  assert(
    decA.decision !== decB.decision &&
    decA.health_summary.score !== decB.health_summary.score,
    "Caso 6 — Isolamento Multi-Tenant",
    `Loja A (${decA.decision}, Score: ${decA.health_summary.score}) isolada de Loja B (${decB.decision}, Score: ${decB.health_summary.score})`
  );

  console.log("\n=================================================================");
  console.log(`📊 RESULTADO FINAL DOS TESTES: ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runGuardTests().catch((err) => {
  console.error("Erro fatal na suíte do Guard:", err);
  process.exit(1);
});
