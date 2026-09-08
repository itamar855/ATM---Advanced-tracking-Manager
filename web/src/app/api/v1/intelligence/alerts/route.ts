/**
 * web/src/app/api/v1/intelligence/alerts/route.ts
 *
 * Endpoint Contábil de Alertas e Recomendações de Inteligência (Fase 6.3)
 * ATM - Advanced Tracking Manager ADS
 *
 * Fornece alertas em tempo real sobre oportunidades de escala, campanhas subestimadas,
 * sangramento financeiro e fadiga de criativos cruzando revenue_ledger com Meta Insights.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runStoreIntelligenceAnalysis, CampaignAlert } from "@/lib/intelligence/campaign-alert-engine";

export const dynamic = "force-dynamic";

interface CachedAlerts {
  data: any;
  expiresAt: number;
}

const alertsMemoryCache = new Map<string, CachedAlerts>();
const CACHE_TTL_MS = 5000; // 5 segundos de cache em memória

export async function GET(req: NextRequest) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(req.url);

    // 1. Validação obrigatória de store_id (Isolamento Multi-tenant)
    const storeId = searchParams.get("store_id");
    if (!storeId || storeId.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "store_id is required" },
        { status: 400 }
      );
    }

    const cleanStoreId = storeId.trim();
    const statusFilter = searchParams.get("status") || "new";
    const severityFilter = searchParams.get("severity");
    const typeFilter = searchParams.get("type");
    const windowDays = parseInt(searchParams.get("windowDays") || "7", 10);
    const forceRefresh = searchParams.get("refresh") === "true";

    const cacheKey = `${cleanStoreId}::${statusFilter}::${severityFilter || ""}::${typeFilter || ""}::${windowDays}`;

    if (!forceRefresh) {
      const cached = alertsMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        const latencyMs = Math.round(performance.now() - startTime);
        return NextResponse.json(
          {
            ...cached.data,
            latencyMs,
            cached: true,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }
    }

    const supabase = createAdminClient();

    // 2. Se a tabela campaign_intelligence_alerts existir no banco e não for forceRefresh, busca nela
    let storedAlerts: CampaignAlert[] | null = null;

    if (!forceRefresh) {
      try {
        let query = supabase
          .from("campaign_intelligence_alerts")
          .select("id, store_id, campaign_id, campaign_name, alert_type, severity, title, description, suggested_action, metrics, status, created_at, resolved_at")
          .eq("store_id", cleanStoreId);

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }
        if (severityFilter) {
          query = query.eq("severity", severityFilter);
        }
        if (typeFilter) {
          query = query.eq("alert_type", typeFilter);
        }

        const { data, error } = await query.order("created_at", { ascending: false }).limit(100);

        if (!error && Array.isArray(data) && data.length > 0) {
          storedAlerts = data.map((d: any) => ({
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
            resolvedAt: d.resolved_at,
          }));
        }
      } catch (dbErr) {
        // Fallback para execução sob demanda se a tabela ainda não tiver sido criada
        storedAlerts = null;
      }
    }

    // 3. Se não houver alertas armazenados ou se foi solicitado refresh, executa o motor analítico
    let alerts: CampaignAlert[] = [];
    let summary: any;

    if (storedAlerts && storedAlerts.length > 0) {
      alerts = storedAlerts;
      summary = {
        totalAlerts: alerts.length,
        critical: alerts.filter((a) => a.severity === "critical").length,
        warning: alerts.filter((a) => a.severity === "warning").length,
        info: alerts.filter((a) => a.severity === "info").length,
        hiddenRevenue: alerts
          .filter((a) => a.type === "UNDER_REPORTED_CAMPAIGN")
          .reduce((sum, a) => sum + (a.metrics.atmRevenue || 0), 0),
        scaleOpportunities: alerts.filter((a) => a.type === "READY_TO_SCALE").length,
        decayCampaigns: alerts.filter((a) => a.type === "CAMPAIGN_DECAY").length,
        fatiguedCreatives: alerts.filter((a) => a.type === "CREATIVE_FATIGUE").length,
      };
    } else {
      const analysisResult = await runStoreIntelligenceAnalysis(cleanStoreId, { windowDays });
      alerts = analysisResult.alerts;
      summary = analysisResult.summary;

      // Aplica filtros se fornecidos
      if (severityFilter) {
        alerts = alerts.filter((a) => a.severity === severityFilter);
      }
      if (typeFilter) {
        alerts = alerts.filter((a) => a.type === typeFilter);
      }
    }

    const responseData = {
      ok: true,
      storeId: cleanStoreId,
      summary,
      alerts,
    };

    alertsMemoryCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    return NextResponse.json(
      {
        ...responseData,
        latencyMs,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    console.error("[Intelligence Alerts API Error]:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Internal server error",
        latencyMs,
      },
      { status: 500 }
    );
  }
}
