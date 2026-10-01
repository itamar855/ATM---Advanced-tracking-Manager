'use me';
'use strict';
'use client';

import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, Zap, X, ArrowRight, Lock } from 'lucide-react';
import { CampaignAction } from '@/lib/intelligence/campaign-action-engine';
import { ActionExecutionStatus } from './ActionExecutionStatus';
import { ActionConfidenceBadge } from './ActionConfidenceBadge';
import { ActionTimeline } from './ActionTimeline';

interface ActionConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: CampaignAction | null;
  onApprove: (actionId: string, idempotencyKey: string) => Promise<void>;
  onReject: (actionId: string, idempotencyKey: string) => Promise<void>;
  onRollback?: (actionId: string) => Promise<void>;
  currencySymbol?: string;
}

export function ActionConfirmationModal({
  isOpen,
  onClose,
  action,
  onApprove,
  onReject,
  onRollback,
  currencySymbol = 'R$',
}: ActionConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  if (!isOpen || !action) return null;

  const prevVal = action.previousValue ?? 0;
  const targetVal = action.targetValue ?? Math.round(prevVal * 1.1);
  const percentDiff = prevVal > 0 ? Math.round(((targetVal - prevVal) / prevVal) * 100) : 10;

  // Guardrail visual
  const maxIncreaseLimit = 20; // 20% guardrail limit
  const isWithinGuardrails = percentDiff <= maxIncreaseLimit;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const idempotencyKey = action.idempotencyKey || `exec_${action.id || Date.now()}_${crypto.randomUUID()}`;
      await onApprove(action.id || '', idempotencyKey);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const idempotencyKey = `reject_${action.id || Date.now()}_${crypto.randomUUID()}`;
      await onReject(action.id || '', idempotencyKey);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRollbackAction = async () => {
    if (!onRollback || !action.id || isRollingBack) return;
    setIsRollingBack(true);
    try {
      await onRollback(action.id);
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm fade-in">
      <div className="bg-[#11141E] border border-purple-500/40 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 relative text-zinc-100 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header com Score de Confiança */}
        <div className="flex items-center justify-between flex-wrap gap-2 pr-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Revisar Alteração de Orçamento</h3>
              <p className="text-xs text-zinc-400">Governança Operacional Assistida Meta Ads</p>
            </div>
          </div>

          <ActionConfidenceBadge score="high" />
        </div>

        {/* Status atual da Ação */}
        {action.status !== 'recommended' && (
          <ActionExecutionStatus
            status={action.status}
            previousValue={action.previousValue}
            targetValue={action.targetValue}
            appliedValue={action.appliedValue}
            errorMessage={action.errorMessage}
            executedAt={action.executedAt}
            onRollback={onRollback ? handleRollbackAction : undefined}
            isRollingBack={isRollingBack}
            currencySymbol={currencySymbol}
          />
        )}

        {/* Detalhes da Proposta vinda do Backend */}
        <div className="bg-[#161B26] border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-zinc-800/80 pb-2">
            <span className="text-zinc-400">Campanha Alvo:</span>
            <strong className="text-white font-bold truncate max-w-[260px]">{action.campaignName}</strong>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-[#0B1437] p-2.5 rounded border border-[#1B255A]">
              <span className="text-[10px] text-zinc-400 block font-medium">Orçamento Atual:</span>
              <span className="text-sm font-mono font-bold text-slate-300">
                {currencySymbol} {prevVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia
              </span>
            </div>

            <div className="bg-[#0B1437] p-2.5 rounded border border-purple-500/30">
              <span className="text-[10px] text-purple-300 block font-medium">Proposta ATM (+{percentDiff}%):</span>
              <span className="text-sm font-mono font-bold text-purple-300">
                {currencySymbol} {targetVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia
              </span>
            </div>
          </div>

          <div className="text-xs text-zinc-300 pt-1">
            <strong className="text-zinc-200">Motivo:</strong> {action.reason || 'Escala recomendada baseada no ROAS e vendas do período.'}
          </div>
        </div>

        {/* Audit Trail (Linha do Tempo) */}
        <ActionTimeline
          status={action.status}
          createdAt={action.createdAt}
          executedAt={action.executedAt}
          approvedBy={action.approvedBy}
          previousValue={action.previousValue}
          targetValue={action.targetValue}
          appliedValue={action.appliedValue}
          errorMessage={action.errorMessage}
          currencySymbol={currencySymbol}
        />

        {/* Painel Amigável de Guardrails de Segurança */}
        <div className="bg-[#0B1437]/90 border border-[#1B255A] rounded-lg p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-indigo-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Proteções Ativas da Conta</span>
          </div>

          <p className="text-[11px] text-slate-300 leading-relaxed">
            Sua conta permite aumentos de até <strong>{maxIncreaseLimit}%</strong> por alteração.
            Esta proposta representa <strong>+{percentDiff}%</strong>.
          </p>

          {isWithinGuardrails ? (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
              ✓ Guardrail verificado: Alteração dentro do limite de segurança.
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
              ⚠️ Alerta: Requer autorização especial.
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        {action.status === 'recommended' && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleRejectAction}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs font-semibold transition-all cursor-pointer"
            >
              Descartar recomendação
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Aplicando na Meta...' : 'Confirmar e aplicar na Meta'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {action.status !== 'recommended' && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
