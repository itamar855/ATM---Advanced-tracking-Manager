/**
 * scripts/test-campaign-intelligence-alerts.js
 *
 * Runner oficial da Suíte de Testes de Integração e Contrato:
 * Campaign Intelligence Alerts Engine (Fase 6).
 */

const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const webDir = path.resolve(rootDir, "web");
const testScript = path.resolve(__dirname, "test-campaign-intelligence-alerts.ts");

console.log("Iniciando runner de integração: test-campaign-intelligence-alerts.ts...\n");

const isWin = process.platform === "win32";
const npxCmd = isWin ? "npx.cmd" : "npx";

const result = spawnSync(npxCmd, ["tsx", `"${testScript}"`], {
  cwd: webDir,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
  },
});

process.exit(result.status ?? 0);
