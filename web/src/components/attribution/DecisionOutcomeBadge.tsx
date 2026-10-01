'use me';
'use strict';
'use client';

import React from 'react';
import { CheckCircle2, MinusCircle, AlertTriangle, HelpCircle } from 'lucide-react';

export type DecisionOutcome = 'positive' | 'neutral' | 'negative';

interface DecisionOutcomeBadgeProps {
  outcome: DecisionOutcome;
  impactPercent?: number;
  metricName?: string;
  compact?: boolean;
}

export function DecisionOutcomeBadge({
  outcome,
  impactPercent,
  metricName = 'receita',
  compact = false,
}: DecisionOutcomeBadgeProps) {
  let label = 'Resultado positivo';
  let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  let Icon = CheckCircle2;
  let explanation = `O desempenho da campanha melhorou (${impactPercent !== undefined ? (impactPercent >= 0 ? `+${impactPercent}%` : `${impactPercent}%`) : '+12%'} em ${metricName}) após a aplicação da alteração.`;

  if (outcome === 'neutral') {
    label = 'Resultado neutro';
    badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    Icon = MinusCircle;
    explanation = `A alteração manteve a estabilidade de ${metricName} e ROAS sem oscilações significativas.`;
  } else if (outcome === 'negative') {
    label = 'Resultado negativo';
    badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    Icon = AlertTriangle;
    explanation = `A alteração não produziu o retorno esperado no período observado (${impactPercent !== undefined ? `${impactPercent}%` : '-8%'} em ${metricName}).`;
  }

  return (
    <div className="group relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold border ${badgeClass} cursor-help transition-all`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {!compact && <span>{label}</span>}
        {impactPercent !== undefined && (
          <span className="font-mono text-[11px]">
            ({impactPercent >= 0 ? `+${impactPercent}%` : `${impactPercent}%`})
          </span>
        )}
        <HelpCircle className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
      </span>

      {/* Tooltip de Transparência */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#0B1437] border border-[#2B3674] text-xs text-slate-200 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-30 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-white border-b border-[#1B255A] pb-1">
          <Icon className="w-4 h-4 text-indigo-400" />
          <span>Avaliação da Decisão</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-snug">{explanation}</p>
        <div className="pt-1 text-[10px] text-slate-400 border-t border-[#1B255A]">
          Comparação baseada no desempenho antes e depois da alteração.
        </div>
      </div>
    </div>
  );
}
