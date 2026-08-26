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

  // Permissões completas para ler e gerenciar campanhas e insights
  const scopes = [
    "ads_read",
    "ads_management",
    "read_insights",
    "business_management",
    "public_profile",
    "email"
  ].join(",");

  const state = Math.random().toString(36).substring(2, 15);

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
