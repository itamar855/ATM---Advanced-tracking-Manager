import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/zedy/credentials
 * Retorna o status da integração Zedy e o token mascarado
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Busca integração zedy ou na config da integração principal
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .order("updated_at", { ascending: false });

    const zedyIntegration = integrations?.find((i) => i.platform === "zedy");
    const metaIntegration = integrations?.find((i) => i.platform === "meta");

    let rawToken =
      zedyIntegration?.access_token_enc ||
      zedyIntegration?.config?.zedy_api_token ||
      metaIntegration?.config?.zedy_api_token ||
      "";

    if (rawToken && !rawToken.startsWith("zdy_")) {
      try {
        rawToken = decrypt(rawToken);
      } catch {
        // fallback
      }
    }

    if (!rawToken) {
      const { data: store } = await supabase
        .from("stores")
        .select("settings")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (store?.settings?.zedy?.api_token) {
        rawToken = store.settings.zedy.api_token;
      }
    }

    const lastSync =
      zedyIntegration?.config?.last_sync ||
      metaIntegration?.config?.zedy_last_sync ||
      null;

    const maskedToken = rawToken
      ? `${rawToken.slice(0, 8)}...${rawToken.slice(-4)}`
      : "";

    return NextResponse.json({
      ok: true,
      connected: !!rawToken,
      has_token: !!rawToken,
      token: rawToken,
      masked_token: maskedToken,
      last_sync: lastSync,
    });
  } catch (error: any) {
    console.error("[Zedy Credentials GET Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/zedy/credentials
 * Salva o Token de API do Zedy com criptografia
 */
export async function POST(request: NextRequest) {
  try {
    const { token, store_id = "dckb5g-7d" } = await request.json();

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ ok: false, error: "Token do Zedy é obrigatório" }, { status: 400 });
    }

    const cleanToken = token.trim();
    const supabase = createAdminClient();

    // Criptografa o token para armazenamento seguro
    const tokenEnc = encrypt(cleanToken);

    // 1. Salva nas configurações da loja (compatível com todas as constraints do Supabase)
    try {
      const { data: store } = await supabase
        .from("stores")
        .select("id, settings")
        .eq("id", store_id)
        .maybeSingle();

      if (store) {
        await supabase
          .from("stores")
          .update({
            settings: {
              ...(store.settings || {}),
              zedy: {
                api_token: cleanToken,
                token_enc: tokenEnc,
                updated_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", store_id);
      }
    } catch (e) {
      console.warn("[Zedy Store Settings Update Warning]:", e);
    }

    // 2. Salva na integração existente da loja
    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, platform, config, store_id")
      .order("updated_at", { ascending: false });

    const targetIntegration =
      integrations?.find((i) => i.store_id === store_id) ||
      integrations?.[0];

    if (targetIntegration) {
      const newConfig = {
        ...(targetIntegration.config || {}),
        zedy_api_token: cleanToken,
        zedy_token_enc: tokenEnc,
        zedy_token_prefix: cleanToken.slice(0, 8),
        zedy_last_sync: new Date().toISOString(),
        store_id,
      };

      await supabase
        .from("integrations")
        .update({
          config: newConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetIntegration.id);
    }

    return NextResponse.json({
      ok: true,
      message: "Token de API do Zedy salvo com sucesso!",
      masked_token: `${cleanToken.slice(0, 8)}...${cleanToken.slice(-4)}`,
    });
  } catch (error: any) {
    console.error("[Zedy Credentials POST Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
