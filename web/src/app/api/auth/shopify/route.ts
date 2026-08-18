import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  if (!shop) {
    return new NextResponse("Missing shop parameter", { status: 400 });
  }

  // Sanitização simples do domínio do shopify
  const shopDomainRegex = /^[a-zA-Z0-9.-]+\.myshopify\.com$/;
  if (!shopDomainRegex.test(shop)) {
    return new NextResponse("Invalid shop domain", { status: 400 });
  }

  const clientId = process.env.SHOPIFY_API_KEY;
  const redirectUri = `${process.env.NEXT_PUBLIC_SHOPIFY_APP_URL}/api/auth/shopify/callback`;
  const scopes = [
    "read_orders",
    "read_products",
    "read_customers",
    "read_inventory",
    "write_pixels"
  ].join(",");

  const state = Math.random().toString(36).substring(2, 15);

  const authorizationUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  // Em produção, o ideal é salvar o state nos cookies com httpOnly para validação posterior no callback.
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("shopify_oauth_state", state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300, // 5 minutos
  });

  return response;
}
