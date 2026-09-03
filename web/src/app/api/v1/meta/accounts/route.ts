import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import {
  discoverFullMetaHierarchy,
  fetchTokenPermissions,
  normalizeAdAccountId,
} from "@/lib/meta/graph-service";
import { MetaAdAccount } from "@/lib/meta/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/accounts
 * Retorna as Business Managers, Contas de Anúncio e Seleção ativa para a loja especificada.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const rawToken = searchParams.get("token");

    if (!storeId && !rawToken) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    let accessToken = rawToken ? (resolveMetaAccessToken(rawToken) || rawToken.trim()) : "";
    let isFromDatabase = false;

    const supabase = createAdminClient();

    // 1. Busca integração específica da loja
    let currentIntegration: any = null;
    if (storeId) {
      const { data: storeInt } = await supabase
        .from("integrations")
        .select("*")
        .eq("store_id", storeId)
        .eq("platform", "meta")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      currentIntegration = storeInt;
    }

    // 2. Fallback: Se a loja atual não possui integração própria, herda a integração Meta ativa da conta
    if (!currentIntegration && !accessToken) {
      const { data: fallbackInt } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackInt) {
        currentIntegration = fallbackInt;
      }
    }

    // 3. Descriptografa e normaliza o token salvo caso nenhum token novo tenha sido enviado
    if (!accessToken && currentIntegration?.access_token_enc) {
      isFromDatabase = true;
      accessToken = resolveMetaAccessToken(currentIntegration.access_token_enc) || "";
    }

    if (!accessToken) {
      return NextResponse.json({
        ok: false,
        connected: false,
        error: "Nenhum token da Meta configurado. Conecte com o Facebook ou insira um Access Token.",
        accounts: [],
        businesses: [],
      });
    }

    const savedProfileName = currentIntegration?.config?.profile_name || undefined;
    const savedPixelId = currentIntegration?.pixel_id || "1104875232197441";

    // 4. Descoberta exaustiva da hierarquia de BMs e Contas
    const profile = await discoverFullMetaHierarchy(accessToken, savedProfileName);
    const permissions = await fetchTokenPermissions(accessToken);

    // 5. Coleta todas as contas planas para compatibilidade
    const allAccounts: MetaAdAccount[] = [];
    profile.businesses.forEach((bm) => {
      bm.accounts.forEach((acc) => {
        if (!allAccounts.some((existing) => existing.id === acc.id)) {
          allAccounts.push(acc);
        }
      });
    });

    // 6. Recupera seleção de contas e BMs salvas no banco
    const savedSelected = currentIntegration?.config?.ad_account_ids;
    const selectedAccountIds: string[] = Array.isArray(savedSelected) ? savedSelected : [];

    const savedBmIds = currentIntegration?.config?.selected_bm_ids;
    const selectedBmIds: string[] = Array.isArray(savedBmIds) ? savedBmIds : [];

    return NextResponse.json({
      ok: true,
      connected: true,
      isFromDatabase,
      tokenMasked: isFromDatabase,
      pixelId: savedPixelId,
      profile,
      businesses: profile.businesses,
      accounts: allAccounts,
      selectedAccountIds,
      selectedBmIds,
      diagnostics: {
        userName: profile.name,
        permissions,
        hasAdsRead: permissions.includes("ads_read"),
        hasAdsManagement: permissions.includes("ads_management"),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/v1/meta/accounts Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/meta/accounts
 * Salva a lista de contas de anúncio selecionadas e configurações da integração por loja.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      store_id,
      access_token,
      profile_name,
      ad_account_ids,
      selected_bm_ids,
      pixel_id,
      test_event_code,
    } = await request.json();

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Busca integração existente para esta loja ou integração mestre
    const { data: existing } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let finalToken = access_token ? access_token.trim() : "";

    // Se nenhum token novo foi digitado, preserva o token existente no banco
    if (!finalToken && existing?.access_token_enc) {
      finalToken = existing.access_token_enc;
    }

    // Se a loja não tinha integração própria mas o sistema tem uma ativa, usa o token da ativa
    if (!finalToken) {
      const { data: globalActive } = await supabase
        .from("integrations")
        .select("access_token_enc")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (globalActive?.access_token_enc) {
        finalToken = globalActive.access_token_enc;
      }
    }

    // Normaliza e limpa o token de qualquer formatação corrompida (hex, json, etc)
    const cleanedToken = resolveMetaAccessToken(finalToken);
    if (cleanedToken) {
      finalToken = cleanedToken;
    }

    if (!finalToken) {
      return NextResponse.json({
        ok: false,
        error: "Access Token é obrigatório. Conecte com o Facebook ou insira seu token.",
      }, { status: 400 });
    }

    // Se um novo token foi digitado, valida na Graph API e captura o nome real
    let resolvedProfileName = profile_name ? profile_name.trim() : (existing?.config?.profile_name || "Perfil Meta Ads");
    if (access_token && access_token.trim()) {
      try {
        const meRes = await fetch(`https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${finalToken}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        const meData = await meRes.json();
        if (meData.error) {
          return NextResponse.json({
            ok: false,
            error: `Token rejeitado pelo Facebook: ${meData.error.message}`,
          }, { status: 400 });
        }
        if (meData.name) {
          resolvedProfileName = meData.name;
        }
      } catch (err: any) {
        console.warn("[POST accounts] Falha ao consultar /me na validação:", err.message);
      }
    }

    // 2. Normaliza lista de contas de anúncio selecionadas
    const rawList = Array.isArray(ad_account_ids) ? ad_account_ids : (ad_account_ids ? [ad_account_ids] : []);
    const normalizedAccounts = rawList
      .filter(Boolean)
      .map((id: string) => normalizeAdAccountId(id));

    // Normaliza BMs selecionadas
    const normalizedBmIds = Array.isArray(selected_bm_ids)
      ? selected_bm_ids.filter(Boolean)
      : (existing?.config?.selected_bm_ids || []);

    const integrationPayload = {
      store_id: store_id,
      platform: "meta",
      pixel_id: pixel_id ? pixel_id.trim() : (existing?.pixel_id || "1104875232197441"),
      access_token_enc: finalToken,
      status: "active",
      config: {
        ...(existing?.config || {}),
        profile_name: resolvedProfileName,
        selected_bm_ids: normalizedBmIds,
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
      message: `Configurações salvas com sucesso! ${normalizedAccounts.length} conta(s) selecionada(s).`,
      savedAccountCount: normalizedAccounts.length,
      ad_account_ids: normalizedAccounts,
      selected_bm_ids: normalizedBmIds,
      profile_name: resolvedProfileName,
    });
  } catch (error: any) {
    console.error("[POST /api/v1/meta/accounts Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
