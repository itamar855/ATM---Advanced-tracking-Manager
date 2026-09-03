import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { discoverFullMetaHierarchy } from "@/lib/meta/graph-service";
import { resolveMetaAccessToken } from "@/lib/meta/token";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/facebook/callback
 * Recebe o código do Facebook, troca pelo token de longa duração e salva no Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const stateRaw = searchParams.get("state");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trackingatm.vercel.app";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/facebook/callback`;

  // Extrai store_id do state (se presente)
  let targetStoreId = "";
  if (stateRaw) {
    try {
      const decodedState = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
      if (decodedState.store_id) targetStoreId = decodedState.store_id;
    } catch {
      targetStoreId = stateRaw;
    }
  }

  if (error || !code) {
    console.error("[Facebook OAuth Error]:", error, errorDescription);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=${encodeURIComponent(errorDescription || error || "Falha na autorização do Facebook")}`
    );
  }

  const appId = process.env.FACEBOOK_APP_ID || "1058930460171432";
  const appSecret = process.env.FACEBOOK_APP_SECRET || "04d87caa98d0e4d2d05037ac2668569e";

  try {
    // 1. Troca o code pelo Short-Lived Access Token
    const tokenUrl = `https://graph.facebook.com/v23.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const errData = await tokenRes.json();
      throw new Error(errData.error?.message || "Erro ao obter token do Facebook");
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    // 2. Estende para um Long-Lived Token (60 dias)
    const longLivedUrl = `https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

    const longRes = await fetch(longLivedUrl);
    let finalToken = shortLivedToken;
    if (longRes.ok) {
      const longData = await longRes.json();
      finalToken = longData.access_token || shortLivedToken;
    }

    // Normaliza token
    const cleanedToken = resolveMetaAccessToken(finalToken) || finalToken;

    // 3. Descoberta completa da árvore de BMs e Contas
    const profile = await discoverFullMetaHierarchy(cleanedToken);

    // 4. Salva no banco de dados do Supabase com propagação multi-lojas
    const supabase = createAdminClient();

    // Busca todas as lojas existentes para garantir sincronização
    const { data: allStores } = await supabase
      .from("stores")
      .select("id")
      .order("created_at", { ascending: false });

    const storeIdsToSync = new Set<string>();
    if (targetStoreId) storeIdsToSync.add(targetStoreId);
    (allStores || []).forEach((s: any) => storeIdsToSync.add(s.id));
    if (storeIdsToSync.size === 0) storeIdsToSync.add("dckb5g-7d");

    for (const sid of Array.from(storeIdsToSync)) {
      const { data: existing } = await supabase
        .from("integrations")
        .select("id, pixel_id, config")
        .eq("store_id", sid)
        .eq("platform", "meta")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const preservedAccountIds = existing?.config?.ad_account_ids || [];
      const preservedBmIds = existing?.config?.selected_bm_ids || [];

      const payload = {
        store_id: sid,
        platform: "meta",
        pixel_id: existing?.pixel_id || "1104875232197441",
        access_token_enc: cleanedToken,
        status: "active",
        config: {
          ...(existing?.config || {}),
          profile_name: profile.name,
          selected_bm_ids: preservedBmIds,
          ad_account_ids: preservedAccountIds,
          oauth_connected: true,
          updated_at: new Date().toISOString(),
        },
      };

      if (existing) {
        await supabase.from("integrations").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("integrations").insert(payload);
      }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Facebook Conectado - ATM</title>
</head>
<body style="background:#0b0e14;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;">
  <div style="text-align:center;max-width:400px;background:#141824;padding:32px;border-radius:20px;border:1px solid #1e293b;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
    <div style="width:48px;height:48px;border-radius:50%;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;font-weight:bold;">✓</div>
    <h2 style="color:#ffffff;font-size:18px;margin:0 0 8px;">Perfil Conectado com Sucesso!</h2>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;line-height:1.5;">${profile.name} e suas contas foram sincronizadas com o ATM.</p>
    <p style="color:#64748b;font-size:11px;margin:0;">Esta janela fechará automaticamente em instantes...</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "FB_OAUTH_SUCCESS", profile: ${JSON.stringify(profile.name)} }, "*");
        setTimeout(function() { window.close(); }, 1200);
      } else {
        setTimeout(function() {
          window.location.href = "${appUrl}/dashboard/settings/integrations?oauth=success&profile=${encodeURIComponent(profile.name)}";
        }, 1200);
      }
    } catch(e) {
      window.location.href = "${appUrl}/dashboard/settings/integrations?oauth=success&profile=${encodeURIComponent(profile.name)}";
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("[Facebook Callback Error]:", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=${encodeURIComponent(error.message || "Erro desconhecido")}`
    );
  }
}
