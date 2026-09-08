/**
 * scripts/test-campaign-action-engine.js
 *
 * Runner oficial da Suíte de Testes da Fase 7: Campaign Action Engine
 * ATM - Advanced Tracking Manager ADS
 */

const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const webDir = path.resolve(rootDir, "web");
const testScript = path.resolve(__dirname, "test-campaign-action-engine.ts");

console.log("Iniciando runner de testes: test-campaign-action-engine.ts...\n");

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
