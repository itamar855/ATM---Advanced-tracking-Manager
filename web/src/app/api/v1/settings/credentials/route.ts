import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

/**
 * POST /api/v1/settings/credentials
 * Permite ao admin/lojista salvar e atualizar chaves diretamente pelo painel do ATM.
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, shopify_api_key, shopify_api_secret, mercadopago_token } = await request.json();

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();

    const updateData: any = {};

    // Criptografa chaves antes de persistir no banco (conforme regras de segurança)
    if (shopify_api_key) {
      updateData.shopify_api_key_enc = encrypt(shopify_api_key);
    }
    if (shopify_api_secret) {
      updateData.shopify_api_secret_enc = encrypt(shopify_api_secret);
    }
    if (mercadopago_token) {
      updateData.mercadopago_token_enc = encrypt(mercadopago_token);
    }

    const { error } = await supabase
      .from("stores")
      .update(updateData)
      .eq("id", store_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Credenciais de API salvas e criptografadas no banco de dados com sucesso!"
    });

  } catch (error: any) {
    console.error("[Settings Credentials API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
