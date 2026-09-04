import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/settings/credentials
 * Salva credenciais do app Shopify e tokens com criptografia segura no Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      store_id,
      shopify_api_key, // Token manual (shpat_...)
      shopify_client_id, // Client ID do App Partners
      shopify_client_secret, // Client Secret (shpss_...)
      shopify_shop_domain, // Domínio myshopify
      mercadopago_token,
    } = body;

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id obrigatório" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Busca configurações atuais da loja
    const { data: store, error: fetchErr } = await supabase
      .from("stores")
      .select("id, settings, shop_domain")
      .eq("id", store_id)
      .maybeSingle();

    if (fetchErr || !store) {
      return NextResponse.json({ ok: false, error: "Loja não encontrada" }, { status: 404 });
    }

    const currentSettings = store.settings || {};
    const shopifySettings = currentSettings.shopify || {};

    // Suporte para desconectar loja com 1 clique
    if (body.action === "disconnect_shopify" || body.disconnect_shopify) {
      shopifySettings.connected = false;
      shopifySettings.access_token_enc = null;
      await supabase.from("stores").update({
        settings: { ...currentSettings, shopify: shopifySettings },
      }).eq("id", store_id);

      return NextResponse.json({ ok: true, message: "Loja Shopify desconectada com sucesso!" });
    }

    if (shopify_client_id !== undefined) {
      shopifySettings.client_id = shopify_client_id.trim();
    }

    if (shopify_client_secret && !shopify_client_secret.includes("••••")) {
      shopifySettings.client_secret_enc = encrypt(shopify_client_secret.trim());
    }

    if (shopify_api_key && !shopify_api_key.includes("••••")) {
      shopifySettings.access_token = shopify_api_key.trim();
      shopifySettings.access_token_enc = encrypt(shopify_api_key.trim());
      shopifySettings.connected = true;
      shopifySettings.connected_at = new Date().toISOString();
      shopifySettings.token_prefix = shopify_api_key.trim().slice(0, 10) + "...";
    }

    if (shopify_shop_domain) {
      shopifySettings.shop_domain = shopify_shop_domain.trim();
    }

    const updatedSettings = {
      ...currentSettings,
      shopify: shopifySettings,
    };

    const updatePayload: any = {
      settings: updatedSettings,
    };

    if (shopify_shop_domain) {
      updatePayload.shop_domain = shopify_shop_domain.trim();
    }

    const { error: updateErr } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", store_id);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Credenciais da Shopify atualizadas com sucesso!",
    });

  } catch (error: any) {
    console.error("[Settings Credentials API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/settings/credentials
 * Retorna status da integração com a Shopify e credenciais mascaradas.
 */
export async function GET(request: NextRequest) {
  try {
    const store_id = request.nextUrl.searchParams.get("store_id");
    if (!store_id) return NextResponse.json({ error: "store_id obrigatório" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("id, name, shop_domain, settings")
      .eq("id", store_id)
      .maybeSingle();

    if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

    const shopify = store.settings?.shopify || {};
    const hasAccessToken = Boolean(shopify.access_token || shopify.access_token_enc);
    const hasClientSecret = Boolean(shopify.client_secret_enc);

    return NextResponse.json({
      ok: true,
      shopifyConnected: hasAccessToken || shopify.connected === true,
      shopifyClientId: shopify.client_id || "",
      shopifyClientSecretMasked: hasClientSecret ? "shpss_••••••••••••••••••••••••" : "",
      shopifyTokenMasked: hasAccessToken ? "shpat_••••••••••••••••••••••••" : "",
      shopifyShopDomain: shopify.shop_domain || store.shop_domain || "dckb5g-7d.myshopify.com",
      shopifyConnectedAt: shopify.connected_at || null,
      shopifyScope: shopify.scope || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
