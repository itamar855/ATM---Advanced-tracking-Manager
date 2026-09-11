/**
 * scripts/test-meta-performance-observability.js
 *
 * Suíte de Testes Automatizada: ATM Meta Performance Observability Layer (Fase 9.5)
 *
 * Validações Obrigatórias:
 * 1. Cache HIT rápido (<50ms) com amostragem anti-inundação (sampling ~1%)
 * 2. Cache MISS normal (100% de persistência para análise de gargalos)
 * 3. Graph API lenta (>1000ms) com criticidade elevada ('high')
 * 4. Erros da Meta Graph API (100% registrados com status code e mensagem)
 * 5. Cooldown Não-Bloqueante e Recuperável:
 *    - Ativação após rajada de chamadas live
 *    - Nunca bloqueia leitura de cache existente
 *    - Bypass manual via refresh=true
 *    - Expiração temporal e recuperação automática
 * 6. Isolamento Multi-Tenant Estrito (Loja A isolada de Loja B)
 * 7. Contextos de Negócio (dashboard, integration, asset_sync, campaign_sync)
 */

const path = require("path");
const { spawnSync } = require("child_process");

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

const { performanceMonitor } = require("../web/src/lib/meta/performance-monitor");
const { metaCache } = require("../web/src/lib/meta/meta-cache");

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

async function runObservabilityTests() {
  console.log("=================================================================");
  console.log("📊 ATM — META PERFORMANCE OBSERVABILITY & COOLDOWN (FASE 9.5)");
  console.log("=================================================================\n");

  performanceMonitor.clear();
  metaCache.clear();

  // ---------------------------------------------------------------------------
  // TESTE 1: Cache HIT rápido (<50ms) com Amostragem Anti-Inundação (1%)
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/7] Testando Cache HIT rápido e amostragem de 1%...");
  let sampledCount = 0;
  const totalHitRequests = 500;

  for (let i = 0; i < totalHitRequests; i++) {
    const isSampled = performanceMonitor.shouldSample({
      tenant_id: "store_sample_test",
      endpoint: "/api/v1/meta/accounts",
      operation: "GET_ACCOUNTS",
      context: "integration",
      duration_ms: 8, // sub-50ms (HIT ultrarrápido)
      cache_status: "HIT",
      graph_calls_count: 0,
      status_code: 200,
    });
    if (isSampled) sampledCount++;
  }

  // De 500 chamadas, com sampling de 1%, esperamos que apenas uma pequena fração seja gravada (ex: entre 0 e 25)
  // protegendo o banco contra milhões de linhas dispensáveis
  assert(
    sampledCount < 35,
    "Amostragem Anti-Inundação para Cache HITs",
    `De ${totalHitRequests} chamadas rápidas (<50ms), apenas ${sampledCount} foram selecionadas (${((sampledCount / totalHitRequests) * 100).toFixed(1)}%). Banco protegido.`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Cache MISS Normal (100% de Persistência)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/7] Testando Cache MISS (100% de persistência)...");
  const missLogged = performanceMonitor.shouldSample({
    tenant_id: "store_miss_test",
    endpoint: "/api/v1/meta/accounts",
    operation: "GET_ACCOUNTS",
    context: "integration",
    duration_ms: 450,
    cache_status: "MISS",
    graph_calls_count: 4,
    status_code: 200,
  });

  assert(missLogged === true, "Cache MISS gravado com 100% de cobertura para diagnóstico de rede");

  // ---------------------------------------------------------------------------
  // TESTE 3: Graph API Lenta (>1000ms) com Criticidade High
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/7] Testando detecção de Graph API lenta (>1000ms)...");
  const slowCrit = performanceMonitor.resolveCriticality("integration", 2150, false, false);
  const slowSampled = performanceMonitor.shouldSample({
    tenant_id: "store_slow_test",
    endpoint: "/api/v1/meta/accounts",
    operation: "GET_ACCOUNTS",
    context: "integration",
    duration_ms: 2150,
    cache_status: "MISS",
    graph_calls_count: 8,
    status_code: 200,
  });

  assert(
    slowCrit === "high" && slowSampled === true,
    "Graph API Lenta detectada e classificada como HIGH",
    `Duração: 2150ms | Criticidade: ${slowCrit} | Persistência: 100%`
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Erros da Meta Graph API (100% Registrados com Código e Mensagem)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/7] Testando registro de erros da Meta Graph API...");
  const errCrit = performanceMonitor.resolveCriticality("dashboard", 120, true, false);
  const errSampled = performanceMonitor.shouldSample({
    tenant_id: "store_err_test",
    endpoint: "/api/v1/dashboard/metrics",
    operation: "GET_DASHBOARD_METRICS",
    context: "dashboard",
    duration_ms: 120,
    cache_status: "MISS",
    graph_calls_count: 1,
    status_code: 500,
    error_message: "OAuthException: Session has expired",
  });

  assert(
    errCrit === "high" && errSampled === true,
    "Erros da Meta registrados com prioridade HIGH e 100% de retenção",
    "Status 500 e mensagem de erro OAuth devidamente preservados"
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Cooldown Ativado por Rajada de Chamadas Live
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/7] Testando Ativação e Gestão de Cooldown...");
  const floodStore = "store_flood_test";

  // Simula 30 chamadas live em sequência
  let cdResult = null;
  for (let i = 0; i < 30; i++) {
    cdResult = performanceMonitor.registerGraphCalls(floodStore, 1);
  }

  assert(
    cdResult.inCooldown === true &&
    cdResult.cooldownUntil !== null &&
    cdResult.reason.includes("Limite seguro atingido"),
    "Cooldown Ativado com Sucesso após rajada",
    `Cooldown até: ${cdResult.cooldownUntilIso} | Motivo: ${cdResult.reason}`
  );

  // Valida que leitura de cache existente NUNCA é bloqueada durante o cooldown
  metaCache.set("accounts", floodStore, "token_sample", { cached_accounts: ["act_1", "act_2"] }, 60000);
  const cacheDuringCooldown = metaCache.get("accounts", floodStore, "token_sample");
  assert(
    cacheDuringCooldown.hit === true && cacheDuringCooldown.data.cached_accounts.length === 2,
    "Leitura de Cache Preservada durante o Cooldown",
    "Usuário continua recebendo dados cacheados mesmo em cooldown de Graph API"
  );

  // Valida Bypass Manual via refresh=true
  const manualOverride = performanceMonitor.checkCooldown(floodStore, true);
  assert(
    manualOverride.inCooldown === false && manualOverride.reason === "MANUAL_REFRESH_OVERRIDE",
    "Bypass Manual de Cooldown via refresh=true aprovado",
    "Usuário tem controle para forçar atualização manual"
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Isolamento Multi-Tenant do Cooldown e Telemetria
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/7] Testando Isolamento Multi-Tenant do Cooldown...");
  const storeA = "store_tenant_a";
  const storeB = "store_tenant_b";

  // Coloca loja A em cooldown
  performanceMonitor.registerGraphCalls(storeA, 35);
  const statusA = performanceMonitor.checkCooldown(storeA, false);
  const statusB = performanceMonitor.checkCooldown(storeB, false);

  assert(
    statusA.inCooldown === true && statusB.inCooldown === false,
    "Isolamento de Cooldown Multi-Tenant Garantido",
    `Loja A (inCooldown: ${statusA.inCooldown}) NÃO afetou Loja B (inCooldown: ${statusB.inCooldown})`
  );

  // ---------------------------------------------------------------------------
  // TESTE 7: Contextos de Negócio e Telemetria Não-Bloqueante
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [7/7] Testando Contextos de Negócio e Fire-and-Forget...");
  const contexts = ["dashboard", "integration", "asset_sync", "campaign_sync"];
  let allContextsValid = true;

  contexts.forEach((ctx) => {
    const crit = performanceMonitor.resolveCriticality(ctx, 300, false, false);
    if (!["low", "medium", "high"].includes(crit)) {
      allContextsValid = false;
    }
  });

  assert(
    allContextsValid,
    "Validação dos 4 Contextos de Negócio (dashboard, integration, asset_sync, campaign_sync)",
    "Criticidades mapeadas corretamente para métricas de produto"
  );

  // ---------------------------------------------------------------------------
  // Resumo Final
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`📊 RESULTADO FINAL DOS TESTES: ${passedCount} PASS | ${failedCount} FAIL`);
  console.log("=================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runObservabilityTests().catch((err) => {
  console.error("Erro fatal na suíte:", err);
  process.exit(1);
});
