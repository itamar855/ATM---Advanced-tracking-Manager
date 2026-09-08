"use client";

import { useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  EyeOff,
  DollarSign,
  CheckCircle2,
  Filter,
  Search,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignAlert, AlertType, AlertSeverity } from "@/lib/intelligence/campaign-alert-engine";

interface IntelligenceAlertListProps {
  alerts: CampaignAlert[];
  loading: boolean;
}

export function IntelligenceAlertList({ alerts, loading }: IntelligenceAlertListProps) {
  const [filterSeverity, setFilterSeverity] = useState<"all" | AlertSeverity>("all");
  const [filterType, setFilterType] = useState<"all" | AlertType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAlerts = alerts.filter((alert) => {
    if (filterSeverity !== "all" && alert.severity !== filterSeverity) return false;
    if (filterType !== "all" && alert.type !== filterType) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = alert.campaignName.toLowerCase().includes(q);
      const matchId = alert.campaignId.toLowerCase().includes(q);
      const matchTitle = alert.title.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchTitle) return false;
    }
    return true;
  });

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case "READY_TO_SCALE":
        return <TrendingUp size={16} className="text-emerald-400" />;
      case "CAMPAIGN_DECAY":
        return <AlertTriangle size={16} className="text-red-400" />;
      case "UNDER_REPORTED_CAMPAIGN":
        return <DollarSign size={16} className="text-purple-400" />;
      case "CREATIVE_FATIGUE":
        return <EyeOff size={16} className="text-amber-400" />;
    }
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case "critical":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            CRÍTICO
          </span>
        );
      case "warning":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            ATENÇÃO
          </span>
        );
      case "info":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            INFO
          </span>
        );
    }
  };

  const getTypeLabel = (type: AlertType) => {
    switch (type) {
      case "READY_TO_SCALE":
        return "Oportunidade de Escala";
      case "CAMPAIGN_DECAY":
        return "Sangramento Financeiro";
      case "UNDER_REPORTED_CAMPAIGN":
        return "Subestimada na Plataforma";
      case "CREATIVE_FATIGUE":
        return "Fadiga de Criativo";
    }
  };

  if (loading) {
    return (
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-5 space-y-4 shadow-md">
        <div className="h-5 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-[#161B26] border border-zinc-800/60 rounded-xl p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4 shadow-md">
      {/* ── Toolbar de Filtros e Busca ──────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold text-white">Alertas Operacionais & Decisão</h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
            {filteredAlerts.length} {filteredAlerts.length === 1 ? "alerta" : "alertas"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Busca por Campanha */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar campanha..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#161B26] border border-zinc-800 text-zinc-200 text-xs pl-7 pr-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60 w-44"
            />
          </div>

          {/* Filtro por Severidade */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            className="bg-[#161B26] border border-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60 cursor-pointer"
          >
            <option value="all">Todas Severidades</option>
            <option value="critical">Críticos</option>
            <option value="warning">Atenção</option>
            <option value="info">Informativos</option>
          </select>

          {/* Filtro por Tipo */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-[#161B26] border border-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60 cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="READY_TO_SCALE">Pronta para Escala</option>
            <option value="UNDER_REPORTED_CAMPAIGN">Vendas Ocultadas</option>
            <option value="CAMPAIGN_DECAY">Sangramento</option>
            <option value="CREATIVE_FATIGUE">Fadiga Criativo</option>
          </select>
        </div>
      </div>

      {/* ── Lista de Alertas ────────────────────────────────────────── */}
      {filteredAlerts.length === 0 ? (
        <div className="text-center py-12 space-y-3 bg-[#161B26]/50 rounded-xl border border-dashed border-zinc-800/80">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
            <ShieldCheck size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Nenhum Alerta Crítico no Momento</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Todas as campanhas analisadas estão operando dentro dos parâmetros aceitáveis de retorno contábil e saturação.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert, idx) => {
            const isScale = alert.type === "READY_TO_SCALE";
            const isDecay = alert.type === "CAMPAIGN_DECAY";
            const isUnderreported = alert.type === "UNDER_REPORTED_CAMPAIGN";
            const isFatigue = alert.type === "CREATIVE_FATIGUE";

            return (
              <div
                key={alert.id || `${alert.campaignId}_${alert.type}_${idx}`}
                className={cn(
                  "bg-[#161B26] border rounded-xl p-4 transition-all duration-200 hover:border-zinc-700 shadow-sm",
                  isScale && "border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-950/5",
                  isDecay && "border-red-500/30 hover:border-red-500/50 bg-red-950/5",
                  isUnderreported && "border-purple-500/30 hover:border-purple-500/50 bg-purple-950/5",
                  isFatigue && "border-amber-500/30 hover:border-amber-500/50 bg-amber-950/5"
                )}
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg border shrink-0 mt-0.5",
                        isScale && "bg-emerald-500/10 border-emerald-500/20",
                        isDecay && "bg-red-500/10 border-red-500/20",
                        isUnderreported && "bg-purple-500/10 border-purple-500/20",
                        isFatigue && "bg-amber-500/10 border-amber-500/20"
                      )}
                    >
                      {getAlertIcon(alert.type)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          {getTypeLabel(alert.type)}
                        </span>
                        {getSeverityBadge(alert.severity)}
                      </div>

                      <h3 className="text-sm font-bold text-white leading-snug">
                        {alert.title}
                      </h3>

                      <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                        {alert.description}
                      </p>

                      <div className="text-[11px] text-zinc-500 pt-0.5">
                        <span className="text-zinc-400 font-medium">Campanha: </span>
                        <span className="text-zinc-200 font-semibold">{alert.campaignName}</span>
                        <span className="font-mono text-zinc-600 ml-1.5 text-[10px]">({alert.campaignId})</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Box de Ação Sugerida ─────────────────────────── */}
                  <div className="w-full sm:w-auto mt-2 sm:mt-0 p-3 rounded-lg bg-[#11141E] border border-zinc-800/80 space-y-1 sm:max-w-xs shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                      <Zap size={11} />
                      Ação Recomendada
                    </span>
                    <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                      {alert.suggestedAction}
                    </p>
                  </div>
                </div>

                {/* ── Badges de Métricas Contábeis Evidenciadas ─────── */}
                <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center gap-3 flex-wrap text-xs">
                  {alert.metrics.realRoas !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11141E] border border-zinc-800 text-zinc-300">
                      <span className="text-zinc-500">ROAS Real:</span>
                      <span className="font-bold text-white">{alert.metrics.realRoas.toFixed(2)}x</span>
                    </div>
                  )}

                  {alert.metrics.realCpa !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11141E] border border-zinc-800 text-zinc-300">
                      <span className="text-zinc-500">CPA Real:</span>
                      <span className="font-bold text-white">R$ {alert.metrics.realCpa.toFixed(2)}</span>
                    </div>
                  )}

                  {alert.metrics.atmOrders !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11141E] border border-zinc-800 text-zinc-300">
                      <span className="text-zinc-500">Vendas ATM:</span>
                      <span className="font-bold text-purple-400">{alert.metrics.atmOrders}</span>
                    </div>
                  )}

                  {alert.metrics.platformOrders !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11141E] border border-zinc-800 text-zinc-300">
                      <span className="text-zinc-500">Vendas Meta:</span>
                      <span className="font-bold text-zinc-400">{alert.metrics.platformOrders}</span>
                    </div>
                  )}

                  {alert.metrics.hiddenSales !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 font-semibold">
                      <span>+{alert.metrics.hiddenSales} vendas recuperadas</span>
                    </div>
                  )}

                  {alert.metrics.frequency !== undefined && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11141E] border border-zinc-800 text-zinc-300">
                      <span className="text-zinc-500">Frequência:</span>
                      <span className="font-bold text-amber-400">{alert.metrics.frequency.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
