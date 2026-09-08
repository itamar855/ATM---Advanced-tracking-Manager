"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  RotateCw,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle,
  Eye,
  Info,
  ChevronDown,
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

type WindowPreset = "1d" | "7d" | "30d" | "custom";

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

  const [loading, setLoading] = useState(true);
  const [refreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricsData, setMetricsData] = useState<MetricsResponse | null>(null);
  const [spendAmount, setSpendAmount] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

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

    let daysToSubtract = 7; // 7 dias incluindo hoje
    if (windowPreset === "1d") daysToSubtract = 0; // Hoje a partir das 00:00
    if (windowPreset === "30d") daysToSubtract = 30; // 30 dias incluindo hoje

    const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToSubtract, 0, 0, 0, 0);
    const startDate = startLocal.toISOString();
    const endDate = now.toISOString();

    return { startDate, endDate };
  }, [windowPreset, customStart, customEnd]);

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (!activeStore?.id) return;

      // Cancela requisição anterior em voo
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
        // 1. Consulta segura ao endpoint contábil do Revenue Ledger
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

        // 2. Consulta opcional ao serviço existente de gastos para cálculo de Real ROAS / CPA
        // Converte preset para o formato do dashboard de métricas legado mantendo exatamente o mesmo período
        const legacyPreset =
          windowPreset === "1d"
            ? "today"
            : windowPreset === "7d"
            ? "last_7d"
            : windowPreset === "30d"
            ? "last_30d"
            : null;

        // Se for período customizado, o endpoint legado de spend não suporta intervalos arbitrários sem distorção.
        // Portanto, isolamos e marcamos spend como null para garantir integridade contábil estrita sem divergência.
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

        const [metricsRes, spendRes] = await Promise.all([metricsPromise, spendPromise]);

        if (metricsRes.ok) {
          setMetricsData(metricsRes);
        } else {
          setError(metricsRes.error || "Falha ao carregar métricas contábeis");
        }

        // Se houver gasto real reportado pela integração existente, utiliza para ROAS/CPA
        if (spendRes?.ok && typeof spendRes.metrics?.ad_spend === "number" && spendRes.metrics.ad_spend > 0) {
          setSpendAmount(spendRes.metrics.ad_spend);
        } else {
          setSpendAmount(null);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("[Attribution Dashboard] Erro:", err);
        setError(err.message || "Erro de conexão com o servidor contábil");
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
  const campaignsList = metricsData?.campaigns ?? [];

  const realRoas =
    spendAmount !== null && spendAmount > 0 && totalRev > 0
      ? totalRev / spendAmount
      : null;

  const realCpa =
    spendAmount !== null && spendAmount > 0 && totalOrders > 0
      ? spendAmount / totalOrders
      : null;

  const modelLabels: Record<AttributionModel, string> = {
    last_click: "Last Click",
    first_click: "First Click",
    linear: "Linear",
    u_shaped: "U-Shaped",
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-4 fade-in select-none text-zinc-100">
      {/* ── 1. Top Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Layers size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Attribution Intelligence & Revenue Ledger
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                PRO
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Contabilidade financeira de vendas multi-touch e auditoria forense de canais.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B26] border border-zinc-800 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Loja: {activeStore?.name || "Carregando..."}</span>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-800 text-white font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={13} className={cn(refreshing && "animate-spin text-purple-400")} />
            <span>{refreshing ? "Atualizando..." : "Atualizar"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Toolbar de Filtros (Janela e Controles) ───────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mr-2">
            <Calendar size={14} className="text-zinc-500" />
            <span>Janela de Atribuição:</span>
          </div>

          {(["1d", "7d", "30d", "custom"] as WindowPreset[]).map((preset) => {
            const labels: Record<WindowPreset, string> = {
              "1d": "Hoje (Últimas 24h)",
              "7d": "7 Dias (Recomendado)",
              "30d": "30 Dias (Mês)",
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
                    ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(147,51,234,0.3)]"
                    : "bg-[#161B26] border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700"
                )}
              >
                {labels[preset]}
              </button>
            );
          })}
        </div>

        {/* Inputs Customizados quando windowPreset === 'custom' */}
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

      {/* ── 3. Mensagem de Erro se houver ──────────────────────────── */}
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

      {/* ── 4. Seletor de Modelo de Atribuição (Reativo) ─────────────── */}
      <AttributionModelSelector
        selectedModel={model}
        onChange={(m) => setModel(m)}
        disabled={loading}
      />

      {/* ── 5. KPI Cards Financeiros ─────────────────────────────────── */}
      <AttributionCards
        loading={loading}
        totalRevenue={totalRev}
        recoveredRevenue={recoveredRev}
        totalOrders={totalOrders}
        assistedConversions={assistedConv}
        realRoas={realRoas}
        realCpa={realCpa}
        modelLabel={modelLabels[model]}
      />

      {/* ── 6. Painel de Insights Forenses Reais ────────────────────── */}
      <AttributionInsights
        totalRevenue={totalRev}
        recoveredRevenue={recoveredRev}
        totalOrders={totalOrders}
        assistedConversions={assistedConv}
        campaigns={campaignsList}
        modelLabel={modelLabels[model]}
      />

      {/* ── 7. Ranking Contábil de Campanhas ────────────────────────── */}
      <AttributionCampaignRanking
        campaigns={campaignsList}
        totalRevenue={totalRev}
        loading={loading}
      />
    </div>
  );
}
