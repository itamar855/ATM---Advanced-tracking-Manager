"use client";

import { Sparkles, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { CampaignMetricItem } from "./AttributionCampaignRanking";

interface DecisionSummaryCardProps {
  loading: boolean;
  totalRevenue: number;
  totalOrders: number;
  realRoas: number | null;
  spendAmount: number | null;
  topCampaign: CampaignMetricItem | null;
  modelLabel: string;
}

export function DecisionSummaryCard({
  loading,
  totalRevenue,
  totalOrders,
  realRoas,
  spendAmount,
  topCampaign,
  modelLabel,
}: DecisionSummaryCardProps) {
  if (loading) {
    return (
      <div className="bg-[#11141E] border border-purple-500/20 rounded-xl p-4 animate-pulse space-y-2">
        <div className="h-4 w-48 bg-zinc-800 rounded" />
        <div className="h-5 w-3/4 bg-zinc-800/60 rounded" />
      </div>
    );
  }

  // Lógica de decisão orientadora
  let decisionText = "";
  let highlightTitle = "";
  let icon = Lightbulb;
  let bannerStyle = "border-purple-500/30 bg-purple-950/20 text-purple-200";

  if (totalOrders === 0 || totalRevenue === 0) {
    highlightTitle = "Aguardando Primeiras Vendas";
    decisionText = "⚠️ Ainda precisamos de mais vendas rastreadas para gerar recomendações automatizadas de escala.";
    icon = AlertTriangle;
    bannerStyle = "border-amber-500/30 bg-amber-950/20 text-amber-200";
  } else if (realRoas !== null && realRoas >= 1.5) {
    highlightTitle = "Retorno Positivo & Espaço para Escala";
    decisionText = `🚀 Suas campanhas estão gerando retorno positivo (ROAS ${realRoas.toFixed(2)}x). Existe espaço para aumentar gradualmente o investimento nas campanhas com maior participação.`;
    icon = TrendingUp;
    bannerStyle = "border-emerald-500/30 bg-emerald-950/20 text-emerald-200";
  } else if (topCampaign && topCampaign.attributedRevenue > 0) {
    const fmtRev = `R$ ${topCampaign.attributedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    highlightTitle = "Potencial Detectado de Mídia";
    decisionText = `💎 Encontramos campanhas com excelente potencial de escala, como "${topCampaign.campaignName}" gerando ${fmtRev} em vendas.`;
    icon = Sparkles;
    bannerStyle = "border-purple-500/30 bg-purple-950/20 text-purple-200";
  } else {
    highlightTitle = "Síntese do Período";
    decisionText = `Analise a distribuição de crédito no modelo ${modelLabel} para identificar quais anúncios estão impulsionando o fechamento das compras.`;
    icon = Lightbulb;
    bannerStyle = "border-blue-500/30 bg-blue-950/20 text-blue-200";
  }

  const IconComp = icon;

  return (
    <div className={`border rounded-xl p-4 shadow-lg transition-all flex items-start gap-3.5 ${bannerStyle}`}>
      <div className="p-2 rounded-lg bg-zinc-950/60 border border-white/10 shrink-0 mt-0.5">
        <IconComp size={18} />
      </div>
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider opacity-90">
            Resumo da Decisão
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/10 border border-white/20">
            {highlightTitle}
          </span>
        </div>
        <p className="text-xs font-medium leading-relaxed opacity-95">
          {decisionText}
        </p>
      </div>
    </div>
  );
}
