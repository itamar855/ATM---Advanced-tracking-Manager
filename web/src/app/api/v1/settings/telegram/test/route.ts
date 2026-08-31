import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { store_id } = body;

    if (!store_id) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 });
    }

    // Check ownership and get bot details
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("tenant_id, telegram_bot_token, telegram_chat_id")
      .eq("id", store_id)
      .maybeSingle();

    if (storeError) {
      return NextResponse.json({ error: "Erro no BD ao buscar loja: " + storeError.message }, { status: 500 });
    }

    if (!store) {
      return NextResponse.json({ error: `Loja ${store_id} não encontrada no banco (ou bloqueada por RLS). tenant_id do user: ${user.id}` }, { status: 404 });
    }

    if (store.tenant_id !== user.id) {
      return NextResponse.json({ error: `Loja não autorizada. Dono: ${store.tenant_id}, Você: ${user.id}` }, { status: 403 });
    }

    if (!store.telegram_bot_token || !store.telegram_chat_id) {
      return NextResponse.json({ error: "Configuração do Telegram incompleta." }, { status: 400 });
    }

    // Send test notification
    const res = await fetch(`https://api.telegram.org/bot${store.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: store.telegram_chat_id,
        text: "⚡️ *Teste do ATM Tracking Manager*\nSua integração com o Telegram está funcionando perfeitamente!",
        parse_mode: "Markdown"
      }),
    });

    if (!res.ok) {
      const data = await res.text();
      throw new Error(`Telegram API Error: ${res.status} - ${data}`);
    }

    return NextResponse.json({ ok: true, message: "Push de teste enviado com sucesso" });
  } catch (err: any) {
    console.error("[Telegram Test API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
