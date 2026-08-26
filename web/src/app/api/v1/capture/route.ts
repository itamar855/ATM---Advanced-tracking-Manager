import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const {
      store_id,
      track_id,
      fbp,
      fbc,
      fbclid,
      landing_page,
      event_source_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    } = await request.json();

    if (!track_id || !/^[A-Za-z0-9_-]{16,80}$/.test(track_id)) {
      return NextResponse.json({ ok: false, error: "track_id inválido" }, { status: 400 });
    }

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id obrigatório" }, { status: 400 });
    }

    // IP real e User Agent do cabeçalho do navegador (nunca do servidor)
    const forwarded = request.headers.get("x-forwarded-for");
    const client_ip = forwarded
      ? forwarded.split(",")[0].trim()
      : request.headers.get("x-real-ip") || "127.0.0.1";
    const client_user_agent = request.headers.get("user-agent") || "";

    const sessionData = {
      store_id,
      track_id,
      fbp: fbp || null,
      fbc: fbc || null,
      fbclid: fbclid || null,
      client_ip,
      client_user_agent,
      landing_page: landing_page || null,
      event_source_url: event_source_url || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      updated_at: new Date().toISOString(),
    };

    // Persistir/enriquecer a sessão no Supabase via Admin Client
    const supabase = createAdminClient();
    const { error: upsertError } = await supabase
      .from("sessions")
      .upsert(sessionData, {
        onConflict: "store_id,track_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      // Logar o erro mas não bloquear a resposta — resiliência máxima
      console.error(`[Capture API] Erro ao persistir sessão (${track_id.slice(-8)}):`, upsertError.message);
    } else {
      console.log(
        `[Capture API] Sessão persistida: ${track_id.slice(-8)} | IP: ${client_ip} | fbp: ${fbp ? "✓" : "✗"} | fbc: ${fbc ? "✓" : "✗"}`
      );
    }

    // CORS Headers
    const origin = request.headers.get("origin") || "*";
    const response = NextResponse.json({ ok: true, track_id });
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Allow-Credentials", "true");

    return response;
  } catch (error) {
    console.error("Erro no capture-tracking API:", error);
    return NextResponse.json({ ok: false, error: "Erro interno no servidor" }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "*";
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}
