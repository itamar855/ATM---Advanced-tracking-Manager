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
    const { store_id, pushcut_url } = body;

    if (!store_id) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 });
    }

    // Verify ownership
    const { data: store } = await supabase
      .from("stores")
      .select("tenant_id")
      .eq("id", store_id)
      .maybeSingle();

    if (!store || store.tenant_id !== user.id) {
      return NextResponse.json({ error: "Loja não encontrada ou não autorizada" }, { status: 403 });
    }

    // Update
    const { error } = await supabase
      .from("stores")
      .update({ pushcut_url: pushcut_url ? pushcut_url.trim() : null })
      .eq("id", store_id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "URL do Pushcut salva com sucesso" });
  } catch (err: any) {
    console.error("[Pushcut Settings API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
