"use client";

import { Rocket, Search, AlertTriangle, BarChart2, ArrowRight } from "lucide-react";

interface AttributionQuickActionsProps {
  onSelectFilter: (field: "attributedRevenue" | "assistedCount" | "recoveredRevenue" | "ordersCount") => void;
  onScrollToModels: () => void;
}

export function AttributionQuickActions({
  onSelectFilter,
  onScrollToModels,
}: AttributionQuickActionsProps) {
  const actions = [
    {
      id: "scale_winners",
      icon: Rocket,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10 border-emerald-500/20",
      title: "🚀 Escalar vencedoras",
      description: "Encontrar campanhas com maior faturamento e retorno direto.",
      actionLabel: "Ver campeãs",
      onClick: () => onSelectFilter("attributedRevenue"),
    },
    {
      id: "investigate_hidden",
      icon: Search,
      iconColor: "text-violet-400",
      iconBg: "bg-violet-500/10 border-violet-500/20",
      title: "🔎 Investigar oportunidades escondidas",
      description: "Identificar anúncios que participam e ajudam na conversão.",
      actionLabel: "Ver assistentes",
      onClick: () => onSelectFilter("assistedCount"),
    },
    {
      id: "fix_waste",
      icon: AlertTriangle,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10 border-amber-500/20",
      title: "⚠️ Corrigir desperdícios",
      description: "Filtrar campanhas ativas com baixa taxa de fechamento.",
      actionLabel: "Analisar retenção",
      onClick: () => onSelectFilter("recoveredRevenue"),
    },
    {
      id: "compare_models",
      icon: BarChart2,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10 border-blue-500/20",
      title: "📊 Comparar modelos",
      description: "Ver como a atribuição altera o crédito entre os anúncios.",
      actionLabel: "Alternar modelos",
      onClick: onScrollToModels,
    },
  ];

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Rocket size={15} className="text-purple-400" />
          <span>Próximas ações recomendadas</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-medium">
          Clique para filtrar ou realizar uma ação imediata
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <div
              key={act.id}
              onClick={act.onClick}
              className="bg-[#161B26] border border-zinc-800/80 hover:border-purple-500/40 rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition-all cursor-pointer hover:shadow-md group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${act.iconBg}`}>
                    <Icon size={14} className={act.iconColor} />
                  </div>
                  <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                    {act.title}
                  </h4>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  {act.description}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-semibold text-purple-400 group-hover:text-purple-300">
                <span>{act.actionLabel}</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
