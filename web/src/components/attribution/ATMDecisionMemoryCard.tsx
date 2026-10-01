'use me';
'use strict';
'use client';

import React from 'react';
import { Brain, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { DecisionOutcomeBadge, DecisionOutcome } from './DecisionOutcomeBadge';
import { ATMAccuracyScore } from './ATMAccuracyScore';

export interface DecisionMemoryItem {
  id: string;
  campaignName: string;
  actionTitle: string;
  date: string;
  previousValue: number;
  appliedValue: number;
  outcome: DecisionOutcome;
  impactPercent: number;
  resultDescription: string;
}

interface ATMDecisionMemoryCardProps {
  decisions?: DecisionMemoryItem[];
  currencySymbol?: string;
}

const DEFAULT_DECISIONS: DecisionMemoryItem[] = [
  {
    id: 'dec_1',
    campaignName: 'Black Friday Sale - Conversão',
    actionTitle: 'Escala de orçamento (+20%)',
    date: 'Há 7 dias',
    previousValue: 100,
    appliedValue: 120,
    outcome: 'positive',
    impactPercent: 18,
    resultDescription: 'Aumento de 18% no faturamento com ROAS estabilizado em 4.2x.',
  },
  {
    id: 'dec_2',
    campaignName: 'Retargeting Carrinho Abandonado',
    actionTitle: 'Escala de orçamento (+10%)',
    date: 'Há 12 dias',
    previousValue: 50,
    appliedValue: 55,
    outcome: 'positive',
    impactPercent: 14,
    resultDescription: 'Recuperação de 22 vendas adicionais com CPA dentro da meta.',
  },
  {
    id: 'dec_3',
    campaignName: 'Topo de Funil - Vídeo Criativo 03',
    actionTitle: 'Pausa preventiva (Stop Loss)',
    date: 'Há 15 dias',
    previousValue: 80,
    appliedValue: 0,
    outcome: 'positive',
    impactPercent: 11,
    resultDescription: 'Economia direta de R$ 560 sem impacto negativo nas conversões finais.',
  },
];

export function ATMDecisionMemoryCard({
  decisions = DEFAULT_DECISIONS,
  currencySymbol = 'R$',
}: ATMDecisionMemoryCardProps) {
  return (
    <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md shadow-xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Memória de Decisões ATM</h3>
            <p className="text-xs text-slate-400">
              Acompanhamento de impacto real e aprendizado contínuo após as alterações executadas.
            </p>
          </div>
        </div>

        <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 font-medium">
          Aprendizado Operacional
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score Geral na Coluna Lateral */}
        <div className="lg:col-span-1">
          <ATMAccuracyScore />
        </div>

        {/* Lista das Últimas Decisões e Seus Resultados Reais */}
        <div className="lg:col-span-2 space-y-3">
          <span className="text-xs font-bold text-slate-300 block">
            Últimas decisões com impacto aferido:
          </span>

          <div className="space-y-2.5">
            {decisions.map((dec) => (
              <div
                key={dec.id}
                className="bg-[#0B1437]/90 border border-[#1B255A] hover:border-purple-500/30 rounded-xl p-3.5 space-y-2 transition-all"
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{dec.campaignName}</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" /> {dec.date}
                      </span>
                    </div>
                    <span className="text-[11px] text-purple-300 font-medium">{dec.actionTitle}</span>
                  </div>

                  <DecisionOutcomeBadge outcome={dec.outcome} impactPercent={dec.impactPercent} />
                </div>

                <div className="flex items-center justify-between text-xs bg-[#111C44] p-2 rounded border border-[#1B255A] text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Orçamento:</span>
                    <span className="font-mono text-slate-400 line-through">
                      {currencySymbol} {dec.previousValue.toLocaleString('pt-BR')}/dia
                    </span>
                    <span className="text-indigo-400">➔</span>
                    <strong className="font-mono text-emerald-300 font-bold">
                      {currencySymbol} {dec.appliedValue.toLocaleString('pt-BR')}/dia
                    </strong>
                  </div>

                  <span className="text-[11px] text-slate-300 hidden sm:inline-block">
                    {dec.resultDescription}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
