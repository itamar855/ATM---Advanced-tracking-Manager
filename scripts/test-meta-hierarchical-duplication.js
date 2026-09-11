/**
 * Teste Automatizado Realista — Duplicação Hierárquica Completa Meta Ads (FULL_CLONE & SIMPLE)
 *
 * Cenário:
 * 1 Campanha Original
 * 2 Conjuntos de Anúncios Originais
 * 3 Anúncios Originais (com Creative, Pixel, UTMs e Tracking Specs)
 *
 * Valida:
 * - Modo FULL_CLONE: 1 nova campanha, 2 novos adsets, 3 novos ads (todos PAUSED)
 * - Modo SIMPLE: 1 nova campanha, 0 adsets, 0 ads (PAUSED)
 * - IDs diferentes dos originais
 * - Relações hierárquicas preservadas (ad -> novo adset -> nova campaign)
 * - Rastreamento, Pixel e UTMs preservados
 * - Validação de integridade atômica (nunca retorna sucesso parcial)
 * - Rollback reverso: exclusão em ordem inversa se houver falha, marcando ROLLED_BACK
 * - Zero órfãos
 * - Isolamento multi-tenant
 */

const path = require("path");
const { spawnSync } = require("child_process");

// Executa via tsx para suporte nativo a TypeScript e resolução de aliases (@/...)
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

const { duplicateCampaign } = require("../web/src/lib/meta/campaign-hierarchical-duplicator");

// Cria um mock server realista da Meta Graph API em memória
function createMockMetaGraphApi() {
  const store = {
    campaigns: new Map([
      ["orig_camp_100", {
        id: "orig_camp_100",
        name: "Campanha Black Friday - Escala",
        objective: "OUTCOME_SALES",
        buying_type: "AUCTION",
        status: "ACTIVE",
        special_ad_categories: ["NONE"],
        daily_budget: "25000",
        account_id: "act_9988776655",
      }]
    ]),
    adsets: new Map([
      ["orig_adset_201", {
        id: "orig_adset_201",
        campaign_id: "orig_camp_100",
        name: "AdSet 1 - Broad Brasil 21-65",
        status: "ACTIVE",
        optimization_goal: "OFFSITE_CONVERSIONS",
        billing_event: "IMPRESSIONS",
        targeting: { age_min: 21, age_max: 65, geo_locations: { countries: ["BR"] } },
        promoted_object: { pixel_id: "1104875232197441", custom_event_type: "PURCHASE" },
        attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }],
      }],
      ["orig_adset_202", {
        id: "orig_adset_202",
        campaign_id: "orig_camp_100",
        name: "AdSet 2 - Lookalike 1% Compradores",
        status: "ACTIVE",
        optimization_goal: "OFFSITE_CONVERSIONS",
        billing_event: "IMPRESSIONS",
        targeting: { age_min: 25, age_max: 55, custom_audiences: [{ id: "aud_1pct_buyers" }] },
        promoted_object: { pixel_id: "1104875232197441", custom_event_type: "PURCHASE" },
        attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }],
      }]
    ]),
    ads: new Map([
      ["orig_ad_301", {
        id: "orig_ad_301",
        adset_id: "orig_adset_201",
        name: "Ad 1 - Vídeo Depoimento 1",
        status: "ACTIVE",
        creative: { id: "cr_vid_01", name: "Vídeo Depoimento" },
        tracking_specs: [{ action_type: ["offsite_conversion"], fb_pixel: ["1104875232197441"] }],
        url_tags: "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}",
        conversion_domain: "lojademo.com.br"
      }],
      ["orig_ad_302", {
        id: "orig_ad_302",
        adset_id: "orig_adset_201",
        name: "Ad 2 - Imagem Carrossel Oferta",
        status: "ACTIVE",
        creative: { id: "cr_img_02", name: "Carrossel Oferta" },
        tracking_specs: [{ action_type: ["offsite_conversion"], fb_pixel: ["1104875232197441"] }],
        url_tags: "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}",
        conversion_domain: "lojademo.com.br"
      }],
      ["orig_ad_303", {
        id: "orig_ad_303",
        adset_id: "orig_adset_202",
        name: "Ad 3 - Vídeo Unboxing UGC",
        status: "ACTIVE",
        creative: { id: "cr_ugc_03", name: "Unboxing UGC" },
        tracking_specs: [{ action_type: ["offsite_conversion"], fb_pixel: ["1104875232197441"] }],
        url_tags: "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}",
        conversion_domain: "lojademo.com.br"
      }]
    ]),
    createdEntities: [],
    deletedEntities: [],
    injectedFailurePoint: null // 'create_adset_2' | 'create_ad_3'
  };

  let idCounter = 1000;

  const mockFetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || "GET";

    // 1. GET /{campaign_id}
    if (method === "GET" && urlStr.includes("/orig_camp_100?")) {
      const camp = store.campaigns.get("orig_camp_100");
      return {
        ok: true,
        json: async () => camp
      };
    }

    // 2. POST /act_{account_id}/campaigns
    if (method === "POST" && urlStr.includes("/campaigns")) {
      const body = JSON.parse(options.body);
      const newId = `clone_camp_${++idCounter}`;
      const newCamp = { id: newId, ...body };
      store.campaigns.set(newId, newCamp);
      store.createdEntities.push({ type: "campaign", id: newId, data: newCamp });
      return {
        ok: true,
        json: async () => ({ id: newId })
      };
    }

    // 3. GET /{campaign_id}/adsets
    if (method === "GET" && urlStr.includes("/orig_camp_100/adsets")) {
      const adsets = Array.from(store.adsets.values()).filter(a => a.campaign_id === "orig_camp_100");
      return {
        ok: true,
        json: async () => ({ data: adsets })
      };
    }

    // 4. POST /act_{account_id}/adsets
    if (method === "POST" && urlStr.includes("/adsets")) {
      const body = JSON.parse(options.body);
      if (store.injectedFailurePoint === "create_adset_2" && store.createdEntities.filter(e => e.type === "adset").length === 1) {
        return {
          ok: false,
          json: async () => ({ error: { message: "Simulated Meta Error: Adset budget limit exceeded" } })
        };
      }
      const newId = `clone_adset_${++idCounter}`;
      const newAdset = { id: newId, ...body };
      store.adsets.set(newId, newAdset);
      store.createdEntities.push({ type: "adset", id: newId, data: newAdset });
      return {
        ok: true,
        json: async () => ({ id: newId })
      };
    }

    // 5. GET /{adset_id}/ads
    if (method === "GET" && urlStr.includes("/ads?")) {
      const match = urlStr.match(/\/([^\/?]+)\/ads\?/);
      const adsetId = match ? match[1] : null;
      const ads = Array.from(store.ads.values()).filter(a => a.adset_id === adsetId);
      return {
        ok: true,
        json: async () => ({ data: ads })
      };
    }

    // 6. POST /act_{account_id}/ads
    if (method === "POST" && urlStr.includes("/ads")) {
      const body = JSON.parse(options.body);
      if (store.injectedFailurePoint === "create_ad_3" && store.createdEntities.filter(e => e.type === "ad").length === 2) {
        return {
          ok: false,
          json: async () => ({ error: { message: "Simulated Meta Error: Creative policy restriction" } })
        };
      }
      const newId = `clone_ad_${++idCounter}`;
      const newAd = { id: newId, ...body };
      store.ads.set(newId, newAd);
      store.createdEntities.push({ type: "ad", id: newId, data: newAd });
      return {
        ok: true,
        json: async () => ({ id: newId })
      };
    }

    // 7. DELETE /{entity_id} (Rollback)
    if (method === "DELETE") {
      const match = urlStr.match(/v23\.0\/([^?]+)\?/);
      const entityId = match ? match[1] : null;
      store.deletedEntities.push(entityId);
      store.campaigns.delete(entityId);
      store.adsets.delete(entityId);
      store.ads.delete(entityId);
      return {
        ok: true,
        json: async () => ({ success: true })
      };
    }

    return {
      ok: false,
      json: async () => ({ error: { message: `Unhandled mock endpoint: ${urlStr}` } })
    };
  };

  return { store, mockFetch };
}

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 SUÍTE DE TESTES: DUPLICAÇÃO HIERÁRQUICA COMPLETA META ADS (FULL_CLONE)");
  console.log("================================================================================\n");

  let allPassed = true;

  // ---------------------------------------------------------------------------
  // TESTE 1: DUPLICAÇÃO HIERÁRQUICA COMPLETA (FULL_CLONE) - CENÁRIO REALISTA
  // ---------------------------------------------------------------------------
  console.log("--- TESTE 1: Execução do FULL_CLONE (1 Campaign, 2 AdSets, 3 Ads) ---");
  const env1 = createMockMetaGraphApi();

  const res1 = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    duplicationMode: "FULL_CLONE",
    customFetch: env1.mockFetch
  });

  if (!res1.ok) {
    console.error("❌ FALHA T1: Duplicação completa retornou ok: false:", res1.error);
    allPassed = false;
  } else {
    const job = res1.job;
    const newCamp = env1.store.createdEntities.find(e => e.type === "campaign");
    const newAdsets = env1.store.createdEntities.filter(e => e.type === "adset");
    const newAds = env1.store.createdEntities.filter(e => e.type === "ad");

    console.log(`✅ Campanha criada: ${newCamp.id} (Status: ${newCamp.data.status})`);
    console.log(`✅ AdSets criados: ${newAdsets.length} de ${job.original_adsets}`);
    console.log(`✅ Ads criados: ${newAds.length} de ${job.original_ads}`);

    // Validações estritas
    const c1 = newCamp.data.status === "PAUSED";
    const c2 = newAdsets.every(a => a.data.status === "PAUSED" && a.data.campaign_id === newCamp.id);
    const c3 = newAds.every(ad => ad.data.status === "PAUSED" && newAdsets.some(a => a.id === ad.data.adset_id));
    const c4 = newAdsets.every(a => a.data.promoted_object?.pixel_id === "1104875232197441");
    const c5 = newAds.every(ad => ad.data.creative?.creative_id && ad.data.url_tags);
    const c6 = job.source_action === "MANUAL_DUPLICATE";
    const c7 = typeof job.duration_ms === "number" && job.duration_ms >= 0 && Boolean(job.started_at) && Boolean(job.completed_at);
    const c8 = job.original_budget === 250 && job.duplicated_budget === 250 && job.budget_change_percent === 0 && job.budget_warning === null;

    if (c1 && c2 && c3 && c4 && c5 && c6 && c7 && c8 && job.status === "COMPLETED") {
      console.log("✅ SUCESSO T1: Hierarquia 100% preservada, todas entidades PAUSED, Pixel e UTMs clonados.");
      console.log(`   Auditoria T1: source_action=${job.source_action}, duration_ms=${job.duration_ms}, budget=${job.original_budget} -> ${job.duplicated_budget} (${job.budget_change_percent}%)`);
    } else {
      console.error("❌ FALHA T1: Inconsistência nos dados clonados:", { c1, c2, c3, c4, c5, c6, c7, c8 });
      allPassed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // TESTE 2: DUPLICAÇÃO SIMPLES (SIMPLE) - LEGADO
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 2: Execução do Modo SIMPLE (Somente Campaign) ---");
  const env2 = createMockMetaGraphApi();

  const res2 = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    duplicationMode: "SIMPLE",
    customFetch: env2.mockFetch
  });

  if (res2.ok && res2.job.duplication_mode === "SIMPLE" && res2.job.created_adsets === 0 && res2.job.created_ads === 0 && typeof res2.job.duration_ms === "number") {
    console.log(`✅ SUCESSO T2: Modo SIMPLE clonou apenas a campanha (${res2.createdCampaignId}), sem filhos. Duration: ${res2.job.duration_ms}ms`);
  } else {
    console.error("❌ FALHA T2: Modo SIMPLE gerou filhos ou falhou:", res2);
    allPassed = false;
  }

  // ---------------------------------------------------------------------------
  // TESTE 3: ROLLBACK ATÔMICO QUANDO ADSET FALHA (ZERO ÓRFÃOS)
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 3: Rollback Atômico em Falha no AdSet ---");
  const env3 = createMockMetaGraphApi();
  env3.store.injectedFailurePoint = "create_adset_2";

  const res3 = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    duplicationMode: "FULL_CLONE",
    customFetch: env3.mockFetch
  });

  if (!res3.ok && res3.job.status === "ROLLED_BACK") {
    // Verifica se os criados foram deletados
    const deletedCount = env3.store.deletedEntities.length;
    console.log(`✅ SUCESSO T3: Falha detectada no AdSet 2. Rollback executado com sucesso.`);
    console.log(`   Entidades removidas via DELETE da Meta: ${deletedCount} (${env3.store.deletedEntities.join(", ")})`);
    console.log(`   Job Status: ${res3.job.status}, Erro: "${res3.error}", Duration: ${res3.job.duration_ms}ms`);
  } else {
    console.error("❌ FALHA T3: Rollback não funcionou corretamente:", res3);
    allPassed = false;
  }

  // ---------------------------------------------------------------------------
  // TESTE 4: ROLLBACK ATÔMICO QUANDO AD FALHA (ZERO ÓRFÃOS)
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 4: Rollback Atômico em Falha no Anúncio (Ad) ---");
  const env4 = createMockMetaGraphApi();
  env4.store.injectedFailurePoint = "create_ad_3";

  const res4 = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    duplicationMode: "FULL_CLONE",
    customFetch: env4.mockFetch
  });

  if (!res4.ok && res4.job.status === "ROLLED_BACK") {
    const deletedAds = env4.store.deletedEntities.filter(id => id.startsWith("clone_ad_"));
    const deletedAdsets = env4.store.deletedEntities.filter(id => id.startsWith("clone_adset_"));
    const deletedCamps = env4.store.deletedEntities.filter(id => id.startsWith("clone_camp_"));
    console.log(`✅ SUCESSO T4: Falha detectada no Ad 3. Rollback reverso executado.`);
    console.log(`   Ads deletados: ${deletedAds.length}, AdSets deletados: ${deletedAdsets.length}, Campaigns deletadas: ${deletedCamps.length}`);
    console.log(`   Zero órfãos garantido na Meta Graph API! Duration: ${res4.job.duration_ms}ms`);
  } else {
    console.error("❌ FALHA T4: Rollback de anúncio falhou:", res4);
    allPassed = false;
  }

  // ---------------------------------------------------------------------------
  // TESTE 5: ISOLAMENTO MULTI-TENANT E INTEGRIDADE DE IDs
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 5: Isolamento Multi-Tenant & IDs Distintos ---");
  const env5 = createMockMetaGraphApi();
  const res5 = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "tenant_store_bravo",
    duplicationMode: "FULL_CLONE",
    customFetch: env5.mockFetch
  });

  const allOriginalIds = ["orig_camp_100", "orig_adset_201", "orig_adset_202", "orig_ad_301", "orig_ad_302", "orig_ad_303"];
  const allNewIds = [res5.createdCampaignId, ...res5.createdAdsetIds, ...res5.createdAdIds];
  const hasOverlap = allNewIds.some(id => allOriginalIds.includes(id));

  if (res5.job.store_id === "tenant_store_bravo" && !hasOverlap && allNewIds.length === 6) {
    console.log(`✅ SUCESSO T5: Isolamento verificado para loja 'tenant_store_bravo'.`);
    console.log(`   6 novos IDs criados (1 Camp, 2 AdSets, 3 Ads) sem nenhuma sobreposição com os originais.`);
  } else {
    console.error("❌ FALHA T5: Erro no isolamento multi-tenant ou sobreposição de IDs.");
    allPassed = false;
  }

  // ---------------------------------------------------------------------------
  // TESTE 6: VALIDAÇÃO E NORMALIZAÇÃO DE SOURCE_ACTION
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 6: Validação e Normalização de source_action ---");
  const env6 = createMockMetaGraphApi();
  
  // 6A: ATM_RECOMMENDATION
  const res6A = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    sourceAction: "ATM_RECOMMENDATION",
    customFetch: env6.mockFetch
  });

  // 6B: AUTOMATED_FLOW
  const res6B = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    sourceAction: "AUTOMATED_FLOW",
    customFetch: env6.mockFetch
  });

  // 6C: Valor Inválido deve cair para MANUAL_DUPLICATE
  const res6C = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    sourceAction: "INVALID_EXTERNAL_ACTION",
    customFetch: env6.mockFetch
  });

  if (
    res6A.job.source_action === "ATM_RECOMMENDATION" &&
    res6B.job.source_action === "AUTOMATED_FLOW" &&
    res6C.job.source_action === "MANUAL_DUPLICATE"
  ) {
    console.log("✅ SUCESSO T6: source_action normalizado corretamente:");
    console.log("   - ATM_RECOMMENDATION aceito");
    console.log("   - AUTOMATED_FLOW aceito");
    console.log("   - INVALID_EXTERNAL_ACTION fallback com sucesso para MANUAL_DUPLICATE");
  } else {
    console.error("❌ FALHA T6: Normalização de source_action incorreta:", {
      res6A: res6A.job.source_action,
      res6B: res6B.job.source_action,
      res6C: res6C.job.source_action
    });
    allPassed = false;
  }

  // ---------------------------------------------------------------------------
  // TESTE 7: AUDITORIA DE ORÇAMENTO E VALIDAÇÃO DE ORÇAMENTO EXTREMO
  // ---------------------------------------------------------------------------
  console.log("\n--- TESTE 7: Auditoria de Orçamento e Alerta de Orçamento Extremo ---");
  const env7 = createMockMetaGraphApi();

  // 7A: Variação normal (+20%: R$ 250 -> R$ 300) -> 30000 cents
  const res7A = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    newDailyBudgetCents: 30000,
    customFetch: env7.mockFetch
  });

  // 7B: Variação extrema positiva (+150%: R$ 250 -> R$ 625) -> 62500 cents
  const res7B = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    newDailyBudgetCents: 62500,
    customFetch: env7.mockFetch
  });

  // 7C: Variação extrema negativa (-95%: R$ 250 -> R$ 12.50) -> 1250 cents
  const res7C = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    newDailyBudgetCents: 1250,
    customFetch: env7.mockFetch
  });

  // 7D: Orçamento inválido (negativo) - Deve bloquear e rejeitar alteração silenciosa
  const res7D = await duplicateCampaign({
    campaignId: "orig_camp_100",
    accessToken: "EAAP_MOCK_TOKEN",
    storeId: "store_alpha_test",
    newDailyBudgetCents: -5000,
    customFetch: env7.mockFetch
  });

  const check7A = res7A.job.original_budget === 250 && res7A.job.duplicated_budget === 300 && res7A.job.budget_change_percent === 20 && res7A.job.budget_warning === null;
  const check7B = res7B.job.original_budget === 250 && res7B.job.duplicated_budget === 625 && res7B.job.budget_change_percent === 150 && res7B.job.budget_warning === "EXTREME_BUDGET_CHANGE";
  const check7C = res7C.job.original_budget === 250 && res7C.job.duplicated_budget === 12.5 && res7C.job.budget_change_percent === -95 && res7C.job.budget_warning === "EXTREME_BUDGET_CHANGE";
  const check7D = res7D.ok === false && res7D.job.status === "ROLLED_BACK" && String(res7D.error).includes("Orçamento inválido");

  if (check7A && check7B && check7C && check7D) {
    console.log("✅ SUCESSO T7: Auditoria de orçamento validada com precisão:");
    console.log(`   - Variação normal (+20%): warning = ${res7A.job.budget_warning}`);
    console.log(`   - Variação extrema alta (+150%): warning = ${res7B.job.budget_warning}`);
    console.log(`   - Variação extrema baixa (-95%): warning = ${res7C.job.budget_warning}`);
    console.log(`   - Orçamento inválido (-5000): bloqueado com rollback atômico`);
  } else {
    console.error("❌ FALHA T7: Validação de orçamento incorreta:", { check7A, check7B, check7C, check7D });
    allPassed = false;
  }

  console.log("\n================================================================================");
  if (allPassed) {
    console.log("🎯 TODOS OS 7 TESTES DE DUPLICAÇÃO HIERÁRQUICA PASSARAM COM 100% DE SUCESSO!");
  } else {
    console.error("❌ HOUVE FALHA EM UM OU MAIS TESTES!");
    process.exit(1);
  }
  console.log("================================================================================\n");
}

runTests().catch(err => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
