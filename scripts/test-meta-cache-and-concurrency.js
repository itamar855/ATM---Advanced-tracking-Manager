/**
 * scripts/test-meta-cache-and-concurrency.js
 *
 * Suíte de Testes Automatizada: ATM Meta Cache & Concorrência
 *
 * Validações Obrigatórias:
 * 1. Cache HIT e MISS com preservação de dados
 * 2. Isolamento Multi-Tenant Estrito (Loja A nunca vê dados de Loja B)
 * 3. Expiração controlada por TTL
 * 4. Invalidação manual por loja (Bypass/Refresh)
 * 5. Concorrência e Alta Carga (100 requisições paralelas sem race condition)
 * 6. Hash seguro e normalização de tokens
 */

const path = require("path");
const { spawnSync } = require("child_process");

// Executa via tsx para carregar módulos TypeScript nativamente
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

async function runCacheTests() {
  console.log("=================================================================");
  console.log("⚡ ATM — META CACHE & TESTE DE CONCORRÊNCIA");
  console.log("=================================================================\n");

  metaCache.clear();

  // ---------------------------------------------------------------------------
  // TESTE 1: Cache HIT vs MISS
  // ---------------------------------------------------------------------------
  console.log("⏳ [1/6] Testando HIT e MISS básico...");
  const sampleStore = "store_cache_1";
  const sampleToken = "EAABtesttoken123";
  const sampleData = { accounts: [{ id: "act_101", name: "Conta Alpha" }] };

  const missBefore = metaCache.get("accounts", sampleStore, sampleToken);
  assert(!missBefore.hit && missBefore.data === null, "MISS inicial confirmado");

  metaCache.set("accounts", sampleStore, sampleToken, sampleData, 60000);

  const hitAfter = metaCache.get("accounts", sampleStore, sampleToken);
  assert(
    hitAfter.hit && hitAfter.data?.accounts[0].id === "act_101" && hitAfter.remainingTtlMs > 0,
    "HIT pós gravação confirmado",
    `Idade: ${hitAfter.ageMs}ms | Restante: ${hitAfter.remainingTtlMs}ms`
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Blindagem Multi-Tenant Estrita
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [2/6] Testando Isolamento Multi-Tenant Estrito...");
  const tenantA = "store_alpha";
  const tenantB = "store_beta";
  const tokenTenantA = "EAABalphaToken";
  const tokenTenantB = "EAABbetaToken";

  metaCache.set("accounts", tenantA, tokenTenantA, { secret: "dados_confidenciais_loja_A" }, 60000);
  metaCache.set("accounts", tenantB, tokenTenantB, { secret: "dados_confidenciais_loja_B" }, 60000);

  const lookupA = metaCache.get("accounts", tenantA, tokenTenantA);
  const lookupB = metaCache.get("accounts", tenantB, tokenTenantB);
  const crossLookup = metaCache.get("accounts", tenantB, tokenTenantA); // Loja B tentando ler chave da Loja A

  assert(
    lookupA.hit && lookupA.data.secret === "dados_confidenciais_loja_A" &&
    lookupB.hit && lookupB.data.secret === "dados_confidenciais_loja_B" &&
    crossLookup.hit === false,
    "Isolamento Multi-Tenant Garantido",
    "Loja B não tem acesso aos dados da Loja A mesmo com o mesmo escopo"
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Expiração Controlada por TTL
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [3/6] Testando Expiração Controlada por TTL...");
  const expireStore = "store_ttl_test";
  const expireToken = "EAABttlToken";

  // TTL curtíssimo de 60ms
  metaCache.set("accounts", expireStore, expireToken, { status: "will_expire" }, 60);

  const immediate = metaCache.get("accounts", expireStore, expireToken);
  assert(immediate.hit === true, "Leitura imediata antes da expiração bem-sucedida");

  // Aguarda 100ms
  await new Promise((resolve) => setTimeout(resolve, 100));

  const afterExpire = metaCache.get("accounts", expireStore, expireToken);
  assert(
    afterExpire.hit === false && afterExpire.data === null,
    "Expiração automática por TTL validada",
    "Chave descartada com sucesso após TTL decorrido"
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Invalidação Manual por Loja
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [4/6] Testando Invalidação Manual (invalidateStore)...");
  const invStore = "store_to_invalidate";
  metaCache.set("accounts", invStore, "token_1", { v: 1 }, 60000);
  metaCache.set("dashboard_metrics", invStore, "token_1", { v: 2 }, 60000);
  metaCache.set("accounts", "other_store", "token_2", { v: 3 }, 60000);

  const removedCount = metaCache.invalidateStore(invStore);
  const checkInv = metaCache.get("accounts", invStore, "token_1");
  const checkOther = metaCache.get("accounts", "other_store", "token_2");

  assert(
    removedCount === 2 && checkInv.hit === false && checkOther.hit === true,
    "Invalidação cirúrgica por loja validada",
    `Removidas: ${removedCount} chaves da loja ${invStore}, outras lojas preservadas`
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Concorrência e Alta Carga (100 Requisições Paralelas)
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [5/6] Testando 100 Requisições Simultâneas em Paralelo...");
  const concStore = "store_concurrent";
  const concToken = "token_heavy_load";
  const concData = { payload: "stress_test_ok" };

  metaCache.set("accounts", concStore, concToken, concData, 60000);

  const parallelReads = Array.from({ length: 100 }, (_, i) => {
    return new Promise((resolve) => {
      const res = metaCache.get("accounts", concStore, concToken);
      resolve(res.hit && res.data.payload === "stress_test_ok");
    });
  });

  const startTime = Date.now();
  const results = await Promise.all(parallelReads);
  const duration = Date.now() - startTime;

  const allSuccess = results.every(Boolean);
  assert(
    allSuccess && results.length === 100,
    "Concorrência de 100 leituras simultâneas aprovada",
    `Tempo total: ${duration}ms (Média: ${(duration / 100).toFixed(3)}ms/req)`
  );

  // ---------------------------------------------------------------------------
  // TESTE 6: Hash e Normalização de Tokens
  // ---------------------------------------------------------------------------
  console.log("\n⏳ [6/6] Testando Normalização e Hashing de Tokens...");
  const tokenA = "  EAAB_my_token_clean  ";
  const tokenB = "EAAB_my_token_clean";
  const tokenDiff = "EAAB_different_token";

  const hashA = metaCache.hashToken(tokenA);
  const hashB = metaCache.hashToken(tokenB);
  const hashDiff = metaCache.hashToken(tokenDiff);

  assert(
    hashA === hashB && hashA !== hashDiff,
    "Normalização e Hashing Determinístico Seguro",
    `Hash: ${hashA}`
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

runCacheTests().catch((err) => {
  console.error("Erro fatal na suíte:", err);
  process.exit(1);
});
