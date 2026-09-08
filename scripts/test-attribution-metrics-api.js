/**
 * scripts/test-attribution-metrics-api.js
 *
 * Suíte de Testes Automatizada: Endpoint Contábil /api/v1/attribution/metrics (Fase 4.3)
 *
 * Testes obrigatórios:
 * 1. ✓ Multi-tenant (Loja A R$ 6.000 vs Loja B R$ 5.000 -> 0 vazamento)
 * 2. ✓ Modelos de atribuição (last_click, first_click, linear, u_shaped)
 * 3. ✓ Receita recuperada (is_recovered = true)
 * 4. ✓ Conversões assistidas (is_assisted = true)
 * 5. ✓ Agrupamento e ordenação de campanhas
 * 6. ✓ Performance (HTTP response < 100ms)
 * 7. ✓ Limpeza completa de todos os registros de teste no Supabase
 */

const http = require("http");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

const STORE_A = "dckb5g-7d";
const STORE_B = "store_isolation_test_tenant_b";
const TIMESTAMP = Date.now();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

const keepAliveAgent = new http.Agent({ keepAlive: true });

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: 3000,
      path: urlPath,
      method: "GET",
      agent: keepAliveAgent,
      headers: {
        "Accept": "application/json",
      },
    };

    const start = performance.now();
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        const clientLatency = Math.round(performance.now() - start);
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw), clientLatency });
        } catch {
          resolve({ status: res.statusCode, raw, clientLatency });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function insertLedgerSlices(slices) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/revenue_ledger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(slices),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao inserir slices de teste: ${err}`);
  }
  return res.json();
}

async function runSuite() {
  console.log("\n=================================================================");
  console.log("🚀 SUÍTE DE TESTES: ENDPOINT CONTÁBIL ATTRIBUTION METRICS (FASE 4.3)");
  console.log("=================================================================\n");

  const createdOrderIdsA = [
    `ORD_METRICS_A1_${TIMESTAMP}`,
    `ORD_METRICS_A2_${TIMESTAMP}`,
    `ORD_METRICS_A3_${TIMESTAMP}`,
  ];
  const createdOrderIdsB = [`ORD_METRICS_B1_${TIMESTAMP}`];
  const allTestOrderIds = [...createdOrderIdsA, ...createdOrderIdsB];

  const nowIso = new Date().toISOString();

  try {
    // ---------------------------------------------------------------------------
    // SETUP: Criação de Massa Controlada para Loja A e Loja B
    // ---------------------------------------------------------------------------
    console.log("📌 Configurando massa contábil de teste no public.revenue_ledger...");

    const testSlices = [];

    // ==========================================
    // LOJA A: 3 Pedidos
    // Pedido A1: R$ 1.000,00 (Single-touch, Campanha Topo)
    // Pedido A2: R$ 2.000,00 (Multi-touch com 2 toques: Toque 1 Topo, Toque 2 Remarketing)
    // Pedido A3: R$ 3.000,00 (Single-touch, Remarketing, Recuperado)
    // ==========================================

    // --- Pedido A1: R$ 1.000,00 ---
    for (const model of ["last_click", "first_click", "linear", "u_shaped"]) {
      testSlices.push({
        store_id: STORE_A,
        order_id: createdOrderIdsA[0],
        order_value: 1000.0,
        currency: "BRL",
        attribution_model: model,
        campaign_id: "camp_topo_100",
        campaign_name: "Campanha Topo de Funil",
        source: "facebook",
        attribution_weight: 1.0,
        attributed_revenue: 1000.0,
        confidence_score: 90,
        attribution_method: "native_pixel",
        is_recovered: false,
        is_assisted: false,
        touchpoint_index: 1,
        total_touchpoints: 1,
        order_paid_at: nowIso,
      });
    }

    // --- Pedido A2: R$ 2.000,00 (2 toques: Toque 1 Topo, Toque 2 Remarketing) ---
    // Last Click: Toque 1 peso 0 (assisted), Toque 2 peso 1.0 (R$ 2000)
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "last_click",
      campaign_id: "camp_topo_100",
      campaign_name: "Campanha Topo de Funil",
      source: "facebook",
      attribution_weight: 0.0,
      attributed_revenue: 0.0,
      confidence_score: 80,
      attribution_method: "assisted",
      is_recovered: false,
      is_assisted: true,
      touchpoint_index: 1,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "last_click",
      campaign_id: "camp_rem_200",
      campaign_name: "Campanha Remarketing",
      source: "facebook",
      attribution_weight: 1.0,
      attributed_revenue: 2000.0,
      confidence_score: 100,
      attribution_method: "forensic_fbc",
      is_recovered: false,
      is_assisted: false,
      touchpoint_index: 2,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });

    // First Click: Toque 1 peso 1.0 (R$ 2000), Toque 2 peso 0
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "first_click",
      campaign_id: "camp_topo_100",
      campaign_name: "Campanha Topo de Funil",
      source: "facebook",
      attribution_weight: 1.0,
      attributed_revenue: 2000.0,
      confidence_score: 80,
      attribution_method: "assisted",
      is_recovered: false,
      is_assisted: false,
      touchpoint_index: 1,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "first_click",
      campaign_id: "camp_rem_200",
      campaign_name: "Campanha Remarketing",
      source: "facebook",
      attribution_weight: 0.0,
      attributed_revenue: 0.0,
      confidence_score: 100,
      attribution_method: "forensic_fbc",
      is_recovered: false,
      is_assisted: false,
      touchpoint_index: 2,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });

    // Linear: Toque 1 peso 0.5 (R$ 1000), Toque 2 peso 0.5 (R$ 1000)
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "linear",
      campaign_id: "camp_topo_100",
      campaign_name: "Campanha Topo de Funil",
      source: "facebook",
      attribution_weight: 0.5,
      attributed_revenue: 1000.0,
      confidence_score: 80,
      attribution_method: "assisted",
      is_recovered: false,
      is_assisted: true,
      touchpoint_index: 1,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "linear",
      campaign_id: "camp_rem_200",
      campaign_name: "Campanha Remarketing",
      source: "facebook",
      attribution_weight: 0.5,
      attributed_revenue: 1000.0,
      confidence_score: 100,
      attribution_method: "forensic_fbc",
      is_recovered: false,
      is_assisted: false,
      touchpoint_index: 2,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });

    // U-Shaped (com N=2: 50/50): Toque 1 R$ 1000, Toque 2 R$ 1000
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "u_shaped",
      campaign_id: "camp_topo_100",
      campaign_name: "Campanha Topo de Funil",
      source: "facebook",
      attribution_weight: 0.5,
      attributed_revenue: 1000.0,
      confidence_score: 80,
      attribution_method: "assisted",
      is_recovered: false,
      is_assisted: true,
      touchpoint_index: 1,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });
    testSlices.push({
      store_id: STORE_A,
      order_id: createdOrderIdsA[1],
      order_value: 2000.0,
      currency: "BRL",
      attribution_model: "u_shaped",
      campaign_id: "camp_rem_200",
      campaign_name: "Campanha Remarketing",
      source: "facebook",
      attribution_weight: 0.5,
      attributed_revenue: 1000.0,
      confidence_score: 100,
      attribution_method: "forensic_fbc",
      is_recovered: false,
      is_assisted: false,
      touchpoint_index: 2,
      total_touchpoints: 2,
      order_paid_at: nowIso,
    });

    // --- Pedido A3: R$ 3.000,00 (Single-touch, Remarketing, RECUPERADO) ---
    for (const model of ["last_click", "first_click", "linear", "u_shaped"]) {
      testSlices.push({
        store_id: STORE_A,
        order_id: createdOrderIdsA[2],
        order_value: 3000.0,
        currency: "BRL",
        attribution_model: model,
        campaign_id: "camp_rem_200",
        campaign_name: "Campanha Remarketing",
        source: "facebook",
        attribution_weight: 1.0,
        attributed_revenue: 3000.0,
        confidence_score: 100,
        attribution_method: "forensic_identity",
        is_recovered: true, // Recurso chave da Fase 3
        is_assisted: false,
        touchpoint_index: 1,
        total_touchpoints: 1,
        order_paid_at: nowIso,
      });
    }

    // ==========================================
    // LOJA B: 1 Pedido de R$ 5.000,00 (Isolamento)
    // ==========================================
    for (const model of ["last_click", "first_click", "linear", "u_shaped"]) {
      testSlices.push({
        store_id: STORE_B,
        order_id: createdOrderIdsB[0],
        order_value: 5000.0,
        currency: "BRL",
        attribution_model: model,
        campaign_id: "camp_tenant_b",
        campaign_name: "Campanha Exclusiva Loja B",
        source: "google",
        attribution_weight: 1.0,
        attributed_revenue: 5000.0,
        confidence_score: 90,
        attribution_method: "webhook_utm",
        is_recovered: false,
        is_assisted: false,
        touchpoint_index: 1,
        total_touchpoints: 1,
        order_paid_at: nowIso,
      });
    }

    await insertLedgerSlices(testSlices);
    console.log(`  ✅ [SETUP] ${testSlices.length} fatias inseridas com sucesso no revenue_ledger!\n`);

    // ---------------------------------------------------------------------------
    // TESTE 1: Multi-tenant (Isolamento Rigoroso)
    // ---------------------------------------------------------------------------
    console.log("👉 TESTE 1: Isolamento Multi-tenant (Loja A vs Loja B)");
    const resA = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=last_click`);
    assert(resA.status === 200, "Status HTTP 200 para Loja A");
    assert(resA.data.ok === true, "Endpoint retornou ok: true");
    assert(resA.data.storeId === STORE_A, `storeId retornado é ${STORE_A}`);

    // Loja A deve totalizar exatamente R$ 6.000,00 (1000 + 2000 + 3000)
    // NUNCA deve incluir os R$ 5.000,00 da Loja B (o que daria R$ 11.000,00)
    assert(
      resA.data.metrics.totalRevenue === 6000.0,
      `Loja A totalRevenue é R$ 6000.00 (obtido: R$ ${resA.data.metrics.totalRevenue})`
    );
    assert(
      resA.data.metrics.totalRevenue !== 11000.0,
      "Garantido: Nenhum centavo da Loja B vazou para a Loja A"
    );
    assert(resA.data.metrics.totalOrders === 3, "totalOrders da Loja A é exatamente 3");

    // Validação da Loja B isolada
    const resB = await get(`/api/v1/attribution/metrics?store_id=${STORE_B}&model=last_click`);
    assert(resB.status === 200, "Status HTTP 200 para Loja B");
    assert(
      resB.data.metrics.totalRevenue === 5000.0,
      `Loja B totalRevenue é R$ 5000.00 isolado (obtido: R$ ${resB.data.metrics.totalRevenue})`
    );
    assert(resB.data.metrics.totalOrders === 1, "totalOrders da Loja B é exatamente 1");

    // Validação de erro se faltar store_id
    const resNoStore = await get("/api/v1/attribution/metrics");
    assert(resNoStore.status === 400, "Rejeita requisição sem store_id com HTTP 400");
    assert(resNoStore.data.error === "store_id is required", "Mensagem clara de store_id obrigatório");

    // ---------------------------------------------------------------------------
    // TESTE 2: Modelos de Atribuição (last_click, first_click, linear, u_shaped)
    // ---------------------------------------------------------------------------
    console.log("\n👉 TESTE 2: Modelos de Atribuição e Distribuição Financeira");

    // 2.1 Last Click: Topo = 1000 (do pedido 1) | Remarketing = 5000 (2000 do pedido 2 + 3000 do pedido 3)
    const resLast = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=last_click`);
    assert(resLast.status === 200, "Modelo last_click responde 200");
    const lastCampTopo = resLast.data.campaigns.find((c) => c.campaignId === "camp_topo_100");
    const lastCampRem = resLast.data.campaigns.find((c) => c.campaignId === "camp_rem_200");
    assert(lastCampTopo.attributedRevenue === 1000.0, "Last Click: Topo de Funil recebe R$ 1000.00");
    assert(lastCampRem.attributedRevenue === 5000.0, "Last Click: Remarketing recebe R$ 5000.00");

    // 2.2 First Click: Topo = 3000 (1000 do pedido 1 + 2000 do pedido 2) | Remarketing = 3000 (do pedido 3)
    const resFirst = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=first_click`);
    assert(resFirst.status === 200, "Modelo first_click responde 200");
    const firstCampTopo = resFirst.data.campaigns.find((c) => c.campaignId === "camp_topo_100");
    const firstCampRem = resFirst.data.campaigns.find((c) => c.campaignId === "camp_rem_200");
    assert(firstCampTopo.attributedRevenue === 3000.0, "First Click: Topo de Funil recebe R$ 3000.00 (reconhecendo o primeiro toque!)");
    assert(firstCampRem.attributedRevenue === 3000.0, "First Click: Remarketing recebe R$ 3000.00");

    // 2.3 Linear: Topo = 2000 (1000 do ped 1 + 1000 do ped 2) | Remarketing = 4000 (1000 do ped 2 + 3000 do ped 3)
    const resLinear = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=linear`);
    assert(resLinear.status === 200, "Modelo linear responde 200");
    const linCampTopo = resLinear.data.campaigns.find((c) => c.campaignId === "camp_topo_100");
    const linCampRem = resLinear.data.campaigns.find((c) => c.campaignId === "camp_rem_200");
    assert(linCampTopo.attributedRevenue === 2000.0, "Linear: Topo de Funil recebe R$ 2000.00 equilibrado");
    assert(linCampRem.attributedRevenue === 4000.0, "Linear: Remarketing recebe R$ 4000.00 equilibrado");

    // 2.4 U-Shaped: Topo = 2000 | Remarketing = 4000 (com 2 toques, 50% para cada)
    const resUShaped = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=u_shaped`);
    assert(resUShaped.status === 200, "Modelo u_shaped responde 200");
    const uCampTopo = resUShaped.data.campaigns.find((c) => c.campaignId === "camp_topo_100");
    assert(uCampTopo.attributedRevenue === 2000.0, "U-Shaped: Topo recebe R$ 2000.00");

    // Validação de modelo inválido
    const resBadModel = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=magic_touch`);
    assert(resBadModel.status === 400, "Rejeita modelo inválido com HTTP 400");
    assert(resBadModel.data.error === "Invalid attribution model", "Mensagem de erro de modelo inválido");

    // ---------------------------------------------------------------------------
    // TESTE 3: Receita Recuperada (is_recovered = true)
    // ---------------------------------------------------------------------------
    console.log("\n👉 TESTE 3: Receita Recuperada pelo ATM (is_recovered)");
    // Pedido A3 foi o único marcado como is_recovered = true no valor de R$ 3.000,00
    assert(
      resA.data.metrics.recoveredRevenue === 3000.0,
      `recoveredRevenue reporta exatamente R$ 3000.00 recuperados (obtido: R$ ${resA.data.metrics.recoveredRevenue})`
    );

    // ---------------------------------------------------------------------------
    // TESTE 4: Conversões Assistidas (is_assisted = true)
    // ---------------------------------------------------------------------------
    console.log("\n👉 TESTE 4: Conversões Assistidas (is_assisted)");
    // Pedido A2 teve o Toque 1 marcado com is_assisted = true
    assert(
      resA.data.metrics.assistedConversions === 1,
      `assistedConversions reporta 1 pedido com toque assistido (obtido: ${resA.data.metrics.assistedConversions})`
    );

    // ---------------------------------------------------------------------------
    // TESTE 5: Agrupamento e Ordenação de Campanhas
    // ---------------------------------------------------------------------------
    console.log("\n👉 TESTE 5: Agrupamento e Ordenação de Campanhas");
    assert(resA.data.campaigns.length === 2, "Loja A tem exatamente 2 campanhas agrupadas");

    // No last_click: Remarketing (5000) vem antes de Topo (1000)
    assert(
      resA.data.campaigns[0].campaignId === "camp_rem_200",
      "Primeira campanha é a de maior receita (camp_rem_200)"
    );
    assert(
      resA.data.campaigns[0].attributedRevenue >= resA.data.campaigns[1].attributedRevenue,
      "Campanhas ordenadas rigorosamente por attributedRevenue decrescente"
    );
    assert(resA.data.campaigns[0].source === "facebook", "Origem da campanha é facebook");
    assert(resA.data.campaigns[0].ordersCount === 2, "Remarketing tocou em 2 pedidos distintos");

    // ---------------------------------------------------------------------------
    // TESTE 6: Performance (< 100ms)
    // ---------------------------------------------------------------------------
    console.log("\n👉 TESTE 6: Performance e Latência da Consulta Indexada");
    const perfRuns = [];
    for (let i = 0; i < 5; i++) {
      const perfRes = await get(`/api/v1/attribution/metrics?store_id=${STORE_A}&model=last_click`);
      perfRuns.push(perfRes.clientLatency);
    }
    const avgLatency = Math.round(perfRuns.reduce((a, b) => a + b, 0) / perfRuns.length);
    console.log(`  ⏱️ Latências medidas: [${perfRuns.join("ms, ")}ms] (Média: ${avgLatency}ms)`);
    assert(
      avgLatency < 100,
      `Tempo de resposta HTTP médio é menor que 100ms (obtido: ${avgLatency}ms)`
    );
  } finally {
    // ---------------------------------------------------------------------------
    // TESTE 7: Limpeza Rigorosa no Banco
    // ---------------------------------------------------------------------------
    console.log("\n📌 TESTE 7: Limpeza de todos os registros de teste no revenue_ledger...");
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/revenue_ledger?order_id=in.(${allTestOrderIds.join(",")})`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (delRes.ok) {
      assert(true, "Todos os registros de teste de ambas as lojas foram 100% removidos");
    } else {
      console.error(`  ⚠️ Falha na limpeza: ${await delRes.text()}`);
    }
  }

  console.log("\n=================================================================");
  console.log(`🏁 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error("❌ Erro fatal na suíte:", err);
  process.exit(1);
});
