import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/encryption";

/**
 * GET /api/v1/meta/accounts?store_id=xyz
 * Retorna a lista de contas de anúncio reais vinculadas ao Access Token da Meta cadastrado
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id é obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Busca a integração ativa da Meta para pegar o token
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({ ok: false, error: "Nenhum token ou integração Meta salva. Cadastre seu Access Token em Integrações." }, { status: 404 });
    }

    const decryptedToken = decrypt(integration.access_token_enc.toString());
    const apiVersion = integration.api_version || "v23.0";

    // 2. Busca todas as contas de anúncio no perfil associado ao token da Meta
    const metaUrl = `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=name,account_id,id,account_status,currency&access_token=${decryptedToken}&limit=50`;

    const resp = await fetch(metaUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      const err = await resp.json();
      return NextResponse.json({ ok: false, error: err.error?.message || "Erro ao consultar contas no Facebook" }, { status: resp.status });
    }

    const accountsData = await resp.json();
    return NextResponse.json({
      ok: true,
      accounts: accountsData.data || [],
    });

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/meta/accounts
 * Salva a conta de anúncios selecionada na configuração de integração
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, ad_account_id } = await request.json();

    if (!store_id || !ad_account_id) {
      return NextResponse.json({ ok: false, error: "Parâmetros obrigatórios ausentes" }, { status: 400 });
    }

    const supabase = await createClient();

    // Busca a integração existente
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({ ok: false, error: "Integração Meta não inicializada" }, { status: 400 });
    }

    // Atualiza o config salvando o ad_account_id da conta selecionada
    const currentConfig = integration.config || {};
    const { error } = await supabase
      .from("integrations")
      .update({
        config: {
          ...currentConfig,
          ad_account_id: ad_account_id,
        },
        status: "active"
      })
      .eq("id", integration.id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Conta de anúncios vinculada com sucesso!" });

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
