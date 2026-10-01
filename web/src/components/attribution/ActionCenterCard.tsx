'use me';
'use strict';
'use client';

import React, { useState } from 'react';
import { Target, Clock, CheckCircle2, Undo2, ArrowUpRight, ShieldCheck, Brain } from 'lucide-react';
import { CampaignAction } from '@/lib/intelligence/campaign-action-engine';
import { ActionExecutionStatus } from './ActionExecutionStatus';
import { ATMDecisionMemoryCard } from './ATMDecisionMemoryCard';
import { RecommendationPerformanceCard } from './RecommendationPerformanceCard';

interface ActionCenterCardProps {
  pendingActions?: CampaignAction[];
  executedActions?: CampaignAction[];
  rolledBackActions?: CampaignAction[];
  onReviewAction: (action: CampaignAction) => void;
  onRollbackAction: (actionId: string) => Promise<void>;
  currencySymbol?: string;
}

export function ActionCenterCard({
  pendingActions = [],
  executedActions = [],
  rolledBackActions = [],
  onReviewAction,
  onRollbackAction,
  currencySymbol = 'R$',
}: ActionCenterCardProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'executed' | 'rolled_back' | 'learning'>('pending');

  const getActiveList = () => {
    if (activeTab === 'pending') return pendingActions;
    if (activeTab === 'executed') return executedActions;
    if (activeTab === 'rolled_back') return rolledBackActions;
    return [];
  };

  const list = getActiveList();

  return (
    <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md shadow-xl">
      {/* Header do Action Center */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Decisões da ATM
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Action Center & Aprendizado
              </span>
            </h3>
            <p className="text-xs text-slate-400">Fila de aprovação assistida, histórico de alterações e memória de impacto.</p>
          </div>
        </div>

        {/* 4 Abas de Navegação (incluindo Aprendizado) */}
        <div className="bg-[#0B1437] border border-[#1B255A] p-1 rounded-lg flex items-center gap-1 text-xs font-semibold flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-purple-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pendentes ({pendingActions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('executed')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'executed'
                ? 'bg-purple-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Executadas ({executedActions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rolled_back')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rolled_back'
                ? 'bg-purple-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Revertidas ({rolledBackActions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('learning')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'learning'
                ? 'bg-indigo-600 text-white shadow-sm font-bold'
                : 'text-indigo-300 hover:text-white'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-indigo-300" />
            <span>Aprendizado & Memória</span>
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba 'Aprendizado' */}
      {activeTab === 'learning' ? (
        <div className="space-y-4 fade-in">
          <ATMDecisionMemoryCard currencySymbol={currencySymbol} />
          <RecommendationPerformanceCard />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-[#0B1437]/60 border border-[#1B255A] rounded-lg p-6 text-center text-xs text-slate-400 space-y-1">
          <p className="font-bold text-slate-300">
            Nenhuma decisão {activeTab === 'pending' ? 'pendente' : activeTab === 'executed' ? 'executada' : 'revertida'} no momento.
          </p>
          <p className="text-[11px] text-slate-500">A ATM continua monitorando suas campanhas para sugerir ações com segurança.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((act, idx) => {
            const prev = act.previousValue || 0;
            const target = act.targetValue || Math.round(prev * 1.1);

            return (
              <div
                key={act.id || idx}
                className="bg-[#0B1437]/90 border border-[#1B255A] hover:border-purple-500/40 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3 transition-all"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate max-w-[280px]">
                      {act.campaignName}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                      {act.actionType}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300">{act.reason}</p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                    <span>
                      Orçamento: <strong className="text-slate-200">{currencySymbol} {prev.toLocaleString('pt-BR')} ➔ {currencySymbol} {target.toLocaleString('pt-BR')}/dia</strong>
                    </span>
                    {act.createdAt && (
                      <span className="text-slate-500">
                        {new Date(act.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'pending' && (
                    <button
                      type="button"
                      onClick={() => onReviewAction(act)}
                      className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer active:scale-95 transition-all"
                    >
                      <span>Revisar proposta</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {activeTab === 'executed' && (
                    <button
                      type="button"
                      onClick={() => act.id && onRollbackAction(act.id)}
                      className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-300 hover:text-white hover:bg-purple-500/20 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Reverter</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
