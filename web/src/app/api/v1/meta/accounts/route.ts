import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/accounts
 * Retorna as contas de anúncio vinculadas ao token passado via query (?token=...)
 * ou da integração salva da loja (?store_id=...).
 * 
 * v3.2.0:
 * - Validação individual direta de contas via ?validate_account_id=act_xxx
 * - Diagnóstico completo do token (permissões concedidas, tipo de token, nome do perfil/BM)
 * - Suporte total a System User Tokens da BM e User Tokens
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const rawToken = searchParams.get("token");
    const validateAccountId = searchParams.get("validate_account_id");

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    let accessToken = rawToken || "";
    let isFromDatabase = false;

    const supabase = await createClient();

    // 1. Busca token da integração caso não tenha sido enviado diretamente
    let { data: currentIntegration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: se a loja atual ainda não tem integração gravada, herda a integração Meta ativa mais recente
    if (!currentIntegration) {
      const { data: fallback } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback) {
        currentIntegration = fallback;
      }
    }

    if (!accessToken && currentIntegration?.access_token_enc) {
      isFromDatabase = true;
      const raw = currentIntegration.access_token_enc.toString();
      if (raw.startsWith("EAA")) {
        accessToken = raw;
      } else {
        try {
          accessToken = decrypt(raw);
        } catch {
          accessToken = raw;
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json({
        ok: false,
        connected: false,
        error: "Nenhum token da Meta configurado. Conecte com o Facebook ou insira um Access Token.",
        accounts: [],
      });
    }

    const apiVersion = "v23.0";

    // ── Validação direta de uma Conta de Anúncio específica (?validate_account_id=act_xxx) ──
    if (validateAccountId) {
      const cleanId = validateAccountId.trim().startsWith("act_")
        ? validateAccountId.trim()
        : `act_${validateAccountId.trim()}`;

      const directRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${cleanId}?fields=name,account_id,id,account_status,currency,amount_spent,business_name&access_token=${accessToken}`,
        { cache: "no-store" }
      );

      if (!directRes.ok) {
        const errJson = await directRes.json();
        return NextResponse.json({
          ok: false,
          error: errJson.error?.message || `Não foi possível acessar a conta ${cleanId}. Verifique se o token tem permissão atribuída a ela na BM.`,
        }, { status: 400 });
      }

      const acc = await directRes.json();
      return NextResponse.json({
        ok: true,
        account: {
          id: acc.id,
          accountId: acc.account_id,
          name: acc.name || `Conta ${acc.account_id}`,
          status: acc.account_status === 1 ? "ACTIVE" : acc.account_status === 2 ? "DISABLED" : "PAUSED",
          currency: acc.currency || "BRL",
          amountSpent: acc.amount_spent ? Number(acc.amount_spent) / 100 : 0,
          businessName: acc.business_name || null,
        },
      });
    }

    // ── Diagnóstico de Perfil / BM e Permissões do Token ──
    let userName = currentIntegration?.config?.profile_name || "Perfil Facebook";
    let tokenType: "user" | "system_user" | "unknown" = "unknown";
    const grantedPermissions: string[] = [];

    // Consulta permissões (/me/permissions ou debug_token)
    try {
      const permRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/me/permissions?access_token=${accessToken}`,
        { cache: "no-store" }
      );
      if (permRes.ok) {
        const permData = await permRes.json();
        if (Array.isArray(permData.data)) {
          permData.data.forEach((p: any) => {
            if (p.status === "granted") grantedPermissions.push(p.permission);
          });
          tokenType = "user";
        }
      }
    } catch {}

    // Consulta perfil básico (/me)
    try {
      const meRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/me?fields=id,name&access_token=${accessToken}`,
        { cache: "no-store" }
      );
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.name) userName = meData.name;
      }
    } catch {}

    // ── Busca de Contas de Anúncio via /me/adaccounts & Business Managers ──
    let formattedAccounts: any[] = [];
    const knownIds = new Set<string>();
    const businessesMap = new Map<string, { id: string; name: string; accounts: any[] }>();

    const addAccount = (acc: any, bmId?: string, bmName?: string) => {
      const cleanId = acc.id?.startsWith("act_") ? acc.id : `act_${acc.account_id || acc.id}`;
      if (acc.id || acc.account_id) {
        const item = {
          id: cleanId,
          accountId: acc.account_id || cleanId.replace("act_", ""),
          name: acc.name || `Conta ${acc.account_id || cleanId}`,
          status: acc.account_status === 1 ? "ACTIVE" : acc.account_status === 2 ? "DISABLED" : "PAUSED",
          currency: (acc.currency || "BRL").toUpperCase(),
          amountSpent: acc.amount_spent ? Number(acc.amount_spent) / 100 : 0,
          businessName: bmName || acc.business_name || null,
        };

        if (!knownIds.has(cleanId)) {
          knownIds.add(cleanId);
          formattedAccounts.push(item);
        }

        const targetBmName = bmName || acc.business_name || "Business Manager Principal";
        const targetBmId = bmId || (acc.business_name ? `bm_${acc.business_name.toLowerCase().replace(/[^a-z0-9]/g, "_")}` : "bm_main");

        if (!businessesMap.has(targetBmId)) {
          businessesMap.set(targetBmId, {
            id: targetBmId,
            name: targetBmName,
            accounts: [],
          });
        }

        const bmEntry = businessesMap.get(targetBmId)!;
        if (!bmEntry.accounts.some((a) => a.id === cleanId)) {
          bmEntry.accounts.push(item);
        }
      }
    };

    // 1. Consulta /me/adaccounts (Campos 100% seguros sem exigir business_management)
    try {
      const metaUrl = `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=name,account_id,id,account_status,currency,amount_spent,business_name&access_token=${accessToken}&limit=100`;
      const resp = await fetch(metaUrl, { cache: "no-store" });
      if (resp.ok) {
        const accountsData = await resp.json();
        if (Array.isArray(accountsData.data)) {
          accountsData.data.forEach((acc: any) => {
            addAccount(acc, undefined, acc.business_name || undefined);
          });
        }
      }
    } catch {}

    // 2. Busca todas as Business Managers via /me/businesses (se o token possuir a permissão)
    try {
      const bmsUrl = `https://graph.facebook.com/${apiVersion}/me/businesses?fields=id,name&access_token=${accessToken}&limit=50`;
      const bmsResp = await fetch(bmsUrl, { cache: "no-store" });
      if (bmsResp.ok) {
        const bmsData = await bmsResp.json();
        if (Array.isArray(bmsData.data)) {
          for (const bm of bmsData.data) {
            const bmId = bm.id;
            const bmName = bm.name || `Business Manager ${bmId}`;

            try {
              const [ownedRes, clientRes] = await Promise.all([
                fetch(`https://graph.facebook.com/${apiVersion}/${bmId}/owned_ad_accounts?fields=name,account_id,id,account_status,currency,amount_spent,business_name&access_token=${accessToken}&limit=100`, { cache: "no-store" }),
                fetch(`https://graph.facebook.com/${apiVersion}/${bmId}/client_ad_accounts?fields=name,account_id,id,account_status,currency,amount_spent,business_name&access_token=${accessToken}&limit=100`, { cache: "no-store" }),
              ]);

              if (ownedRes.ok) {
                const owned = await ownedRes.json();
                if (Array.isArray(owned.data)) {
                  owned.data.forEach((acc: any) => addAccount(acc, bmId, bmName));
                }
              }

              if (clientRes.ok) {
                const clients = await clientRes.json();
                if (Array.isArray(clients.data)) {
                  clients.data.forEach((acc: any) => addAccount(acc, bmId, bmName));
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    let businesses = Array.from(businessesMap.values());
    if (businesses.length === 0 && formattedAccounts.length > 0) {
      businesses = [
        {
          id: "bm_default",
          name: "Business Manager Principal",
          accounts: formattedAccounts,
        },
      ];
    }

    const savedSelected = currentIntegration?.config?.ad_account_ids;
    const selectedAccountIds = Array.isArray(savedSelected)
      ? savedSelected
      : formattedAccounts.length > 0
      ? formattedAccounts.map((a) => a.id)
      : [];

    const savedPixelId = currentIntegration?.pixel_id || "1104875232197441";
    const savedProfileName = currentIntegration?.config?.profile_name || userName;

    return NextResponse.json({
      ok: true,
      connected: currentIntegration?.status === "active" || !!accessToken,
      isFromDatabase,
      tokenMasked: isFromDatabase,
      diagnostics: {
        userName: savedProfileName || userName,
        permissions: grantedPermissions,
        hasAdsRead: grantedPermissions.includes("ads_read"),
        hasAdsManagement: grantedPermissions.includes("ads_management"),
        tokenType,
      },
      user: { name: savedProfileName || userName },
      pixelId: savedPixelId,
      selectedAccountIds,
      accounts: formattedAccounts,
      businesses,
      fetchAccountsError: null,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/meta/accounts
 * Salva a lista de contas de anúncio selecionadas e o perfil na integração.
 * Se nenhum novo token for enviado mas já existir integração ativa, preserva o token salvo no banco!
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, access_token, profile_name, ad_account_ids, pixel_id, test_event_code } = await request.json();

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Busca integração existente para esta loja ou qualquer integração Meta ativa
    const { data: existing } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let finalToken = access_token ? access_token.trim() : "";

    // Se nenhum token novo foi digitado, preserva o token já existente no banco
    if (!finalToken && existing?.access_token_enc) {
      finalToken = existing.access_token_enc;
    }

    if (!finalToken) {
      return NextResponse.json({
        ok: false,
        error: "Access Token é obrigatório. Cole seu token de acesso da Meta ou conecte com o Facebook.",
      }, { status: 400 });
    }

    // 2. Normaliza lista de contas de anúncio
    const normalizedAccounts = (Array.isArray(ad_account_ids) ? ad_account_ids : [ad_account_ids])
      .filter(Boolean)
      .map((id: string) => (id.startsWith("act_") ? id : `act_${id}`));

    const integrationPayload = {
      store_id: store_id,
      platform: "meta",
      pixel_id: pixel_id ? pixel_id.trim() : (existing?.pixel_id || "1104875232197441"),
      access_token_enc: finalToken,
      status: "active",
      config: {
        profile_name: profile_name ? profile_name.trim() : (existing?.config?.profile_name || "Perfil Principal"),
        ad_account_ids: normalizedAccounts,
        test_event_code: test_event_code ? test_event_code.trim() : undefined,
        updated_at: new Date().toISOString(),
      },
    };

    if (existing) {
      const { error: updateErr } = await supabase
        .from("integrations")
        .update(integrationPayload)
        .eq("id", existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from("integrations")
        .insert(integrationPayload);

      if (insertErr) throw insertErr;
    }

    return NextResponse.json({
      ok: true,
      message: `Configurações salvas com sucesso! ${normalizedAccounts.length} conta(s) de anúncio vinculada(s).`,
      savedAccountCount: normalizedAccounts.length,
    });
  } catch (error: any) {
    console.error("[Save Meta Integration Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
