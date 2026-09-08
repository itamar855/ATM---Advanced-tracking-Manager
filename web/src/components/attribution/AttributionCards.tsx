"use client";

import { DollarSign, Sparkles, TrendingUp, Target, ShoppingBag, GitFork } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttributionCardsProps {
  loading: boolean;
  totalRevenue: number;
  recoveredRevenue: number;
  totalOrders: number;
  assistedConversions: number;
  realRoas: number | null;
  realCpa: number | null;
  modelLabel: string;
}

export function AttributionCards({
  loading,
  totalRevenue,
  recoveredRevenue,
  totalOrders,
  assistedConversions,
  realRoas,
  realCpa,
  modelLabel,
}: AttributionCardsProps) {
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const recoveredPercent =
    totalRevenue > 0 ? Math.round((recoveredRevenue / totalRevenue) * 100) : 0;

  const assistedPercent =
    totalOrders > 0 ? Math.round((assistedConversions / totalOrders) * 100) : 0;

  const cards = [
    {
      id: "total_revenue",
      title: "Total Revenue",
      value: fmt(totalRevenue),
      subtext: `Atribuído via ${modelLabel}`,
      badge: "100% Auditado",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: DollarSign,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      id: "recovered_revenue",
      title: "Recovered Revenue",
      value: fmt(recoveredRevenue),
      subtext: `${recoveredPercent}% do faturamento resgatado`,
      badge: "ATM Forensic",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      icon: Sparkles,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      id: "real_roas",
      title: "Real ROAS",
      value: realRoas !== null && realRoas > 0 ? `${realRoas.toFixed(2)}x` : "—",
      subtext:
        realRoas !== null && realRoas > 0
          ? "Receita contábil ÷ Spend real"
          : "Spend não conectado",
      badge: realRoas !== null && realRoas > 0 ? "Sem Inflação" : "Indisponível",
      badgeColor:
        realRoas !== null && realRoas > 0
          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
          : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: TrendingUp,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      id: "real_cpa",
      title: "Real CPA",
      value: realCpa !== null && realCpa > 0 ? fmt(realCpa) : "—",
      subtext:
        realCpa !== null && realCpa > 0
          ? "Spend real ÷ Pedidos auditados"
          : "Spend não conectado",
      badge: realCpa !== null && realCpa > 0 ? "Custo Real" : "Indisponível",
      badgeColor:
        realCpa !== null && realCpa > 0
          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: Target,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      id: "total_orders",
      title: "Total Orders",
      value: totalOrders.toLocaleString("pt-BR"),
      subtext: "Vendas únicas no Ledger",
      badge: "Pedidos Pagos",
      badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      icon: ShoppingBag,
      iconColor: "text-cyan-400",
      iconBg: "bg-cyan-500/10",
    },
    {
      id: "assisted_conversions",
      title: "Assisted Conversions",
      value: assistedConversions.toLocaleString("pt-BR"),
      subtext: `${assistedPercent}% exigiram multi-touch`,
      badge: "Jornada Longa",
      badgeColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",
      icon: GitFork,
      iconColor: "text-violet-400",
      iconBg: "bg-violet-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-zinc-800 rounded" />
              <div className="h-6 w-6 bg-zinc-800 rounded-lg" />
            </div>
            <div className="h-7 w-28 bg-zinc-800 rounded" />
            <div className="h-3 w-24 bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className="bg-[#11141E] border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 shadow-lg hover:shadow-xl group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                {card.title}
              </span>
              <div
                className={cn(
                  "p-1.5 rounded-lg transition-transform duration-200 group-hover:scale-110",
                  card.iconBg
                )}
              >
                <Icon className={cn("w-4 h-4", card.iconColor)} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-lg font-bold text-white tracking-tight">
                {card.value}
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
                <span className="truncate mr-1">{card.subtext}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-semibold border whitespace-nowrap",
                    card.badgeColor
                  )}
                >
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
