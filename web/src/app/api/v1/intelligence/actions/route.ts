import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  syncCampaignActions,
  CampaignAction,
} from "@/lib/intelligence/campaign-action-engine";
import { CampaignAlert } from "@/lib/intelligence/campaign-alert-engine";

/**
 * GET /api/v1/intelligence/actions
 * Retorna as ações recomendadas (fila de aprovação) e histórico de auditoria.
 * Sincroniza automaticamente com alertas ativos caso a fila esteja vazia.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const statusFilter = searchParams.get("status") || "all";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const autoSync = searchParams.get("sync") !== "false";

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "store_id é obrigatório." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Consulta ações existentes
    let query = supabase
      .from("campaign_actions")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    // Se a tabela ainda não existir, retorna resposta segura em memória
    if (error) {
      console.warn("[Intelligence Actions API] Tabela ainda não criada ou inacessível:", error.message);
      return NextResponse.json({
        ok: true,
        pendingCount: 0,
        executedCount: 0,
        actions: [],
      });
    }

    let rawActions = data || [];

    // 2. Se autoSync estiver ativo e não houver ações recomendadas pendentes, busca alertas ativos e gera propostas
    const hasPending = rawActions.some((a: any) => a.status === "recommended");
    if (!hasPending && autoSync) {
      try {
        const { data: alertsData } = await supabase
          .from("campaign_intelligence_alerts")
          .select("*")
          .eq("store_id", storeId)
          .eq("status", "new")
          .limit(20);

        if (alertsData && alertsData.length > 0) {
          const mappedAlerts: CampaignAlert[] = alertsData.map((d: any) => ({
            id: d.id,
            storeId: d.store_id,
            campaignId: d.campaign_id,
            campaignName: d.campaign_name,
            type: d.alert_type,
            severity: d.severity,
            title: d.title,
            description: d.description,
            suggestedAction: d.suggested_action,
            metrics: d.metrics || {},
            status: d.status,
            createdAt: d.created_at,
          }));

          const synced = await syncCampaignActions(storeId, mappedAlerts);
          if (synced.length > 0) {
            // Recarrega query para incluir os recém-gerados
            const { data: reloaded } = await supabase
              .from("campaign_actions")
              .select("*")
              .eq("store_id", storeId)
              .order("created_at", { ascending: false })
              .limit(limit);

            if (reloaded) rawActions = reloaded;
          }
        }
      } catch (syncErr) {
        console.warn("[Intelligence Actions API] Falha na auto-sincronização:", syncErr);
      }
    }

    const actions: CampaignAction[] = rawActions.map((row: any) => ({
      id: row.id,
      storeId: row.store_id,
      alertId: row.alert_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      adsetId: row.adset_id,
      adId: row.ad_id,
      actionType: row.action_type,
      executionMode: row.execution_mode || "assisted",
      autopilotEnabled: row.autopilot_enabled ?? false,
      status: row.status,
      previousValue: row.previous_value !== null ? Number(row.previous_value) : null,
      targetValue: row.target_value !== null ? Number(row.target_value) : null,
      appliedValue: row.applied_value !== null ? Number(row.applied_value) : null,
      previousSnapshot: row.previous_snapshot || {},
      targetSnapshot: row.target_snapshot || {},
      idempotencyKey: row.idempotency_key,
      reason: row.reason,
      errorMessage: row.error_message,
      metaResponse: row.meta_response,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      executedAt: row.executed_at,
      rolledBackAt: row.rolled_back_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const pendingCount = actions.filter((a) => a.status === "recommended").length;
    const executedCount = actions.filter((a) => a.status === "executed").length;

    return NextResponse.json({
      ok: true,
      pendingCount,
      executedCount,
      actions,
    });
  } catch (err: any) {
    console.error("[Intelligence Actions API] Erro inesperado:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erro interno ao consultar ações." },
      { status: 500 }
    );
  }
}
