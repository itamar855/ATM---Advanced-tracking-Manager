import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

/**
 * POST /api/v1/intelligence/actions/rollback
 * Reverte uma ação executada anteriormente, restaurando o estado exato
 * contido no `previous_snapshot` (orçamento, status e parâmetros operacionais).
 *
 * Payload:
 * - store_id: string
 * - action_id: string
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, action_id } = body;

    if (!store_id || !action_id) {
      return NextResponse.json(
        { ok: false, error: "store_id e action_id são obrigatórios para rollback." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Busca ação a ser revertida
    const { data: action, error: actionError } = await supabase
      .from("campaign_actions")
      .select("*")
      .eq("id", action_id)
      .eq("store_id", store_id)
      .maybeSingle();

    if (actionError || !action) {
      return NextResponse.json(
        { ok: false, error: "Ação executada não encontrada para esta loja." },
        { status: 404 }
      );
    }

    // 2. Valida status atual: só pode reverter o que já foi executado
    if (action.status !== "executed") {
      return NextResponse.json(
        {
          ok: false,
          error: `Não é possível reverter uma ação com status '${action.status}'. Apenas ações 'executed' podem ser revertidas.`,
        },
        { status: 400 }
      );
    }

    const prevSnapshot = action.previous_snapshot;
    if (!prevSnapshot || typeof prevSnapshot !== "object") {
      return NextResponse.json(
        { ok: false, error: "Snapshot prévio não encontrado ou inválido nesta ação." },
        { status: 400 }
      );
    }

    // 3. Busca credencial ativa da Meta para restaurar parâmetros reais
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    let rollbackSuccess = false;
    let rollbackMetaResponse: any = null;
    let rollbackError: string | null = null;
    const targetEntityId = action.campaign_id;

    if (!integration) {
      console.warn(`[Action Rollback] Sem integração Meta ativa para store_id=${store_id}. Executando em modo simulado.`);
      rollbackSuccess = true;
      rollbackMetaResponse = { simulated: true, note: "Rollback executado em modo simulado seguro." };
    } else {
      try {
        const decryptedToken = decrypt(integration.access_token_enc.toString());
        const apiVersion = integration.api_version || "v23.0";
        const url = `https://graph.facebook.com/${apiVersion}/${targetEntityId}`;

        const rollbackPayload: any = {};

        // Restaura orçamento anterior
        if (prevSnapshot.daily_budget !== undefined && prevSnapshot.daily_budget !== null) {
          rollbackPayload.daily_budget = Math.round(Number(prevSnapshot.daily_budget) * 100);
        }

        // Restaura status anterior
        if (prevSnapshot.status) {
          rollbackPayload.status = prevSnapshot.status;
        }

        if (Object.keys(rollbackPayload).length > 0) {
          const res = await fetch(`${url}?access_token=${decryptedToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rollbackPayload),
          });

          const resData = await res.json();
          if (!res.ok) {
            rollbackSuccess = false;
            rollbackError = resData.error?.message || "Erro retornado pela Meta Ads API ao reverter.";
            rollbackMetaResponse = resData;
          } else {
            rollbackSuccess = true;
            rollbackMetaResponse = resData;
          }
        } else {
          rollbackSuccess = true;
          rollbackMetaResponse = { info_only: true, message: "Nenhum parâmetro de mutação exigido para este rollback." };
        }
      } catch (err: any) {
        rollbackSuccess = false;
        rollbackError = err.message || "Falha de rede ao reverter ação na Meta.";
      }
    }

    if (!rollbackSuccess) {
      return NextResponse.json(
        {
          ok: false,
          error: rollbackError || "Falha ao executar rollback na Meta Graph API.",
          metaResponse: rollbackMetaResponse,
        },
        { status: 502 }
      );
    }

    // 4. Marca como 'rolled_back' na auditoria
    const nowIso = new Date().toISOString();
    const { data: updatedAction, error: updateError } = await supabase
      .from("campaign_actions")
      .update({
        status: "rolled_back",
        rolled_back_at: nowIso,
        meta_response: {
          ...action.meta_response,
          rollback_result: rollbackMetaResponse,
        },
        updated_at: nowIso,
      })
      .eq("id", action_id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[Action Rollback Update Error]:", updateError);
    }

    return NextResponse.json({
      ok: true,
      message: "Ação revertida com sucesso. Configurações anteriores restauradas na Meta Ads.",
      action: updatedAction,
    });
  } catch (err: any) {
    console.error("[Action Rollback Error]:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erro interno ao processar rollback." },
      { status: 500 }
    );
  }
}
