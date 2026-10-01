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
  showTechnicalDetails?: boolean;
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
  showTechnicalDetails = false,
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
      title: "Faturamento atribuído",
      value: fmt(totalRevenue),
      subtext: "Valor das vendas conectadas às suas campanhas",
      decisionExplanation: `Atribuído pelo critério: ${modelLabel}`,
      badge: "100% Auditado",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: DollarSign,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
      techSubtext: `Ledger Idempotente (${modelLabel})`,
    },
    {
      id: "recovered_revenue",
      title: "Receita recuperada",
      value: fmt(recoveredRevenue),
      subtext: "Vendas identificadas via rastreamento avançado ATM",
      decisionExplanation: `${recoveredPercent}% das vendas foram salvas de perdas por bloqueadores de rastreio`,
      badge: "Rastreio Avançado",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      icon: Sparkles,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
      techSubtext: "ATM Forensic Hash & Cookie Resilient",
    },
    {
      id: "real_roas",
      title: "ROAS real",
      value: realRoas !== null && realRoas > 0 ? `${realRoas.toFixed(2)}x` : "—",
      subtext: "Retorno real do investimento em anúncios",
      decisionExplanation:
        realRoas !== null && realRoas > 0
          ? `Cada R$ 1 investido gerou R$ ${realRoas.toFixed(2).replace(".", ",")} em vendas`
          : "Conecte o investimento para ver o retorno exato",
      badge: realRoas !== null && realRoas > 0 ? "Sem Inflação" : "Pendente",
      badgeColor:
        realRoas !== null && realRoas > 0
          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
          : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: TrendingUp,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
      techSubtext: "Receita Atribuída ÷ Ad Spend",
    },
    {
      id: "real_cpa",
      title: "Custo por venda",
      value: realCpa !== null && realCpa > 0 ? fmt(realCpa) : "—",
      subtext: "Quanto custa gerar cada compra",
      decisionExplanation:
        realCpa !== null && realCpa > 0
          ? `Você investe em média ${fmt(realCpa)} em mídia para fechar cada pedido`
          : "Conecte o investimento para ver o custo por venda",
      badge: realCpa !== null && realCpa > 0 ? "Custo Real" : "Pendente",
      badgeColor:
        realCpa !== null && realCpa > 0
          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: Target,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
      techSubtext: "Ad Spend ÷ Pedidos Auditados",
    },
    {
      id: "total_orders",
      title: "Pedidos identificados",
      value: totalOrders.toLocaleString("pt-BR"),
      subtext: "Compras encontradas e atribuídas às campanhas",
      decisionExplanation: "Total de vendas com origem de anúncio comprovada",
      badge: "Pedidos Pagos",
      badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      icon: ShoppingBag,
      iconColor: "text-cyan-400",
      iconBg: "bg-cyan-500/10",
      techSubtext: "Deduplicated Order Ledger",
    },
    {
      id: "assisted_conversions",
      title: "Campanhas que ajudaram",
      value: assistedConversions.toLocaleString("pt-BR"),
      subtext: "Anúncios que participaram mesmo sem serem o último clique",
      decisionExplanation: `${assistedPercent}% das compras dependem de mais de 1 anúncio para fechar`,
      badge: "Jornada Multi-Touch",
      badgeColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",
      icon: GitFork,
      iconColor: "text-violet-400",
      iconBg: "bg-violet-500/10",
      techSubtext: "Touchpoints Intermediários (is_assisted)",
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
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">
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

            <div className="space-y-1.5">
              <div className="text-lg font-bold text-white tracking-tight">
                {card.value}
              </div>

              <p className="text-[11px] text-zinc-400 leading-tight">
                {card.subtext}
              </p>

              <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                <p className="text-[10px] text-purple-300/90 font-medium leading-tight">
                  💡 {card.decisionExplanation}
                </p>

                {showTechnicalDetails && (
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-0.5">
                    <span className="truncate">{card.techSubtext}</span>
                    <span
                      className={cn(
                        "px-1 py-0.2 rounded border whitespace-nowrap ml-1",
                        card.badgeColor
                      )}
                    >
                      {card.badge}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

