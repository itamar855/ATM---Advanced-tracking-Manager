import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  computeDecisionMaturityMetrics,
  RecommendationAuditRecord,
} from "@/lib/intelligence/decision-maturity-engine";

/**
 * GET /api/v1/intelligence/maturity
 *
 * Endpoint analítico de leitura (read-only) que consolida a maturidade das decisões do ATM.
 * Responde executivamente: "O ATM está tomando boas decisões?"
 *
 * Query Params:
 * - store_id: string (obrigatório) - ID do tenant
 * - days: number (opcional, padrão 30) - Janela de retroação em dias
 * - include_simulations: boolean (opcional, padrão true) - Incluir decisões de Shadow Mode
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const includeSimulations = searchParams.get("include_simulations") !== "false";

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "store_id é obrigatório." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Calcula a data de corte inicial
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("campaign_intelligence_recommendations")
      .select(
        "id, store_id, campaign_id, campaign_name, action, budget_change_percent, confidence_score, data_maturity_score, outcome_result, outcome_reason_code, outcome_metrics_delta, metrics_before, metrics_after, is_simulation, created_at, evaluated_at"
      )
      .eq("store_id", storeId)
      .gte("created_at", sinceDate)
      .order("created_at", { ascending: false });

    if (!includeSimulations) {
      query = query.eq("is_simulation", false);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("[Intelligence Maturity API] Falha na consulta de recomendações:", error.message);
      // Retorna análise segura com amostragem vazia se tabela inexistente ou vazia
      const emptyAnalysis = computeDecisionMaturityMetrics([], storeId, days);
      return NextResponse.json({
        ok: true,
        data: emptyAnalysis,
      });
    }

    const records: RecommendationAuditRecord[] = (data || []).map((row: any) => ({
      id: row.id,
      store_id: row.store_id,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      action: row.action,
      budget_change_percent: row.budget_change_percent,
      confidence_score: row.confidence_score,
      data_maturity_score: row.data_maturity_score,
      outcome_result: row.outcome_result,
      outcome_reason_code: row.outcome_reason_code,
      outcome_metrics_delta: row.outcome_metrics_delta,
      metrics_before: row.metrics_before,
      metrics_after: row.metrics_after,
      is_simulation: row.is_simulation,
      created_at: row.created_at,
      evaluated_at: row.evaluated_at,
    }));

    const analysis = computeDecisionMaturityMetrics(records, storeId, days);

    return NextResponse.json({
      ok: true,
      data: analysis,
    });
  } catch (err: any) {
    console.error("[Intelligence Maturity API] Erro interno:", err?.message);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
