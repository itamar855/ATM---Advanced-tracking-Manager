"use client";

import { Sparkles, GitFork, AlertCircle, TrendingUp, Lightbulb } from "lucide-react";
import { CampaignMetricItem } from "./AttributionCampaignRanking";

interface AttributionInsightsProps {
  totalRevenue: number;
  recoveredRevenue: number;
  totalOrders: number;
  assistedConversions: number;
  campaigns: CampaignMetricItem[];
  modelLabel: string;
}

export function AttributionInsights({
  totalRevenue,
  recoveredRevenue,
  totalOrders,
  assistedConversions,
  campaigns,
  modelLabel,
}: AttributionInsightsProps) {
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const insights: Array<{
    id: string;
    title: string;
    description: string;
    type: "positive" | "warning" | "neutral";
    icon: any;
  }> = [];

  // Insight 1: Receita Recuperada pelo Rastreamento ATM
  if (recoveredRevenue > 0 && totalRevenue > 0) {
    const recPercent = Math.round((recoveredRevenue / totalRevenue) * 100);
    insights.push({
      id: "recovered_share",
      title: "Vendas resgatadas pelo rastreamento",
      description: `A ATM identificou ${fmt(recoveredRevenue)} (${recPercent}% do faturamento) que seriam perdidos devido a bloqueios de navegadores ou perda de cookies.`,
      type: "positive",
      icon: Sparkles,
    });
  }

  // Insight 2: Multi-touch e Conversões Assistidas
  if (assistedConversions > 0 && totalOrders > 0) {
    const assistedPercent = Math.round((assistedConversions / totalOrders) * 100);
    insights.push({
      id: "multi_touch_ratio",
      title: "Jornadas com múltiplos anúncios",
      description: `${assistedPercent}% das vendas (${assistedConversions} compras) passaram por mais de um anúncio antes do cliente fechar o pedido.`,
      type: "neutral",
      icon: GitFork,
    });
  }

  // Insight 3: Campanhas Assistentes Ativas
  const topAssistingCampaign = campaigns
    .filter((c) => c.assistedCount > 0)
    .sort((a, b) => b.assistedCount - a.assistedCount)[0];

  if (topAssistingCampaign) {
    insights.push({
      id: "top_assisting",
      title: `Anúncios de apoio: ${topAssistingCampaign.campaignName}`,
      description: `Esta campanha ajudou em ${topAssistingCampaign.assistedCount} vendas no meio da jornada. Ela prepara o cliente para comprar mais tarde.`,
      type: "neutral",
      icon: TrendingUp,
    });
  }

  // Insight 4: Concentração de Receita
  if (campaigns.length >= 3 && totalRevenue > 0) {
    const topRevenue = campaigns[0].attributedRevenue;
    const topPercent = Math.round((topRevenue / totalRevenue) * 100);
    if (topPercent >= 60) {
      insights.push({
        id: "concentration_alert",
        title: "Concentração em uma única campanha",
        description: `A campanha "${campaigns[0].campaignName}" gera ${topPercent}% do seu faturamento no modelo ${modelLabel}. Considere testar novos criativos para distribuir o risco.`,
        type: "warning",
        icon: AlertCircle,
      });
    }
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-lg">
      <div className="flex items-center gap-2 text-xs font-bold text-white">
        <Lightbulb size={14} className="text-amber-400" />
        <span>Insights de Vendas e Oportunidades</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {insights.map((item) => {
          const Icon = item.icon;
          const borderClass =
            item.type === "positive"
              ? "border-purple-500/30 bg-purple-950/10"
              : item.type === "warning"
              ? "border-amber-500/30 bg-amber-950/10"
              : "border-blue-500/30 bg-blue-950/10";

          const iconColor =
            item.type === "positive"
              ? "text-purple-400"
              : item.type === "warning"
              ? "text-amber-400"
              : "text-blue-400";

          return (
            <div
              key={item.id}
              className={`p-3 rounded-lg border flex items-start gap-2.5 transition-all ${borderClass}`}
            >
              <div className="p-1 rounded bg-zinc-900/80 mt-0.5 shrink-0">
                <Icon size={14} className={iconColor} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">{item.title}</h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

