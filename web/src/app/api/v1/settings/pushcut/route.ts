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
    const { store_id, pushcut_url, notifyApproved, notifyPending } = body;

    if (!store_id) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 });
    }

    // Verify ownership
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("tenant_id")
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

    // Update
    const { error } = await supabase
      .from("stores")
      .update({ 
        pushcut_url: pushcut_url ? pushcut_url.trim() : null,
        pushcut_notify_approved: notifyApproved ?? true,
        pushcut_notify_pending: notifyPending ?? true
      })
      .eq("id", store_id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "URL do Pushcut e preferências salvas com sucesso" });
  } catch (err: any) {
    console.error("[Pushcut Settings API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
