import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveMetaAccessToken } from "@/lib/meta/token";
import { getUsdBrlRate } from "@/lib/currency";
import { clearCampaignsMemoryCache, getCachedEntityMetrics } from "../list/route";
import { duplicateCampaign, DuplicationMode, normalizeSourceAction } from "@/lib/meta/campaign-hierarchical-duplicator";

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
    const { id, level, action, value, accountCurrency, store_id, duplication_mode, source_action } = body as {
      id: string;
      level: "campaign" | "adset" | "ad";
      action: "status" | "name" | "rename" | "budget" | "duplicate" | "delete";
      value?: any;
      accountCurrency?: string;
      store_id?: string;
      duplication_mode?: DuplicationMode;
      source_action?: string;
      copies?: number;
      newBudget?: number | string | null;
    };

    if (!id || !action || !store_id) {
      return NextResponse.json({ ok: false, error: "ID, action e store_id são obrigatórios" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Identificação do Usuário Autenticado
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email || null;
      }
    } catch {}

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

    // Variáveis de snapshot para auditoria de orçamento
    let budgetSnapshot: ReturnType<typeof getCachedEntityMetrics> = null;
    let snapshotSource: "cache" | "none" = "none";
    let datePresetUsed: string | null = null;
    let timezoneUsed: string | null = null;
    let entityName: string | null = null;
    let previousBudget: number | null = null;

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

      // Captura segura de métricas antes da alteração na Meta (100% backend)
      if (level === "campaign" || level === "adset") {
        budgetSnapshot = getCachedEntityMetrics(store_id, id, level);
        if (budgetSnapshot) {
          snapshotSource = "cache";
          datePresetUsed = budgetSnapshot.date_preset;
          timezoneUsed = budgetSnapshot.timezone;
          entityName = budgetSnapshot.name;
          previousBudget = budgetSnapshot.budget;
        } else {
          // Fallback seguro: se cache não estiver disponível, obtém dados básicos da Meta sem gravar métricas zeradas silenciosamente
          try {
            const infoRes = await fetch(
              `https://graph.facebook.com/v23.0/${id}?fields=name,daily_budget,lifetime_budget&access_token=${token}`,
              { signal: AbortSignal.timeout(3500) }
            );
            if (infoRes.ok) {
              const info = await infoRes.json();
              entityName = info.name || null;
              const rawB = info.daily_budget
                ? Number(info.daily_budget) / 100
                : info.lifetime_budget
                ? Number(info.lifetime_budget) / 100
                : null;
              if (rawB !== null) {
                previousBudget = curr === "USD" ? rawB * usdBrlRate : rawB;
              }
            }
          } catch {}
        }
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
      const duplicationMode: DuplicationMode = body.duplication_mode === "SIMPLE" ? "SIMPLE" : "FULL_CLONE";
      const sourceAction = normalizeSourceAction(body.source_action);
      const copies = Number(body.copies) || 1;
      
      let targetBudget: number | null = null;
      if (body.newBudget !== undefined && body.newBudget !== null && String(body.newBudget).trim() !== "") {
        const rawNewBudget = Number(String(body.newBudget).replace(",", ".").trim());
        if (isNaN(rawNewBudget) || rawNewBudget <= 0) {
          return NextResponse.json(
            { ok: false, error: "Valor de novo orçamento inválido para duplicação. Não é permitida alteração silenciosa ou inválida de orçamento." },
            { status: 400 }
          );
        }
        let val = rawNewBudget;
        if (curr === "USD") {
          val = val / usdBrlRate;
        }
        targetBudget = Math.round(val * 100);
      }

      // Se for nível campanha, utiliza o motor de duplicação hierárquica (FULL_CLONE ou SIMPLE)
      if (level === "campaign") {
        const duplicationResults = [];

        for (let i = 0; i < copies; i++) {
          const result = await duplicateCampaign({
            campaignId: id,
            accessToken: token,
            storeId: store_id,
            duplicationMode,
            sourceAction,
            newDailyBudgetCents: targetBudget,
          });

          if (!result.ok) {
            clearCampaignsMemoryCache(store_id);
            return NextResponse.json(
              {
                ok: false,
                error: `Falha na duplicação da campanha: ${result.error}`,
                job: result.job,
              },
              { status: 400 }
            );
          }

          duplicationResults.push(result);
        }

        clearCampaignsMemoryCache(store_id);
        return NextResponse.json({
          ok: true,
          action,
          id,
          duplication_mode: duplicationMode,
          source_action: sourceAction,
          results: duplicationResults.map((r) => ({
            new_campaign_id: r.createdCampaignId,
            adsets_count: r.createdAdsetIds?.length || 0,
            ads_count: r.createdAdIds?.length || 0,
            budget_validation: {
              original_budget: r.job.original_budget,
              duplicated_budget: r.job.duplicated_budget,
              budget_change_percent: r.job.budget_change_percent,
              budget_warning: r.job.budget_warning,
            },
            duration_ms: r.job.duration_ms,
            job: r.job,
          })),
        });
      }

      // Caso seja adset ou ad individual, mantém cópia do objeto (sempre PAUSED por segurança)
      graphUrl = `https://graph.facebook.com/v23.0/${id}/copies`;
      
      const copyPromises = Array.from({ length: copies }).map(async () => {
        const res = await fetch(`${graphUrl}?access_token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_option: "PAUSED" })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
           return { success: false, error: data };
        }
        
        const newCopiedId = data.copied_campaign_id || data.copied_adset_id || data.copied_ad_id || data.id || data.new_campaign_id;

        if (targetBudget !== null && targetBudget > 0 && newCopiedId && level === "adset") {
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

      clearCampaignsMemoryCache(store_id);
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

    if (!metaRes.ok || resData.error || resData.success === false) {
      console.error("[Meta Manage API Error]:", resData);
      
      const metaError =
        resData.error?.error_user_msg ||
        resData.error?.error_user_title ||
        resData.error?.message ||
        (resData.success === false ? "Operação rejeitada pela Meta Ads." : "Erro desconhecido na Meta");

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

    // Persistência do histórico de decisões operacionais na tabela meta_entity_history
    // SOMENTE após validação de sucesso pela Meta Graph API
    if (action === "budget") {
      try {
        const normalizedValue = String(value ?? "").replace(",", ".").trim();
        await supabase.from("meta_entity_history").insert({
          store_id,
          user_id: userId,
          user_email: userEmail,
          source: "atm_user",
          action: "budget",
          entity_id: id,
          entity_type: level,
          entity_name: entityName,
          previous_budget: previousBudget !== null ? Number(previousBudget.toFixed(2)) : null,
          new_budget: Number(normalizedValue),
          sales_at_update: budgetSnapshot ? budgetSnapshot.sales : null,
          revenue_at_update: budgetSnapshot ? Number(budgetSnapshot.revenue.toFixed(2)) : null,
          spend_at_update: budgetSnapshot ? Number(budgetSnapshot.spend.toFixed(2)) : null,
          profit_at_update: budgetSnapshot ? Number(budgetSnapshot.profit.toFixed(2)) : null,
          roas_at_update: budgetSnapshot ? Number(budgetSnapshot.roas.toFixed(2)) : null,
          cpa_at_update: budgetSnapshot ? Number(budgetSnapshot.cpa.toFixed(2)) : null,
          metadata: {
            snapshot_source: snapshotSource,
            date_preset: datePresetUsed,
            timezone: timezoneUsed,
            currency: curr,
            usd_rate: usdBrlRate,
          },
        });
      } catch (histErr) {
        console.warn("[Meta Entity History Insert Warning]:", histErr);
      }
    }

    clearCampaignsMemoryCache(store_id);

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
