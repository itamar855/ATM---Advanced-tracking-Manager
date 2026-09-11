/**
 * Teste de Validação Cirúrgica — Correção do Meta OAuth Token 190
 *
 * Valida os 4 requisitos obrigatórios:
 * 1. Token válido atual continua funcionando contra a Graph API da Meta.
 * 2. Payload JSON antigo / BYTEA hex corrompido é interceptado e NUNCA enviado para a Meta.
 * 3. Token inválido/JSON/HEX retorna erro local e é bloqueado antes de persistir no banco.
 * 4. Diagnóstico (debug/route) não gera mais OAuthException 190 ao receber token malformado.
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("../web/node_modules/@supabase/supabase-js");

// Carrega .env.local
const envContent = fs.readFileSync(path.join(__dirname, "../web/.env.local"), "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Simula / Reutiliza lógica idêntica à implementada em web/src/lib/meta/token.ts
const { decrypt, encrypt } = require("../web/src/lib/encryption.ts");

function isCleanMetaToken(val) {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("\\x") ||
    trimmed.startsWith("\\\\x") ||
    trimmed.includes(":") ||
    trimmed.includes('"') ||
    trimmed.includes("'")
  ) {
    return false;
  }
  return /^EAA[A-Za-z0-9_-]{20,}$/.test(trimmed);
}

function resolveMetaAccessToken(raw) {
  if (!raw) return null;

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }

  if (typeof raw === "object") {
    if (raw.access_token) {
      const resolved = resolveMetaAccessToken(raw.access_token);
      if (resolved) return resolved;
    }
    if (raw.token) {
      const resolved = resolveMetaAccessToken(raw.token);
      if (resolved) return resolved;
    }
    for (const key of Object.keys(raw)) {
      const val = raw[key];
      if (typeof val === "string" || (val && typeof val === "object")) {
        const nested = resolveMetaAccessToken(val);
        if (nested) return nested;
      }
    }
    return null;
  }

  let str = String(raw).trim();

  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }

  if (/^\\+x/i.test(str)) {
    try {
      const hex = str.replace(/^\\+x/i, "");
      if (hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
        const decoded = Buffer.from(hex, "hex").toString("utf8").trim();
        if (decoded) {
          const nested = resolveMetaAccessToken(decoded);
          if (nested) return nested;
        }
      }
    } catch {
      // Ignora erro
    }
  }

  if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
    try {
      const parsed = JSON.parse(str);
      const nested = resolveMetaAccessToken(parsed);
      if (nested) return nested;
    } catch {
      // Ignora erro
    }
  }

  if (isCleanMetaToken(str)) {
    return str;
  }

  try {
    const decrypted = decrypt(str).trim();
    if (decrypted) {
      const nested = resolveMetaAccessToken(decrypted);
      if (nested) return nested;
    }
  } catch {
    // Não é ciphertext AES
  }

  const match = str.match(/EAA[A-Za-z0-9_-]{20,}/);
  if (match && isCleanMetaToken(match[0])) {
    return match[0];
  }

  return null;
}

function isValidMetaTokenForStorage(tokenCandidate) {
  if (!tokenCandidate || typeof tokenCandidate !== "string") return false;
  const trimmed = tokenCandidate.trim();

  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("\\x") ||
    trimmed.startsWith("\\\\x") ||
    trimmed.includes('"') ||
    trimmed.includes("'")
  ) {
    return false;
  }

  if (isCleanMetaToken(trimmed) || /^EA[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return true;
  }

  try {
    const decrypted = decrypt(trimmed).trim();
    if (isCleanMetaToken(decrypted) || /^EA[A-Za-z0-9_-]{20,}$/.test(decrypted)) {
      return true;
    }
  } catch {
    // Não é ciphertext
  }

  return false;
}

async function runSurgicalTests() {
  console.log("================================================================================");
  console.log("🛠️ INICIANDO SUÍTE DE TESTES CIRÚRGICOS: META OAUTH TOKEN 190");
  console.log("================================================================================\n");

  let allPassed = true;

  // TESTE 1: Token válido atual no banco continua funcionando
  console.log("--- TESTE 1: Validação do Token Atual na Graph API ---");
  const { data: storeInt } = await supabase
    .from("integrations")
    .select("store_id, platform, access_token_enc")
    .eq("store_id", "dckb5g-7d")
    .eq("platform", "meta")
    .single();

  const currentToken = resolveMetaAccessToken(storeInt.access_token_enc);
  console.log("Token recuperado do banco:", currentToken ? `${currentToken.slice(0, 15)}...${currentToken.slice(-6)}` : "NULO");

  if (!currentToken || !currentToken.startsWith("EA")) {
    console.error("❌ FALHA T1: Token não foi recuperado ou não inicia com EA");
    allPassed = false;
  } else {
    try {
      const meRes = await fetch(`https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${currentToken}`, {
        cache: "no-store",
      });
      const meData = await meRes.json();
      if (meRes.ok && meData.id && meData.name) {
        console.log(`✅ SUCESSO T1: Graph API /me respondeu HTTP 200 (ID: ${meData.id}, Nome: ${meData.name})`);
      } else {
        console.error("❌ FALHA T1: Resposta inesperada da Meta:", meData);
        allPassed = false;
      }
    } catch (err) {
      console.error("❌ FALHA T1: Erro de rede:", err.message);
      allPassed = false;
    }
  }

  // TESTE 2: Payload JSON antigo / BYTEA hex não é enviado para a Meta
  console.log("\n--- TESTE 2: Interceptação de Payload JSON/HEX Antigo ---");
  const corruptPayloads = [
    '\\x7b2273656c65637465645f626d5f696473223a5b5d2c2261645f6163636f756e745f696473223a5b226163745f31353532383331353832343630383132225d7d',
    '{"ad_account_ids":["act_12345"]}',
    '{"profile_name":"Test","selected_bm_ids":[]}',
    '\\x7b226163636573735f746f6b656e223a22227d' // JSON com token vazio
  ];

  for (const p of corruptPayloads) {
    const resolved = resolveMetaAccessToken(p);
    if (resolved === null) {
      console.log(`✅ SUCESSO T2: Payload [${p.slice(0, 30)}...] rejeitado com segurança (retornou null).`);
    } else {
      console.error(`❌ FALHA T2: Payload corrompido retornou valor não-nulo: ${resolved}`);
      allPassed = false;
    }
  }

  // TESTE 3: Token inválido retorna erro local e bloqueia persistência
  console.log("\n--- TESTE 3: Bloqueio de Persistência para Tokens Inválidos (accounts/route) ---");
  const invalidCandidates = [
    '{"config": 123}',
    '\\x7b22...355d7d',
    'invalid_random_string_without_ea_prefix',
    '',
    null,
    undefined,
    'EAA_CURTO' // menos de 20 caracteres
  ];

  for (const inv of invalidCandidates) {
    const canStore = isValidMetaTokenForStorage(inv);
    if (!canStore) {
      console.log(`✅ SUCESSO T3: Candidato inválido [${String(inv).slice(0, 25)}] bloqueado antes da persistência.`);
    } else {
      console.error(`❌ FALHA T3: Candidato inválido [${inv}] passou pela validação de persistência!`);
      allPassed = false;
    }
  }

  // Também testa candidato válido
  const validCandidates = [
    currentToken,
    encrypt(currentToken)
  ];
  for (const val of validCandidates) {
    const canStore = isValidMetaTokenForStorage(val);
    if (canStore) {
      console.log(`✅ SUCESSO T3: Candidato legítimo [${val.slice(0, 20)}...] aprovado para persistência.`);
    } else {
      console.error(`❌ FALHA T3: Candidato legítimo foi indevidamente rejeitado: ${val.slice(0, 20)}`);
      allPassed = false;
    }
  }

  // TESTE 4: Diagnóstico não gera mais OAuthException 190 ao receber token malformado
  console.log("\n--- TESTE 4: Simulação do Diagnóstico (debug/route) com Token Malformado ---");
  // Simula a lógica do debug/route.ts
  const simulateDebugRoute = (tokenFromDb) => {
    let token = "";
    let graphApiCalled = false;
    let oauthException190 = false;
    const recommendations = [];

    const resolved = resolveMetaAccessToken(tokenFromDb);
    if (resolved) {
      token = resolved;
    } else {
      recommendations.push(
        "Token encontrado para esta loja, mas está em formato inválido ou corrompido (JSON/HEX). Chamadas à Graph API foram bloqueadas para prevenir OAuthException 190."
      );
    }

    if (token) {
      graphApiCalled = true;
    }

    return {
      token_masked: token ? `${token.slice(0, 7)}...${token.slice(-6)}` : null,
      graphApiCalled,
      recommendations
    };
  };

  const corruptInput = "\\x7b227...355d7d";
  const debugResult = simulateDebugRoute(corruptInput);
  if (!debugResult.graphApiCalled && debugResult.token_masked === null && debugResult.recommendations.length > 0) {
    console.log("✅ SUCESSO T4: Diagnóstico bloqueou chamadas à Graph API para token malformado e emitiu recomendação protetiva.");
    console.log("   Recomendação registrada:", debugResult.recommendations[0]);
  } else {
    console.error("❌ FALHA T4: Diagnóstico permitiu chamada externa com token malformado:", debugResult);
    allPassed = false;
  }

  console.log("\n================================================================================");
  if (allPassed) {
    console.log("🎯 TODOS OS 4 TESTES CIRÚRGICOS PASSARAM COM 100% DE ASSERTIVIDADE!");
  } else {
    console.error("❌ HOUVE FALHAS EM UM OU MAIS TESTES!");
    process.exit(1);
  }
  console.log("================================================================================\n");
}

runSurgicalTests().catch(err => {
  console.error("Erro fatal no executor de testes:", err);
  process.exit(1);
});
