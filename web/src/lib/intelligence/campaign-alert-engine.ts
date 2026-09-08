/**
 * web/src/lib/intelligence/campaign-alert-engine.ts
 *
 * Motor de Inteligência e Detecção de Oportunidades / Riscos de Campanhas (Fase 6)
 * ATM - Advanced Tracking Manager ADS
 *
 * Regras Contábeis Implementadas:
 * 1. UNDER_REPORTED_CAMPAIGN: Identifica quando a Meta oculta vendas capturadas pelo ATM.
 * 2. READY_TO_SCALE: Identifica campanhas com ROAS elevado, CPA reduzido e volume estatístico.
 * 3. CAMPAIGN_DECAY: Identifica sangramento financeiro (aumento de spend + queda de receita).
 * 4. CREATIVE_FATIGUE: Identifica saturação de audiência (frequência alta, queda de CTR, alta de CPA).
 */

import { createAdminClient } from "@/lib/supabase/server";

export type AlertType =
  | "UNDER_REPORTED_CAMPAIGN"
  | "READY_TO_SCALE"
  | "CAMPAIGN_DECAY"
  | "CREATIVE_FATIGUE";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertStatus = "new" | "acknowledged" | "dismissed" | "resolved";

export interface CampaignAlertMetrics {
  realRoas?: number;
  accountAvgRoas?: number;
  realCpa?: number;
  accountAvgCpa?: number;
  atmOrders?: number;
  platformOrders?: number;
  hiddenSales?: number;
  atmRevenue?: number;
  spend?: number;
  spendDeltaPercent?: number;
  revenueDeltaPercent?: number;
  ctr?: number;
  ctrDeltaPercent?: number;
  frequency?: number;
  frequencyDeltaPercent?: number;
  cpaDeltaPercent?: number;
}

export interface CampaignAlert {
  id?: string;
  storeId: string;
  campaignId: string;
  campaignName: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  suggestedAction: string;
  metrics: CampaignAlertMetrics;
  status: AlertStatus;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface IntelligenceSummary {
  totalAlerts: number;
  critical: number;
  warning: number;
  info: number;
  hiddenRevenue: number;
  scaleOpportunities: number;
  decayCampaigns: number;
  fatiguedCreatives: number;
}

export interface CampaignAnalysisInput {
  campaignId: string;
  campaignName: string;
  atmOrders: number;
  atmRevenue: number;
  platformOrders: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  frequency: number;
  // Métricas do período anterior (para detecção de tendências de sangramento e fadiga)
  previousSpend?: number;
  previousRevenue?: number;
  previousCtr?: number;
  previousFrequency?: number;
  previousCpa?: number;
}

/**
 * Avalia as 4 regras contábeis para uma única campanha a partir dos dados de performance.
 */
export function evaluateCampaignRules(
  campaign: CampaignAnalysisInput,
  accountAvg: { avgRoas: number; avgCpa: number },
  storeId: string
): CampaignAlert[] {
  const alerts: CampaignAlert[] = [];
  const nowIso = new Date().toISOString();

  const realRoas = campaign.spend > 0 ? campaign.atmRevenue / campaign.spend : 0;
  const realCpa = campaign.atmOrders > 0 && campaign.spend > 0 ? campaign.spend / campaign.atmOrders : 0;

  // ---------------------------------------------------------------------------
  // REGRA 1: UNDER_REPORTED_CAMPAIGN (Vendas Ocultadas na Plataforma)
  // ---------------------------------------------------------------------------
  const hiddenSales = campaign.atmOrders - campaign.platformOrders;
  const isSignificantlyUnderreported =
    hiddenSales >= 3 &&
    campaign.atmOrders >= campaign.platformOrders * 1.3 &&
    campaign.atmRevenue >= 200;

  if (isSignificantlyUnderreported) {
    const isCritical = hiddenSales >= 5;
    alerts.push({
      storeId,
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      type: "UNDER_REPORTED_CAMPAIGN",
      severity: isCritical ? "critical" : "warning",
      title: "Vendas Ocultadas pela Plataforma",
      description: `O ATM auditou ${campaign.atmOrders} compras reais no Ledger, enquanto o painel de anúncios registrou apenas ${campaign.platformOrders} (${hiddenSales} compras recuperadas).`,
      suggestedAction: "Não pause esta campanha. O algoritmo da Meta está sub-reportando o resultado real.",
      metrics: {
        atmOrders: campaign.atmOrders,
        platformOrders: campaign.platformOrders,
        hiddenSales,
        atmRevenue: Math.round(campaign.atmRevenue * 100) / 100,
        realRoas: Math.round(realRoas * 100) / 100,
      },
      status: "new",
      createdAt: nowIso,
    });
  }

  // ---------------------------------------------------------------------------
  // REGRA 2: READY_TO_SCALE (Oportunidade de Escala Lucrativa)
  // ---------------------------------------------------------------------------
  const hasScaleVolume = campaign.atmOrders >= 5 && campaign.spend >= 100;
  const isHighRoas =
    realRoas >= 2.5 &&
    (accountAvg.avgRoas <= 0 || realRoas >= accountAvg.avgRoas * 1.35);
  const isLowCpa =
    accountAvg.avgCpa <= 0 || realCpa <= accountAvg.avgCpa * 0.75;

  if (hasScaleVolume && isHighRoas && isLowCpa) {
    alerts.push({
      storeId,
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      type: "READY_TO_SCALE",
      severity: "critical",
      title: "Campanha Pronta para Escala Segura",
      description: `ROAS real de ${realRoas.toFixed(2)}x com CPA de R$ ${realCpa.toFixed(2)} (significativamente melhor que a média da conta).`,
      suggestedAction: "Aumentar orçamento diário em 15% a 20% com segurança contábil comprovada.",
      metrics: {
        realRoas: Math.round(realRoas * 100) / 100,
        accountAvgRoas: Math.round(accountAvg.avgRoas * 100) / 100,
        realCpa: Math.round(realCpa * 100) / 100,
        accountAvgCpa: Math.round(accountAvg.avgCpa * 100) / 100,
        atmOrders: campaign.atmOrders,
        spend: Math.round(campaign.spend * 100) / 100,
        atmRevenue: Math.round(campaign.atmRevenue * 100) / 100,
      },
      status: "new",
      createdAt: nowIso,
    });
  }

  // ---------------------------------------------------------------------------
  // REGRA 3: CAMPAIGN_DECAY (Sangramento / Queda de Eficiência)
  // ---------------------------------------------------------------------------
  if (
    campaign.previousSpend !== undefined &&
    campaign.previousRevenue !== undefined &&
    campaign.previousSpend > 0 &&
    campaign.spend >= 150
  ) {
    const spendDelta = (campaign.spend - campaign.previousSpend) / campaign.previousSpend;
    const revDelta = campaign.previousRevenue > 0
      ? (campaign.atmRevenue - campaign.previousRevenue) / campaign.previousRevenue
      : -1;

    const isBleeding = spendDelta >= 0.25 && revDelta <= -0.20 && realRoas < 1.15;

    if (isBleeding) {
      alerts.push({
        storeId,
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        type: "CAMPAIGN_DECAY",
        severity: "critical",
        title: "Sangramento Financeiro Detectado",
        description: `Gasto aumentou +${Math.round(spendDelta * 100)}% enquanto a receita caiu ${Math.round(revDelta * 100)}% (ROAS atual: ${realRoas.toFixed(2)}x).`,
        suggestedAction: "Reduzir orçamento imediatamente ou pausar conjuntos não lucrativos para estancar perdas.",
        metrics: {
          realRoas: Math.round(realRoas * 100) / 100,
          spend: Math.round(campaign.spend * 100) / 100,
          atmRevenue: Math.round(campaign.atmRevenue * 100) / 100,
          spendDeltaPercent: Math.round(spendDelta * 100),
          revenueDeltaPercent: Math.round(revDelta * 100),
        },
        status: "new",
        createdAt: nowIso,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // REGRA 4: CREATIVE_FATIGUE (Saturação / Fadiga de Criativo)
  // ---------------------------------------------------------------------------
  if (
    campaign.impressions >= 2500 &&
    campaign.previousCtr !== undefined &&
    campaign.previousFrequency !== undefined &&
    campaign.previousCtr > 0
  ) {
    const ctrDelta = (campaign.ctr - campaign.previousCtr) / campaign.previousCtr;
    const freqDelta = (campaign.frequency - campaign.previousFrequency) / Math.max(1, campaign.previousFrequency);
    const cpaDelta = campaign.previousCpa && campaign.previousCpa > 0 && realCpa > 0
      ? (realCpa - campaign.previousCpa) / campaign.previousCpa
      : 0;

    const isFatigued =
      (campaign.frequency >= 2.8 || freqDelta >= 0.30) &&
      ctrDelta <= -0.25 &&
      (cpaDelta >= 0.30 || realCpa > (accountAvg.avgCpa || 50));

    if (isFatigued) {
      alerts.push({
        storeId,
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        type: "CREATIVE_FATIGUE",
        severity: "warning",
        title: "Fadiga de Criativo & Saturação de Público",
        description: `Frequência atingiu ${campaign.frequency.toFixed(2)} e CTR caiu ${Math.round(ctrDelta * 100)}%, elevando o custo de aquisição.`,
        suggestedAction: "Substituir criativos saturados e renovar ganchos visuais antes de injetar mais verba.",
        metrics: {
          frequency: Math.round(campaign.frequency * 100) / 100,
          frequencyDeltaPercent: Math.round(freqDelta * 100),
          ctr: Math.round(campaign.ctr * 100) / 100,
          ctrDeltaPercent: Math.round(ctrDelta * 100),
          cpaDeltaPercent: Math.round(cpaDelta * 100),
          realCpa: Math.round(realCpa * 100) / 100,
        },
        status: "new",
        createdAt: nowIso,
      });
    }
  }

  return alerts;
}

/**
 * Executa a análise contábil completa para todas as campanhas de uma loja,
 * combinando os dados do revenue_ledger com os dados da Meta.
 */
export async function runStoreIntelligenceAnalysis(
  storeId: string,
  options?: { windowDays?: number }
): Promise<{
  alerts: CampaignAlert[];
  summary: IntelligenceSummary;
}> {
  const supabase = createAdminClient();
  const windowDays = options?.windowDays || 7;
  const now = new Date();
  const startDate = new Date(now.getTime() - windowDays * 86400 * 1000).toISOString();
  const endDate = now.toISOString();

  // 1. Busca dados contábeis consolidados do public.revenue_ledger
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from("revenue_ledger")
    .select("order_id, campaign_id, campaign_name, source, attributed_revenue, is_recovered, order_paid_at")
    .eq("store_id", storeId)
    .eq("attribution_model", "last_click")
    .gte("order_paid_at", startDate)
    .lte("order_paid_at", endDate);

  if (ledgerErr) {
    console.error("[Intelligence Engine] Erro ao consultar revenue_ledger:", ledgerErr.message);
  }

  // Agrega por campanha no ATM
  const atmCampaignMap = new Map<string, { name: string; revenue: number; ordersSet: Set<string> }>();

  let totalAccountRevenue = 0;
  let totalAccountOrdersSet = new Set<string>();

  (ledgerRows || []).forEach((row) => {
    const cId = row.campaign_id || "no_campaign";
    const rev = Number(row.attributed_revenue) || 0;
    const oId = String(row.order_id);

    totalAccountRevenue += rev;
    totalAccountOrdersSet.add(oId);

    let camp = atmCampaignMap.get(cId);
    if (!camp) {
      camp = { name: row.campaign_name || "Sem Nome", revenue: 0, ordersSet: new Set<string>() };
      atmCampaignMap.set(cId, camp);
    }
    camp.revenue += rev;
    camp.ordersSet.add(oId);
  });

  // 2. Busca campanhas e métricas da plataforma Meta via integration
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("store_id", storeId)
    .eq("platform", "meta")
    .eq("status", "active")
    .maybeSingle();

  const token = integration?.access_token_enc || process.env.META_ACCESS_TOKEN || "";
  const configuredAccounts: string[] = integration?.config?.ad_account_ids || [];

  const platformCampaignMap = new Map<string, {
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    frequency: number;
    purchases: number;
  }>();

  let totalAccountSpend = 0;

  // Consulta Meta Graph API se houver token e contas
  if (token && configuredAccounts.length > 0) {
    for (const accId of configuredAccounts) {
      const formattedAccId = accId.startsWith("act_") ? accId : `act_${accId}`;
      try {
        const sinceStr = new Date(now.getTime() - windowDays * 86400 * 1000).toISOString().slice(0, 10);
        const untilStr = now.toISOString().slice(0, 10);
        const timeRangeParam = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

        const res = await fetch(
          `https://graph.facebook.com/v23.0/${formattedAccId}/insights?level=campaign&time_range=${timeRangeParam}&fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,frequency,actions&limit=100&access_token=${token}`,
          { cache: "no-store" }
        );

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            for (const item of data.data) {
              const cId = String(item.campaign_id);
              const sp = Number(item.spend || 0);
              const imp = Number(item.impressions || 0);
              const clk = Number(item.clicks || 0);
              const ctr = Number(item.ctr || 0);
              const freq = Number(item.frequency || 1);

              let purchases = 0;
              if (Array.isArray(item.actions)) {
                const pAction = item.actions.find(
                  (a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase"
                );
                if (pAction) purchases = Number(pAction.value || 0);
              }

              totalAccountSpend += sp;
              platformCampaignMap.set(cId, {
                name: item.campaign_name || "Campanha Meta",
                spend: sp,
                impressions: imp,
                clicks: clk,
                ctr,
                frequency: freq,
                purchases,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Intelligence Engine] Erro ao consultar Meta para conta ${formattedAccId}:`, err);
      }
    }
  }

  // Médias da conta
  const totalAccountOrders = totalAccountOrdersSet.size;
  const avgRoas = totalAccountSpend > 0 ? totalAccountRevenue / totalAccountSpend : 0;
  const avgCpa = totalAccountOrders > 0 && totalAccountSpend > 0 ? totalAccountSpend / totalAccountOrders : 0;

  // 3. Monta insumos consolidados e aplica as regras matemáticas
  const allCampaignIds = new Set([...Array.from(atmCampaignMap.keys()), ...Array.from(platformCampaignMap.keys())]);
  const generatedAlerts: CampaignAlert[] = [];

  for (const cId of allCampaignIds) {
    if (cId === "no_campaign" || !cId) continue;

    const atmData = atmCampaignMap.get(cId) || { name: "", revenue: 0, ordersSet: new Set<string>() };
    const metaData = platformCampaignMap.get(cId) || {
      name: atmData.name || "Campanha",
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      frequency: 1,
      purchases: 0,
    };

    const input: CampaignAnalysisInput = {
      campaignId: cId,
      campaignName: atmData.name || metaData.name || `Campanha ${cId}`,
      atmOrders: atmData.ordersSet.size,
      atmRevenue: atmData.revenue,
      platformOrders: metaData.purchases,
      spend: metaData.spend,
      impressions: metaData.impressions,
      clicks: metaData.clicks,
      ctr: metaData.ctr,
      frequency: metaData.frequency,
    };

    const campaignAlerts = evaluateCampaignRules(
      input,
      { avgRoas, avgCpa },
      storeId
    );

    generatedAlerts.push(...campaignAlerts);
  }

  // 4. Salva alertas no banco (se a tabela campaign_intelligence_alerts existir)
  if (generatedAlerts.length > 0) {
    try {
      const inserts = generatedAlerts.map((a) => ({
        store_id: a.storeId,
        campaign_id: a.campaignId,
        campaign_name: a.campaignName,
        alert_type: a.type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        suggested_action: a.suggestedAction,
        metrics: a.metrics,
        status: a.status,
      }));

      const { error: upsertErr } = await supabase
        .from("campaign_intelligence_alerts")
        .upsert(inserts, {
          onConflict: "store_id,campaign_id,alert_type,status",
          ignoreDuplicates: true,
        });

      if (upsertErr) {
        // Se a tabela ainda não foi criada no Supabase via SQL Editor, apenas loga e não quebra a resposta
        console.warn("[Intelligence Engine] Tabela campaign_intelligence_alerts ainda não criada no banco. Retornando alertas em memória.");
      }
    } catch (e) {
      console.warn("[Intelligence Engine] Falha ao persistir alertas no banco:", e);
    }
  }

  // 5. Compila o sumário executivo
  const summary: IntelligenceSummary = {
    totalAlerts: generatedAlerts.length,
    critical: generatedAlerts.filter((a) => a.severity === "critical").length,
    warning: generatedAlerts.filter((a) => a.severity === "warning").length,
    info: generatedAlerts.filter((a) => a.severity === "info").length,
    hiddenRevenue: generatedAlerts
      .filter((a) => a.type === "UNDER_REPORTED_CAMPAIGN")
      .reduce((sum, a) => sum + (a.metrics.atmRevenue || 0), 0),
    scaleOpportunities: generatedAlerts.filter((a) => a.type === "READY_TO_SCALE").length,
    decayCampaigns: generatedAlerts.filter((a) => a.type === "CAMPAIGN_DECAY").length,
    fatiguedCreatives: generatedAlerts.filter((a) => a.type === "CREATIVE_FATIGUE").length,
  };

  return {
    alerts: generatedAlerts,
    summary,
  };
}
