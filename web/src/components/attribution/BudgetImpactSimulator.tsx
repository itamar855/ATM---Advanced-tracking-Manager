'use me';
'use strict';
'use client';

import React, { useState } from 'react';
import { Calculator, Info, AlertCircle } from 'lucide-react';

interface BudgetImpactSimulatorProps {
  currentSpend: number;
  currentRevenue: number;
  currentConversions: number;
  currentRoas: number;
  currencySymbol?: string;
}

export function BudgetImpactSimulator({
  currentSpend,
  currentRevenue,
  currentConversions,
  currentRoas,
  currencySymbol = 'R$'
}: BudgetImpactSimulatorProps) {
  const initialNewSpend = currentSpend > 0 ? Math.round(currentSpend * 1.25) : 1000;
  const [newSpend, setNewSpend] = useState<number>(initialNewSpend);

  const effectiveRoas = currentSpend > 0 ? currentRevenue / currentSpend : currentRoas || 0;

  // Visual Projection (Estimativa baseada no desempenho atual)
  const projectedRevenue = newSpend * effectiveRoas;
  const projectedConversions = currentSpend > 0 && currentConversions > 0
    ? Math.round((newSpend / currentSpend) * currentConversions)
    : 0;

  return (
    <div className="bg-[#111C44]/40 border border-[#2B3674] rounded-xl p-5 mb-6 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-5 h-5 text-indigo-400" />
        <h3 className="text-base font-semibold text-white">Simulador de Impacto no Orçamento</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 ml-auto">
          Simulação Visual
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-4">
        Simule como o faturamento pode reagir se você ajustar o orçamento mantendo a eficiência atual da atribuição.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0B1437]/80 border border-[#1B255A] p-4 rounded-lg">
        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Orçamento atual no período
            </label>
            <div className="text-sm font-semibold text-white bg-[#111C44] px-3 py-2 rounded border border-[#2B3674]">
              {currencySymbol} {currentSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Simular novo orçamento: <strong className="text-indigo-400">{currencySymbol} {newSpend.toLocaleString('pt-BR')}</strong>
            </label>
            <input
              type="range"
              min={Math.max(100, Math.round(currentSpend * 0.5))}
              max={Math.max(5000, Math.round(currentSpend * 3))}
              step={50}
              value={newSpend}
              onChange={(e) => setNewSpend(Number(e.target.value))}
              className="w-full h-2 bg-[#111C44] rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>{currencySymbol} {Math.max(100, Math.round(currentSpend * 0.5))}</span>
              <span>{currencySymbol} {Math.max(5000, Math.round(currentSpend * 3))}</span>
            </div>
          </div>
        </div>

        {/* Projected Outcome */}
        <div className="flex flex-col justify-between bg-[#111C44] border border-[#2B3674] p-4 rounded-lg">
          <div>
            <span className="text-xs font-medium text-slate-400">Projeção Estimada</span>
            <div className="mt-2 space-y-2">
              <div>
                <span className="text-[11px] text-slate-400">Faturamento Projetado:</span>
                <div className="text-xl font-bold text-emerald-400">
                  {currencySymbol} {projectedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-[#1B255A]">
                <span>Vendas Projetadas:</span>
                <strong className="text-white">~ {projectedConversions} pedidos</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>ROAS Considerado:</span>
                <strong className="text-white">{effectiveRoas.toFixed(2)}x</strong>
              </div>
            </div>
          </div>

          {/* Mandatory Disclaimer */}
          <div className="mt-4 pt-2 border-t border-[#1B255A] flex items-start gap-1.5 text-[11px] text-slate-400">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Estimativa baseada no desempenho atual.</strong> Os resultados reais podem variar conforme o leilão e a saturação de público.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
