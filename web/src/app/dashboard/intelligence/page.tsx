"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  RotateCw,
  Calendar,
  BrainCircuit,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { IntelligenceAlertCards } from "@/components/intelligence/IntelligenceAlertCards";
import { IntelligenceAlertList } from "@/components/intelligence/IntelligenceAlertList";
import { IntelligenceAIAnalyst } from "@/components/intelligence/IntelligenceAIAnalyst";
import { CampaignAlert, IntelligenceSummary } from "@/lib/intelligence/campaign-alert-engine";

type WindowDaysOption = 3 | 7 | 14 | 30;

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

  const [windowDays, setWindowDays] = useState<WindowDaysOption>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alertsData, setAlertsData] = useState<AlertsApiResponse | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

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
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadAlerts]);

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
              Attribution Intelligence & Decision Engine
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                AI ENGINE
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Detecção preditiva de oportunidades de escala, vendas ocultas e sangramento financeiro de anúncios.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B26] border border-zinc-800 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Loja: {activeStore?.name || "Carregando..."}</span>
          </div>

          <button
            onClick={() => loadAlerts(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-800 text-white font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={13} className={cn(refreshing && "animate-spin text-amber-400")} />
            <span>{refreshing ? "Analisando..." : "Atualizar Análise"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Toolbar de Janela Temporal ────────────────────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mr-2">
            <Calendar size={14} className="text-zinc-500" />
            <span>Janela de Análise Histórica:</span>
          </div>

          {([3, 7, 14, 30] as WindowDaysOption[]).map((days) => {
            const labels: Record<WindowDaysOption, string> = {
              3: "Últimos 3 Dias (Rápido)",
              7: "Últimos 7 Dias (Recomendado)",
              14: "Últimos 14 Dias (Consolidado)",
              30: "Últimos 30 Dias (Mês)",
            };

            const isSel = windowDays === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
                  isSel
                    ? "bg-amber-600 border-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.3)] font-bold"
                    : "bg-[#161B26] border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700"
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

      {/* ── 5. Síntese Executiva do AI Analyst ───────────────────────── */}
      <IntelligenceAIAnalyst
        alerts={alertsList}
        loading={loading}
      />

      {/* ── 6. Lista Detalhada de Alertas e Ações Acionáveis ─────────── */}
      <IntelligenceAlertList
        alerts={alertsList}
        loading={loading}
      />
    </div>
  );
}
