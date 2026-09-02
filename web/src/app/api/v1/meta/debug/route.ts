import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * GET /api/v1/meta/debug
 * Executa um diagnóstico cirúrgico completo da conexão com o Facebook Graph API.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store_id");
  const directToken = searchParams.get("token");

  const debugLog: {
    timestamp: string;
    store_id: string | null;
    database: {
      found_in_store: boolean;
      found_in_fallback: boolean;
      token_masked: string | null;
      decrypted_successfully: boolean;
    };
    graph_api_tests: {
      step1_user_profile: any;
      step2_permissions: any;
      step3_debug_token: any;
      step4_direct_adaccounts: any;
      step5_businesses: any;
      step6_bm_accounts: any[];
      step7_assigned_accounts: any;
    };
    diagnosis_summary: {
      is_connected: boolean;
      token_valid: boolean;
      total_accounts_found: number;
      total_bms_found: number;
      account_ids: string[];
      bm_names: string[];
      missing_permissions: string[];
      recommendations: string[];
    };
  } = {
    timestamp: new Date().toISOString(),
    store_id: storeId,
    database: {
      found_in_store: false,
      found_in_fallback: false,
      token_masked: null,
      decrypted_successfully: false,
    },
    graph_api_tests: {
      step1_user_profile: null,
      step2_permissions: null,
      step3_debug_token: null,
      step4_direct_adaccounts: null,
      step5_businesses: null,
      step6_bm_accounts: [],
      step7_assigned_accounts: null,
    },
    diagnosis_summary: {
      is_connected: false,
      token_valid: false,
      total_accounts_found: 0,
      total_bms_found: 0,
      account_ids: [],
      bm_names: [],
      missing_permissions: [],
      recommendations: [],
    },
  };

  let token = directToken ? directToken.trim() : "";

  // 1. Consulta no Banco de Dados
  if (!token && storeId) {
    try {
      const supabase = createAdminClient();

      const { data: storeInt } = await supabase
        .from("integrations")
        .select("*")
        .eq("store_id", storeId)
        .eq("platform", "meta")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (storeInt?.access_token_enc) {
        debugLog.database.found_in_store = true;
        const raw = storeInt.access_token_enc.toString();
        if (raw.startsWith("EAA")) {
          token = raw;
          debugLog.database.decrypted_successfully = true;
        } else {
          try {
            token = decrypt(raw);
            debugLog.database.decrypted_successfully = true;
          } catch {
            token = raw;
          }
        }
      } else {
        // Fallback global
        const { data: fallbackInt } = await supabase
          .from("integrations")
          .select("*")
          .eq("platform", "meta")
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackInt?.access_token_enc) {
          debugLog.database.found_in_fallback = true;
          const raw = fallbackInt.access_token_enc.toString();
          if (raw.startsWith("EAA")) {
            token = raw;
            debugLog.database.decrypted_successfully = true;
          } else {
            try {
              token = decrypt(raw);
              debugLog.database.decrypted_successfully = true;
            } catch {
              token = raw;
            }
          }
        }
      }
    } catch (dbErr: any) {
      debugLog.diagnosis_summary.recommendations.push(`Erro ao acessar Supabase: ${dbErr.message}`);
    }
  }

  if (token) {
    debugLog.database.token_masked = `${token.slice(0, 7)}...${token.slice(-6)}`;
  } else {
    debugLog.diagnosis_summary.recommendations.push("Nenhum token encontrado no banco de dados ou informado na requisição.");
    return NextResponse.json(debugLog, { status: 200 });
  }

  const allDiscoveredAccounts = new Map<string, any>();
  const allDiscoveredBms = new Map<string, any>();

  // 2. Step 1: GET /me
  try {
    const res = await fetch(`${GRAPH_BASE}/me?fields=id,name,email&access_token=${token}`, { cache: "no-store" });
    const data = await res.json();
    debugLog.graph_api_tests.step1_user_profile = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
    if (res.ok) {
      debugLog.diagnosis_summary.token_valid = true;
    }
  } catch (e: any) {
    debugLog.graph_api_tests.step1_user_profile = { error: e.message };
  }

  // 3. Step 2: GET /me/permissions
  const grantedPerms: string[] = [];
  try {
    const res = await fetch(`${GRAPH_BASE}/me/permissions?access_token=${token}`, { cache: "no-store" });
    const data = await res.json();
    debugLog.graph_api_tests.step2_permissions = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
    if (res.ok && Array.isArray(data.data)) {
      data.data.forEach((p: any) => {
        if (p.status === "granted") grantedPerms.push(p.permission);
      });
    }
  } catch (e: any) {
    debugLog.graph_api_tests.step2_permissions = { error: e.message };
  }

  // Verifica permissões essenciais
  if (!grantedPerms.includes("ads_read")) debugLog.diagnosis_summary.missing_permissions.push("ads_read");
  if (!grantedPerms.includes("ads_management")) debugLog.diagnosis_summary.missing_permissions.push("ads_management");

  // 4. Step 3: GET /debug_token
  try {
    const res = await fetch(`${GRAPH_BASE}/debug_token?input_token=${token}&access_token=${token}`, { cache: "no-store" });
    const data = await res.json();
    debugLog.graph_api_tests.step3_debug_token = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
  } catch (e: any) {
    debugLog.graph_api_tests.step3_debug_token = { error: e.message };
  }

  // 5. Step 4: GET /me/adaccounts
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name&limit=100&access_token=${token}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    debugLog.graph_api_tests.step4_direct_adaccounts = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
    if (res.ok && Array.isArray(data.data)) {
      data.data.forEach((acc: any) => {
        allDiscoveredAccounts.set(acc.id, acc);
        if (acc.business_name) {
          allDiscoveredBms.set(acc.business_name, { name: acc.business_name });
        }
      });
    }
  } catch (e: any) {
    debugLog.graph_api_tests.step4_direct_adaccounts = { error: e.message };
  }

  // 6. Step 5: GET /me/businesses
  try {
    const res = await fetch(`${GRAPH_BASE}/me/businesses?fields=id,name,verification_status&limit=50&access_token=${token}`, { cache: "no-store" });
    const data = await res.json();
    debugLog.graph_api_tests.step5_businesses = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
    if (res.ok && Array.isArray(data.data)) {
      for (const bm of data.data) {
        allDiscoveredBms.set(bm.id, bm);

        // Step 6: Contas da BM
        try {
          const [ownedRes, clientRes] = await Promise.all([
            fetch(`${GRAPH_BASE}/${bm.id}/owned_ad_accounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name&limit=100&access_token=${token}`, { cache: "no-store" }),
            fetch(`${GRAPH_BASE}/${bm.id}/client_ad_accounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name&limit=100&access_token=${token}`, { cache: "no-store" }),
          ]);

          const ownedData = ownedRes.ok ? await ownedRes.json() : null;
          const clientData = clientRes.ok ? await clientRes.json() : null;

          if (ownedData?.data) {
            ownedData.data.forEach((acc: any) => allDiscoveredAccounts.set(acc.id, { ...acc, bm_name: bm.name }));
          }
          if (clientData?.data) {
            clientData.data.forEach((acc: any) => allDiscoveredAccounts.set(acc.id, { ...acc, bm_name: bm.name }));
          }

          debugLog.graph_api_tests.step6_bm_accounts.push({
            bm_id: bm.id,
            bm_name: bm.name,
            owned_status: ownedRes.status,
            owned_count: ownedData?.data?.length || 0,
            client_status: clientRes.status,
            client_count: clientData?.data?.length || 0,
          });
        } catch (bmErr: any) {
          debugLog.graph_api_tests.step6_bm_accounts.push({
            bm_id: bm.id,
            error: bmErr.message,
          });
        }
      }
    }
  } catch (e: any) {
    debugLog.graph_api_tests.step5_businesses = { error: e.message };
  }

  // 7. Step 7: GET /me/assigned_ad_accounts
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/assigned_ad_accounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name&limit=100&access_token=${token}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    debugLog.graph_api_tests.step7_assigned_accounts = {
      status_code: res.status,
      ok: res.ok,
      data,
    };
    if (res.ok && Array.isArray(data.data)) {
      data.data.forEach((acc: any) => allDiscoveredAccounts.set(acc.id, acc));
    }
  } catch (e: any) {
    debugLog.graph_api_tests.step7_assigned_accounts = { error: e.message };
  }

  // Consolida resumo final
  debugLog.diagnosis_summary.is_connected = debugLog.diagnosis_summary.token_valid;
  debugLog.diagnosis_summary.total_accounts_found = allDiscoveredAccounts.size;
  debugLog.diagnosis_summary.total_bms_found = allDiscoveredBms.size;
  debugLog.diagnosis_summary.account_ids = Array.from(allDiscoveredAccounts.keys());
  debugLog.diagnosis_summary.bm_names = Array.from(allDiscoveredBms.values()).map((b) => b.name);

  if (allDiscoveredAccounts.size === 0) {
    debugLog.diagnosis_summary.recommendations.push(
      "O token é válido, mas nenhuma conta de anúncio foi retornada pelo Facebook. Verifique no Meta Business Manager se este Usuário do Sistema ou Perfil possui a permissão 'Gerenciar campanhas' ou 'Visualizar desempenho' atribuída como Ativo na Conta de Anúncios."
    );
  } else {
    debugLog.diagnosis_summary.recommendations.push(
      `Sucesso: ${allDiscoveredAccounts.size} conta(s) encontrada(s) em ${allDiscoveredBms.size} Business Manager(s).`
    );
  }

  return NextResponse.json(debugLog, { status: 200 });
}
