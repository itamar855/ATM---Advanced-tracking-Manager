import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications/sound?store_id=...
 * Serve o som configurado para a loja (arquivo estático ou áudio personalizado em Base64).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id") || "dckb5g-7d";

    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("settings")
      .eq("id", storeId)
      .maybeSingle();

    const notifications = store?.settings?.notifications || {};
    const soundType = notifications.sound || "chaching";

    // 1. Som personalizado em Base64
    if (soundType === "custom" && notifications.custom_sound_url) {
      const rawUrl: string = notifications.custom_sound_url;

      let contentType = "audio/mpeg";
      let base64Data = rawUrl;

      const matches = rawUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        contentType = matches[1];
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, "base64");

      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": buffer.length.toString(),
          "Cache-Control": "public, max-age=86400",
          "Accept-Ranges": "bytes",
        },
      });
    }

    // 2. Mapeamento de sons pré-definidos
    let targetFile = "/sounds/chaching.wav";
    if (soundType === "safe_coins" || soundType === "coin") {
      targetFile = "/sounds/safe-coins.wav";
    } else if (soundType === "bell" || soundType === "subtle") {
      targetFile = "/sounds/bell.wav";
    }

    // Redireciona para o arquivo de áudio pré-carregado
    const origin = request.nextUrl.origin;
    return NextResponse.redirect(new URL(targetFile, origin));
  } catch (err: any) {
    console.error("[Notification Sound API Error]:", err.message);
    return new Response("Erro ao carregar som", { status: 500 });
  }
}
