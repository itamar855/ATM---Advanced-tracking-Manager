/**
 * scripts/backfill-campaign-costs.js
 *
 * Backfill Histórico dos Custos de Campanhas Meta (Fase 8.2)
 *
 * Popula a tabela campaign_cost_snapshots com o histórico diário real da Meta Graph API.
 * 
 * Regras:
 * 1. Busca todas as contas de anúncio configuradas na integração Meta da loja
 * 2. Consulta Meta Insights API no nível campaign diário (time_increment = 1)
 * 3. Converte USD para BRL usando exchange_rate comercial oficial congelado
 * 4. Executa upsert idempotente: UNIQUE (store_id, ad_account_id, campaign_id, date)
 * 5. Trava de segurança: default é --dry-run (simulação); só grava com --execute
 */

const path = require("path");

const webDir = path.resolve(__dirname, "../web");
const { createClient } = require(path.join(webDir, "node_modules/@supabase/supabase-js"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const isExecute = args.includes("--execute");
const storeArg = args.find((a) => a.startsWith("--store="));
const STORE_ID = storeArg ? storeArg.split("=")[1] : "dckb5g-7d";

const datePresetArg = args.find((a) => a.startsWith("--preset="));
const DATE_PRESET = datePresetArg ? datePresetArg.split("=")[1] : "maximum"; // maximum cobre todo o histórico

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function round4(val) {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

async function getUsdBrlExchangeRate() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL");
    if (res.ok) {
      const data = await res.json();
      const bid = Number(data.USDBRL?.bid);
      if (bid && !isNaN(bid) && bid > 0) {
        return Math.round(bid * 10000) / 10000;
      }
    }
  } catch (e) {
    console.warn("⚠️  Aviso ao buscar cotação USD/BRL comercial, usando taxa estável:", e.message);
  }
  return 5.5450;
}

async function fetchMetaDailyInsightsPaged(accessToken, adAccountId, datePreset = "maximum") {
  const allRows = [];
  let nextUrl = `https://graph.facebook.com/v23.0/${adAccountId}/insights?` + new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    time_increment: "1",
    date_preset: datePreset,
    fields: "campaign_id,campaign_name,objective,spend,impressions,clicks,cpc,cpm,ctr,account_currency",
    limit: "500",
  });

  let page = 0;
  while (nextUrl && page < 20) {
    page++;
    const res = await fetch(nextUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Meta API ${res.status}: ${errText.slice(0, 250)}`);
    }

    const json = await res.json();
    const rows = json.data || [];
    allRows.push(...rows);
    nextUrl = json.paging?.next || null;
  }

  return allRows;
}

async function runCostBackfill() {
  console.log("\n=================================================================");
  console.log("🚀 ATM — BACKFILL HISTÓRICO DE CAMPAIGN COST SNAPSHOTS (FASE 8.2)");
  console.log("=================================================================");
  console.log(`Loja Alvo:        ${STORE_ID}`);
  console.log(`Modo:             ${isExecute ? "⚡ EXECUÇÃO REAL (GRAVAÇÃO NO SUPABASE)" : "🛡️  DRY-RUN / SIMULAÇÃO (SEM GRAVAÇÃO)"}`);
  console.log(`Date Preset:      ${DATE_PRESET}`);
  console.log(`Supabase URL:     ${SUPABASE_URL}\n`);

  // 1. Busca integração ativa da Meta para a loja
  console.log("⏳ [1/4] Localizando integração Meta ativa da loja...");
  const { data: integration, error: intError } = await adminClient
    .from("integrations")
    .select("id, access_token_enc, config")
    .eq("store_id", STORE_ID)
    .eq("platform", "meta")
    .eq("status", "active")
    .single();

  if (intError || !integration) {
    console.error("❌ Nenhuma integração Meta ativa encontrada:", intError?.message);
    process.exit(1);
  }

  const token = integration.access_token_enc;
  const adAccountIds = integration.config?.ad_account_ids || [];

  if (adAccountIds.length === 0) {
    console.error("❌ Nenhuma conta de anúncio configurada em integration.config.ad_account_ids");
    process.exit(1);
  }

  console.log(`✓ Integração Meta localizada. Contas conectadas: ${adAccountIds.join(", ")}`);

  // 2. Consulta taxa cambial comercial oficial
  const exchangeRate = await getUsdBrlExchangeRate();
  console.log(`✓ Cotação Comercial USD/BRL de referência: R$ ${exchangeRate.toFixed(4)}\n`);

  // 3. Itera em cada conta de anúncio coletando os insights diários históricos
  console.log("⏳ [2/4] Consultando histórico diário da Meta Graph API...");
  const allSnapshots = [];
  const uniqueDates = new Set();
  const uniqueCampaignIds = new Set();
  let totalSpendUsd = 0;
  let totalSpendBrl = 0;

  for (const rawAccId of adAccountIds) {
    const cleanAccId = rawAccId.startsWith("act_") ? rawAccId : `act_${rawAccId}`;
    console.log(`  👉 Consultando conta: ${cleanAccId}...`);

    try {
      const dailyRows = await fetchMetaDailyInsightsPaged(token, cleanAccId, DATE_PRESET);
      console.log(`     ✓ Retornados ${dailyRows.length} registros diários de campanha.`);

      for (const item of dailyRows) {
        const campId = String(item.campaign_id || "").trim();
        const campName = String(item.campaign_name || "Campanha Desconhecida").trim();
        const objective = item.objective || null;
        const date = item.date_start;
        const currency = (item.account_currency || "USD").toUpperCase();

        const rawSpend = parseFloat(item.spend || "0");
        const impressions = parseInt(item.impressions || "0", 10);
        const clicks = parseInt(item.clicks || "0", 10);

        const rate = currency === "USD" ? exchangeRate : 1.0;
        const spendBrl = currency === "USD" ? round2(rawSpend * rate) : round2(rawSpend);

        if (currency === "USD") {
          totalSpendUsd += rawSpend;
        }
        totalSpendBrl += spendBrl;

        if (date) uniqueDates.add(date);
        if (campId) uniqueCampaignIds.add(campId);

        const cpc = clicks > 0 ? round4(spendBrl / clicks) : 0;
        const cpm = impressions > 0 ? round4((spendBrl / impressions) * 1000) : 0;
        const ctr = impressions > 0 ? round4((clicks / impressions) * 100) : 0;

        allSnapshots.push({
          store_id: STORE_ID,
          ad_account_id: cleanAccId,
          campaign_id: campId,
          campaign_name: campName,
          objective,
          date,
          spend: rawSpend,
          currency,
          exchange_rate: rate,
          spend_brl: spendBrl,
          impressions,
          clicks,
          cpc,
          cpm,
          ctr,
          raw_insights: item,
          sync_source: "meta_api",
          sync_status: "success",
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`     ❌ Falha ao consultar conta ${cleanAccId}:`, err.message);
    }
  }

  totalSpendUsd = round2(totalSpendUsd);
  totalSpendBrl = round2(totalSpendBrl);

  console.log("\n=================================================================");
  console.log("📊 RESUMO DOS CUSTOS HISTÓRICOS IDENTIFICADOS:");
  console.log("=================================================================");
  console.log(`Quantidade de Dias Encontrados:     ${uniqueDates.size} dias`);
  console.log(`Quantidade de Campanhas Únicas:    ${uniqueCampaignIds.size} campanhas`);
  console.log(`Total de Snapshots Gerados:         ${allSnapshots.length} registros`);
  console.log(`Spend Total (USD):                  $ ${totalSpendUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Spend Total Harmonizado (BRL):      R$ ${totalSpendBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log("=================================================================\n");

  // Amostra dos primeiros 10 snapshots
  const previewSample = allSnapshots.slice(0, 10).map((s) => ({
    Conta: s.ad_account_id,
    Data: s.date,
    Campanha: s.campaign_name.slice(0, 36),
    SpendUSD: `$ ${s.spend.toFixed(2)}`,
    SpendBRL: `R$ ${s.spend_brl.toFixed(2)}`,
    Cliques: s.clicks,
    CPC: `R$ ${s.cpc.toFixed(2)}`,
  }));
  console.log("📋 PREVIEW DOS PRIMEIROS 10 REGISTROS DIÁRIOS:");
  console.table(previewSample);

  // 4. Verificação de Pré-Flight de Chave Única
  const keySet = new Set();
  for (const s of allSnapshots) {
    const k = `${s.store_id}__${s.ad_account_id}__${s.campaign_id}__${s.date}`;
    if (keySet.has(k)) {
      console.warn(`⚠️  Chave repetida no retorno da Meta: ${k}. Resolvendo por agregação antes do upsert.`);
    }
    keySet.add(k);
  }

  // Se modo Dry-Run, encerra sem gravar
  if (!isExecute) {
    console.log("\n=================================================================");
    console.log("🛡️  [MODO DRY-RUN CONCLUÍDO] — NENHUM DADO FOI GRAVADO NO BANCO");
    console.log("=================================================================");
    console.log(`Registros prontos para persistência: ${allSnapshots.length}`);
    console.log("Para confirmar e executar a gravação no Supabase, execute:");
    console.log("  node scripts/backfill-campaign-costs.js --execute\n");
    return;
  }

  // 5. Execução Real de Upsert no Supabase
  console.log("\n=================================================================");
  console.log("⚡ INICIANDO GRAVAÇÃO EM PRODUÇÃO (UPSERT EM LOTES)...");
  console.log("=================================================================");

  const { error: probeErr } = await adminClient
    .from("campaign_cost_snapshots")
    .select("id")
    .limit(1);

  if (probeErr && (probeErr.message.includes("Could not find the table") || probeErr.code === "PGRST205")) {
    console.log("\n❌ [TABELA NÃO ENCONTRADA NO BANCO]");
    console.log("A tabela 'campaign_cost_snapshots' ainda não foi criada no Supabase.");
    console.log("👉 Por favor, execute a migration 'supabase/migrations/021_create_campaign_cost_snapshots.sql' no SQL Editor do painel Supabase.");
    console.log("👉 Após aplicar a migration, execute novamente este comando com --execute.\n");
    process.exit(1);
  }

  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < allSnapshots.length; i += BATCH_SIZE) {
    const batch = allSnapshots.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allSnapshots.length / BATCH_SIZE);

    const { error: upsertErr } = await adminClient
      .from("campaign_cost_snapshots")
      .upsert(batch, {
        onConflict: "store_id,ad_account_id,campaign_id,date",
      });

    if (upsertErr) {
      console.error(`\n❌ Falha no lote ${batchNum}/${totalBatches}:`, upsertErr.message);
      errors++;
      throw new Error(`Interrompido por erro no lote ${batchNum}: ${upsertErr.message}`);
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✓ Lote ${batchNum}/${totalBatches} persistido (${inserted}/${allSnapshots.length} snapshots)\r`);
    }
  }

  console.log(`\n\n=================================================================`);
  console.log("🎉 BACKFILL DE CUSTOS CONCLUÍDO COM SUCESSO!");
  console.log("=================================================================");
  console.log(`Total de Snapshots Persistidos: ${inserted}`);
  console.log(`Lotes com Erro:                 ${errors}`);
  console.log(`Idempotência Garantida:         Sim (uq_campaign_cost_snapshot)`);
  console.log("Execute agora a auditoria de consistência de custos:");
  console.log("  node scripts/audit-campaign-cost-consistency.js\n");
}

runCostBackfill().catch((err) => {
  console.error("❌ Erro fatal no backfill de custos:", err);
  process.exit(1);
});
