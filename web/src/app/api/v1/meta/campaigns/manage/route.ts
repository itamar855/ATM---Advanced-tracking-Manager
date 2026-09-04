import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { getUsdBrlRate } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/meta/campaigns/manage
 * Permite controle total de campanhas, conjuntos e anúncios:
 * - status: 'ACTIVE' | 'PAUSED'
 * - name: renomeia campanha, conjunto ou anúncio
 * - budget: altera orçamento diário
 * - duplicate: duplica o objeto
 * - delete: remove o objeto
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, level, action, value, accountCurrency, store_id } = body as {
      id: string;
      level: "campaign" | "adset" | "ad";
      action: "status" | "name" | "rename" | "budget" | "duplicate" | "delete";
      value?: any;
      accountCurrency?: string;
      store_id?: string;
    };

    if (!id || !action || !store_id) {
      return NextResponse.json({ ok: false, error: "ID, action e store_id são obrigatórios" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Busca token da Meta da loja selecionada com fallback
    let { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", store_id)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) {
      const { data: fallbackInt } = await supabase
        .from("integrations")
        .select("*")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = fallbackInt;
    }

    let token = resolveMetaAccessToken(integration?.access_token_enc) || resolveMetaAccessToken(process.env.META_ACCESS_TOKEN) || "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token da Meta não encontrado" }, { status: 400 });
    }

    const curr = (accountCurrency || "USD").toUpperCase();
    const usdBrlRate = await getUsdBrlRate();

    let graphUrl = `https://graph.facebook.com/v23.0/${id}`;
    let method = "POST";
    let payload: Record<string, any> = {};

    if (action === "status") {
      payload = { status: value === "active" || value === "ACTIVE" ? "ACTIVE" : "PAUSED" };
    } else if (action === "name" || action === "rename") {
      const newName = String(value || "").trim();
      if (!newName) {
        return NextResponse.json({ ok: false, error: "O novo nome não pode ficar vazio" }, { status: 400 });
      }
      payload = { name: newName };
    } else if (action === "budget") {
      const normalizedValue = String(value ?? "").replace(",", ".").trim();
      let budgetAmount = Number(normalizedValue);

      if (isNaN(budgetAmount) || budgetAmount <= 0) {
        return NextResponse.json(
          { ok: false, error: "Valor de orçamento inválido. Informe um número válido maior que zero." },
          { status: 400 }
        );
      }

      // Se a conta for USD e o usuário digitou em BRL, converte para USD
      if (curr === "USD") {
        budgetAmount = budgetAmount / usdBrlRate;
      }
      const budgetCents = Math.round(budgetAmount * 100);

      if (isNaN(budgetCents) || budgetCents <= 0) {
        return NextResponse.json(
          { ok: false, error: "Valor de orçamento calculado inválido." },
          { status: 400 }
        );
      }

      payload = { daily_budget: budgetCents };
    } else if (action === "duplicate") {
      const copies = Number(body.copies) || 1;
      const rawNewBudget = body.newBudget !== undefined && body.newBudget !== null && body.newBudget !== ""
        ? Number(String(body.newBudget).replace(",", ".").trim())
        : null;
      let targetBudget = rawNewBudget !== null && !isNaN(rawNewBudget) && rawNewBudget > 0 ? rawNewBudget : null;

      if (targetBudget !== null && targetBudget > 0) {
        if (curr === "USD") {
          targetBudget = targetBudget / usdBrlRate;
        }
        targetBudget = Math.round(targetBudget * 100);
      }

      graphUrl = `https://graph.facebook.com/v23.0/${id}/copies`;
      
      const copyPromises = Array.from({ length: copies }).map(async () => {
        const res = await fetch(`${graphUrl}?access_token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_option: "ACTIVE" })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
           return { success: false, error: data };
        }
        
        const newCopiedId = data.copied_campaign_id || data.copied_adset_id || data.copied_ad_id || data.id || data.new_campaign_id;

        if (targetBudget !== null && targetBudget > 0 && newCopiedId && (level === "campaign" || level === "adset")) {
          const budUrl = `https://graph.facebook.com/v23.0/${newCopiedId}?access_token=${token}`;
          await fetch(budUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ daily_budget: targetBudget })
          });
        }
        
        return { success: true, newId: newCopiedId };
      });
      
      const results = await Promise.all(copyPromises);
      
      const failed = results.find(r => !r.success);
      if (failed) {
        return NextResponse.json({ ok: false, error: "Falha na duplicação na API da Meta", details: failed.error }, { status: 400 });
      }

      return NextResponse.json({ ok: true, action, id, meta_response: { results } });
    } else if (action === "delete") {
      method = "DELETE";
    }

    const metaRes = await fetch(
      `${graphUrl}?access_token=${token}`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(payload) : undefined,
      }
    );

    const resData = await metaRes.json();

    if (!metaRes.ok) {
      console.error("[Meta Manage API Error]:", resData);
      
      const metaError =
        resData.error?.error_user_msg ||
        resData.error?.error_user_title ||
        resData.error?.message ||
        "Erro desconhecido na Meta";

      let errMsg = metaError;
      if (resData.error?.message?.includes("(#200) Requires") && resData.error?.message?.includes("ads_management")) {
        errMsg = "Sem permissão. Você precisa adicionar 'ads_management' no Token da Meta e atualizar as Integrações.";
      } else if (resData.error?.code === 190) {
        errMsg = "O Token da Meta expirou ou é inválido. Gere um novo nas configurações.";
      } else if (
        resData.error?.message?.includes("Campaign budget is not supported") ||
        resData.error?.message?.includes("ad set budget") ||
        resData.error?.message?.includes("campaign budget")
      ) {
        errMsg = "Esta campanha é ABO (Orçamento no Conjunto). O orçamento deve ser alterado no nível de Conjuntos de Anúncios (CJs).";
      }
      
      return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      action,
      id,
      meta_response: resData,
    });
  } catch (error: any) {
    console.error("[POST /api/v1/meta/campaigns/manage Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
