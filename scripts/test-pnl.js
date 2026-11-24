/**
 * scripts/test-pnl.js
 *
 * Testes da Fase 5 (P&L de infoproduto e app), offline:
 *   - custos de uma venda: taxa do gateway, imposto, afiliado e coprodução
 *   - loja: mesmo resultado do cálculo antigo do Resumo (antes da Fase 5)
 *   - reembolso e fechamento (lucro, ROAS, ROI, margem)
 *
 * Uso: node scripts/test-pnl.js
 */

const path = require("path");
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

const { saleCosts, refundLoss, summarizePnl, paymentKindOf } = require(path.resolve(__dirname, "..", "web", "src", "lib", "pnl", "project-pnl.ts"));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
const costs = (...args) => {
  const c = saleCosts(...args);
  return [r2(c.gatewayFee), r2(c.operationalTax), r2(c.affiliate), r2(c.coproduction), r2(c.net)];
};

const rule = (type, value, extra = {}) => ({ type, value, value_type: "percentage", payment_method: "all", calculation_rule: "revenue_value", ...extra });

console.log("\n💳 1. Forma de pagamento");
test("cartão, boleto, pix e vazio", () =>
  eq(["credit_card", "Cartão", "visa", "boleto", "pix", "", null, "transferencia"].map(paymentKindOf),
    ["card", "card", "card", "boleto", "pix", "pix", "pix", "other"]));

console.log("\n🧾 2. Custos de uma venda");
const info = [
  rule("duty", 5, { payment_method: "pix" }),
  rule("duty", 1.5, { payment_method: "pix", value_type: "fixed" }),
  rule("affiliate", 40),
  rule("coproduction", 20),
  rule("tax", 6),
];
test("exemplo do cabeçalho: R$ 100 com gateway 5%, afiliado 40%, coprodução 20%", () =>
  eq(costs(100, "pix", [rule("duty", 5), rule("affiliate", 40), rule("coproduction", 20)], "infoproduct"), [5, 0, 38, 11.4, 45.6]));
test("PIX com % + R$ fixo, afiliado, coprodução e imposto sobre o faturamento", () =>
  // taxa 5 + 1,50 = 6,50 → sobra 93,50 → afiliado 37,40 → sobra 56,10 → copro 11,22 → imposto 6% de 100 = 6
  eq(costs(100, "pix", info, "infoproduct"), [6.5, 6, 37.4, 11.22, 38.88]));
test("taxa de PIX não vale para cartão", () => eq(costs(100, "credit_card", info, "infoproduct")[0], 0));
test("imposto sobre a sua comissão", () =>
  // comissão = 100 − 10 − 0 − 0 = 90 → 10% = 9
  eq(costs(100, "pix", [rule("duty", 10), rule("tax", 10, { calculation_rule: "commission_value" })], "app"), [10, 9, 0, 0, 81]));
test("info e app sem nenhuma regra: taxa zero (não inventa)", () => {
  eq(costs(100, "pix", [], "infoproduct"), [0, 0, 0, 0, 100]);
  eq(costs(100, "credit_card", [], "app"), [0, 0, 0, 0, 100]);
});
test("afiliado + coprodução nunca passam do valor", () => {
  const c = saleCosts(100, "pix", [rule("affiliate", 100), rule("coproduction", 100), rule("duty", 200, { value_type: "fixed" })], "infoproduct");
  eq([c.affiliate, c.coproduction], [0, 0]);
});

console.log("\n🛒 3. Loja: igual ao cálculo antigo");
// Cópia do cálculo do Resumo antes da Fase 5 (ramo dos eventos)
function oldFee(val, method, rules) {
  method = String(method || "").toLowerCase();
  const isCard = method.includes("card") || method.includes("cartao") || method.includes("credit") || method.includes("visa") || method.includes("master");
  const isBoleto = method.includes("boleto");
  const isPix = method.includes("pix") || method === "";
  let fee = 0;
  let tax = 0;
  if (rules.length > 0) {
    rules.filter((t) => t.type === "tax").forEach((t) => (tax += val * (Number(t.value || 0) / 100)));
    rules.filter((t) => t.type === "duty").forEach((t) => {
      const match = t.payment_method === "all" || (isPix && t.payment_method === "pix") || (isCard && t.payment_method === "credit_card") || (isBoleto && t.payment_method === "boleto");
      if (match) fee += t.value_type === "percentage" ? val * (Number(t.value || 0) / 100) : Number(t.value || 0);
    });
  } else if (val > 0) {
    fee = isCard ? val * 0.15 : val * 0.099;
  }
  return [r2(fee), r2(tax)];
}
const ruleSets = [
  [],
  [rule("tax", 6)],
  [rule("duty", 6.99, { payment_method: "pix" }), rule("duty", 1.99, { payment_method: "pix", value_type: "fixed" }), rule("duty", 4.99, { payment_method: "credit_card" })],
  [rule("tax", 11.33), rule("duty", 3, { payment_method: "boleto", value_type: "fixed" }), rule("duty", 2)],
];
const methods = ["pix", "", "credit_card", "cartao", "boleto", "Visa", "outro"];
test("mesmas taxas e impostos em 4 conjuntos de regras × 7 formas × 5 valores", () => {
  for (const rules of ruleSets)
    for (const m of methods)
      for (const v of [0, 1, 97, 172.88, 1999.9]) {
        const c = saleCosts(v, m, rules, "ecommerce");
        eq([r2(c.gatewayFee), r2(c.operationalTax)], oldFee(v, m, rules));
      }
});

console.log("\n↩️  4. Reembolso e fechamento");
test("reembolso tira o valor menos afiliado e coprodução", () =>
  // R$ 100 com gateway 5%, afiliado 40%, copro 20%: afiliado 38 + copro 11,40 voltam → perde 50,60
  eq(r2(refundLoss(100, "pix", [rule("duty", 5), rule("affiliate", 40), rule("coproduction", 20)], "infoproduct")), 50.6));
test("lucro, ROAS (bruto), ROI e margem", () => {
  const p = summarizePnl({ grossRevenue: 1000, gatewayFees: 50, operationalTaxes: 60, affiliate: 100, coproduction: 40, refunds: 200, refundLoss: 150, cogs: 0, adSpend: 300 });
  eq([r2(p.netRevenue), r2(p.profit), r2(p.roas), r2(p.roi), r2(p.margin)], [600, 300, 3.33, 1, 50]);
});
test("sem gasto: ROAS e ROI zero, sem dividir por zero", () => {
  const p = summarizePnl({ grossRevenue: 0, gatewayFees: 0, operationalTaxes: 0, affiliate: 0, coproduction: 0, refunds: 0, refundLoss: 0, cogs: 0, adSpend: 0 });
  eq([p.roas, p.roi, p.margin], [0, 0, 0]);
});

console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
process.exit(fail ? 1 : 0);
