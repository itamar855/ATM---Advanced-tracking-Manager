/**
 * scripts/audit-campaign-cost-consistency.js
 *
 * Auditoria de Consistência e Conciliação de Custos Meta (Fase 8.2)
 *
 * Valida:
 * 1. Snapshots sem duplicação na tabela campaign_cost_snapshots
 * 2. Soma total de spend (USD e BRL)
 * 3. Campanhas existentes e ativas
 * 4. Join contábil direto com revenue_ledger
 * 5. Cálculo real de ROAS, CPA e ROI por campanha e global
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
const storeArg = args.find((a) => a.startsWith("--store="));
const STORE_ID = storeArg ? storeArg.split("=")[1] : "dckb5g-7d";

const modelArg = args.find((a) => a.startsWith("--model="));
const ATTRIBUTION_MODEL = modelArg ? modelArg.split("=")[1] : "last_click";

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function round4(val) {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

async function runCostAudit() {
  console.log("\n=================================================================");
  console.log("🔍 ATM — AUDITORIA DE CONSISTÊNCIA DE CUSTOS & CONCILIAÇÃO ROAS");
  console.log("=================================================================");
  console.log(`Loja Auditada:        ${STORE_ID}`);
  console.log(`Modelo de Atribuição: ${ATTRIBUTION_MODEL}`);
  console.log(`Supabase URL:         ${SUPABASE_URL}\n`);

  // 1. Consulta snapshots de custo
  console.log("⏳ [1/4] Consultando public.campaign_cost_snapshots...");
  const { data: costSnapshots, error: costErr } = await adminClient
    .from("campaign_cost_snapshots")
    .select("*")
    .eq("store_id", STORE_ID);

  if (costErr) {
    if (costErr.message.includes("Could not find the table") || costErr.code === "PGRST205") {
      console.log("\nℹ️  A tabela 'campaign_cost_snapshots' ainda não foi criada no banco Supabase.");
      console.log("   👉 Execute o arquivo 'supabase/migrations/021_create_campaign_cost_snapshots.sql' no SQL Editor do Supabase.");
      console.log("   👉 Após executar o script SQL, rode: node scripts/backfill-campaign-costs.js --execute\n");
      return;
    }
    console.error("❌ Erro ao consultar campaign_cost_snapshots:", costErr.message);
    process.exit(1);
  }

  const totalSnapshots = costSnapshots ? costSnapshots.length : 0;
  console.log(`✓ Total de snapshots encontrados no banco: ${totalSnapshots}`);

  if (totalSnapshots === 0) {
    console.log("\n⚠️  A tabela campaign_cost_snapshots está vazia para esta loja.");
    console.log("   Execute o backfill de custos primeiro:");
    console.log("   node scripts/backfill-campaign-costs.js --execute\n");
    return;
  }

  // 2. Validação Anti-Duplicação
  console.log("⏳ [2/4] Verificando integridade e ausência de duplicações...");
  const keyCounter = new Map();
  let duplicateCount = 0;

  for (const row of costSnapshots) {
    const key = `${row.store_id}__${row.ad_account_id}__${row.campaign_id}__${row.date}`;
    const count = (keyCounter.get(key) || 0) + 1;
    keyCounter.set(key, count);
    if (count > 1) {
      duplicateCount++;
    }
  }

  if (duplicateCount === 0) {
    console.log(`✅ Zero duplicações detectadas! Todas as ${keyCounter.size} chaves são estritamente únicas.`);
  } else {
    console.error(`❌ ALERTA: ${duplicateCount} registros duplicados encontrados na constraint única!`);
  }

  // 3. Agregação de Custos por Campanha
  console.log("\n⏳ [3/4] Agregando spend e métricas por campanha...");
  const campaignSpendMap = new Map();
  let totalSpendUsd = 0;
  let totalSpendBrl = 0;
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const row of costSnapshots) {
    const campId = row.campaign_id;
    const spend = Number(row.spend || 0);
    const spendBrl = Number(row.spend_brl || 0);
    const imp = Number(row.impressions || 0);
    const clk = Number(row.clicks || 0);

    if (row.currency === "USD") {
      totalSpendUsd += spend;
    }
    totalSpendBrl += spendBrl;
    totalImpressions += imp;
    totalClicks += clk;

    const current = campaignSpendMap.get(campId) || {
      campaignId: campId,
      campaignName: row.campaign_name,
      adAccountId: row.ad_account_id,
      currency: row.currency,
      totalSpend: 0,
      totalSpendBrl: 0,
      impressions: 0,
      clicks: 0,
      activeDays: 0,
    };

    current.totalSpend += spend;
    current.totalSpendBrl += spendBrl;
    current.impressions += imp;
    current.clicks += clk;
    current.activeDays += 1;
    campaignSpendMap.set(campId, current);
  }

  totalSpendUsd = round2(totalSpendUsd);
  totalSpendBrl = round2(totalSpendBrl);

  // 4. Join com revenue_ledger para Conciliação de Real ROAS
  console.log(`⏳ [4/4] Realizando Join com revenue_ledger (modelo = '${ATTRIBUTION_MODEL}')...`);
  const { data: ledgerRows, error: ledgerErr } = await adminClient
    .from("revenue_ledger")
    .select("order_id, attributed_revenue, campaign_id, campaign_name")
    .eq("store_id", STORE_ID)
    .eq("attribution_model", ATTRIBUTION_MODEL);

  if (ledgerErr) {
    console.error("❌ Erro ao consultar revenue_ledger:", ledgerErr.message);
    process.exit(1);
  }

  const campaignRevenueMap = new Map();
  let totalAttributedRevenue = 0;
  const uniqueOrders = new Set();

  for (const row of ledgerRows || []) {
    const rev = Number(row.attributed_revenue || 0);
    totalAttributedRevenue += rev;
    if (row.order_id) uniqueOrders.add(row.order_id);

    const cId = row.campaign_id || "unattributed";
    const current = campaignRevenueMap.get(cId) || {
      revenue: 0,
      orders: new Set(),
      campaignName: row.campaign_name,
    };
    current.revenue += rev;
    if (row.order_id) current.orders.add(row.order_id);
    campaignRevenueMap.set(cId, current);
  }

  totalAttributedRevenue = round2(totalAttributedRevenue);

  // 5. Tabela de Conciliação por Campanha (Top 15 por Spend)
  const reconciliationRows = [];
  const sortedCampaigns = Array.from(campaignSpendMap.values()).sort(
    (a, b) => b.totalSpendBrl - a.totalSpendBrl
  );

  let joinedCampaignsCount = 0;

  for (const camp of sortedCampaigns) {
    const revData = campaignRevenueMap.get(camp.campaignId);
    const rev = round2(revData ? revData.revenue : 0);
    const orders = revData ? revData.orders.size : 0;
    const spend = round2(camp.totalSpendBrl);

    const roas = spend > 0 ? round2(rev / spend) : 0;
    const cpa = orders > 0 ? round2(spend / orders) : 0;
    const roi = spend > 0 ? round4((rev - spend) / spend) : 0;

    if (rev > 0) joinedCampaignsCount++;

    reconciliationRows.push({
      Campanha: camp.campaignName.slice(0, 32),
      SpendBRL: `R$ ${spend.toFixed(2)}`,
      ReceitaBRL: `R$ ${rev.toFixed(2)}`,
      Pedidos: orders,
      RealROAS: `${roas.toFixed(2)}x`,
      RealCPA: orders > 0 ? `R$ ${cpa.toFixed(2)}` : "—",
      RealROI: spend > 0 ? `${(roi * 100).toFixed(1)}%` : "—",
      Dias: camp.activeDays,
    });
  }

  console.log("\n=================================================================");
  console.log("📋 CONCILIAÇÃO POR CAMPANHA — TOP 15 POR GASTO (SPEND):");
  console.log("=================================================================");
  console.table(reconciliationRows.slice(0, 15));

  // 6. Resumo Executivo Global
  const globalRoas = totalSpendBrl > 0 ? round2(totalAttributedRevenue / totalSpendBrl) : 0;
  const globalCpa = uniqueOrders.size > 0 ? round2(totalSpendBrl / uniqueOrders.size) : 0;
  const globalRoi = totalSpendBrl > 0 ? round4((totalAttributedRevenue - totalSpendBrl) / totalSpendBrl) : 0;
  const netProfit = round2(totalAttributedRevenue - totalSpendBrl);

  console.log("\n=================================================================");
  console.log("📊 RESUMO GLOBAL CONCILIADO (REVENUE LEDGER × COST SNAPSHOTS):");
  console.log("=================================================================");
  console.log(`Total de Campanhas com Custo:      ${campaignSpendMap.size}`);
  console.log(`Campanhas com Vendas Atribuídas:   ${joinedCampaignsCount}`);
  console.log(`Total de Pedidos Conciliados:      ${uniqueOrders.size}`);
  console.log("-----------------------------------------------------------------");
  console.log(`Spend Total Meta (USD):            $ ${totalSpendUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Spend Total Harmonizado (BRL):     R$ ${totalSpendBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Receita Total Atribuída (BRL):     R$ ${totalAttributedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Lucro Líquido Operacional (Ads):   R$ ${netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log("-----------------------------------------------------------------");
  console.log(`Real ROAS Global:                  ${globalRoas.toFixed(2)}x`);
  console.log(`Real CPA Global:                   R$ ${globalCpa.toFixed(2)} por pedido`);
  console.log(`Real ROI Global:                   ${(globalRoi * 100).toFixed(2)}%`);
  console.log("=================================================================\n");
}

runCostAudit().catch((err) => {
  console.error("❌ Erro fatal na auditoria:", err);
  process.exit(1);
});
