'use me';
'use strict';
'use client';

import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, RefreshCw, Undo2 } from 'lucide-react';
import { CampaignActionStatus } from '@/lib/intelligence/campaign-action-engine';

interface ActionExecutionStatusProps {
  status: CampaignActionStatus;
  previousValue?: number | null;
  targetValue?: number | null;
  appliedValue?: number | null;
  errorMessage?: string | null;
  executedAt?: string | null;
  onRollback?: () => void;
  isRollingBack?: boolean;
  currencySymbol?: string;
}

export function ActionExecutionStatus({
  status,
  previousValue,
  targetValue,
  appliedValue,
  errorMessage,
  executedAt,
  onRollback,
  isRollingBack = false,
  currencySymbol = 'R$',
}: ActionExecutionStatusProps) {
  const formatVal = (v?: number | null) =>
    v !== undefined && v !== null
      ? `${currencySymbol} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia`
      : 'N/A';

  if (status === 'recommended' || status === 'approved') {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
        <Clock className="w-4 h-4 shrink-0 text-amber-400" />
        <div>
          <span className="font-bold block">🟡 Aguardando sua aprovação</span>
          <span className="text-[11px] text-amber-300/80">Proposta pronta para revisão e autorização de alteração.</span>
        </div>
      </div>
    );
  }

  if (status === 'executing') {
    return (
      <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-blue-400" />
        <div>
          <span className="font-bold block">🔵 Aplicando alteração na Meta Ads...</span>
          <span className="text-[11px] text-blue-300/80">Validando credenciais e enviando nova configuração para a API da Meta.</span>
        </div>
      </div>
    );
  }

  if (status === 'executed') {
    return (
      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-white">🟢 Orçamento atualizado com sucesso na Meta</span>
          </div>
          {executedAt && (
            <span className="text-[10px] text-emerald-400/70">
              {new Date(executedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs bg-[#0B1437]/80 p-2 rounded border border-emerald-500/20">
          <div>
            <span className="text-[10px] text-slate-400 block">De (Anterior):</span>
            <span className="font-mono text-slate-300">{formatVal(previousValue)}</span>
          </div>
          <span className="text-slate-500">➔</span>
          <div>
            <span className="text-[10px] text-emerald-400 block">Para (Novo):</span>
            <span className="font-mono font-bold text-emerald-300">{formatVal(appliedValue || targetValue)}</span>
          </div>
        </div>

        {onRollback && (
          <button
            type="button"
            onClick={onRollback}
            disabled={isRollingBack}
            className="mt-1 text-[11px] text-purple-400 hover:text-purple-300 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Undo2 className="w-3 h-3" />
            <span>{isRollingBack ? 'Revertendo alteração...' : 'Desfazer alteração (Rollback)'}</span>
          </button>
        )}
      </div>
    );
  }

  if (status === 'failed' || status === 'rejected') {
    return (
      <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300">
        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
        <div>
          <span className="font-bold block">
            {status === 'rejected' ? '⚪ Ação descartada pelo gestor' : '🔴 Não foi possível aplicar na Meta'}
          </span>
          <span className="text-[11px] text-rose-300/80 leading-relaxed block mt-0.5">
            {errorMessage || 'A solicitação foi recusada pelas regras de segurança da loja ou pela API.'}
          </span>
        </div>
      </div>
    );
  }

  if (status === 'rolled_back') {
    return (
      <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
        <Undo2 className="w-4 h-4 shrink-0 text-purple-400" />
        <div>
          <span className="font-bold block">🟣 Alteração revertida (Rollback concluído)</span>
          <span className="text-[11px] text-purple-300/80">O orçamento da campanha foi restaurado ao valor original anterior.</span>
        </div>
      </div>
    );
  }

  return null;
}
