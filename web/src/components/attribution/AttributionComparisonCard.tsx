'use me';
'use strict';
'use client';

import React from 'react';
import { Calendar, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

interface MetricComparison {
  current: number;
  previous?: number;
  label: string;
  isCurrency?: boolean;
}

interface AttributionComparisonCardProps {
  currentRevenue: number;
  currentOrders: number;
  currentRoas?: number | null;
  previousRevenue?: number;
  previousOrders?: number;
  previousRoas?: number;
  currencySymbol?: string;
}

export function AttributionComparisonCard({
  currentRevenue,
  currentOrders,
  currentRoas,
  previousRevenue,
  previousOrders,
  previousRoas,
  currencySymbol = 'R$',
}: AttributionComparisonCardProps) {
  // Verificação rigorosa: Se não existir histórico real prévio, exibir estado sem histórico
  const hasHistory = typeof previousRevenue === 'number' && previousRevenue > 0;

  if (!hasHistory) {
    return (
      <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Evolução do Negócio</h3>
        </div>

        <div className="flex items-center gap-2 p-3 bg-[#0B1437]/70 border border-[#1B255A] rounded-lg text-xs text-slate-400">
          <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>A ATM está acumulando dados suficientes do histórico anterior para comparar a evolução das suas vendas.</span>
        </div>
      </div>
    );
  }

  const calcDiff = (curr: number, prev: number) => {
    if (!prev || prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  };

  const revenueDiff = calcDiff(currentRevenue, previousRevenue!);
  const ordersDiff = calcDiff(currentOrders, previousOrders || 0);
  const roasDiff = typeof currentRoas === 'number' && typeof previousRoas === 'number'
    ? calcDiff(currentRoas, previousRoas)
    : 0;

  const renderMetric = (label: string, value: string, diff: number) => {
    const isPositive = diff >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';

    return (
      <div className="bg-[#0B1437]/80 border border-[#1B255A] rounded-lg p-3.5 flex flex-col justify-between">
        <span className="text-xs text-slate-400 font-medium">{label}</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-base font-bold text-white">{value}</span>
          <span className={`text-xs font-bold flex items-center ${colorClass}`}>
            <Icon className="w-3.5 h-3.5 mr-0.5" />
            {Math.abs(diff).toFixed(1)}%
          </span>
        </div>
        <span className="text-[10px] text-slate-500 mt-1">vs. período anterior</span>
      </div>
    );
  };

  return (
    <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Evolução do Negócio</h3>
        </div>
        <span className="text-xs text-slate-400 bg-[#0B1437] px-2.5 py-1 rounded border border-[#1B255A]">
          Comparado ao período anterior
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {renderMetric(
          'Receita Atribuída',
          `${currencySymbol} ${currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          revenueDiff
        )}
        {renderMetric(
          'Pedidos Confirmados',
          `${currentOrders.toLocaleString('pt-BR')}`,
          ordersDiff
        )}
        {renderMetric(
          'ROAS Médio',
          currentRoas ? `${currentRoas.toFixed(2)}x` : 'N/A',
          roasDiff
        )}
      </div>
    </div>
  );
}
