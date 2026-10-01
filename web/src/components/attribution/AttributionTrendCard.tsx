'use me';
'use strict';
'use client';

import React from 'react';
import { Calendar, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

interface PeriodData {
  revenue: number;
  conversions: number;
  roas: number;
}

interface AttributionTrendCardProps {
  currentPeriod?: PeriodData;
  previousPeriod?: PeriodData;
  currencySymbol?: string;
}

export function AttributionTrendCard({ currentPeriod, previousPeriod, currencySymbol = 'R$' }: AttributionTrendCardProps) {
  // If no previous period historical data is supplied
  if (!previousPeriod || previousPeriod.revenue === 0) {
    return (
      <div className="bg-[#111C44]/40 border border-[#2B3674] rounded-xl p-5 mb-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Comparação com período anterior</h3>
        </div>
        <div className="flex items-center gap-2 p-3 bg-[#0B1437]/60 border border-[#1B255A] rounded-lg text-xs text-slate-400">
          <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>Estamos coletando histórico para comparação temporal nos próximos relatórios.</span>
        </div>
      </div>
    );
  }

  const calcDiff = (curr: number, prev: number) => {
    if (!prev || prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  };

  const revenueDiff = calcDiff(currentPeriod?.revenue || 0, previousPeriod.revenue);
  const convDiff = calcDiff(currentPeriod?.conversions || 0, previousPeriod.conversions);
  const roasDiff = calcDiff(currentPeriod?.roas || 0, previousPeriod.roas);

  const renderMetricDiff = (label: string, value: string, diff: number) => {
    const isPositive = diff >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';

    return (
      <div className="bg-[#0B1437]/80 border border-[#1B255A] rounded-lg p-3">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-base font-bold text-white">{value}</span>
          <span className={`text-xs font-semibold flex items-center ${colorClass}`}>
            <Icon className="w-3.5 h-3.5 mr-0.5" />
            {Math.abs(diff).toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#111C44]/40 border border-[#2B3674] rounded-xl p-5 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Comparação com período anterior</h3>
        </div>
        <span className="text-xs text-slate-400 bg-[#0B1437] px-2.5 py-1 rounded border border-[#1B255A]">
          Últimos 7 dias vs. 7 dias anteriores
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {renderMetricDiff(
          'Receita Atribuída',
          `${currencySymbol} ${(currentPeriod?.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          revenueDiff
        )}
        {renderMetricDiff(
          'Pedidos Identificados',
          `${currentPeriod?.conversions || 0}`,
          convDiff
        )}
        {renderMetricDiff(
          'ROAS Médio',
          `${(currentPeriod?.roas || 0).toFixed(2)}x`,
          roasDiff
        )}
      </div>
    </div>
  );
}
