"use client";

import { TrendingUp, AlertTriangle, DollarSign, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntelligenceAlertCardsProps {
  loading: boolean;
  scaleOpportunities: number;
  decayCampaigns: number;
  hiddenRevenue: number;
  fatiguedCreatives: number;
}

export function IntelligenceAlertCards({
  loading,
  scaleOpportunities,
  decayCampaigns,
  hiddenRevenue,
  fatiguedCreatives,
}: IntelligenceAlertCardsProps) {
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cards = [
    {
      id: "scale_opportunities",
      title: "Prontas para Escala",
      value: scaleOpportunities.toString(),
      subtext: scaleOpportunities > 0 ? "ROAS alto e CPA controlado" : "Aguardando consistência",
      badge: scaleOpportunities > 0 ? "Escalar Agora" : "Monitorando",
      badgeColor: scaleOpportunities > 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: TrendingUp,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      id: "decay_campaigns",
      title: "Sangramento Financeiro",
      value: decayCampaigns.toString(),
      subtext: decayCampaigns > 0 ? "Spend alto com queda de vendas" : "Zero sangramento",
      badge: decayCampaigns > 0 ? "Ação Urgente" : "Operação Saudável",
      badgeColor: decayCampaigns > 0 ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: AlertTriangle,
      iconColor: "text-red-400",
      iconBg: "bg-red-500/10",
    },
    {
      id: "hidden_revenue",
      title: "Receita Ocultada",
      value: fmt(hiddenRevenue),
      subtext: "Vendas que a Meta não registrou",
      badge: "ATM Forensic",
      badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      icon: DollarSign,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      id: "fatigued_creatives",
      title: "Fadiga de Criativo",
      value: fatiguedCreatives.toString(),
      subtext: fatiguedCreatives > 0 ? "Frequência alta e queda de CTR" : "Audiências respondendo",
      badge: fatiguedCreatives > 0 ? "Renovar Anúncios" : "Estável",
      badgeColor: fatiguedCreatives > 0 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: EyeOff,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-zinc-800 rounded" />
              <div className="h-6 w-6 bg-zinc-800 rounded-lg" />
            </div>
            <div className="h-7 w-20 bg-zinc-800 rounded" />
            <div className="h-3 w-32 bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className="bg-[#11141E] border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 shadow-md group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                {card.title}
              </span>
              <div className={cn("p-1.5 rounded-lg transition-transform duration-200 group-hover:scale-110", card.iconBg)}>
                <Icon className={cn("w-4 h-4", card.iconColor)} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xl font-bold text-white tracking-tight">
                {card.value}
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
                <span className="truncate mr-1">{card.subtext}</span>
                <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold border whitespace-nowrap", card.badgeColor)}>
                  {card.badge}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
