'use me';
'use strict';
'use client';

import React from 'react';
import { Award, CheckCircle2, MinusCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ATMAccuracyScoreProps {
  totalAnalyzed?: number;
  positiveCount?: number;
  neutralCount?: number;
  negativeCount?: number;
  averageRevenueLift?: number;
  compact?: boolean;
}

export function ATMAccuracyScore({
  totalAnalyzed = 52,
  positiveCount = 41,
  neutralCount = 7,
  negativeCount = 4,
  averageRevenueLift = 14,
  compact = false,
}: ATMAccuracyScoreProps) {
  const accuracyPercent = totalAnalyzed > 0 ? Math.round((positiveCount / totalAnalyzed) * 100) : 0;

  if (totalAnalyzed === 0) {
    return (
      <div className="bg-[#0B1437]/70 border border-[#1B255A] rounded-xl p-4 text-xs text-slate-400">
        <p className="font-bold text-white mb-1">Confiança Histórica ATM em formação</p>
        <p className="text-[11px] text-slate-400">
          A ATM precisa de mais decisões executadas e monitoradas após 7 dias para calcular o score de confiança histórico.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0B1437]/90 border border-purple-500/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Confiança Histórica ATM</span>
            <span className="text-[10px] text-slate-400">Baseado no impacto real medido após as decisões</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-black text-emerald-400 font-mono">{accuracyPercent}%</span>
          <span className="text-[10px] text-slate-400 block">taxa de sucesso</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1B255A] text-center">
        <div className="bg-[#111C44] p-2 rounded border border-[#1B255A]">
          <span className="text-[10px] text-emerald-400 font-bold block flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Positivas
          </span>
          <span className="text-xs font-mono font-bold text-white">{positiveCount}</span>
        </div>

        <div className="bg-[#111C44] p-2 rounded border border-[#1B255A]">
          <span className="text-[10px] text-amber-400 font-bold block flex items-center justify-center gap-1">
            <MinusCircle className="w-3 h-3" /> Neutras
          </span>
          <span className="text-xs font-mono font-bold text-white">{neutralCount}</span>
        </div>

        <div className="bg-[#111C44] p-2 rounded border border-[#1B255A]">
          <span className="text-[10px] text-rose-400 font-bold block flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Negativas
          </span>
          <span className="text-xs font-mono font-bold text-white">{negativeCount}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1">
        <span>Impacto médio de faturamento:</span>
        <strong className="text-emerald-300">+{averageRevenueLift}% na receita</strong>
      </div>
    </div>
  );
}
