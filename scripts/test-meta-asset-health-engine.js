/**
 * scripts/test-meta-asset-health-engine.js
 *
 * FASE 9.1 — Suíte de Testes Automatizada do Meta Asset Intelligence Engine
 *
 * Valida os 5 casos de teste obrigatórios:
 * 1. Conta Premium (300 dias, gasto alto, billing 0 falhas, EMQ 95) -> Score > 85, SAFE_TO_SCALE
 * 2. Conta Frankenstein (5 dias, sem histórico) -> Score < 70, WARNING
 * 3. Billing quebrado (3 falhas de pagamento) -> HIGH / CRITICAL RISK, DO_NOT_SCALE
 * 4. Restrição Meta (disabled_reason=true / status=2) -> CRITICAL, DO_NOT_SCALE
 * 5. Multi-Tenant (Isolamento estrito entre loja A e loja B)
 */

const path = require("path");

const webDir = path.resolve(__dirname, "../web");
// Importa o engine usando require (via ts-node ou dist se compilado, ou utilitário transpilado)
const { generateAssetHealthScore } = require(path.join(webDir, "src/lib/intelligence/meta-asset-health-engine.ts"));

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

function runTests() {
  console.log("=================================================================");
  console.log("🧠 ATM — META ASSET INTELLIGENCE ENGINE (SUÍTE FASE 9.1)");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // TESTE 1: Conta Premium
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/5] Testando Caso 1 — Conta Premium (Alta Maturidade)...");
  const premiumResult = generateAssetHealthScore({
    storeId: "loja_premium",
    assetType: "ad_account",
    assetId: "act_premium_123",
    assetName: "Conta Premium de Produção",
    metrics: {
      account_age_days: 300,
      amount_spent_brl: 85000,
      account_status: 1,
      disabled_reason: 0,
      payment_failures: 0,
      has_active_payment_method: true,
      has_pending_balance: false,
      disapproved_ads_count: 0,
      event_match_quality: 95,
      has_pixel_active: true,
      has_capi_active: true,
      current_daily_spend: 1500,
      historical_max_spend: 5000,
      delivery_stability: 95,
    },
  });

  assert(
    premiumResult.score > 85 && premiumResult.decision === "SAFE_TO_SCALE" && premiumResult.tier === "excellent",
    "Caso 1 — Conta Premium",
    `Score: ${premiumResult.score} | Tier: ${premiumResult.tier} | Decision: ${premiumResult.decision}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Conta Frankenstein (Nova sem histórico)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/5] Testando Caso 2 — Conta Frankenstein (Nova / Sem histórico)...");
  const frankensteinResult = generateAssetHealthScore({
    storeId: "loja_novata",
    assetType: "ad_account",
    assetId: "act_frank_456",
    assetName: "Conta Novata Criada Ontem",
    metrics: {
      account_age_days: 5,
      amount_spent_brl: 0,
      account_status: 1,
      payment_failures: 0,
      event_match_quality: 50,
    },
  });

  assert(
    frankensteinResult.score < 70 && frankensteinResult.tier === "warning",
    "Caso 2 — Conta Frankenstein",
    `Score: ${frankensteinResult.score} | Tier: ${frankensteinResult.tier} | Decision: ${frankensteinResult.decision}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Billing Quebrado (3 falhas de pagamento)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/5] Testando Caso 3 — Billing Quebrado (3+ Falhas de Pagamento)...");
  const billingFailResult = generateAssetHealthScore({
    storeId: "loja_billing_issue",
    assetType: "ad_account",
    assetId: "act_billing_789",
    metrics: {
      account_age_days: 120,
      amount_spent_brl: 10000,
      account_status: 1,
      payment_failures: 3,
      has_active_payment_method: false,
    },
  });

  assert(
    (billingFailResult.risk_level === "critical" || billingFailResult.risk_level === "high") && billingFailResult.decision === "DO_NOT_SCALE",
    "Caso 3 — Billing Quebrado",
    `Risk Level: ${billingFailResult.risk_level} | Decision: ${billingFailResult.decision} | Max Multiplier: ${billingFailResult.recommendation.max_budget_multiplier}x`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Restrição Meta (disabled_reason=true / status=2)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/5] Testando Caso 4 — Restrição Meta (Conta Desativada)...");
  const restrictedResult = generateAssetHealthScore({
    storeId: "loja_bloqueada",
    assetType: "ad_account",
    assetId: "act_restricted_999",
    metrics: {
      account_age_days: 200,
      amount_spent_brl: 50000,
      account_status: 2, // Disabled
      disabled_reason: 1, // Policy Violation
    },
  });

  assert(
    restrictedResult.tier === "critical" && restrictedResult.decision === "DO_NOT_SCALE" && restrictedResult.recommendation.allowed === false,
    "Caso 4 — Restrição Meta",
    `Tier: ${restrictedResult.tier} | Decision: ${restrictedResult.decision} | Allowed: ${restrictedResult.recommendation.allowed}`
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/5] Testando Caso 5 — Isolamento Multi-Tenant...");
  const storeAResult = generateAssetHealthScore({
    storeId: "store_alpha",
    assetType: "ad_account",
    assetId: "act_alpha_001",
    metrics: { account_age_days: 100, amount_spent_brl: 20000 },
  });

  const storeBResult = generateAssetHealthScore({
    storeId: "store_beta",
    assetType: "ad_account",
    assetId: "act_beta_002",
    metrics: { account_age_days: 10, amount_spent_brl: 100 },
  });

  const isIsolated =
    storeAResult.store_id === "store_alpha" &&
    storeBResult.store_id === "store_beta" &&
    storeAResult.asset_id !== storeBResult.asset_id &&
    storeAResult.score !== storeBResult.score;

  assert(
    isIsolated,
    "Caso 5 — Isolamento Multi-Tenant",
    `Store A (${storeAResult.store_id}): ${storeAResult.score} pts | Store B (${storeBResult.store_id}): ${storeBResult.score} pts`
  );

  console.log("\n=================================================================");
  console.log(`📊 RESULTADO FINAL DOS TESTES: ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
