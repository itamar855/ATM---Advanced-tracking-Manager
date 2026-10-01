'use me';
'use strict';
'use client';

import React from 'react';
import { Clock, CheckCircle2, User, Sparkles, AlertTriangle, Undo2, LineChart, CheckCheck } from 'lucide-react';
import { CampaignActionStatus } from '@/lib/intelligence/campaign-action-engine';

interface TimelineStep {
  time?: string | null;
  title: string;
  description: string;
  user?: string;
  status: 'done' | 'current' | 'pending' | 'failed';
}

interface ActionTimelineProps {
  status: CampaignActionStatus;
  createdAt: string;
  executedAt?: string | null;
  approvedBy?: string | null;
  previousValue?: number | null;
  targetValue?: number | null;
  appliedValue?: number | null;
  errorMessage?: string | null;
  currencySymbol?: string;
}

export function ActionTimeline({
  status,
  createdAt,
  executedAt,
  approvedBy,
  previousValue,
  targetValue,
  appliedValue,
  errorMessage,
  currencySymbol = 'R$',
}: ActionTimelineProps) {
  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const steps: TimelineStep[] = [
    {
      time: formatTime(createdAt),
      title: 'ATM encontrou oportunidade',
      description: 'Análise heurística identificou tráfego e retorno consistente no período.',
      status: 'done',
    },
    {
      time: formatTime(createdAt),
      title: 'Proposta de alteração gerada',
      description: `Target: ${currencySymbol} ${(targetValue || 0).toLocaleString('pt-BR')} (Aumento seguro recomendado).`,
      status: 'done',
    },
  ];

  if (status === 'recommended') {
    steps.push({
      time: '',
      title: 'Aguardando revisão humana',
      description: 'Necessário aprovação do gestor para prosseguir.',
      status: 'current',
    });
    steps.push({
      time: '',
      title: 'Envio para a Meta Ads API',
      description: 'Será executado após autorização.',
      status: 'pending',
    });
  } else if (status === 'approved' || status === 'executing') {
    steps.push({
      time: formatTime(executedAt || new Date().toISOString()),
      title: 'Usuário autorizou alteração',
      description: 'Gestor revisou os dados e autorizou a execução.',
      user: approvedBy || 'Administrador da Loja',
      status: 'done',
    });
    steps.push({
      time: formatTime(executedAt || new Date().toISOString()),
      title: 'Enviando para Meta Ads API...',
      description: 'Transmitindo novos parâmetros de orçamento com idempotência.',
      status: 'current',
    });
  } else if (status === 'executed') {
    steps.push({
      time: formatTime(executedAt),
      title: 'Usuário autorizou alteração',
      description: 'Gestor revisou os dados e autorizou a execução.',
      user: approvedBy || 'Administrador da Loja',
      status: 'done',
    });
    steps.push({
      time: formatTime(executedAt),
      title: 'Alteração concluída na Meta',
      description: `Orçamento atualizado: De ${currencySymbol} ${previousValue?.toLocaleString('pt-BR')} ➔ Para ${currencySymbol} ${(appliedValue || targetValue)?.toLocaleString('pt-BR')}/dia.`,
      status: 'done',
    });
    // Novos eventos do Learning Engine (Nona Camada)
    steps.push({
      time: 'D+1 a D+7',
      title: 'Monitoramento de impacto ativo',
      description: 'ATM rastreando variações de ROAS, CPA e pedidos após a alteração.',
      status: 'current',
    });
    steps.push({
      time: 'D+7',
      title: 'Impacto calculado e arquivado na Memória',
      description: 'Resultado integrado à taxa histórica de acerto do Learning Engine.',
      status: 'pending',
    });
  } else if (status === 'failed') {
    steps.push({
      time: formatTime(executedAt),
      title: 'Falha na execução',
      description: errorMessage || 'A API da Meta recusou a alteração ou os guardrails foram acionados.',
      status: 'failed',
    });
  } else if (status === 'rejected') {
    steps.push({
      time: formatTime(executedAt),
      title: 'Proposta descartada',
      description: 'O gestor optou por não aplicar a alteração.',
      user: approvedBy || 'Administrador da Loja',
      status: 'done',
    });
  } else if (status === 'rolled_back') {
    steps.push({
      time: formatTime(executedAt),
      title: 'Alteração revertida (Rollback)',
      description: 'Orçamento restaurado com sucesso ao snapshot original anterior.',
      status: 'done',
    });
  }

  return (
    <div className="bg-[#0B1437]/90 border border-[#1B255A] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-[#1B255A] pb-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          Histórico da Decisão (Audit Trail & Aprendizado)
        </span>
        <span className="text-[10px] text-slate-400 font-mono">Governança Operacional</span>
      </div>

      <div className="relative pl-4 space-y-4 border-l border-[#1B255A] ml-2 my-1">
        {steps.map((step, idx) => {
          let dotColor = 'bg-slate-600';
          let textColor = 'text-slate-400';

          if (step.status === 'done') {
            dotColor = 'bg-emerald-400';
            textColor = 'text-slate-200';
          } else if (step.status === 'current') {
            dotColor = 'bg-indigo-400 animate-pulse';
            textColor = 'text-indigo-300 font-semibold';
          } else if (step.status === 'failed') {
            dotColor = 'bg-rose-400';
            textColor = 'text-rose-300';
          }

          return (
            <div key={idx} className="relative group">
              {/* Dot */}
              <div
                className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-[#0B1437]`}
              />

              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-bold ${textColor}`}>{step.title}</span>
                {step.time && <span className="text-[10px] text-slate-500 font-mono">{step.time}</span>}
              </div>

              <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{step.description}</p>

              {step.user && (
                <div className="flex items-center gap-1 text-[10px] text-indigo-300/80 mt-1">
                  <User className="w-3 h-3 text-indigo-400" />
                  <span>Executado por: {step.user}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
