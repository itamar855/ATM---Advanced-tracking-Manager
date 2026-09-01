import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { discoverFullMetaHierarchy } from "@/lib/meta/graph-service";

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

    // 3. Descoberta completa da árvore de BMs e Contas
    const profile = await discoverFullMetaHierarchy(finalToken);
    const discoveredAccountIds: string[] = [];
    profile.businesses.forEach((bm) => {
      bm.accounts.forEach((acc) => {
        if (!discoveredAccountIds.includes(acc.id)) {
          discoveredAccountIds.push(acc.id);
        }
      });
    });

    // 4. Salva no banco de dados do Supabase
    const supabase = createAdminClient();

    // Se targetStoreId não foi recebido via state, busca a loja ativa mais recente
    if (!targetStoreId) {
      const { data: storeRow } = await supabase
        .from("stores")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetStoreId = storeRow?.id || "dckb5g-7d";
    }

    const { data: existing } = await supabase
      .from("integrations")
      .select("id, pixel_id, config")
      .eq("store_id", targetStoreId)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      store_id: targetStoreId,
      platform: "meta",
      pixel_id: existing?.pixel_id || "1104875232197441",
      access_token_enc: finalToken,
      status: "active",
      config: {
        ...(existing?.config || {}),
        profile_name: profile.name,
        ad_account_ids: discoveredAccountIds.length > 0 ? discoveredAccountIds : (existing?.config?.ad_account_ids || []),
        oauth_connected: true,
        updated_at: new Date().toISOString(),
      },
    };

    if (existing) {
      await supabase.from("integrations").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert(payload);
    }

    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?oauth=success&profile=${encodeURIComponent(profile.name)}`
    );
  } catch (error: any) {
    console.error("[Facebook Callback Error]:", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=${encodeURIComponent(error.message || "Erro desconhecido")}`
    );
  }
}
