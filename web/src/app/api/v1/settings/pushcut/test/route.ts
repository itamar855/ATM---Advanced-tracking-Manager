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

    // Verify ownership
    const { data: store } = await supabase
      .from("stores")
      .select("tenant_id, pushcut_url")
      .eq("id", store_id)
      .maybeSingle();

    if (!store || store.tenant_id !== user.id) {
      return NextResponse.json({ error: "Loja não encontrada ou não autorizada" }, { status: 403 });
    }

    if (!store.pushcut_url) {
      return NextResponse.json({ error: "Nenhuma URL do Pushcut configurada nesta loja" }, { status: 400 });
    }

    // Dispara a notificação de teste
    const response = await fetch(store.pushcut_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "✅ Teste ATM Tracking",
        text: "Sua notificação do Pushcut está configurada corretamente!",
        sound: "cash_register"
      })
    });

    if (!response.ok) {
      throw new Error(`Pushcut API error: ${response.statusText}`);
    }

    return NextResponse.json({ ok: true, message: "Notificação de teste enviada!" });
  } catch (err: any) {
    console.error("[Pushcut Test API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
