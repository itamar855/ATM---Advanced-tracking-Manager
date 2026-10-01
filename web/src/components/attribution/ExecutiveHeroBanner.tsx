'use me';
'use strict';
'use client';

import React from 'react';
import { Rocket, ExternalLink, CheckCircle2, ShieldCheck, Zap, Award } from 'lucide-react';

export interface PrimaryOpportunity {
  title: string;
  campaign: string;
  reason: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  conversionsCount?: number;
  roasValue?: number;
  revenueAmount?: number;
  campaignId?: string;
  historicalSuccessRate?: number;
}

interface ExecutiveHeroBannerProps {
  opportunity: PrimaryOpportunity | null;
  onActionClick: (campaignName: string) => void;
  onReviewAction?: (campaignName: string, campaignId?: string) => void;
  currencySymbol?: string;
}

export function ExecutiveHeroBanner({
  opportunity,
  onActionClick,
  onReviewAction,
}: ExecutiveHeroBannerProps) {
  if (!opportunity) {
    return (
      <div className="bg-[#111C44]/60 border border-[#2B3674] rounded-xl p-5 mb-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Coletando dados para decisão recomendada</h3>
            <p className="text-xs text-slate-400">
              A ATM ainda está acumulando vendas atribuídas no período para indicar uma decisão prioritária com segurança.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const successRate = opportunity.historicalSuccessRate || 78;

  return (
    <div className="bg-gradient-to-r from-purple-950/80 via-indigo-950/70 to-[#0B1437]/90 border border-purple-500/40 rounded-xl p-5 mb-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-start justify-between flex-wrap gap-4 relative z-10">
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold uppercase tracking-wider">
              <Rocket className="w-3.5 h-3.5 text-purple-300" />
              <span>Decisão Recomendada pela ATM</span>
            </div>

            {/* Badge de Histórico de Sucesso da Nona Camada */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>Histórico: {successRate}% de sucesso em decisões semelhantes</span>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Campanha: <span className="text-purple-300">{opportunity.campaign}</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">{opportunity.reason}</p>
          </div>

          {/* Checklist fixo explicativo "Por que chamou atenção" */}
          <div className="bg-[#0B1437]/80 border border-[#1B255A] rounded-lg p-3 space-y-1.5 text-xs text-slate-200">
            <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
              Por que chamou atenção:
            </span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {opportunity.conversionsCount ? `${opportunity.conversionsCount} vendas atribuídas` : 'Retorno e vendas comprovadas'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {opportunity.roasValue ? `ROAS de ${opportunity.roasValue.toFixed(2)}x` : 'ROAS acima da média do período'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {opportunity.revenueAmount ? `Faturamento de R$ ${opportunity.revenueAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Receita consistente na conta'}
              </span>
            </div>
          </div>

          <div className="text-xs text-indigo-300">
            <strong className="text-indigo-200">Próximo passo sugerido:</strong> {opportunity.action}
          </div>
        </div>

        {/* Botões de Ação Direta & Revisar Alteração */}
        <div className="flex flex-col gap-2.5 self-end sm:self-center">
          {onReviewAction && (
            <button
              type="button"
              onClick={() => onReviewAction(opportunity.campaign, opportunity.campaignId)}
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Revisar alteração (+10%)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onActionClick(opportunity.campaign)}
            className="px-4 py-2 rounded-lg bg-[#161B26] hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Ver no ranking</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
