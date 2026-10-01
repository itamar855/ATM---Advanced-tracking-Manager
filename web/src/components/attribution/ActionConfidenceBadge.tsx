'use me';
'use strict';
'use client';

import React from 'react';
import { ShieldCheck, HelpCircle, AlertTriangle } from 'lucide-react';

export type ConfidenceScore = 'high' | 'medium' | 'low';

interface ActionConfidenceBadgeProps {
  score?: ConfidenceScore;
  conversionsCount?: number;
  roasValue?: number;
  compact?: boolean;
}

export function ActionConfidenceBadge({
  score = 'high',
  conversionsCount = 5,
  roasValue = 2.5,
  compact = false,
}: ActionConfidenceBadgeProps) {
  let label = 'Alta confiança';
  let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  let dotClass = 'bg-emerald-400';
  let reasons = [
    'Volume de vendas suficiente no período auditado',
    `ROAS de ${roasValue.toFixed(2)}x consistente acima da média`,
    'Sem registros de erros de rastreamento no Pixel',
    'Guardrails de teto diário respeitados',
  ];

  if (score === 'medium' || conversionsCount < 3) {
    label = 'Média confiança';
    badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    dotClass = 'bg-amber-400';
    reasons = [
      'Poucos dados de conversão acumulados no período',
      'Desempenho positivo mas maturidade recente',
      'Recomendada alteração com limite conservador (+10%)',
    ];
  } else if (score === 'low') {
    label = 'Baixa confiança';
    badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    dotClass = 'bg-rose-400';
    reasons = [
      'Volatilidade nos resultados recentes',
      'Pouco histórico acumulado no rastreamento',
      'Recomendado manter observação antes de escalar',
    ];
  }

  return (
    <div className="group relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold border ${badgeClass} cursor-help transition-all`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {!compact && <span>{label}</span>}
        <HelpCircle className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity" />
      </span>

      {/* Tooltip de Transparência do Score */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#0B1437] border border-[#2B3674] text-xs text-slate-200 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-30 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-white border-b border-[#1B255A] pb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Score de Confiança: {label}</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium block">Evidências consideradas:</span>
        <ul className="space-y-1 text-[11px] text-slate-300">
          {reasons.map((r, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
