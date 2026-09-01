import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/facebook
 * Inicia o fluxo de autorização OAuth 2.0 da Meta (Facebook Login for Business).
 */
export async function GET(request: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID || "1058930460171432";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trackingatm.vercel.app";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/facebook/callback`;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store_id") || searchParams.get("state") || "";

  // Permissões oficiais da Meta para leitura e gestão de contas e anúncios
  const scopes = [
    "ads_read",
    "ads_management",
    "business_management",
    "public_profile"
  ].join(",");

  const nonce = Math.random().toString(36).substring(2, 10);
  const statePayload = JSON.stringify({ store_id: storeId, nonce });
  const state = Buffer.from(statePayload).toString("base64url");

  const authUrl = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&response_type=code`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("fb_oauth_state", state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutos
  });

  return response;
}
