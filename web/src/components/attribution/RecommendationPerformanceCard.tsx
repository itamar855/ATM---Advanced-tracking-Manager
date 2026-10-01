'use me';
'use strict';
'use client';

import React from 'react';
import { BarChart3, TrendingUp, CheckCircle2, ShieldCheck } from 'lucide-react';

export interface DecisionTypeStats {
  actionType: string;
  label: string;
  appliedCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  successRate: number;
  averageLiftPercent: number;
}

interface RecommendationPerformanceCardProps {
  stats?: DecisionTypeStats[];
}

const DEFAULT_STATS: DecisionTypeStats[] = [
  {
    actionType: 'SCALE_BUDGET_PERCENT',
    label: 'Escala de orçamento gradual (+10% a +20%)',
    appliedCount: 42,
    positiveCount: 31,
    neutralCount: 8,
    negativeCount: 3,
    successRate: 74,
    averageLiftPercent: 16,
  },
  {
    actionType: 'PAUSE_CAMPAIGN',
    label: 'Pausa de campanhas sem conversão (Stop Loss)',
    appliedCount: 18,
    positiveCount: 15,
    neutralCount: 2,
    negativeCount: 1,
    successRate: 83,
    averageLiftPercent: 22,
  },
  {
    actionType: 'SET_EXACT_BUDGET',
    label: 'Reajuste para valor ótimo de escala',
    appliedCount: 12,
    positiveCount: 9,
    neutralCount: 2,
    negativeCount: 1,
    successRate: 75,
    averageLiftPercent: 12,
  },
];

export function RecommendationPerformanceCard({ stats = DEFAULT_STATS }: RecommendationPerformanceCardProps) {
  return (
    <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md shadow-xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Desempenho Histórico das Decisões ATM</h3>
            <p className="text-xs text-slate-400">
              Taxa histórica de sucesso calculada após período de maturação (7 dias).
            </p>
          </div>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Análise Histórica ATM
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {stats.map((item, idx) => (
          <div
            key={idx}
            className="bg-[#0B1437]/90 border border-[#1B255A] rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition-all space-y-3"
          >
            <div>
              <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block mb-1">
                {item.label}
              </span>

              <div className="flex items-baseline justify-between mt-2">
                <span className="text-xs text-slate-400">Taxa de sucesso:</span>
                <span className="text-lg font-black font-mono text-emerald-400">{item.successRate}%</span>
              </div>

              <div className="w-full bg-[#111C44] rounded-full h-1.5 overflow-hidden my-2 border border-[#1B255A]">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${item.successRate}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-slate-400 bg-[#111C44] p-2 rounded border border-[#1B255A]/60">
                <div>
                  <span className="block text-slate-500">Aplicadas</span>
                  <strong className="text-white font-mono">{item.appliedCount}</strong>
                </div>
                <div>
                  <span className="block text-emerald-400">Positivas</span>
                  <strong className="text-emerald-300 font-mono">{item.positiveCount}</strong>
                </div>
                <div>
                  <span className="block text-slate-500">Neutras/Neg.</span>
                  <strong className="text-slate-300 font-mono">{item.neutralCount + item.negativeCount}</strong>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 pt-2 border-t border-[#1B255A] flex items-center justify-between">
              <span>Impacto médio:</span>
              <strong className="text-emerald-400 font-mono">+{item.averageLiftPercent}% receita</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
