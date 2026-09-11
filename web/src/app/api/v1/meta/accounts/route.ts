import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import {
  discoverFullMetaHierarchy,
  fetchTokenPermissions,
  normalizeAdAccountId,
} from "@/lib/meta/graph-service";
import { MetaAdAccount } from "@/lib/meta/types";
import { metaCache } from "@/lib/meta/meta-cache";
import { performanceMonitor } from "@/lib/meta/performance-monitor";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/accounts
 * Retorna as Business Managers, Contas de Anúncio e Seleção ativa para a loja especificada.
 * Suporta cache em memória (TTL 5m), Cooldown inteligente anti-rate-limit e telemetria assíncrona.
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const rawToken = searchParams.get("token");
    const refresh = searchParams.get("refresh") === "true";

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

    const effectiveStoreId = storeId || currentIntegration?.store_id || "default_store";

    // 4. Verificação de Cooldown da Loja (Proteção contra excesso de chamadas Graph API)
    const cooldownStatus = performanceMonitor.checkCooldown(effectiveStoreId, refresh);
    if (cooldownStatus.inCooldown && !refresh) {
      // Cooldown ativo: Nunca bloqueia a leitura de cache existente!
      const staleCache = metaCache.get<any>("accounts", effectiveStoreId, accessToken);
      if (staleCache.data) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        performanceMonitor.log({
          tenant_id: effectiveStoreId,
          endpoint: "/api/v1/meta/accounts",
          operation: "GET_ACCOUNTS",
          context: "integration",
          criticality: "medium",
          duration_ms: totalDurationMs,
          cache_status: "COOLDOWN",
          graph_calls_count: 0,
          status_code: 200,
          error_message: cooldownStatus.reason || undefined,
        });

        return NextResponse.json({
          ...staleCache.data,
          _cooldown: {
            active: true,
            remainingMs: cooldownStatus.remainingMs,
            cooldownUntil: cooldownStatus.cooldownUntilIso,
            reason: cooldownStatus.reason,
          },
          _cache: {
            hit: true,
            cooldown: true,
            ageMs: staleCache.ageMs,
            durationMs: totalDurationMs,
          },
        });
      }
    }

    // 5. Verificação de Cache Multi-Tenant (Se não for forçado refresh)
    if (!refresh) {
      const cached = metaCache.get<any>("accounts", effectiveStoreId, accessToken);
      if (cached.hit && cached.data) {
        const totalDurationMs = Math.round(performance.now() - startTime);

        performanceMonitor.log({
          tenant_id: effectiveStoreId,
          endpoint: "/api/v1/meta/accounts",
          operation: "GET_ACCOUNTS",
          context: "integration",
          criticality: "low",
          duration_ms: totalDurationMs,
          cache_status: "HIT",
          graph_calls_count: 0,
          status_code: 200,
        });

        return NextResponse.json({
          ...cached.data,
          _cache: {
            hit: true,
            ageMs: cached.ageMs,
            ttlRemainingMs: cached.remainingTtlMs,
            durationMs: totalDurationMs,
          },
        });
      }
    }

    console.log(`[GET /api/v1/meta/accounts] [CACHE MISS] store_id=${effectiveStoreId} (refresh=${refresh}) consultando Meta Graph API...`);

    const savedProfileName = currentIntegration?.config?.profile_name || undefined;
    const savedPixelId = currentIntegration?.pixel_id || "1104875232197441";

    // 6. Descoberta exaustiva da hierarquia de BMs e Contas
    const graphStartTime = performance.now();
    const [profile, permissions] = await Promise.all([
      discoverFullMetaHierarchy(accessToken, savedProfileName),
      fetchTokenPermissions(accessToken),
    ]);
    const graphDurationMs = Math.round(performance.now() - graphStartTime);

    // Registra chamada live no monitor de rate limit
    const liveCallsCount = 3 + profile.businesses.length * 2;
    performanceMonitor.registerGraphCalls(effectiveStoreId, liveCallsCount);

    // 7. Coleta todas as contas planas para compatibilidade
    const allAccounts: MetaAdAccount[] = [];
    profile.businesses.forEach((bm) => {
      bm.accounts.forEach((acc) => {
        if (!allAccounts.some((existing) => existing.id === acc.id)) {
          allAccounts.push(acc);
        }
      });
    });

    // 8. Recupera seleção de contas e BMs salvas no banco
    const savedSelected = currentIntegration?.config?.ad_account_ids;
    const selectedAccountIds: string[] = Array.isArray(savedSelected) ? savedSelected : [];

    const savedBmIds = currentIntegration?.config?.selected_bm_ids;
    const selectedBmIds: string[] = Array.isArray(savedBmIds) ? savedBmIds : [];

    const responsePayload = {
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
    };

    // 9. Grava no cache por 5 minutos (300.000 ms) com isolamento por storeId e token
    metaCache.set("accounts", effectiveStoreId, accessToken, responsePayload, 5 * 60 * 1000);

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Telemetria assíncrona não-bloqueante
    performanceMonitor.log({
      tenant_id: effectiveStoreId,
      endpoint: "/api/v1/meta/accounts",
      operation: "GET_ACCOUNTS",
      context: "integration",
      criticality: graphDurationMs > 2000 ? "high" : graphDurationMs > 800 ? "medium" : "low",
      duration_ms: totalDurationMs,
      cache_status: refresh ? "BYPASS" : "MISS",
      graph_calls_count: liveCallsCount,
      status_code: 200,
    });

    return NextResponse.json({
      ...responsePayload,
      _cache: {
        hit: false,
        graphDurationMs,
        totalDurationMs,
      },
    });
  } catch (error: any) {
    const totalDurationMs = Math.round(performance.now() - startTime);
    const storeIdFallback = new URL(request.url).searchParams.get("store_id") || "unknown_store";

    performanceMonitor.log({
      tenant_id: storeIdFallback,
      endpoint: "/api/v1/meta/accounts",
      operation: "GET_ACCOUNTS",
      context: "integration",
      criticality: "high",
      duration_ms: totalDurationMs,
      cache_status: "MISS",
      graph_calls_count: 1,
      status_code: 500,
      error_message: error.message,
    });

    console.error(`[GET /api/v1/meta/accounts Error] Falhou após ${totalDurationMs}ms:`, error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/meta/accounts
 * Salva a lista de contas de anúncio selecionadas e configurações da integração por loja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      store_id,
      access_token,
      profile_name,
      ad_account_ids,
      ad_accounts_metadata,
      selected_bm_ids,
      pixel_id,
      test_event_code,
    } = body;

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
        ad_accounts_metadata: ad_accounts_metadata !== undefined ? ad_accounts_metadata : (existing?.config?.ad_accounts_metadata || {}),
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

    // Invalida o cache da loja para garantir consistência imediata na próxima leitura
    const invalidatedCount = metaCache.invalidateStore(store_id, "accounts");
    console.log(`[POST /api/v1/meta/accounts] Cache invalidado para store_id=${store_id} (${invalidatedCount} chave(s) removida(s))`);

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
