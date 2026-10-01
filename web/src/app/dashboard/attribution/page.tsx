"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  RotateCw,
  Calendar,
  Layers,
  AlertCircle,
  Code2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { AttributionCards } from "@/components/attribution/AttributionCards";
import {
  AttributionModelSelector,
  AttributionModel,
} from "@/components/attribution/AttributionModelSelector";
import {
  AttributionCampaignRanking,
  CampaignMetricItem,
} from "@/components/attribution/AttributionCampaignRanking";
import { AttributionInsights } from "@/components/attribution/AttributionInsights";
import { AttributionPeriodSummary } from "@/components/attribution/AttributionPeriodSummary";
import { AttributionOpportunities } from "@/components/attribution/AttributionOpportunities";
import { DecisionSummaryCard } from "@/components/attribution/DecisionSummaryCard";
import { AttributionExplanationModal } from "@/components/attribution/AttributionExplanationModal";
import { AttributionQuickActions } from "@/components/attribution/AttributionQuickActions";
import { AttributionConfidenceCard } from "@/components/attribution/AttributionConfidenceCard";
import { DecisionHistoryCard } from "@/components/attribution/DecisionHistoryCard";
import { GrowthRecommendations } from "@/components/attribution/GrowthRecommendations";
import { AttributionTrendCard } from "@/components/attribution/AttributionTrendCard";
import { BudgetImpactSimulator } from "@/components/attribution/BudgetImpactSimulator";
import { ExecutiveHeroBanner, PrimaryOpportunity } from "@/components/attribution/ExecutiveHeroBanner";
import { CockpitSection } from "@/components/attribution/CockpitSection";
import { AttributionAlerts } from "@/components/attribution/AttributionAlerts";
import { AttributionComparisonCard } from "@/components/attribution/AttributionComparisonCard";
import { ActionConfirmationModal } from "@/components/attribution/ActionConfirmationModal";
import { ActionCenterCard } from "@/components/attribution/ActionCenterCard";
import { CampaignAction } from "@/lib/intelligence/campaign-action-engine";

type WindowPreset = "1d" | "7d" | "30d" | "custom";
type ViewMode = "executive" | "analyst";

interface MetricsResponse {
  ok: boolean;
  storeId: string;
  attributionModel: AttributionModel;
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    recoveredRevenue: number;
    assistedConversions: number;
    totalTouchpoints: number;
  };
  campaigns: CampaignMetricItem[];
  latencyMs?: number;
  error?: string;
}

export default function AttributionDashboardPage() {
  const { activeStore } = useStore();

  const [model, setModel] = useState<AttributionModel>("last_click");
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("executive");
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  // Estados para Action Bridge & Governança (Oitava Camada)
  const [selectedActionModal, setSelectedActionModal] = useState<CampaignAction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [actionsList, setActionsList] = useState<CampaignAction[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricsData, setMetricsData] = useState<MetricsResponse | null>(null);
  const [spendAmount, setSpendAmount] = useState<number | null>(null);

  const modelSelectorRef = useRef<HTMLDivElement | null>(null);
  const rankingRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const showTechnicalDetails = viewMode === "analyst";

  // Calcula datas ISO a partir do preset selecionado alinhadas por dia civil
  const getDateRange = useCallback((): { startDate: string; endDate: string } => {
    const now = new Date();

    if (windowPreset === "custom" && customStart && customEnd) {
      const s = new Date(customStart);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      return {
        startDate: s.toISOString(),
        endDate: e.toISOString(),
      };
    }

    let daysToSubtract = 7;
    if (windowPreset === "1d") daysToSubtract = 0;
    if (windowPreset === "30d") daysToSubtract = 30;

    const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToSubtract, 0, 0, 0, 0);
    const startDate = startLocal.toISOString();
    const endDate = now.toISOString();

    return { startDate, endDate };
  }, [windowPreset, customStart, customEnd]);

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (!activeStore?.id) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const { startDate, endDate } = getDateRange();

      try {
        const metricsPromise = fetch(
          `/api/v1/attribution/metrics?store_id=${encodeURIComponent(
            activeStore.id
          )}&model=${encodeURIComponent(model)}&startDate=${encodeURIComponent(
            startDate
          )}&endDate=${encodeURIComponent(endDate)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        ).then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
          return res.json();
        });

        const legacyPreset =
          windowPreset === "1d"
            ? "today"
            : windowPreset === "7d"
            ? "last_7d"
            : windowPreset === "30d"
            ? "last_30d"
            : null;

        const spendPromise = legacyPreset
          ? fetch(
              `/api/v1/dashboard/metrics?store_id=${encodeURIComponent(
                activeStore.id
              )}&date_preset=${encodeURIComponent(legacyPreset)}`,
              {
                signal: controller.signal,
                cache: "no-store",
              }
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null);

        const actionsPromise = fetch(
          `/api/v1/intelligence/actions?store_id=${encodeURIComponent(activeStore.id)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const [metricsRes, spendRes, actionsRes] = await Promise.all([
          metricsPromise,
          spendPromise,
          actionsPromise,
        ]);

        if (metricsRes.ok) {
          setMetricsData(metricsRes);
        } else {
          setError(metricsRes.error || "Falha ao carregar métricas de vendas");
        }

        if (spendRes?.ok && typeof spendRes.metrics?.ad_spend === "number" && spendRes.metrics.ad_spend > 0) {
          setSpendAmount(spendRes.metrics.ad_spend);
        } else {
          setSpendAmount(null);
        }

        if (actionsRes?.ok && Array.isArray(actionsRes.actions)) {
          setActionsList(actionsRes.actions);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("[Attribution Dashboard] Erro:", err);
        setError(err.message || "Erro de conexão com o servidor de inteligência");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeStore?.id, model, getDateRange, windowPreset]
  );

  useEffect(() => {
    loadData(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);

  // Cálculos derivados
  const totalRev = metricsData?.metrics?.totalRevenue ?? 0;
  const totalOrders = metricsData?.metrics?.totalOrders ?? 0;
  const recoveredRev = metricsData?.metrics?.recoveredRevenue ?? 0;
  const assistedConv = metricsData?.metrics?.assistedConversions ?? 0;
  const totalTouchpoints = metricsData?.metrics?.totalTouchpoints ?? 0;
  const campaignsList = metricsData?.campaigns ?? [];
  const topCampaign = campaignsList.length > 0 ? campaignsList[0] : null;

  const realRoas =
    spendAmount !== null && spendAmount > 0 && totalRev > 0
      ? totalRev / spendAmount
      : null;

  const realCpa =
    spendAmount !== null && spendAmount > 0 && totalOrders > 0
      ? spendAmount / totalOrders
      : null;

  const modelLabels: Record<AttributionModel, string> = {
    last_click: "Último anúncio antes da compra",
    first_click: "Primeiro contato",
    linear: "Divisão equilibrada",
    u_shaped: "Modelo inteligente ATM",
  };

  /**
   * Função centralizada para calcular a oportunidade prioritária sem conflitos
   */
  const calculatePrimaryOpportunity = useCallback((): PrimaryOpportunity | null => {
    if (!campaignsList || campaignsList.length === 0) return null;

    const topRevenue = [...campaignsList].sort((a, b) => b.attributedRevenue - a.attributedRevenue)[0];
    if (topRevenue && topRevenue.attributedRevenue > 0 && topRevenue.ordersCount >= 2) {
      const topRoas = spendAmount && spendAmount > 0 ? topRevenue.attributedRevenue / (spendAmount / campaignsList.length) : undefined;
      return {
        title: "Campanha com maior potencial de escala",
        campaign: topRevenue.campaignName,
        reason: `Responsável por trazer o maior faturamento do período (R$ ${topRevenue.attributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        action: "Aumentar o investimento em 10% a 20% para potencializar a escala sem perder ROI.",
        priority: "high",
        conversionsCount: topRevenue.ordersCount,
        roasValue: topRoas,
        revenueAmount: topRevenue.attributedRevenue,
        campaignId: topRevenue.campaignId || undefined,
      };
    }

    const topAssisted = [...campaignsList].sort((a, b) => b.assistedCount - a.assistedCount)[0];
    if (topAssisted && topAssisted.assistedCount > 0) {
      return {
        title: "Campanha decisiva na jornada de compra",
        campaign: topAssisted.campaignName,
        reason: `Participou e auxiliou na decisão de ${topAssisted.assistedCount} vendas em outros canais.`,
        action: "Manter ativa e testar novos criativos para reforçar a consideração da marca.",
        priority: "medium",
        conversionsCount: topAssisted.assistedCount,
        revenueAmount: topAssisted.attributedRevenue,
        campaignId: topAssisted.campaignId || undefined,
      };
    }

    return null;
  }, [campaignsList, spendAmount]);

  const primaryOpportunity = useMemo(() => calculatePrimaryOpportunity(), [calculatePrimaryOpportunity]);

  // Listas filtradas para o Action Center Card
  const pendingActions = useMemo(() => actionsList.filter((a) => a.status === "recommended" || a.status === "approved"), [actionsList]);
  const executedActions = useMemo(() => actionsList.filter((a) => a.status === "executed"), [actionsList]);
  const rolledBackActions = useMemo(() => actionsList.filter((a) => a.status === "rolled_back"), [actionsList]);

  /**
   * Fluxo da Sétima/Oitava Camada: Busca proposta oficial vinda do Backend antes de abrir o modal
   */
  const handleReviewAction = async (campaignName: string, campaignId?: string) => {
    if (!activeStore?.id) return;

    try {
      const res = await fetch(`/api/v1/intelligence/actions?store_id=${encodeURIComponent(activeStore.id)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      let matchedAction: CampaignAction | null = null;

      if (data.ok && Array.isArray(data.actions) && data.actions.length > 0) {
        matchedAction = data.actions.find(
          (a: CampaignAction) =>
            a.campaignName.toLowerCase() === campaignName.toLowerCase() ||
            (campaignId && a.campaignId === campaignId)
        );
      }

      if (!matchedAction) {
        const estimatedSpend = spendAmount ? spendAmount / (campaignsList.length || 1) : 100;
        matchedAction = {
          id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          storeId: activeStore.id,
          campaignId: campaignId || `camp_${Date.now()}`,
          campaignName,
          actionType: "SCALE_BUDGET_PERCENT",
          executionMode: "assisted",
          autopilotEnabled: false,
          status: "recommended",
          previousValue: Math.round(estimatedSpend),
          targetValue: Math.round(estimatedSpend * 1.1),
          previousSnapshot: { daily_budget: Math.round(estimatedSpend) },
          targetSnapshot: { daily_budget: Math.round(estimatedSpend * 1.1) },
          reason: `Recomendação de escala assistida (+10%) baseada no alto desempenho de receita e ROAS do período.`,
          createdAt: new Date().toISOString(),
        };
      }

      setSelectedActionModal(matchedAction);
      setIsModalOpen(true);
    } catch (err) {
      console.warn("[Attribution Action Bridge] Falha ao consultar backend /actions:", err);
    }
  };

  const handleReviewExistingAction = (action: CampaignAction) => {
    setSelectedActionModal(action);
    setIsModalOpen(true);
  };

  /**
   * Processamento da aprovação no Backend via POST /api/v1/intelligence/actions/execute
   */
  const handleApproveAction = async (actionId: string, idempotencyKey: string) => {
    if (!activeStore?.id || !selectedActionModal) return;

    try {
      setSelectedActionModal((prev) => (prev ? { ...prev, status: "executing" } : null));

      const res = await fetch("/api/v1/intelligence/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: activeStore.id,
          action_id: actionId,
          idempotency_key: idempotencyKey,
          decision: "approve",
        }),
      });

      const data = await res.json();

      if (data.ok) {
        const updatedAction: CampaignAction = {
          ...selectedActionModal,
          status: "executed",
          appliedValue: data.action?.applied_value || selectedActionModal.targetValue,
          executedAt: new Date().toISOString(),
          approvedBy: "Administrador da Loja",
        };

        setSelectedActionModal(updatedAction);
        setActionsList((prev) => [updatedAction, ...prev.filter((a) => a.id !== actionId)]);
      } else {
        setSelectedActionModal((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                errorMessage: data.error || "Falha ao aplicar alteração na API da Meta.",
              }
            : null
        );
      }
    } catch (err: any) {
      setSelectedActionModal((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              errorMessage: err.message || "Erro de comunicação durante a execução.",
            }
          : null
      );
    }
  };

  const handleRejectAction = async (actionId: string, idempotencyKey: string) => {
    if (!activeStore?.id) return;
    try {
      await fetch("/api/v1/intelligence/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: activeStore.id,
          action_id: actionId,
          idempotency_key: idempotencyKey,
          decision: "reject",
        }),
      });
      setActionsList((prev) => prev.filter((a) => a.id !== actionId));
    } catch (e) {
      console.warn("[Attribution Action Bridge] Erro ao descartar:", e);
    }
  };

  const handleRollbackAction = async (actionId: string) => {
    if (!activeStore?.id) return;
    try {
      const res = await fetch("/api/v1/intelligence/actions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: activeStore.id,
          action_id: actionId,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSelectedActionModal((prev) => (prev ? { ...prev, status: "rolled_back" } : null));
        setActionsList((prev) =>
          prev.map((a) => (a.id === actionId ? { ...a, status: "rolled_back" } : a))
        );
      }
    } catch (e) {
      console.warn("[Attribution Action Bridge] Erro ao reverter:", e);
    }
  };

  const scrollToModels = () => {
    if (modelSelectorRef.current) {
      modelSelectorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const scrollToRanking = (campaignName?: string) => {
    if (rankingRef.current) {
      rankingRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-4 fade-in select-none text-zinc-100">
      {/* Modal Explicativo da Jornada do Cliente */}
      <AttributionExplanationModal
        isOpen={isExplanationOpen}
        onClose={() => setIsExplanationOpen(false)}
      />

      {/* Modal de Confirmação Assistida do Action Engine */}
      <ActionConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        action={selectedActionModal}
        onApprove={handleApproveAction}
        onReject={handleRejectAction}
        onRollback={handleRollbackAction}
      />

      {/* ── TOPO: Selo ATM Intelligence com subtítulo oficial ──────────── */}
      <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-purple-950/40 border border-purple-500/30 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <Sparkles className="w-5 h-5 text-purple-300 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              ATM Intelligence
              <span className="text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold uppercase">
                Operador de Mídia Assistido
              </span>
            </h1>
            <p className="text-xs text-purple-200/90 font-medium">
              Seu centro de decisão para campanhas, vendas e crescimento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-semibold flex-wrap">
          <div className="bg-[#161B26] border border-zinc-800 p-0.5 rounded-lg flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode("executive")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                viewMode === "executive"
                  ? "bg-purple-600 text-white shadow-sm font-bold"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              Modo Executivo
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analyst")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                viewMode === "analyst"
                  ? "bg-purple-600 text-white shadow-sm font-bold"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Code2 size={12} />
              <span>Modo Analista</span>
            </button>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-800 text-white font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={13} className={cn(refreshing && "animate-spin text-purple-400")} />
            <span>{refreshing ? "Atualizando..." : "Atualizar"}</span>
          </button>
        </div>
      </div>

      {/* ── Toolbar de Período Analisado ─────────────────────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mr-2">
            <Calendar size={14} className="text-zinc-500" />
            <span>Período analisado:</span>
          </div>

          {(["1d", "7d", "30d", "custom"] as WindowPreset[]).map((preset) => {
            const labels: Record<WindowPreset, string> = {
              "1d": "Hoje",
              "7d": "Últimos 7 dias",
              "30d": "Últimos 30 dias",
              custom: "Personalizado",
            };

            const isSel = windowPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setWindowPreset(preset)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
                  isSel
                    ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(147,51,234,0.3)] font-bold"
                    : "bg-[#161B26] border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700"
                )}
              >
                {labels[preset]}
              </button>
            );
          })}
        </div>

        {windowPreset === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-[#161B26] border border-zinc-800 text-zinc-200 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60"
            />
            <span className="text-zinc-500">até</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-[#161B26] border border-zinc-800 text-zinc-200 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60"
            />
            <button
              onClick={() => loadData(false)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(false)}
            className="underline font-bold hover:text-white cursor-pointer ml-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── SEÇÃO 1: Resumo Executivo (Foco em leitura em 30 segundos) ──── */}
      <div className="space-y-4">
        <AttributionCards
          loading={loading}
          totalRevenue={totalRev}
          recoveredRevenue={recoveredRev}
          totalOrders={totalOrders}
          assistedConversions={assistedConv}
          realRoas={realRoas}
          realCpa={realCpa}
          modelLabel={modelLabels[model]}
          showTechnicalDetails={showTechnicalDetails}
        />

        <AttributionPeriodSummary
          loading={loading}
          totalRevenue={totalRev}
          spendAmount={spendAmount}
          realRoas={realRoas}
          topCampaign={topCampaign}
          modelLabel={modelLabels[model]}
        />
      </div>

      {/* ── Action Center da Oitava Camada (Pendentes, Executadas, Revertidas) ── */}
      <ActionCenterCard
        pendingActions={pendingActions}
        executedActions={executedActions}
        rolledBackActions={rolledBackActions}
        onReviewAction={handleReviewExistingAction}
        onRollbackAction={handleRollbackAction}
      />

      {/* ── SEÇÃO 2: Alertas Importantes & Diagnóstico de Tendência ────── */}
      <AttributionAlerts
        campaigns={campaignsList}
        totalRevenue={totalRev}
        spendAmount={spendAmount}
        onSelectCampaign={(name) => scrollToRanking(name)}
      />

      {/* ── SEÇÃO 3: Decisão Recomendada & Oportunidades ───────────────── */}
      <ExecutiveHeroBanner
        opportunity={primaryOpportunity}
        onActionClick={(campaignName) => scrollToRanking(campaignName)}
        onReviewAction={(cName, cId) => handleReviewAction(cName, cId)}
      />

      <AttributionComparisonCard
        currentRevenue={totalRev}
        currentOrders={totalOrders}
        currentRoas={realRoas}
      />

      {/* ── SEÇÃO 4: O que devo fazer agora? ─────────────────────────── */}
      <CockpitSection
        title="O que devo fazer agora?"
        description="Central de decisão rápida e oportunidades de escala acionáveis"
        badge="Decisões Recomendadas"
        defaultOpen={true}
        mode={viewMode}
      >
        <GrowthRecommendations
          campaigns={campaignsList.map((c) => ({
            id: c.campaignId || c.campaignName,
            name: c.campaignName,
            spend: c.spend || (spendAmount ? spendAmount / campaignsList.length : 0),
            revenue: c.attributedRevenue,
            conversions: c.ordersCount,
            roas: c.spend && c.spend > 0 ? c.attributedRevenue / c.spend : c.attributedRevenue > 0 ? 2 : 0,
          }))}
          onSelectCampaign={(name) => scrollToRanking(name)}
          onReviewAction={(cName, cId) => handleReviewAction(cName, cId)}
        />

        <AttributionOpportunities
          campaigns={campaignsList}
          totalRevenue={totalRev}
          recoveredRevenue={recoveredRev}
          totalOrders={totalOrders}
          assistedConversions={assistedConv}
          spendAmount={spendAmount}
          realRoas={realRoas}
          modelLabel={modelLabels[model]}
          onAnalyzeJourney={() => scrollToRanking()}
        />

        <AttributionQuickActions
          onSelectFilter={() => scrollToRanking()}
          onScrollToModels={scrollToModels}
        />

        <BudgetImpactSimulator
          currentSpend={spendAmount || 0}
          currentRevenue={totalRev}
          currentConversions={totalOrders}
          currentRoas={realRoas || 0}
        />
      </CockpitSection>

      {/* ── SEÇÃO 5: Análise detalhada (Oculto no Modo Executivo por padrão) ─ */}
      <CockpitSection
        title="Análise detalhada"
        description="Ranking individual de campanhas, modelos de atribuição e auditoria avançada"
        badge={viewMode === "analyst" ? "Modo Analista Ativo" : "Detalhes Técnicos"}
        defaultOpen={viewMode === "analyst"}
        mode={viewMode}
      >
        <DecisionSummaryCard
          loading={loading}
          totalRevenue={totalRev}
          totalOrders={totalOrders}
          realRoas={realRoas}
          spendAmount={spendAmount}
          topCampaign={topCampaign}
          modelLabel={modelLabels[model]}
        />

        <AttributionConfidenceCard
          totalOrders={totalOrders}
          totalTouchpoints={totalTouchpoints}
          campaignsCount={campaignsList.length}
          modelLabel={modelLabels[model]}
        />

        <div ref={rankingRef}>
          <AttributionCampaignRanking
            campaigns={campaignsList}
            totalRevenue={totalRev}
            loading={loading}
            spendAmount={spendAmount}
            showTechnicalDetails={showTechnicalDetails}
          />
        </div>

        <div ref={modelSelectorRef}>
          <AttributionModelSelector
            selectedModel={model}
            onChange={(m) => setModel(m)}
            disabled={loading}
            showTechnicalDetails={showTechnicalDetails}
            onOpenExplanation={() => setIsExplanationOpen(true)}
          />
        </div>

        <AttributionInsights
          totalRevenue={totalRev}
          recoveredRevenue={recoveredRev}
          totalOrders={totalOrders}
          assistedConversions={assistedConv}
          campaigns={campaignsList}
          modelLabel={modelLabels[model]}
        />

        <DecisionHistoryCard
          currentRecommendation={
            primaryOpportunity ? `${primaryOpportunity.title}: ${primaryOpportunity.campaign}` : undefined
          }
        />
      </CockpitSection>
    </div>
  );
}
