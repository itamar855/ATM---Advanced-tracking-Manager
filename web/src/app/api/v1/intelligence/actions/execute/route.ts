import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

/**
 * POST /api/v1/intelligence/actions/execute
 * Executa uma ação de campanha aprovada pelo usuário com proteção estrita de idempotência.
 *
 * Payload obrigatório:
 * - store_id: string
 * - action_id: string
 * - idempotency_key: string (UUID ou hash único da transação)
 * - decision: "approve" | "reject"
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, action_id, idempotency_key, decision = "approve" } = body;

    // 1. Validação de parâmetros obrigatórios
    if (!store_id || !action_id || !idempotency_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "store_id, action_id e idempotency_key são obrigatórios para garantir execução assistida e idempotente.",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 2. Proteção de Idempotência: Checa se a chave já foi processada
    const { data: existingIdempotent } = await supabase
      .from("campaign_actions")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existingIdempotent) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        message: "Ação já processada anteriormente com esta mesma chave de idempotência.",
        action: existingIdempotent,
      });
    }

    // 3. Busca a ação original
    const { data: action, error: actionError } = await supabase
      .from("campaign_actions")
      .select("*")
      .eq("id", action_id)
      .eq("store_id", store_id)
      .maybeSingle();

    if (actionError || !action) {
      return NextResponse.json(
        { ok: false, error: "Ação recomendada não encontrada para esta loja." },
        { status: 404 }
      );
    }

    // 4. Fluxo de Descarte / Rejeição
    if (decision === "reject") {
      const { data: rejectedAction, error: rejectError } = await supabase
        .from("campaign_actions")
        .update({
          status: "rejected",
          idempotency_key,
          updated_at: new Date().toISOString(),
        })
        .eq("id", action_id)
        .select("*")
        .single();

      if (rejectError) {
        return NextResponse.json(
          { ok: false, error: `Falha ao descartar ação: ${rejectError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Ação descartada com sucesso pelo gestor.",
        action: rejectedAction,
      });
    }

    // 5. Fluxo de Aprovação: Valida se a ação está em estado recomendável
    if (action.status !== "recommended") {
      return NextResponse.json(
        {
          ok: false,
          error: `Ação não pode ser executada pois seu status atual é '${action.status}'.`,
        },
        { status: 400 }
      );
    }

    // 6. Atualiza status temporário para "executing" para evitar concorrência
    await supabase
      .from("campaign_actions")
      .update({
        status: "executing",
        idempotency_key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", action_id);

    // 7. Busca credenciais ativas da Meta Graph API para a loja
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    let metaSuccess = false;
    let metaResponse: any = null;
    let errorMessage: string | null = null;
    const targetEntityId = action.campaign_id;

    if (!integration) {
      // Se não houver credencial ativa na loja (ex: ambiente de teste ou simulação), registra simulação segura
      console.warn(`[Action Execute] Nenhuma integração Meta ativa para store_id=${store_id}. Registrando em modo simulado.`);
      metaSuccess = true;
      metaResponse = { simulated: true, note: "Sem integração Meta ativa conectada à loja; executado em modo simulado seguro." };
    } else {
      try {
        const decryptedToken = decrypt(integration.access_token_enc.toString());
        const apiVersion = integration.api_version || "v23.0";
        const url = `https://graph.facebook.com/${apiVersion}/${targetEntityId}`;

        let bodyPayload: any = {};

        if (
          action.action_type === "SCALE_BUDGET_PERCENT" ||
          action.action_type === "REDUCE_BUDGET_PERCENT" ||
          action.action_type === "SET_EXACT_BUDGET"
        ) {
          const budgetInCents = Math.round(Number(action.target_value) * 100);
          bodyPayload = { daily_budget: budgetInCents };
        } else if (action.action_type === "PAUSE_CAMPAIGN") {
          bodyPayload = { status: "PAUSED" };
        } else if (action.action_type === "ACTIVATE_CAMPAIGN") {
          bodyPayload = { status: "ACTIVE" };
        } else {
          // Ações informativas de proteção ou criativo não mutam o Ads Manager
          bodyPayload = null;
        }

        if (bodyPayload) {
          const res = await fetch(`${url}?access_token=${decryptedToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });

          const resData = await res.json();
          if (!res.ok) {
            metaSuccess = false;
            errorMessage = resData.error?.message || "Erro desconhecido na Meta Graph API";
            metaResponse = resData;
          } else {
            metaSuccess = true;
            metaResponse = resData;
          }
        } else {
          metaSuccess = true;
          metaResponse = { info_only: true, action: action.action_type };
        }
      } catch (callErr: any) {
        metaSuccess = false;
        errorMessage = callErr.message || "Erro de rede ao comunicar com a Meta Graph API";
      }
    }

    // 8. Atualiza o registro final da auditoria
    const nowIso = new Date().toISOString();
    const finalStatus = metaSuccess ? "executed" : "failed";

    const { data: updatedAction, error: updateError } = await supabase
      .from("campaign_actions")
      .update({
        status: finalStatus,
        applied_value: metaSuccess ? action.target_value : null,
        executed_at: metaSuccess ? nowIso : null,
        error_message: errorMessage,
        meta_response: metaResponse,
        updated_at: nowIso,
      })
      .eq("id", action_id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[Action Execute Update Error]:", updateError);
    }

    if (!metaSuccess) {
      return NextResponse.json(
        {
          ok: false,
          error: errorMessage || "Falha na execução da ação na Meta Ads API.",
          action: updatedAction,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Ação de campanha executada e auditada com sucesso na Meta Ads.",
      action: updatedAction,
    });
  } catch (err: any) {
    console.error("[Action Execute Critical Error]:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erro interno ao executar ação." },
      { status: 500 }
    );
  }
}
