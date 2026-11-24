/**
 * scripts/test-core-tracking.js
 *
 * Bateria de testes do NÚCLEO de tracking (offline, sem banco e sem rede).
 * Valida o código contra as regras documentadas no CEREBRO_TECNICO.md §4.1:
 *   - Normalização + SHA-256 dos 13 sinais PII da Meta CAPI
 *   - fbp/fbc/IP/UA NÃO hasheados
 *   - Inferência de UF pelo CEP
 *   - Criptografia AES-256-GCM (ida/volta e adulteração)
 *   - Verificação HMAC (webhook Shopify) e state OAuth da Shopify
 *   - Janelas de data no fuso America/Sao_Paulo
 *   - Conversão cambial
 *
 * Uso: node scripts/test-core-tracking.js
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

// Chave de teste gerada na hora (nunca uma chave real). Os helpers não têm mais valor reserva.
const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env.ATM_ENCRYPTION_KEY = TEST_KEY;
delete process.env.ATM_WEBHOOK_SECRET;
delete process.env.SHOPIFY_API_SECRET;
delete process.env.SHOPIFY_CLIENT_SECRET;

const lib = (p) => require(path.resolve(__dirname, "..", "web", "src", "lib", p));
const { buildBrowserEvent, getStateFromZip, getUserDataKeys } = lib("tracking/event-builder");
const { encrypt, decrypt, hashEmail, hashPhone, hashState, verifyHmac } = lib("encryption");
const { signOAuthState, verifyOAuthState } = lib("shopify-oauth");
const { webhookTokenFor, isValidWebhookToken, isValidShopifyHmac, shopifyWebhookSecrets } = lib("webhook-auth");
const { resolveAccountDateRange } = lib("date-utils");
const { convertToBrl } = lib("currency");

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

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
    failures.push(`${name} → ${e.message}`);
    console.log(`  ❌ ${name}\n     → ${e.message}`);
  }
}
function eq(actual, expected, msg = "") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} esperado ${b}, recebido ${a}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔐 1. Normalização e hash de PII (CEREBRO §4.1)");
// ─────────────────────────────────────────────────────────────────────────────
const session = {
  fbp: "fb.1.1700000000000.123456789",
  fbc: "fb.1.1700000000000.IwAR0abc",
  client_ip: "200.100.50.25",
  client_user_agent: "Mozilla/5.0 Teste",
};
const ev = buildBrowserEvent(
  "InitiateCheckout",
  "ic_1",
  "https://loja.test/checkout",
  session,
  {
    email: "  Cliente.Teste@Gmail.COM ",
    phone: "(11) 98765-4321",
    firstName: " José ",
    lastName: "Conceição",
    city: "São Paulo",
    state: "São Paulo",
    zip: "01310-100",
    country: "Brasil",
  },
  { value: 197.9, currency: "BRL" }
);
const ud = ev.user_data;

test("em: lowercase + trim", () => eq(ud.em, [sha("cliente.teste@gmail.com")]));
test("ph: inclui DDI 55 (E.164) como hash principal", () => eq(ud.ph[0], sha("5511987654321")));
test("fn: lowercase + sem acentos", () => eq(ud.fn, [sha("jose")]));
test("ln: lowercase + sem acentos", () => eq(ud.ln, [sha("conceicao")]));
test("ct: lowercase + sem acentos", () => eq(ud.ct, [sha("sao paulo")]));
test("st: nome por extenso vira UF 'sp'", () => eq(ud.st, [sha("sp")]));
test("zp: apenas 8 dígitos", () => eq(ud.zp, [sha("01310100")]));
test("co: 'Brasil' vira 'br'", () => eq(ud.co, [sha("br")]));
test("fbp NÃO hasheado", () => eq(ud.fbp, session.fbp));
test("fbc NÃO hasheado", () => eq(ud.fbc, session.fbc));
test("IP e UA repassados crus", () => {
  eq(ud.client_ip_address, session.client_ip);
  eq(ud.client_user_agent, session.client_user_agent);
});
test("external_id = sha256('visitor:'+fbp) quando não há customer id", () =>
  eq(ud.external_id, [sha(`visitor:${session.fbp}`)]));
test("custom_data mantém valor e moeda", () => {
  eq(ev.custom_data.value, 197.9);
  eq(ev.custom_data.currency, "BRL");
});
test("hashEmail rejeita string sem @", () => eq(hashEmail("semarroba"), ""));
test("hashPhone de string sem dígitos retorna vazio", () => eq(hashPhone("abc"), ""));
test("hashState: sigla 'RJ' e nome 'Paraná'", () => {
  eq(hashState("RJ"), sha("rj"));
  eq(hashState("Paraná"), sha("pr"));
  eq(hashState("Pará"), sha("pa"));
});
test("getUserDataKeys lista os sinais presentes", () => {
  const keys = getUserDataKeys(ud);
  for (const k of ["em", "ph", "fn", "ln", "ct", "st", "zp", "fbp", "fbc", "external_id"]) {
    ok(keys.includes(k), `chave '${k}' ausente em ${JSON.stringify(keys)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n📮 2. Inferência de UF pelo CEP (faixas dos Correios)");
// ─────────────────────────────────────────────────────────────────────────────
const ceps = {
  "01310-100": "sp", "20040-020": "rj", "29010-000": "es", "30130-010": "mg",
  "40020-000": "ba", "49010-000": "se", "50010-000": "pe", "57010-000": "al",
  "58010-000": "pb", "59010-000": "rn", "60010-000": "ce", "64000-000": "pi",
  "65010-000": "ma", "66010-000": "pa", "68900-000": "ap", "69005-010": "am",
  "69301-000": "rr", "69900-000": "ac", "70040-010": "df", "74000-000": "go",
  "76801-000": "ro", "77001-000": "to", "78005-000": "mt", "79002-000": "ms",
  "80010-000": "pr", "88010-000": "sc", "90010-000": "rs",
};
for (const [cep, uf] of Object.entries(ceps)) {
  test(`CEP ${cep} → ${uf}`, () => eq(getStateFromZip(cep), uf));
}
test("CEP inválido retorna null", () => eq(getStateFromZip("12"), null));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔒 3. Criptografia de tokens (AES-256-GCM)");
// ─────────────────────────────────────────────────────────────────────────────
test("encrypt → decrypt devolve o texto original", () => {
  const secret = "shpat_1234567890abcdef";
  eq(decrypt(encrypt(secret)), secret);
});
test("dois encrypt do mesmo texto geram cifras diferentes (IV aleatório)", () => {
  ok(encrypt("x") !== encrypt("x"), "IV repetido");
});
test("cifra adulterada é rejeitada", () => {
  const c = Buffer.from(encrypt("segredo"), "base64");
  c[c.length - 1] ^= 0xff;
  let threw = false;
  let out;
  try {
    out = decrypt(c.toString("base64"));
  } catch {
    threw = true;
  }
  ok(threw || out !== "segredo", "adulteração não detectada");
});

test("lê dado cifrado com a chave antiga pública (migração)", () => {
  const legacyKey = Buffer.from("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", legacyKey, iv);
  const enc = Buffer.concat([cipher.update("token-antigo", "utf8"), cipher.final()]);
  const blob = Buffer.concat([crypto.randomBytes(32), iv, cipher.getAuthTag(), enc]).toString("base64");
  eq(decrypt(blob), "token-antigo");
});
test("sem ATM_ENCRYPTION_KEY, encrypt falha (sem chave reserva)", () => {
  process.env.ATM_ENCRYPTION_KEY = "";
  let threw = false;
  try {
    encrypt("x");
  } catch {
    threw = true;
  } finally {
    process.env.ATM_ENCRYPTION_KEY = TEST_KEY;
  }
  ok(threw, "encrypt funcionou sem chave configurada");
});
test("ATM_ENCRYPTION_KEY com tamanho errado é recusada", () => {
  process.env.ATM_ENCRYPTION_KEY = "abc123";
  let threw = false;
  try {
    encrypt("x");
  } catch {
    threw = true;
  } finally {
    process.env.ATM_ENCRYPTION_KEY = TEST_KEY;
  }
  ok(threw, "chave inválida aceita");
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n✍️  4. Assinaturas (HMAC webhook Shopify e state OAuth)");
// ─────────────────────────────────────────────────────────────────────────────
const body = '{"id":123}';
const key = "shpss_teste";
const goodSig = crypto.createHmac("sha256", key).update(body, "utf8").digest("base64");
test("verifyHmac aceita assinatura válida", () => eq(verifyHmac(body, goodSig, key), true));
test("verifyHmac rejeita assinatura errada de mesmo tamanho", () => {
  const bad = crypto.createHmac("sha256", "outra").update(body).digest("base64");
  eq(verifyHmac(body, bad, key), false);
});
test("verifyHmac retorna false (sem lançar exceção) para assinatura malformada", () => {
  let r;
  try {
    r = verifyHmac(body, "curta", key);
  } catch (e) {
    throw new Error(`lançou exceção em vez de retornar false: ${e.message}`);
  }
  eq(r, false);
});
test("state OAuth Shopify: assinado → verificado", () => {
  const r = verifyOAuthState(signOAuthState("store-abc", "client-1"));
  eq([r.valid, r.storeId], [true, "store-abc"]);
});
test("state OAuth Shopify: storeId adulterado é rejeitado", () => {
  const s = JSON.parse(Buffer.from(signOAuthState("store-abc"), "base64url").toString());
  s.storeId = "store-vitima";
  const r = verifyOAuthState(Buffer.from(JSON.stringify(s)).toString("base64url"));
  eq(r.valid, false);
});
test("state OAuth Shopify: expirado (>60min) é rejeitado", () => {
  const s = JSON.parse(Buffer.from(signOAuthState("store-abc"), "base64url").toString());
  s.timestamp = Date.now() - 61 * 60 * 1000;
  eq(verifyOAuthState(Buffer.from(JSON.stringify(s)).toString("base64url")).valid, false);
});

test("state OAuth sem ATM_ENCRYPTION_KEY: assinatura falha (sem segredo reserva)", () => {
  process.env.ATM_ENCRYPTION_KEY = "";
  let threw = false;
  try {
    signOAuthState("store-abc");
  } catch {
    threw = true;
  } finally {
    process.env.ATM_ENCRYPTION_KEY = TEST_KEY;
  }
  ok(threw, "state assinado sem segredo configurado");
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🛡️  4b. Autenticação dos webhooks de checkout");
// ─────────────────────────────────────────────────────────────────────────────
const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const req = (url, headers = {}) => new Request(url, { method: "POST", headers });
test("token de webhook é estável por loja e diferente entre lojas", () => {
  eq(webhookTokenFor(STORE_A), webhookTokenFor(STORE_A));
  ok(webhookTokenFor(STORE_A) !== webhookTokenFor(STORE_B), "lojas com o mesmo token");
});
test("webhook com token correto na URL é aceito", () =>
  eq(isValidWebhookToken(req(`https://x.test/api/v1/webhook/zedy/${STORE_A}?token=${webhookTokenFor(STORE_A)}`), STORE_A), true));
test("webhook com token no cabeçalho x-atm-webhook-token é aceito", () =>
  eq(isValidWebhookToken(req(`https://x.test/w`, { "x-atm-webhook-token": webhookTokenFor(STORE_A) }), STORE_A), true));
test("webhook sem token é recusado", () => eq(isValidWebhookToken(req("https://x.test/w"), STORE_A), false));
test("token da loja B não abre o webhook da loja A", () =>
  eq(isValidWebhookToken(req(`https://x.test/w?token=${webhookTokenFor(STORE_B)}`), STORE_A), false));
test("token malformado é recusado sem exceção", () => eq(isValidWebhookToken(req("https://x.test/w?token=abc"), STORE_A), false));
test("Shopify: HMAC válido com a chave de assinatura da loja", () => {
  const raw = '{"id":987,"financial_status":"paid"}';
  const sig = crypto.createHmac("sha256", "chave-da-loja").update(raw, "utf8").digest("base64");
  eq(isValidShopifyHmac(raw, sig, shopifyWebhookSecrets({ webhook_secret: "chave-da-loja" })), true);
});
test("Shopify: HMAC válido com o Client Secret cifrado do app", () => {
  const raw = '{"id":988}';
  const sig = crypto.createHmac("sha256", "shpss_app").update(raw, "utf8").digest("base64");
  const store = { settings: { shopify: { client_secret_enc: encrypt("shpss_app") } } };
  eq(isValidShopifyHmac(raw, sig, shopifyWebhookSecrets(store)), true);
});
test("Shopify: corpo adulterado é recusado", () => {
  const sig = crypto.createHmac("sha256", "chave-da-loja").update('{"id":1}', "utf8").digest("base64");
  eq(isValidShopifyHmac('{"id":2}', sig, shopifyWebhookSecrets({ webhook_secret: "chave-da-loja" })), false);
});
test("Shopify: cabeçalho presente mas loja sem segredo é recusado", () =>
  eq(isValidShopifyHmac('{"id":1}', "qualquer", shopifyWebhookSecrets({})), false));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🕒 5. Janelas de data (America/Sao_Paulo, UTC-3)");
// ─────────────────────────────────────────────────────────────────────────────
const today = resolveAccountDateRange("today", "America/Sao_Paulo");
test("'today' começa 00:00 de Brasília = 03:00Z", () => ok(today.startUtc.endsWith("T03:00:00.000Z"), today.startUtc));
test("'today' termina 23:59:59.999 de Brasília = 02:59:59.999Z do dia seguinte", () =>
  ok(today.endUtc.endsWith("T02:59:59.999Z"), today.endUtc));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
test("'last_7d' cobre 7 dias (mesma semântica da Meta/UTMify)", () => {
  const r = resolveAccountDateRange("last_7d", "America/Sao_Paulo");
  eq(daysBetween(r.since, r.until), 7, `since=${r.since} until=${r.until}:`);
});
test("'last_30d' cobre 30 dias", () => {
  const r = resolveAccountDateRange("last_30d", "America/Sao_Paulo");
  eq(daysBetween(r.since, r.until), 30, `since=${r.since} until=${r.until}:`);
});
test("'yesterday' é um único dia anterior a hoje", () => {
  const r = resolveAccountDateRange("yesterday", "America/Sao_Paulo");
  eq([r.since === r.until, daysBetween(r.since, today.since)], [true, 2]);
});
test("timezone inválido cai no fallback America/Sao_Paulo", () =>
  eq(resolveAccountDateRange("today", "Mars/Olympus").timezone, "America/Sao_Paulo"));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n💱 6. Conversão cambial");
// ─────────────────────────────────────────────────────────────────────────────
test("USD 100 × 5,40 = R$ 540,00", () => eq(convertToBrl(100, "USD", 5.4), 540));
test("BRL não é convertido", () => eq(convertToBrl(99.999, "BRL", 5.4), 100));
test("EUR é convertido (não tratado como BRL)", () =>
  ok(convertToBrl(100, "EUR", 5.4) !== 100, "EUR 100 retornou R$ 100 — moeda ignorada"));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
if (fail) {
  console.log("\nFalhas:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);
