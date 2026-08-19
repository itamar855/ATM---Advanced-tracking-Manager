import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/encryption";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/meta/campaigns/actions
 * Gerencia ações de escrita no Meta Ads Manager (pausar, alterar orçamento, deletar, duplicar)
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, action, campaign_id, value, adset_id, ad_id } = await request.json();

    if (!store_id || !action || !campaign_id) {
      return NextResponse.json({ ok: false, error: "Parâmetros ausentes" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Busca credencial ativa da Meta
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({ ok: false, error: "Integração Meta ativa não localizada" }, { status: 400 });
    }

    const decryptedToken = decrypt(integration.access_token_enc.toString());
    const apiVersion = integration.api_version || "v23.0";

    // 2. Determina a URL e o payload de acordo com a ação e o nível
    let url = "";
    let bodyPayload: any = {};
    const targetId = ad_id || adset_id || campaign_id;

    if (action === "pause") {
      url = `https://graph.facebook.com/${apiVersion}/${targetId}`;
      bodyPayload = { status: "PAUSED" };
    } else if (action === "activate") {
      url = `https://graph.facebook.com/${apiVersion}/${targetId}`;
      bodyPayload = { status: "ACTIVE" };
    } else if (action === "rename") {
      url = `https://graph.facebook.com/${apiVersion}/${targetId}`;
      bodyPayload = { name: value };
    } else if (action === "update_budget") {
      // Orçamento diário ou vitalício
      url = `https://graph.facebook.com/${apiVersion}/${targetId}`;
      bodyPayload = { daily_budget: Math.round(Number(value) * 100) }; // Em centavos de BRL
    } else if (action === "delete") {
      url = `https://graph.facebook.com/${apiVersion}/${targetId}`;
      const deleteResponse = await fetch(`${url}?access_token=${decryptedToken}`, {
        method: "DELETE",
      });
      const deleteResult = await deleteResponse.json();
      return NextResponse.json({ ok: deleteResult.success });
    } else if (action === "duplicate") {
      // Duplicar via Graph API
      url = `https://graph.facebook.com/${apiVersion}/${campaign_id}/copies`;
      bodyPayload = { status: "PAUSED" }; // Duplica em rascunho/pausada por segurança
    } else {
      return NextResponse.json({ ok: false, error: "Ação não suportada" }, { status: 400 });
    }

    // Dispara a requisição HTTP Post/Update para o Graph API
    const response = await fetch(`${url}?access_token=${decryptedToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Meta Ads Manager API Action Error]:", result);
      return NextResponse.json({ ok: false, error: result.error?.message || "Erro no Ads Manager API" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });

  } catch (error: any) {
    console.error("[Campaigns Actions API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
