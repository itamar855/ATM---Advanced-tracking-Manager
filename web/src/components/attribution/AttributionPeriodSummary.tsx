"use client";

import { DollarSign, TrendingUp, Trophy, Wallet, Sparkles } from "lucide-react";
import { CampaignMetricItem } from "./AttributionCampaignRanking";

interface AttributionPeriodSummaryProps {
  loading: boolean;
  totalRevenue: number;
  spendAmount: number | null;
  realRoas: number | null;
  topCampaign: CampaignMetricItem | null;
  modelLabel: string;
}

export function AttributionPeriodSummary({
  loading,
  totalRevenue,
  spendAmount,
  realRoas,
  topCampaign,
  modelLabel,
}: AttributionPeriodSummaryProps) {
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="bg-[#11141E] border border-purple-500/20 rounded-xl p-4 animate-pulse space-y-3">
        <div className="h-4 w-40 bg-zinc-800 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="h-14 bg-zinc-800/60 rounded-lg" />
          <div className="h-14 bg-zinc-800/60 rounded-lg" />
          <div className="h-14 bg-zinc-800/60 rounded-lg" />
          <div className="h-14 bg-zinc-800/60 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#141724] via-[#11141E] to-[#141724] border border-purple-500/30 rounded-xl p-4 shadow-xl relative overflow-hidden">
      {/* Elemento estético de fundo */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Resumo do Período
              <span className="text-[10px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full font-medium border border-purple-500/30">
                Visão de Decisão (10s)
              </span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              Desempenho consolidado pelo modelo: <strong className="text-white font-semibold">{modelLabel}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Faturamento Atribuído */}
        <div className="bg-[#161B26]/90 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <DollarSign size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 font-medium block truncate">
              Faturamento Atribuído
            </span>
            <div className="text-base font-bold text-white tracking-tight truncate">
              {fmt(totalRevenue)}
            </div>
          </div>
        </div>

        {/* 2. Investimento em Anúncios */}
        <div className="bg-[#161B26]/90 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <Wallet size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 font-medium block truncate">
              Investimento em Anúncios
            </span>
            <div className="text-base font-bold text-white tracking-tight truncate">
              {spendAmount !== null && spendAmount > 0 ? fmt(spendAmount) : "Não conectado"}
            </div>
          </div>
        </div>

        {/* 3. ROAS Real */}
        <div className="bg-[#161B26]/90 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
            <TrendingUp size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 font-medium block truncate">
              ROAS Real
            </span>
            <div className="text-base font-bold text-white tracking-tight truncate">
              {realRoas !== null && realRoas > 0 ? `${realRoas.toFixed(2)}x` : "—"}
            </div>
          </div>
        </div>

        {/* 4. Melhor Campanha */}
        <div className="bg-[#161B26]/90 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
            <Trophy size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 font-medium block truncate">
              Melhor Campanha
            </span>
            <div className="text-xs font-bold text-white tracking-tight truncate" title={topCampaign?.campaignName || "Sem dados"}>
              {topCampaign ? topCampaign.campaignName : "Nenhuma no período"}
            </div>
            {topCampaign && topCampaign.attributedRevenue > 0 && (
              <span className="text-[10px] text-emerald-400 font-semibold block">
                {fmt(topCampaign.attributedRevenue)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
