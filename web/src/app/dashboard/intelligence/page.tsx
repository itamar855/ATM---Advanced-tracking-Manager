"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  RotateCw,
  Calendar,
  BrainCircuit,
  AlertCircle,
  Sparkles,
  Zap,
  History,
  Sliders,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { IntelligenceAlertCards } from "@/components/intelligence/IntelligenceAlertCards";
import { IntelligenceAlertList } from "@/components/intelligence/IntelligenceAlertList";
import { IntelligenceAIAnalyst } from "@/components/intelligence/IntelligenceAIAnalyst";
import { IntelligenceActionQueue } from "@/components/intelligence/IntelligenceActionQueue";
import { IntelligenceActionHistory } from "@/components/intelligence/IntelligenceActionHistory";
import { IntelligenceSettingsModal } from "@/components/intelligence/IntelligenceSettingsModal";
import { CampaignAlert, IntelligenceSummary } from "@/lib/intelligence/campaign-alert-engine";
import { CampaignAction } from "@/lib/intelligence/campaign-action-engine";

type WindowDaysOption = 3 | 7 | 14 | 30;
type DashboardTab = "actions" | "alerts";

interface AlertsApiResponse {
  ok: boolean;
  storeId: string;
  summary: IntelligenceSummary;
  alerts: CampaignAlert[];
  latencyMs?: number;
  error?: string;
}

export default function IntelligenceDashboardPage() {
  const { activeStore } = useStore();

  const [activeTab, setActiveTab] = useState<DashboardTab>("actions");
  const [windowDays, setWindowDays] = useState<WindowDaysOption>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alertsData, setAlertsData] = useState<AlertsApiResponse | null>(null);
  const [actions, setActions] = useState<CampaignAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Carrega ações geradas / fila de aprovação
  const loadActions = useCallback(async () => {
    if (!activeStore?.id) return;
    setActionsLoading(true);
    try {
      const res = await fetch(`/api/v1/intelligence/actions?store_id=${encodeURIComponent(activeStore.id)}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.actions)) {
        setActions(data.actions);
      }
    } catch (err) {
      console.warn("[Intelligence Dashboard] Falha ao carregar ações:", err);
    } finally {
      setActionsLoading(false);
    }
  }, [activeStore?.id]);

  // Carrega alertas analíticos do motor da Fase 6
  const loadAlerts = useCallback(
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

      try {
        const refreshParam = isManualRefresh ? "&refresh=true" : "";
        const res = await fetch(
          `/api/v1/intelligence/alerts?store_id=${encodeURIComponent(
            activeStore.id
          )}&windowDays=${windowDays}${refreshParam}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }

        const data: AlertsApiResponse = await res.json();
        if (data.ok) {
          setAlertsData(data);
        } else {
          setError(data.error || "Falha ao carregar alertas de inteligência");
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("[Intelligence Dashboard] Erro:", err);
        setError(err.message || "Erro de conexão com o motor de inteligência");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeStore?.id, windowDays]
  );

  useEffect(() => {
    loadAlerts(false);
    loadActions();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadAlerts, loadActions]);

  const summary = alertsData?.summary || {
    totalAlerts: 0,
    critical: 0,
    warning: 0,
    info: 0,
    hiddenRevenue: 0,
    scaleOpportunities: 0,
    decayCampaigns: 0,
    fatiguedCreatives: 0,
  };

  const alertsList = alertsData?.alerts || [];
  const pendingActionsCount = actions.filter((a) => a.status === "recommended").length;

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-4 fade-in select-none text-zinc-100">
      {/* ── 1. Header Superior ───────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <BrainCircuit size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Attribution Intelligence & Action Engine
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                FASE 7
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Detecção contábil preditiva e intervenção controlada nos anúncios com aprovação humana obrigatória.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-semibold">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Sliders size={13} className="text-amber-400" />
            <span>Guardrails & Segurança</span>
          </button>

          <button
            onClick={() => {
              loadAlerts(true);
              loadActions();
            }}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-800 text-white font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={13} className={cn(refreshing && "animate-spin text-amber-400")} />
            <span>{refreshing ? "Atualizando..." : "Sincronizar"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Navegação em Abas & Seletor de Período ─────────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 shadow-md">
        {/* Abas */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("actions")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === "actions"
                ? "bg-amber-600 border-amber-500 text-white shadow-[0_0_12px_rgba(217,119,6,0.3)]"
                : "bg-[#161B26] border-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            <Zap size={13} />
            <span>Ações & Execuções</span>
            {pendingActionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-emerald-500 text-black ml-1">
                {pendingActionsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === "alerts"
                ? "bg-amber-600 border-amber-500 text-white shadow-[0_0_12px_rgba(217,119,6,0.3)]"
                : "bg-[#161B26] border-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            <Bell size={13} />
            <span>Alertas Analíticos</span>
            {alertsList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 ml-1">
                {alertsList.length}
              </span>
            )}
          </button>
        </div>

        {/* Janela de Análise */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Calendar size={13} className="text-zinc-500 mr-1" />
          {([3, 7, 14, 30] as WindowDaysOption[]).map((days) => {
            const labels: Record<WindowDaysOption, string> = {
              3: "3D",
              7: "7D",
              14: "14D",
              30: "30D",
            };
            const isSel = windowDays === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer",
                  isSel
                    ? "bg-zinc-700 border-zinc-600 text-white font-bold"
                    : "bg-[#161B26] border-zinc-800/80 text-zinc-400 hover:text-white"
                )}
              >
                {labels[days]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Mensagem de Erro se houver ──────────────────────────── */}
      {error && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadAlerts(false)}
            className="underline font-bold hover:text-white cursor-pointer ml-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── 4. KPI Cards de Oportunidades & Riscos ───────────────────── */}
      <IntelligenceAlertCards
        loading={loading}
        scaleOpportunities={summary.scaleOpportunities}
        decayCampaigns={summary.decayCampaigns}
        hiddenRevenue={summary.hiddenRevenue}
        fatiguedCreatives={summary.fatiguedCreatives}
      />

      {/* ── 5. Conteúdo da Aba Ativa ─────────────────────────────────── */}
      {activeTab === "actions" ? (
        <div className="space-y-4">
          {/* Fila de Decisão Rápida (Aprovação 1 Clique) */}
          <IntelligenceActionQueue
            storeId={activeStore?.id || ""}
            actions={actions}
            loading={actionsLoading}
            onActionProcessed={loadActions}
          />

          {/* Histórico & Auditoria com Suporte a Rollback */}
          <IntelligenceActionHistory
            storeId={activeStore?.id || ""}
            actions={actions}
            loading={actionsLoading}
            onRollbackCompleted={loadActions}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Síntese Executiva do AI Analyst */}
          <IntelligenceAIAnalyst alerts={alertsList} loading={loading} />

          {/* Lista Detalhada de Alertas */}
          <IntelligenceAlertList alerts={alertsList} loading={loading} />
        </div>
      )}

      {/* Modal de Configurações e Guardrails */}
      {activeStore?.id && (
        <IntelligenceSettingsModal
          storeId={activeStore.id}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            loadAlerts(false);
            loadActions();
          }}
        />
      )}
    </div>
  );
}
