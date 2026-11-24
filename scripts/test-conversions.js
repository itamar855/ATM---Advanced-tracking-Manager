/**
 * scripts/test-conversions.js
 *
 * Testes do motor único de conversão e dos adaptadores (offline, sem banco e sem rede):
 *   - API universal: validação do corpo, apelidos em português, centavos, assinatura
 *   - Vega/Gateway7 e Zedy: classificação (compra, PIX/boleto pendente, checkout, ignorado)
 *   - Motor: evento Meta por tipo, status do pedido, montagem do evento CAPI
 *
 * Uso: node scripts/test-conversions.js
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
const { parseAtmApi, resolveEventKind } = lib("conversions/adapters/atm-api.ts");
const { parseGenericCheckout } = lib("conversions/adapters/generic-checkout.ts");
const { parseZedy, parseZedyValue } = lib("conversions/adapters/zedy.ts");
const {
  META_EVENT_FOR_KIND, orderStatusFor, buildConversionMetaEvent, fbcFromUtmContent, estimateEmqScore,
} = lib("conversions/engine.ts");

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
function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`esperado ${b}, veio ${a}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg || "condição falsa");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🌐 1. API universal (/api/v1/conversions)");
// ─────────────────────────────────────────────────────────────────────────────
const fullPurchase = {
  event: "purchase",
  id: "txn_1",
  value: 97,
  payment_method: "pix",
  occurred_at: "2026-11-23T12:00:00-03:00",
  customer: { email: "Ana@Email.com", phone: "(11) 99999-0000", name: "Ana Maria Souza", id: "u_1" },
  products: [{ id: "curso-1", name: "Curso X", price: 97 }],
  tracking: { track_id: "t1", fbp: "fb.1.1.1", utm_source: "facebook", utm_campaign: "camp|123", ip: "1.2.3.4", user_agent: "UA" },
};
test("compra completa vira purchase", () => {
  const r = parseAtmApi(fullPurchase);
  ok(r.ok, r.error);
  const c = r.conversion;
  eq([c.kind, c.orderId, c.value, c.currency, c.paymentMethod, c.source], ["purchase", "txn_1", 97, "BRL", "pix", "api"]);
  eq([c.customer.firstName, c.customer.lastName, c.customer.externalId], ["Ana", "Maria Souza", "u_1"]);
  eq([c.tracking.track_id, c.signals.fbp, c.signals.client_ip, c.signals.client_user_agent], ["t1", "fb.1.1.1", "1.2.3.4", "UA"]);
  eq(c.occurredAt, "2026-11-23T15:00:00.000Z");
  eq(c.isTest, false);
});
test("apelidos em português", () => {
  eq(
    ["pix_gerado", "compra_aprovada", "reembolso", "assinatura_iniciada", "assinatura_renovada", "Assinatura Cancelada", "cadastro"].map(resolveEventKind),
    ["payment_pending", "purchase", "refund", "subscription_started", "subscription_renewed", "subscription_canceled", "lead"]
  );
});
test("evento desconhecido é recusado", () => {
  const r = parseAtmApi({ event: "venda_maluca", id: "1" });
  ok(!r.ok && !r.ignored && r.error.includes("event"), JSON.stringify(r));
});
test("sem id é recusado", () => {
  const r = parseAtmApi({ event: "lead" });
  ok(!r.ok && r.error.includes("id"), JSON.stringify(r));
});
test("compra sem valor é recusada", () => {
  const r = parseAtmApi({ event: "purchase", id: "1" });
  ok(!r.ok && r.error.includes("value"), JSON.stringify(r));
});
test("valor negativo ou texto inválido é recusado", () => {
  ok(!parseAtmApi({ event: "lead", id: "1", value: -5 }).ok);
  ok(!parseAtmApi({ event: "purchase", id: "1", value: "abc" }).ok);
});
test("value_in_cents vira reais", () => {
  const r = parseAtmApi({ event: "purchase", id: "1", value_in_cents: 4790 });
  eq(r.conversion.value, 47.9);
});
test("valor com vírgula em texto", () => eq(parseAtmApi({ event: "purchase", id: "1", value: "19,90" }).conversion.value, 19.9));
test("lead sem valor é aceito", () => {
  const r = parseAtmApi({ event: "lead", id: "lead_1", customer: { email: "a@b.com" } });
  ok(r.ok);
  eq(r.conversion.value, 0);
});
test("método de pagamento inválido é recusado", () => ok(!parseAtmApi({ event: "purchase", id: "1", value: 1, payment_method: "cheque" }).ok));
test("moeda inválida é recusada", () => ok(!parseAtmApi({ event: "purchase", id: "1", value: 1, currency: "reais" }).ok));
test("data inválida é recusada", () => ok(!parseAtmApi({ event: "purchase", id: "1", value: 1, occurred_at: "ontem" }).ok));
test("corpo que não é objeto é recusado", () => {
  ok(!parseAtmApi(null).ok);
  ok(!parseAtmApi([1, 2]).ok);
});
test("assinatura e event_id passam adiante", () => {
  const r = parseAtmApi({
    event: "subscription_started", id: "inv_1", value: 49.9, event_id: "Purchase_abc",
    subscription: { id: "sub_1", plan: "Pro", interval: "month" },
  });
  eq([r.conversion.eventId, r.conversion.subscription], ["Purchase_abc", { id: "sub_1", plan: "Pro", interval: "month" }]);
});
test("test: true marca teste (e só com booleano)", () => {
  eq(parseAtmApi({ event: "lead", id: "1", test: true }).conversion.isTest, true);
  eq(parseAtmApi({ event: "lead", id: "1", test: "true" }).conversion.isTest, false);
});
test("produtos limitados e com quantidade mínima 1", () => {
  const r = parseAtmApi({ event: "purchase", id: "1", value: 1, products: Array.from({ length: 150 }, () => ({ quantity: 0 })) });
  eq([r.conversion.products.length, r.conversion.products[0].quantity, r.conversion.products[0].id], [100, 1, "item_1"]);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🛒 2. Vega / Gateway7");
// ─────────────────────────────────────────────────────────────────────────────
test("venda aprovada → purchase", () => {
  const r = parseGenericCheckout({ event: "order_paid", status: "paid", order_id: "V1", total_price: 150, payment_method: "credit_card",
    customer: { name: "João Silva", email: "j@x.com" }, tracking_params: { track_id: "abc", utm_campaign: "c1" } }, "vega");
  eq([r.conversion.kind, r.conversion.orderId, r.conversion.value, r.conversion.paymentMethod], ["purchase", "V1", 150, "card"]);
  eq([r.conversion.tracking.track_id, r.conversion.tracking.utm_campaign, r.conversion.customer.firstName], ["abc", "c1", "João"]);
});
test("PIX aguardando com QR → payment_pending", () => {
  const r = parseGenericCheckout({ event: "order_waiting_payment", payment_method: "pix", id: "V2", amount: 50, pix_code: "000201" }, "vega");
  eq([r.conversion.kind, r.conversion.paymentMethod], ["payment_pending", "pix"]);
});
test("PIX pendente SEM QR → checkout_started (não conta PIX falso)", () => {
  const r = parseGenericCheckout({ status: "pending", payment_method: "pix", id: "V3", amount: 50 }, "gateway7");
  eq(r.conversion.kind, "checkout_started");
});
test("PIX 'aguardando' sem QR nem 'pending' é ignorado (igual à regra antiga)", () => {
  const r = parseGenericCheckout({ event: "order_waiting_payment", payment_method: "pix", id: "V3b", amount: 50 }, "gateway7");
  ok(!r.ok && r.ignored, JSON.stringify(r));
});
test("boleto pendente com código → payment_pending", () => {
  const r = parseGenericCheckout({ status: "pending", payment_method: "boleto", id: "V4", total: 80, boleto_url: "http://b" }, "vega");
  eq([r.conversion.kind, r.conversion.paymentMethod], ["payment_pending", "boleto"]);
});
test("carrinho abandonado → checkout_started", () =>
  eq(parseGenericCheckout({ event: "carrinho_abandonado", id: "V5" }, "vega").conversion.kind, "checkout_started"));
test("evento desconhecido é ignorado", () => {
  const r = parseGenericCheckout({ event: "customer_updated", id: "V6" }, "vega");
  ok(!r.ok && r.ignored, JSON.stringify(r));
});
test("sem ID → erro; em teste gera ID", () => {
  ok(!parseGenericCheckout({ status: "paid" }, "vega").ok);
  const r = parseGenericCheckout({ status: "paid", test_mode: true }, "gateway7");
  ok(r.ok && r.conversion.orderId.startsWith("GATEWAY7_TEST_") && r.conversion.isTest);
});
test("totalPriceInCents vira reais", () =>
  eq(parseGenericCheckout({ status: "paid", id: "V7", totalPriceInCents: 12990 }, "vega").conversion.value, 129.9));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n⚡ 3. Zedy");
// ─────────────────────────────────────────────────────────────────────────────
test("ORDER_PAID → purchase com valor em centavos", () => {
  const r = parseZedy({ eventType: "ORDER_PAID", orderId: "Z1", commission: { totalPriceInCents: 19700, paymentMethod: "credit_card" },
    customer: { name: "Bia Lima", email: "b@x.com" }, trackingParameters: { utm_source: "fb", track_id: "tz" } });
  eq([r.conversion.kind, r.conversion.value, r.conversion.paymentMethod, r.conversion.tracking.track_id], ["purchase", 197, "card", "tz"]);
});
test("PIX_CREATED → payment_pending pix", () => {
  const r = parseZedy({ eventType: "PIX_CREATED", orderId: "Z2", totalPriceInCents: 4700 });
  eq([r.conversion.kind, r.conversion.paymentMethod, r.conversion.value], ["payment_pending", "pix", 47]);
});
test("ORDER_CREATED sem método → checkout_started", () =>
  eq(parseZedy({ eventType: "ORDER_CREATED", orderId: "Z3", value: 10 }).conversion.kind, "checkout_started"));
test("evento que não é venda é ignorado", () => ok(parseZedy({ eventType: "REFUND_REQUESTED", orderId: "Z4" }).ignored));
test("sem orderId → erro (antes virava o texto 'undefined')", () => ok(!parseZedy({ eventType: "ORDER_PAID" }).ok));
test("track_id vem da URL do checkout", () =>
  eq(parseZedy({ eventType: "ORDER_PAID", orderId: "Z5", checkoutUrl: "https://pay.zedy.com/x?track_id=tt9" }).conversion.tracking.track_id, "tt9"));
test("valor em texto R$ 1.234,56", () => eq(parseZedyValue({ value: "R$ 1.234,56" }), 1234.56));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n⚙️  4. Motor");
// ─────────────────────────────────────────────────────────────────────────────
test("evento Meta por tipo", () => {
  eq(
    ["lead", "checkout_started", "payment_pending", "purchase", "subscription_started", "trial_started"].map((k) => META_EVENT_FOR_KIND[k]),
    ["Lead", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Purchase", "StartTrial"]
  );
});
test("renovação, cancelamento e estorno NÃO vão para a Meta", () =>
  eq(["subscription_renewed", "subscription_canceled", "refund", "chargeback"].map((k) => META_EVENT_FOR_KIND[k]), [null, null, null, null]));
test("status do pedido", () => {
  eq(
    [
      orderStatusFor({ kind: "payment_pending", paymentMethod: "pix" }),
      orderStatusFor({ kind: "payment_pending", paymentMethod: "boleto" }),
      orderStatusFor({ kind: "purchase" }),
      orderStatusFor({ kind: "subscription_renewed" }),
      orderStatusFor({ kind: "refund" }),
      orderStatusFor({ kind: "lead" }),
      orderStatusFor({ kind: "subscription_canceled" }),
    ],
    ["pix_pending", "created", "paid", "paid", "refunded", null, null]
  );
});
test("fbc recuperado do utm_content (Utmify)", () => {
  const id = "A".repeat(45);
  eq(fbcFromUtmContent(`Ad|123::${id}`, 1000), `fb.1.1000.${id}`);
  eq(fbcFromUtmContent("sem-fbclid"), undefined);
});
test("EMQ estimado", () => eq([estimateEmqScore(["em", "ph", "fbp"]), estimateEmqScore([])], [50, 0]));

const apiConv = parseAtmApi(fullPurchase).conversion;
test("evento CAPI: nome, id, PII com hash e sinais sem hash", () => {
  const ev = buildConversionMetaEvent(apiConv, "Purchase", "Purchase_txn_1", { fbp: "fb.1.1.1", client_ip: "1.2.3.4", client_user_agent: "UA" });
  eq([ev.event_name, ev.event_id, ev.action_source], ["Purchase", "Purchase_txn_1", "website"]);
  const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
  eq(ev.user_data.em, [sha("ana@email.com")]);
  ok(ev.user_data.ph[0] === sha("5511999990000"), "telefone com DDI 55");
  eq([ev.user_data.fbp, ev.user_data.client_ip_address, ev.user_data.client_user_agent], ["fb.1.1.1", "1.2.3.4", "UA"]);
  eq([ev.custom_data.value, ev.custom_data.currency, ev.custom_data.content_ids], [97, "BRL", ["curso-1"]]);
  eq(ev.event_time, Math.floor(Date.parse("2026-11-23T15:00:00Z") / 1000));
});
test("lead sem valor não manda value/currency nem produtos", () => {
  const lead = parseAtmApi({ event: "lead", id: "l1", customer: { email: "a@b.com" } }).conversion;
  const ev = buildConversionMetaEvent(lead, "Lead", "Lead_l1", { client_user_agent: "UA" });
  eq([ev.custom_data.value, ev.custom_data.currency, ev.custom_data.content_ids], [undefined, undefined, undefined]);
});
test("sem navegador do comprador → action_source system_generated (não inventa UA)", () => {
  const ev = buildConversionMetaEvent(apiConv, "Purchase", "x", {});
  eq([ev.action_source, ev.user_data.client_user_agent, ev.user_data.client_ip_address, ev.user_data.fbp], ["system_generated", undefined, undefined, undefined]);
});
test("assinatura vai no custom_data", () => {
  const sub = parseAtmApi({ event: "subscription_started", id: "i1", value: 49.9, subscription: { id: "sub_9", plan: "Pro" } }).conversion;
  const ev = buildConversionMetaEvent(sub, "Purchase", "Purchase_i1", { client_user_agent: "UA" });
  eq([ev.custom_data.subscription_id, ev.custom_data.plan], ["sub_9", "Pro"]);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
if (fail) {
  console.log("\nFalhas:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);
