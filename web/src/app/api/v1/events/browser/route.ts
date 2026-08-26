import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBrowserEvent, getUserDataKeys, BrowserEventName, BrowserUserData, BrowserEventCustomData } from "@/lib/tracking/event-builder";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { reserveEvent, updateEventResult } from "@/lib/tracking/dedup-engine";
import { decrypt } from "@/lib/encryption";

/**
 * POST /api/v1/events/browser
 *
 * Recebe eventos de funil do Pixel do Shopify (PageView, ViewContent,
 * AddToCart, InitiateCheckout, AddPaymentInfo, etc.) e os encaminha
 * à Meta Conversions API com todos os sinais disponíveis.
 *
 * Os dados PII (email, phone, nome, endereço, etc.) são hasheados
 * com SHA-256 aqui no servidor, nunca no browser.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    const {
      store_id,
      track_id,
      event_name,
      event_id,
      event_source_url,
      user_data: rawUserData,
      custom_data: rawCustomData,
    } = body as {
      store_id: string;
      track_id: string;
      event_name: BrowserEventName;
      event_id: string;
      event_source_url: string;
      user_data?: BrowserUserData;
      custom_data?: BrowserEventCustomData;
    };

    // ── Validações básicas ──
    if (!store_id || !event_name || !event_id) {
      return NextResponse.json(
        { ok: false, error: "store_id, event_name e event_id são obrigatórios" },
        { status: 400 }
      );
    }

    const validEvents: BrowserEventName[] = [
      "PageView", "ViewContent", "AddToCart",
      "InitiateCheckout", "AddPaymentInfo", "Purchase",
      "Search", "Lead", "CompleteRegistration", "Subscribe",
    ];
    if (!validEvents.includes(event_name)) {
      return NextResponse.json(
        { ok: false, error: `event_name inválido: ${event_name}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ── 1. Buscar integração Meta ativa ──
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration) {
      return NextResponse.json(
        { ok: false, error: "Integração Meta CAPI não configurada para esta loja" },
        { status: 400 }
      );
    }

    // ── 2. Deduplicação: checar se evento já foi enviado ──
    const lock = await reserveEvent(store_id, event_name, event_id, "browser");
    if (!lock.acquired) {
      return NextResponse.json(
        { ok: true, message: `Evento ${event_name} deduplicado (${lock.state})`, deduplicated: true },
        { status: 200 }
      );
    }

    // ── 3. Recuperar sessão para enriquecer com fbp, fbc, IP e UA ──
    let sessionData: {
      fbp?: string | null;
      fbc?: string | null;
      client_ip?: string | null;
      client_user_agent?: string | null;
    } = {};

    if (track_id) {
      const { data: session } = await supabase
        .from("sessions")
        .select("fbp, fbc, client_ip, client_user_agent")
        .eq("store_id", store_id)
        .eq("track_id", track_id)
        .maybeSingle();

      if (session) {
        sessionData = session;
      }
    }

    // Fallback: IP do cabeçalho HTTP (último recurso, menos preciso que o bridge)
    if (!sessionData.client_ip) {
      const forwarded = request.headers.get("x-forwarded-for");
      sessionData.client_ip = forwarded
        ? forwarded.split(",")[0].trim()
        : request.headers.get("x-real-ip") || undefined;
    }
    if (!sessionData.client_user_agent) {
      sessionData.client_user_agent = request.headers.get("user-agent") || undefined;
    }

    // ── 4. Construir evento com qualificação máxima de PII ──
    const metaEvent = buildBrowserEvent(
      event_name,
      event_id,
      event_source_url || "",
      sessionData,
      rawUserData || {},
      rawCustomData
    );

    // ── 5. Despachar para a Meta CAPI ──
    const decryptedToken = decrypt(integration.access_token_enc.toString());
    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedToken,
      apiVersion: integration.api_version,
      testEventCode: integration.config?.test_event_code,
    };

    const capiResult = await sendMetaCAPIEvent(capiConfig, metaEvent);
    const latencyMs = Date.now() - startTime;

    const status = capiResult.ok ? "accepted" : "rejected";
    await updateEventResult(store_id, event_id, "browser", status, capiResult.response, latencyMs);

    // Registrar quais sinais PII foram incluídos (para Health Score e auditoria)
    const userDataKeys = getUserDataKeys(metaEvent.user_data);
    await supabase
      .from("events")
      .update({ user_data_keys: userDataKeys })
      .eq("store_id", store_id)
      .eq("event_id", event_id)
      .eq("source", "browser");

    if (!capiResult.ok) {
      return NextResponse.json(
        { ok: false, error: capiResult.error },
        { status: 400 }
      );
    }

    console.log(
      `[Browser Event] ${event_name} (${event_id.slice(-8)}) | ` +
      `Sinais: [${userDataKeys.join(", ")}] | ` +
      `Latência: ${latencyMs}ms`
    );

    return NextResponse.json({
      ok: true,
      event_name,
      event_id,
      signals_sent: userDataKeys,
    });

  } catch (error: any) {
    console.error("[Browser Event Error]:", error);
    return NextResponse.json(
      { ok: false, error: "Erro interno no servidor" },
      { status: 500 }
    );
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
