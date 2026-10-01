"use client";

import { useRouter } from "next/navigation";
import { Target, Zap, Sparkles, AlertTriangle, TrendingUp, ArrowRight, ExternalLink } from "lucide-react";
import { CampaignMetricItem } from "./AttributionCampaignRanking";

interface AttributionOpportunitiesProps {
  campaigns: CampaignMetricItem[];
  totalRevenue: number;
  recoveredRevenue: number;
  totalOrders: number;
  assistedConversions: number;
  spendAmount: number | null;
  realRoas: number | null;
  modelLabel: string;
  onAnalyzeJourney?: (campaignName?: string) => void;
}

export function AttributionOpportunities({
  campaigns,
  totalRevenue,
  recoveredRevenue,
  totalOrders,
  assistedConversions,
  spendAmount,
  realRoas,
  modelLabel,
  onAnalyzeJourney,
}: AttributionOpportunitiesProps) {
  const router = useRouter();

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const opportunities: Array<{
    id: string;
    priority: "high" | "medium" | "info";
    priorityLabel: string;
    priorityBadgeColor: string;
    title: string;
    reason: string;
    suggestedAction: string;
    actionButtonText: string;
    actionType: "navigate_campaigns" | "analyze_journey";
    campaignSearchTerm?: string;
    icon: any;
    iconColor: string;
  }> = [];

  // Oportunidade 1: Campeã de Vendas (Escalar)
  if (campaigns.length > 0 && totalRevenue > 0) {
    const topCamp = campaigns[0];
    const topShare = Math.round((topCamp.attributedRevenue / totalRevenue) * 100);

    opportunities.push({
      id: "scale_top_campaign",
      priority: "high",
      priorityLabel: "Alta prioridade 🔴",
      priorityBadgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
      title: `Escalar campanha vencedora: "${topCamp.campaignName}"`,
      reason: `Essa campanha gerou ${fmt(topCamp.attributedRevenue)} (${topShare}% de toda a receita) em ${topCamp.ordersCount} pedidos.`,
      suggestedAction: "Avaliar aumento gradual de orçamento mantendo o mesmo direcionamento.",
      actionButtonText: "Ver campanha",
      actionType: "navigate_campaigns",
      campaignSearchTerm: topCamp.campaignName,
      icon: TrendingUp,
      iconColor: "text-red-400",
    });
  }

  // Oportunidade 2: Ouro Oculto (Campanhas Assistentes)
  const topAssisting = campaigns
    .filter((c) => c.assistedCount > 0)
    .sort((a, b) => b.assistedCount - a.assistedCount)[0];

  if (topAssisting) {
    opportunities.push({
      id: "hidden_gem_assisting",
      priority: "medium",
      priorityLabel: "Média prioridade 🟡",
      priorityBadgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      title: `Proteger anúncio de topo/meio: "${topAssisting.campaignName}"`,
      reason: `Essa campanha participou da decisão de compra em ${topAssisting.assistedCount} vendas mesmo sem ser o último toque.`,
      suggestedAction: "Manter ativa! Ela atrai e prepara os clientes antes do fechamento.",
      actionButtonText: "Analisar jornada",
      actionType: "analyze_journey",
      campaignSearchTerm: topAssisting.campaignName,
      icon: Zap,
      iconColor: "text-amber-400",
    });
  }

  // Oportunidade 3: Resgate de Faturamento pelo Rastreamento ATM
  if (recoveredRevenue > 0 && totalRevenue > 0) {
    const recPercent = Math.round((recoveredRevenue / totalRevenue) * 100);
    opportunities.push({
      id: "tracking_rescue",
      priority: "info",
      priorityLabel: "Observação 🔵",
      priorityBadgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      title: "Saldo de vendas salvas pelo rastreamento",
      reason: `A ATM resgatou ${fmt(recoveredRevenue)} (${recPercent}% da receita) que seriam perdidos por bloqueio de cookies.`,
      suggestedAction: "Utilizar este valor resgatado para reinvestir em testes de criativos.",
      actionButtonText: "Ver campanhas salvas",
      actionType: "navigate_campaigns",
      icon: Sparkles,
      iconColor: "text-blue-400",
    });
  }

  // Oportunidade 4: Concentração Excessiva
  if (campaigns.length >= 2 && totalRevenue > 0) {
    const topRevenue = campaigns[0].attributedRevenue;
    const topPercent = Math.round((topRevenue / totalRevenue) * 100);
    if (topPercent >= 65) {
      opportunities.push({
        id: "diversification_alert",
        priority: "medium",
        priorityLabel: "Média prioridade 🟡",
        priorityBadgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        title: "Diversificar fontes de tráfego",
        reason: `${topPercent}% de todo o faturamento da loja depende de uma única campanha.`,
        suggestedAction: "Criar novos conjuntos de anúncios para reduzir a dependência de um só criativo.",
        actionButtonText: "Analisar distribuição",
        actionType: "analyze_journey",
        icon: AlertTriangle,
        iconColor: "text-amber-400",
      });
    }
  }

  if (opportunities.length === 0) {
    return null;
  }

  const handleAction = (opp: (typeof opportunities)[0]) => {
    if (opp.actionType === "navigate_campaigns") {
      const param = opp.campaignSearchTerm ? `?search=${encodeURIComponent(opp.campaignSearchTerm)}` : "";
      router.push(`/dashboard/campaigns${param}`);
    } else if (opp.actionType === "analyze_journey") {
      if (onAnalyzeJourney) {
        onAnalyzeJourney(opp.campaignSearchTerm);
      }
    }
  };

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Target size={15} className="text-purple-400" />
          <span>Central de Oportunidades & Ações Prioritárias</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-medium">
          Recomendações automáticas organizadas por urgência
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {opportunities.map((opp) => {
          const Icon = opp.icon;
          return (
            <div
              key={opp.id}
              className="bg-[#161B26] border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition-all shadow-md group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0">
                    <Icon size={15} className={opp.iconColor} />
                  </div>
                  <h4 className="text-xs font-bold text-white truncate" title={opp.title}>
                    {opp.title}
                  </h4>
                </div>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded font-bold border whitespace-nowrap shrink-0 ${opp.priorityBadgeColor}`}
                >
                  {opp.priorityLabel}
                </span>
              </div>

              <div className="space-y-1 text-[11px]">
                <p className="text-zinc-400 leading-snug">
                  <strong className="text-zinc-300 font-semibold">Motivo:</strong> {opp.reason}
                </p>
                <p className="text-purple-300 leading-snug font-medium pt-0.5">
                  <strong className="text-purple-200 font-semibold">Ação sugerida:</strong> {opp.suggestedAction}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleAction(opp)}
                  className="w-full py-1.5 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>{opp.actionButtonText}</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


