'use me';
'use strict';
'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';

export type HealthStatus = 'healthy' | 'warning' | 'problem';

interface CampaignHealthScoreProps {
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  compact?: boolean;
}

export function CampaignHealthScore({ spend, revenue, conversions, roas, compact = false }: CampaignHealthScoreProps) {
  // Heuristic rule classification
  const calculatedRoas = spend > 0 ? revenue / spend : roas || 0;
  
  let status: HealthStatus = 'warning';
  let label = 'Atenção';
  let badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  let dotClass = 'bg-amber-400';
  let tooltipReason = 'Volume de dados ou investimento ainda pequeno para determinar a eficiência com clareza.';

  if (spend > 50 && calculatedRoas >= 1.2 && conversions > 0) {
    status = 'healthy';
    label = 'Saudável';
    badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    dotClass = 'bg-emerald-400';
    tooltipReason = `Retorno positivo com ROAS de ${calculatedRoas.toFixed(2)}x e ${conversions} vendas rastreadas.`;
  } else if (spend > 100 && (calculatedRoas < 0.8 || conversions === 0)) {
    status = 'problem';
    label = 'Problema';
    badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    dotClass = 'bg-rose-400';
    tooltipReason = `Gasto significativo (R$ ${spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) sem trazer o retorno financeiro esperado (ROAS ${calculatedRoas.toFixed(2)}x).`;
  }

  return (
    <div className="group relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${badgeClass} cursor-help transition-all`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {!compact && <span>{label}</span>}
        <HelpCircle className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
      </span>

      {/* Tooltip explicativo */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-[#0B1437] border border-[#2B3674] text-xs text-slate-200 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-30">
        <p className="font-semibold text-white mb-1">Saúde da campanha: {label}</p>
        <p className="text-slate-300 text-[11px] leading-snug">{tooltipReason}</p>
        <div className="mt-1.5 pt-1.5 border-t border-[#1B255A] text-[10px] text-slate-400">
          Classificação baseada nos dados de gasto, receita e vendas do período.
        </div>
      </div>
    </div>
  );
}
