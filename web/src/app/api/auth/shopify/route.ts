import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOAuthState, buildShopifyAuthorizeUrl } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let shop = searchParams.get("shop")?.trim();
  let storeId = searchParams.get("store_id")?.trim();
  let clientId = searchParams.get("client_id")?.trim();
  const mode = searchParams.get("mode");

  const supabase = await createClient();

  // Se não passou storeId, busca loja pelo shop_domain ou pega a primeira loja ativa
  if (!storeId) {
    if (shop) {
      const clean = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const { data: store } = await supabase
        .from("stores")
        .select("id, settings, shop_domain")
        .or(`shop_domain.eq.${clean},domain.eq.${clean}`)
        .limit(1)
        .maybeSingle();
      if (store) {
        storeId = store.id;
        if (!clientId && store.settings?.shopify?.client_id) {
          clientId = store.settings.shopify.client_id;
        }
      }
    }
  }

  // Se ainda não temos storeId, busca a loja default (dckb5g-7d ou primeira)
  if (!storeId) {
    const { data: store } = await supabase.from("stores").select("id, shop_domain, settings").limit(1).maybeSingle();
    if (store) {
      storeId = store.id;
      if (!shop) shop = store.shop_domain;
      if (!clientId && store.settings?.shopify?.client_id) {
        clientId = store.settings.shopify.client_id;
      }
    }
  }

  // Se ainda não temos shop, default para a loja do cliente
  if (!shop) {
    shop = "dckb5g-7d.myshopify.com";
  }

  // Sanitização do domínio shopify
  let cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  if (!cleanShop.includes(".myshopify.com") && !cleanShop.includes(".")) {
    cleanShop = `${cleanShop}.myshopify.com`;
  }

  // Resolve clientId (prioridade: query param > settings no banco > env var)
  if (!clientId && storeId) {
    const { data: s } = await supabase.from("stores").select("settings").eq("id", storeId).maybeSingle();
    if (s?.settings?.shopify?.client_id) {
      clientId = s.settings.shopify.client_id;
    }
  }

  if (!clientId) {
    clientId = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || "58504954bae6d390c53081c82eaf76b1";
  }

  if (!clientId) {
    if (mode === "json") {
      return NextResponse.json(
        { ok: false, error: "Client ID do app Shopify não configurado. Insira o Client ID no painel." },
        { status: 400 }
      );
    }
    return new NextResponse(
      "Erro: Client ID do app Shopify não configurado. Por favor, preencha o Client ID nas configurações de integração.",
      { status: 400 }
    );
  }

  // Define Redirect URI
  // Prioridade: NEXT_PUBLIC_APP_URL > host do request (Vercel) > fallback trackingatm
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "trackingatm.vercel.app";
  const protocol = host.includes("localhost") ? "http" : "https";
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/auth/shopify/callback`;

  // Gera o state assinado com HMAC (não depende de cookies locais!)
  const state = signOAuthState(storeId || "default", clientId);

  const authorizationUrl = buildShopifyAuthorizeUrl({
    shop: cleanShop,
    clientId,
    redirectUri,
    state,
  });

  if (mode === "json") {
    return NextResponse.json({
      ok: true,
      authorizeUrl: authorizationUrl,
      shop: cleanShop,
      storeId,
      clientId,
      redirectUri,
    });
  }

  return NextResponse.redirect(authorizationUrl);
}
