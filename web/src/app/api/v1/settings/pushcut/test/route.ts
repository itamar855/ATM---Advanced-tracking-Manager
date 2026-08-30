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

    // Check ownership and get URL
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("tenant_id, pushcut_url")
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
