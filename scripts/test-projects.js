/**
 * scripts/test-projects.js
 *
 * Testes da Fase 1 (tipo de projeto), offline:
 *   - tipo do projeto com fallback para loja
 *   - o que cada tipo mostra no menu
 *   - limpeza do domínio digitado no cadastro
 *   - detecção do erro "migration 030 não rodada"
 *
 * A migration 030 em si é testada num Postgres real (PGlite).
 *
 * Uso: node scripts/test-projects.js
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

const {
  PROJECT_TYPES,
  PROJECT_TYPE_INFO,
  projectTypeOf,
  projectInfo,
  normalizeDomain,
  isMissingProjectTypeColumn,
} = require(path.resolve(__dirname, "..", "web", "src", "lib", "projects", "types.ts"));

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
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}

console.log("\n🗂️  1. Tipo do projeto");
test("loja antiga (sem coluna) conta como loja", () =>
  eq([projectTypeOf({}), projectTypeOf(null), projectTypeOf({ project_type: null }), projectTypeOf({ project_type: "saas" })],
    ["ecommerce", "ecommerce", "ecommerce", "ecommerce"]));
test("infoproduto e app são lidos", () =>
  eq([projectTypeOf({ project_type: "infoproduct" }), projectTypeOf({ project_type: "app" })], ["infoproduct", "app"]));
test("todo tipo tem textos e plataforma", () => {
  for (const t of PROJECT_TYPES) {
    const i = PROJECT_TYPE_INFO[t];
    if (!i.label || !i.domainLabel || !i.salesLabel || !["shopify", "custom"].includes(i.platform)) throw new Error(t);
  }
});

console.log("\n🧭 2. Menu por tipo");
test("Assinaturas só no web app", () =>
  eq(PROJECT_TYPES.map((t) => projectInfo({ project_type: t }).showSubscriptions), [false, false, true]));
test("Shopify só na loja", () =>
  eq(PROJECT_TYPES.map((t) => projectInfo({ project_type: t }).showShopify), [true, false, false]));
test("projeto sem loja grava plataforma custom", () =>
  eq(PROJECT_TYPES.map((t) => PROJECT_TYPE_INFO[t].platform), ["shopify", "custom", "custom"]));

console.log("\n🌐 3. Domínio digitado");
test("tira https, www, caminho, porta e maiúsculas", () =>
  eq(
    ["https://www.MeuCurso.com.br/oferta?x=1", "meuapp.com.br:443", "  loja.myshopify.com  ", "http://app.meusite.io/#/login", "www.site.com."].map(normalizeDomain),
    ["meucurso.com.br", "meuapp.com.br", "loja.myshopify.com", "app.meusite.io", "site.com"]
  ));
test("recusa o que não é domínio", () =>
  eq(["", "meucurso", "meu curso.com", "https://", "-a.com", "a..com", "<script>.com"].map(normalizeDomain), ["", "", "", "", "", "", ""]));

console.log("\n🧱 4. Migration 030 não rodada");
test("reconhece o erro de coluna inexistente", () =>
  eq(
    [
      isMissingProjectTypeColumn({ code: "42703", message: "column stores.project_type does not exist" }),
      isMissingProjectTypeColumn({ code: "PGRST204", message: "Could not find the 'project_type' column of 'stores' in the schema cache" }),
      isMissingProjectTypeColumn({ code: "23514", message: 'new row violates check constraint "stores_platform_check"' }),
      isMissingProjectTypeColumn({ code: "23505", message: "duplicate key" }),
      isMissingProjectTypeColumn(null),
    ],
    [true, true, false, false, false]
  ));

console.log(`\n📊 RESULTADO: ${pass} PASS | ${fail} FAIL`);
process.exit(fail ? 1 : 0);
