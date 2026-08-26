import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trackingatm.vercel.app";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/facebook/callback`;

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

    // 3. Busca o nome do usuário/perfil
    let profileName = "Perfil Facebook";
    try {
      const meRes = await fetch(`https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${finalToken}`);
      if (meRes.ok) {
        const meData = await meRes.json();
        profileName = meData.name || profileName;
      }
    } catch {}

    // 4. Busca as contas de anúncio desse perfil
    let adAccountIds: string[] = [];
    try {
      const adAccRes = await fetch(`https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name&access_token=${finalToken}&limit=50`);
      if (adAccRes.ok) {
        const adAccData = await adAccRes.json();
        if (Array.isArray(adAccData.data)) {
          adAccountIds = adAccData.data.map((acc: any) => acc.id);
        }
      }
    } catch {}

    // 5. Salva no banco de dados do Supabase
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("integrations")
      .select("id, pixel_id")
      .eq("platform", "meta")
      .limit(1)
      .maybeSingle();

    const payload = {
      store_id: "dckb5g-7d",
      platform: "meta",
      pixel_id: existing?.pixel_id || "1104875232197441",
      access_token_enc: finalToken,
      status: "active",
      config: {
        profile_name: profileName,
        ad_account_ids: adAccountIds.length > 0 ? adAccountIds : ["act_1316835733682937"],
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
      `${appUrl}/dashboard/settings/integrations?oauth=success&profile=${encodeURIComponent(profileName)}`
    );
  } catch (error: any) {
    console.error("[Facebook Callback Error]:", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=${encodeURIComponent(error.message || "Erro desconhecido")}`
    );
  }
}
