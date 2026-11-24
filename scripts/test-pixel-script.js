/**
 * scripts/test-pixel-script.js
 *
 * Roda o script do pixel ATM (v5) num navegador simulado (node:vm, sem rede) e confere:
 *   - fila atm(...) antes do carregamento, ATM.track / identify / getTrackId / getAttribution
 *   - UTMs guardadas e reaproveitadas em outra página
 *   - página própria: sem valor inventado no InitiateCheckout, data-atm-event
 *   - compra com event_id "Purchase_<id>" (igual ao servidor) e sem compra falsa por ?id=
 *   - decoração de links de checkout com track_id
 *
 * Uso: node scripts/test-pixel-script.js
 */

const path = require("path");
const vm = require("vm");
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

const { generateATMScript, generateNoopScript } = require(path.resolve(__dirname, "..", "web", "src", "lib", "tracking", "pixel-script.ts"));

const STORE = "11111111-2222-3333-4444-555555555555";
const SCRIPT = generateATMScript(STORE, "https://atm.test/api/v1");

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

/** Elemento mínimo com atributos. */
function makeEl(tag, attrs = {}, text = "") {
  const a = { ...attrs };
  return {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    innerText: text,
    className: a.class || "",
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    hasAttribute: (k) => k in a,
    closest() { return this; },
    querySelector: () => null,
    querySelectorAll: () => [],
    attrs: a,
  };
}

/** Navegador simulado. `storage` pode ser compartilhado entre "páginas". */
function browser(url, { storage = {}, ctx, links = [], preload } = {}) {
  const sent = [];
  const listeners = {};
  let cookies = storage.__cookies || {};
  const ls = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
  };
  const u = new URL(url);
  const document = {
    get cookie() { return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(s) { const [kv] = s.split(";"); const i = kv.indexOf("="); cookies[kv.slice(0, i).trim()] = kv.slice(i + 1); storage.__cookies = cookies; },
    referrer: "",
    readyState: "complete",
    documentElement: {},
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    querySelectorAll: () => links,
    createElement: (t) => makeEl(t),
    dispatchEvent: () => true,
  };
  const window = {
    location: { href: url, search: u.search, pathname: u.pathname, origin: u.origin },
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    __ATM_CTX__: ctx,
    fetch: (endpoint, opts) => { sent.push({ endpoint, body: JSON.parse(opts.body) }); return Promise.resolve({ clone: () => ({ json: () => Promise.resolve({}) }) }); },
    console: { warn: () => {}, log: () => {} },
  };
  // No navegador, window É o escopo global
  const sandbox = Object.assign(window, {
    document, URL, URLSearchParams, Date, Math, JSON, Number, String, Array, Promise, isFinite,
    navigator: { userAgent: "UA-Test" },
    crypto: { randomUUID: () => require("crypto").randomUUID() },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    MutationObserver: function () { this.observe = () => {}; },
    CustomEvent: function () {},
    Blob: function () {},
  });
  sandbox.window = sandbox;
  if (preload) preload(sandbox);
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  const events = () => sent.filter((s) => s.endpoint.endsWith("/events/browser")).map((s) => s.body);
  const fire = (type, target) => (listeners[type] || []).forEach((fn) => fn({ target, preventDefault() {} }));
  return { sandbox, sent, events, fire, storage, ATM: sandbox.window.ATM };
}

console.log("\n🧩 1. Carregamento");
test("template não tem crase nem ${ e é JavaScript válido", () => {
  ok(!SCRIPT.includes("${"));
  new vm.Script(SCRIPT);
});
test("script vazio quando a loja não existe é válido", () => new vm.Script(generateNoopScript("teste */ x")));
test("PageView e capture na carga", () => {
  const b = browser("https://curso.com/oferta");
  eq(b.events().map((e) => e.event_name), ["PageView"]);
  ok(b.sent.some((s) => s.endpoint === "https://atm.test/api/v1/capture"));
  eq(b.events()[0].store_id, STORE);
});
test("carregar duas vezes não duplica", () => {
  const b = browser("https://curso.com/");
  vm.runInContext(SCRIPT, b.sandbox);
  eq(b.events().length, 1);
});

console.log("\n🎯 2. API pública");
test("fila atm(...) feita antes do script carrega depois", () => {
  const b = browser("https://curso.com/", {
    preload: (sb) => { sb.window.atmq = [["identify", { email: "a@b.com", name: "Ana Souza" }], ["track", "Lead"]]; },
  });
  const lead = b.events().find((e) => e.event_name === "Lead");
  ok(lead, "Lead não enviado");
  eq([lead.user_data.email, lead.user_data.firstName, lead.user_data.lastName], ["a@b.com", "Ana", "Souza"]);
});
test("atm() depois de carregar chama na hora", () => {
  const b = browser("https://curso.com/");
  b.sandbox.window.atm("track", "CompleteRegistration");
  ok(b.events().some((e) => e.event_name === "CompleteRegistration"));
});
test("Purchase usa event_id Purchase_<order_id> (igual ao servidor)", () => {
  const b = browser("https://curso.com/obrigado");
  const id = b.ATM.track("Purchase", { order_id: "txn_9", value: 97 });
  eq(id, "Purchase_txn_9");
  const p = b.events().find((e) => e.event_name === "Purchase");
  eq([p.event_id, p.custom_data.value, p.custom_data.currency], ["Purchase_txn_9", 97, "BRL"]);
});
test("evento desconhecido é recusado", () => {
  const b = browser("https://curso.com/");
  eq(b.ATM.track("Compra"), null);
  eq(b.events().length, 1);
});
test("StartTrial é aceito", () => {
  const b = browser("https://app.com/");
  ok(b.ATM.track("StartTrial", { value: 0 }));
});
test("getAttribution traz track_id, fbp, UTMs e navegador", () => {
  const b = browser("https://curso.com/?utm_source=facebook&utm_campaign=c%7C1&fbclid=ABC");
  const a = b.ATM.getAttribution();
  eq([a.track_id, a.utm_source, a.utm_campaign, a.user_agent], [b.ATM.getTrackId(), "facebook", "c|1", "UA-Test"]);
  ok(/^fb\.1\.\d+\.ABC$/.test(a.fbc), "fbc " + a.fbc);
  ok(/^fb\.1\./.test(a.fbp));
});

console.log("\n🔗 3. Atribuição entre páginas");
test("UTMs e track_id continuam na página seguinte (sem UTM na URL)", () => {
  const storage = {};
  const b1 = browser("https://curso.com/?utm_source=fb&utm_campaign=camp1", { storage });
  const b2 = browser("https://curso.com/checkout", { storage });
  eq(b2.ATM.getTrackId(), b1.ATM.getTrackId());
  const cap = b2.sent.find((s) => s.endpoint.endsWith("/capture")).body;
  eq([cap.utm_source, cap.utm_campaign], ["fb", "camp1"]);
});
test("clique novo em anúncio troca o fbc", () => {
  const storage = {};
  browser("https://curso.com/?fbclid=OLD", { storage });
  const b2 = browser("https://curso.com/?fbclid=NEW", { storage });
  ok(b2.ATM.getAttribution().fbc.endsWith(".NEW"));
});
test("link de checkout externo recebe track_id e UTMs", () => {
  const link = makeEl("a", { href: "https://pay.kiwify.com.br/abc" });
  const b = browser("https://curso.com/?utm_source=fb", { links: [link] });
  const href = new URL(link.attrs.href);
  eq([href.searchParams.get("track_id"), href.searchParams.get("utm_source")], [b.ATM.getTrackId(), "fb"]);
});
test("clique em link comum não quebra (antes: isZedyLink indefinido)", () => {
  const b = browser("https://curso.com/");
  b.fire("click", makeEl("a", { href: "/sobre" }, "Sobre"));
});

console.log("\n🛒 4. Checkout e compra");
test("página própria: InitiateCheckout sem valor inventado (antes: R$ 172,88)", () => {
  const b = browser("https://curso.com/");
  b.fire("click", makeEl("a", { href: "/checkout" }, "Comprar agora"));
  const ic = b.events().find((e) => e.event_name === "InitiateCheckout");
  ok(ic, "InitiateCheckout não enviado");
  eq(ic.custom_data.value, undefined);
});
test("valor da oferta em __ATM_CTX__.offer", () => {
  const b = browser("https://curso.com/", { ctx: { offer: { id: "curso-x", value: 97 } } });
  b.fire("click", makeEl("a", { href: "/checkout" }, "Quero comprar"));
  const ic = b.events().find((e) => e.event_name === "InitiateCheckout");
  eq([ic.custom_data.value, ic.custom_data.content_ids], [97, ["curso-x"]]);
});
test("data-atm-event e data-atm-value sem código", () => {
  const b = browser("https://curso.com/");
  b.fire("click", makeEl("button", { "data-atm-event": "InitiateCheckout", "data-atm-value": "47,90" }, "Assinar"));
  const ic = b.events().find((e) => e.event_name === "InitiateCheckout");
  eq(ic.custom_data.value, 47.9);
});
test("?id= numa página comum NÃO gera compra falsa", () => {
  const b = browser("https://curso.com/aula?id=123");
  ok(!b.events().some((e) => e.event_name === "Purchase"));
});
test("Shopify: página de obrigado com pedido gera Purchase_<id>", () => {
  const b = browser("https://loja.com/checkouts/x/thank_you", {
    preload: (sb) => { sb.window.Shopify = { checkout: { order_id: 555, total_price: "129.90", email: "c@d.com" } }; },
  });
  const p = b.events().find((e) => e.event_name === "Purchase");
  eq([p.event_id, p.custom_data.value, p.user_data.email], ["Purchase_555", 129.9, "c@d.com"]);
});
test("formulário de cadastro com e-mail dispara Lead (harvester)", () => {
  const b = browser("https://curso.com/");
  b.sandbox.setTimeout = (fn) => { fn(); return 0; };
  const input = (attrs, value) => Object.assign(makeEl("input", attrs), { type: attrs.type || "text", value, id: attrs.id || "", name: attrs.name || "", placeholder: "" });
  b.fire("input", input({ type: "tel", name: "whatsapp" }, "(11) 98888-7777"));
  b.fire("input", input({ type: "email", name: "email" }, "x@y.com"));
  const leads = b.events().filter((e) => e.event_name === "Lead");
  eq(leads.length, 1);
  eq(leads[0].user_data.phone, "11988887777");
});
test("senha digitada nunca é capturada", () => {
  const b = browser("https://curso.com/");
  const pwd = Object.assign(makeEl("input", {}), { type: "password", value: "segredo@123.com", name: "senha", id: "", placeholder: "" });
  b.fire("input", pwd);
  b.ATM.track("Lead");
  eq(b.events().find((e) => e.event_name === "Lead").user_data.email, "");
});
test("identify junta nome, e-mail e telefone", () => {
  const b = browser("https://curso.com/");
  b.ATM.identify({ email: "x@y.com", phone: "(11) 98888-7777", name: "Bia Lima Souza" });
  b.ATM.track("Lead");
  const lead = b.events().find((e) => e.event_name === "Lead");
  eq([lead.user_data.email, lead.user_data.phone, lead.user_data.firstName, lead.user_data.lastName], ["x@y.com", "11988887777", "Bia", "Lima Souza"]);
});

console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
if (fail) {
  console.log("\nFalhas:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);
