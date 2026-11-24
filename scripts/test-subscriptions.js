/**
 * scripts/test-subscriptions.js
 *
 * Testes da Fase 4 (assinaturas), offline:
 *   - API universal: subscription.id obrigatório, intervalo (mensal/anual...)
 *   - Motor: corpo enviado à função atm_record_subscription_event e campanha a partir da UTM
 *   - Métricas: MRR, churn, LTV, CAC, payback, trial → pago, por campanha
 *
 * A função SQL em si é testada num Postgres real (PGlite) pelo teste da migration 029.
 *
 * Uso: node scripts/test-subscriptions.js
 */

const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

if (!process.env.RUNNING_UNDER_TSX) {
  const webDir = path.resolve(__dirname, "..", "web");
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npxCmd, ["--yes", "tsx", `"${__filename}"`], {
    cwd: webDir,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, RUNNING_UNDER_TSX: "true" },
  });
  process.exit(result.status ?? 0);
}

process.env.ATM_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

const lib = (p) => require(path.resolve(__dirname, "..", "web", "src", "lib", p));
const { parseAtmApi, resolveInterval } = lib("conversions/adapters/atm-api.ts");
const { buildSubscriptionPayload, campaignIdFrom } = lib("conversions/engine.ts");
const { computeSubscriptionMetrics, campaignKeyOf } = lib("subscriptions/metrics.ts");

let pass = 0;
let fail = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
function ok(c, m) {
  if (!c) throw new Error(m || "condição falsa");
}

console.log("\n🌐 1. API de conversões (assinaturas)");
test("eventos de assinatura exigem subscription.id", () => {
  for (const ev of ["trial_iniciado", "assinatura_iniciada", "assinatura_renovada", "assinatura_cancelada"]) {
    const r = parseAtmApi({ event: ev, id: "x", value: 10 });
    ok(!r.ok && r.error.includes("subscription.id"), `${ev}: ${JSON.stringify(r)}`);
  }
});
test("subscription_id no topo também vale", () => {
  const r = parseAtmApi({ event: "assinatura_renovada", id: "inv2", value: 49.9, subscription_id: "sub_1" });
  eq(r.conversion.subscription.id, "sub_1");
});
test("intervalos em português e inglês", () => {
  eq(["mensal", "Anual", "yearly", "trimestral", "semestral", "semanal", "diário", ""].map(resolveInterval),
    ["month", "year", "year", "quarter", "semester", "week", "day", undefined]);
});
test("intervalo inválido é recusado", () => {
  const r = parseAtmApi({ event: "assinatura_iniciada", id: "i", value: 1, subscription: { id: "s", interval: "quinzenal" } });
  ok(!r.ok && r.error.includes("interval"), JSON.stringify(r));
});
test("compra avulsa continua sem exigir assinatura", () => ok(parseAtmApi({ event: "purchase", id: "p", value: 1 }).ok));

console.log("\n⚙️  2. Motor → função do banco");
const conv = parseAtmApi({
  event: "assinatura_iniciada", id: "inv1", value: 600, payment_method: "card", source: "meuapp",
  customer: { email: "Ana@x.com", id: "u1" },
  subscription: { id: "sub_1", plan: "Pro anual", interval: "anual" },
  tracking: { track_id: "t1", utm_source: "facebook", utm_campaign: "Black Friday|23850000" },
}).conversion;
test("corpo enviado à função", () => {
  const p = buildSubscriptionPayload("store-1", conv);
  eq(
    [p.store_id, p.kind, p.subscription_id, p.charge_id, p.amount, p.interval, p.plan, p.campaign_id, p.source, p.external_id, p.payment_method],
    ["store-1", "subscription_started", "sub_1", "inv1", 600, "year", "Pro anual", "23850000", "meuapp", "u1", "card"]
  );
  eq(p.email_hash, crypto.createHash("sha256").update("ana@x.com").digest("hex"));
});
test("campanha: nome|id, utm_id ou nada", () => {
  eq([campaignIdFrom({ utm_campaign: "a|1" }), campaignIdFrom({ utm_campaign: "a", utm_id: "9" }), campaignIdFrom({ utm_campaign: "a" })], ["1", "9", undefined]);
});
test("estorno manda o ID da cobrança", () => {
  const r = parseAtmApi({ event: "reembolso", id: "inv1" }).conversion;
  const p = buildSubscriptionPayload("s", r);
  eq([p.kind, p.charge_id], ["refund", "inv1"]);
});

console.log("\n📈 3. Métricas");
const D = (s) => new Date(s + "T12:00:00Z").toISOString();
const period = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-30T23:59:59Z") };
const subs = [
  // já ativo antes do período, continua ativo
  { subscription_id: "a", status: "active", mrr: 100, utm_campaign: "Camp A|1", started_at: D("2026-09-01"), payments_count: 3, total_revenue: 300 },
  // já ativo antes, cancelou no período (churn)
  { subscription_id: "b", status: "canceled", mrr: 50, utm_campaign: "Camp A|1", started_at: D("2026-08-01"), canceled_at: D("2026-11-10"), payments_count: 3, total_revenue: 150 },
  // novo no período (veio de trial do período)
  { subscription_id: "c", status: "active", mrr: 100, utm_campaign: "Camp B|2", trial_started_at: D("2026-11-02"), started_at: D("2026-11-09"), payments_count: 1, total_revenue: 100 },
  // novo no período, anual (MRR 50)
  { subscription_id: "d", status: "active", mrr: 50, utm_campaign: "Camp B|2", started_at: D("2026-11-15"), payments_count: 1, total_revenue: 600 },
  // trial do período que não converteu
  { subscription_id: "e", status: "trialing", mrr: 0, utm_campaign: "Camp B|2", trial_started_at: D("2026-11-20"), payments_count: 0, total_revenue: 0 },
  // trial cancelado sem nunca pagar: não é churn
  { subscription_id: "f", status: "canceled", mrr: 0, trial_started_at: D("2026-11-03"), canceled_at: D("2026-11-05"), payments_count: 0, total_revenue: 0 },
];
const charges = [
  { value: 100, status: "paid", order_paid_at: D("2026-11-01") },   // renovação de a
  { value: 100, status: "paid", order_paid_at: D("2026-11-09") },   // 1ª de c
  { value: 600, status: "refunded", refund_value: 600, order_paid_at: D("2026-11-15"), refunded_at: D("2026-11-16") },
  { value: 100, status: "paid", order_paid_at: D("2026-10-01") },   // fora do período
];
const spend = [
  { campaign_id: "2", campaign_name: "Camp B", spend_brl: 300 },
  { campaign_id: "2", campaign_name: "Camp B", spend_brl: 100 },
  { campaign_id: "3", campaign_name: "Camp C sem venda", spend_brl: 80 },
];
const m = computeSubscriptionMetrics(subs, charges, spend, period);

test("MRR, ARR, ativos, trial e ARPU", () =>
  eq([m.mrr, m.arr, m.activeSubscribers, m.trialingSubscribers, m.arpu], [250, 3000, 3, 1, 83.33]));
test("novos no período e MRR novo", () => eq([m.newSubscribers, m.newMrr], [2, 150]));
test("churn: só assinante pago, sobre os ativos no início", () =>
  eq([m.canceledSubscribers, m.activeAtStart, m.churnRate, m.churnedMrr], [1, 2, 0.5, 50]));
test("receita do período e estornos", () => eq([m.revenueInPeriod, m.refundsInPeriod], [800, 600]));
test("trial → pago", () => eq([m.trialsStarted, m.trialsConverted, m.trialConversionRate], [3, 1, 1 / 3]));
test("LTV recebido médio e estimado", () => {
  eq(m.avgRealizedLtv, 287.5); // (300+150+100+600)/4
  ok(m.estimatedLtv > 0, "LTV estimado ausente");
});
test("CAC e payback gerais", () => eq([m.totalSpend, m.cac, m.paybackMonths], [480, 240, 3.2]));

const camp = Object.fromEntries(m.byCampaign.map((c) => [c.campaignId || c.key, c]));
test("por campanha: Camp B", () => {
  const b = camp["2"];
  eq([b.name, b.newSubscribers, b.activeSubscribers, b.mrr, b.spend, b.cac, b.paybackMonths, b.avgRealizedLtv], ["Camp B", 2, 2, 150, 400, 200, 2.7, 350]);
});
test("por campanha: Camp A (sem gasto) e campanha só com gasto", () => {
  eq([camp["1"].activeSubscribers, camp["1"].cac, camp["1"].mrr], [1, null, 100]);
  eq([camp["3"].spend, camp["3"].newSubscribers, camp["3"].cac], [80, 0, null]);
});
test("assinante sem UTM vai para (sem campanha)", () => ok(m.byCampaign.some((c) => c.name === "(sem campanha)")));
test("nome e ID da campanha a partir da UTM", () => {
  eq(campaignKeyOf({ utm_campaign: "Black|99" }), { key: "99", id: "99", name: "Black" });
  eq(campaignKeyOf({ utm_campaign: "", campaign_id: "77" }), { key: "77", id: "77", name: "Campanha 77" });
});
test("sem dados não quebra", () => {
  const z = computeSubscriptionMetrics([], [], [], period);
  eq([z.mrr, z.churnRate, z.cac, z.arpu, z.estimatedLtv, z.byCampaign.length], [0, null, null, null, null, 0]);
});

console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
if (fail) {
  console.log("\nFalhas:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);
