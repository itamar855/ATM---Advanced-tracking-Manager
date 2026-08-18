import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { track_id, fbp, fbc, fbclid, landing_page, event_source_url } = await request.json();

    if (!track_id || !/^[A-Za-z0-9_-]{16,80}$/.test(track_id)) {
      return NextResponse.json({ ok: false, error: "track_id inválido" }, { status: 400 });
    }

    // IP real e User Agent do cabeçalho
    const client_ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    const client_user_agent = request.headers.get("user-agent") || "";

    const sessionData = {
      track_id,
      fbp: fbp || null,
      fbc: fbc || null,
      fbclid: fbclid || null,
      client_ip,
      client_user_agent,
      landing_page: landing_page || null,
      event_source_url: event_source_url || null,
      updated_at: new Date().toISOString()
    };

    // TODO: Salvar no Hot Cache (Redis/Upstash) e salvar/atualizar na tabela `sessions` do Supabase.
    console.log(`[Capture API] Sessão de atribuição registrada: ${track_id.slice(-8)} (IP: ${client_ip})`);

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
