import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMetaCAPIEvent } from "@/lib/meta/capi";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { store_id, test_event_code, event_name } = body;

    if (!store_id || !test_event_code || !event_name) {
      return NextResponse.json({ error: "store_id, test_event_code e event_name são obrigatórios" }, { status: 400 });
    }

    // Verify ownership and get meta integration
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("tenant_id")
      .eq("id", store_id)
      .maybeSingle();

    if (storeError || !store || store.tenant_id !== user.id) {
      return NextResponse.json({ error: "Loja não autorizada" }, { status: 403 });
    }

    // Obter credenciais da Meta
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("pixel_id, access_token_enc, api_version")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration || !integration.access_token_enc || !integration.pixel_id) {
      return NextResponse.json({ error: "Integração Meta não configurada ou inativa" }, { status: 400 });
    }

    const rawToken = integration.access_token_enc.toString();
    let decryptedMetaToken = rawToken;
    if (!rawToken.startsWith("EAA")) {
      try {
        decryptedMetaToken = decrypt(rawToken);
      } catch {
        decryptedMetaToken = rawToken;
      }
    }

    // Gerar payload fake baseado no evento
    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `test_${event_name.toLowerCase()}_${Date.now()}`;
    
    // Dados de usuário de teste genéricos
    const userData = {
      em: ["7b17fb0bd173f625b58636fb796407c22b3d16fc78302d79f0fd30c2fc2fc068"], // john@smith.com
      ph: ["254aa248acb47dd654ca3ea53f48c2c26d641d23d7e2e93a1cc56d0eb384c924"], // 1234567890
      client_ip: "192.168.0.1",
      client_user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowser/1.0",
      fbc: `fb.1.${Date.now()}.IwARtest_${Math.floor(Math.random() * 10000)}`,
      fbp: `fb.1.${Date.now()}.1234567890`,
    };

    const customData: any = {
      currency: "BRL",
      value: 199.99,
      content_name: "Produto Teste CAPI",
      content_ids: ["test_123"],
      content_type: "product",
    };

    if (event_name === "Purchase") {
      customData.num_items = 1;
    }

    const metaEvent = {
      event_name: event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: "website",
      event_source_url: `https://test-capi.${store_id}.trackingatm.com/checkout`,
      user_data: userData,
      custom_data: customData,
    };

    const capiConfig = {
      pixelId: integration.pixel_id,
      accessToken: decryptedMetaToken,
      apiVersion: integration.api_version,
      testEventCode: test_event_code.trim(),
    };

    const metaResponse = await sendMetaCAPIEvent(capiConfig, metaEvent);

    if (metaResponse.ok) {
      return NextResponse.json({ ok: true, message: "Evento CAPI enviado com sucesso!", meta_response: metaResponse });
    } else {
      return NextResponse.json({ error: "Erro na API da Meta: " + JSON.stringify(metaResponse.error) }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[CAPI Test Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
