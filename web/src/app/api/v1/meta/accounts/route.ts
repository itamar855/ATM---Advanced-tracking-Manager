import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/accounts
 * Retorna as contas de anúncio vinculadas ao token passado via query (?token=...)
 * ou da integração salva da loja (?store_id=...).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const rawToken = searchParams.get("token");

    let accessToken = rawToken || "";

    if (!accessToken) {
      const supabase = createAdminClient();
      let query = supabase.from("integrations").select("*").eq("platform", "meta");
      if (storeId) {
        query = query.eq("store_id", storeId);
      }
      const { data: integration } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();

      if (integration && integration.access_token_enc) {
        const raw = integration.access_token_enc.toString();
        if (raw.startsWith("EAA")) {
          accessToken = raw;
        } else {
          try {
            accessToken = decrypt(raw);
          } catch {
            accessToken = raw;
          }
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Nenhum token da Meta fornecido ou cadastrado." },
        { status: 400 }
      );
    }

    const apiVersion = "v23.0";

    // 1. Busca dados do Perfil/Usuário
    let userName = "Perfil Facebook";
    try {
      const meRes = await fetch(`https://graph.facebook.com/${apiVersion}/me?fields=id,name&access_token=${accessToken}`);
      if (meRes.ok) {
        const meData = await meRes.json();
        userName = meData.name || userName;
      }
    } catch {}

    // 2. Busca todas as contas de anúncio no perfil
    const metaUrl = `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=name,account_id,id,account_status,currency,amount_spent,business_name&access_token=${accessToken}&limit=100`;

    const resp = await fetch(metaUrl);
    if (!resp.ok) {
      const err = await resp.json();
      return NextResponse.json(
        { ok: false, error: err.error?.message || "Erro ao consultar contas no Facebook" },
        { status: resp.status }
      );
    }

    const accountsData = await resp.json();
    const formattedAccounts = (accountsData.data || []).map((acc: any) => ({
      id: acc.id,
      accountId: acc.account_id,
      name: acc.name || `Conta ${acc.account_id}`,
      status: acc.account_status === 1 ? "ACTIVE" : acc.account_status === 2 ? "DISABLED" : "PAUSED",
      currency: acc.currency || "BRL",
      amountSpent: acc.amount_spent ? Number(acc.amount_spent) / 100 : 0,
      businessName: acc.business_name || null,
    }));

    return NextResponse.json({
      ok: true,
      user: { name: userName },
      accounts: formattedAccounts,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/meta/accounts
 * Salva a lista de contas de anúncio selecionadas e o perfil na integração
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, access_token, profile_name, ad_account_ids, pixel_id, test_event_code } = await request.json();

    const finalStoreId = store_id || "dckb5g-7d";

    if (!access_token) {
      return NextResponse.json({ ok: false, error: "Access token é obrigatório" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Verifica se já existe uma integração da Meta para esta loja
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("store_id", finalStoreId)
      .eq("platform", "meta")
      .limit(1)
      .maybeSingle();

    const integrationPayload = {
      store_id: finalStoreId,
      platform: "meta",
      pixel_id: pixel_id || "1104875232197441",
      access_token_enc: access_token,
      status: "active",
      config: {
        profile_name: profile_name || "Perfil Principal",
        ad_account_ids: Array.isArray(ad_account_ids) ? ad_account_ids : [ad_account_ids],
        test_event_code: test_event_code || undefined,
        updated_at: new Date().toISOString(),
      },
    };

    if (existing) {
      const { error: updateErr } = await supabase
        .from("integrations")
        .update(integrationPayload)
        .eq("id", existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from("integrations")
        .insert(integrationPayload);

      if (insertErr) throw insertErr;
    }

    return NextResponse.json({
      ok: true,
      message: "Perfil do Meta e contas de anúncio vinculados com sucesso!",
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
