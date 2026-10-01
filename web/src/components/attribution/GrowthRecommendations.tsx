'use me';
'use strict';
'use client';

import React from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Eye, ArrowRight, CheckCircle2, Zap } from 'lucide-react';

interface CampaignData {
  id: string;
  name: string;
  utm_campaign?: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa?: number;
}

interface GrowthRecommendationsProps {
  campaigns: CampaignData[];
  onSelectCampaign?: (campaignName: string) => void;
  onReviewAction?: (campaignName: string, campaignId?: string) => void;
}

export function GrowthRecommendations({
  campaigns,
  onSelectCampaign,
  onReviewAction,
}: GrowthRecommendationsProps) {
  if (!campaigns || campaigns.length === 0) {
    return null;
  }

  // Calculate average ROAS for baseline comparison
  const totalSpend = campaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Classify campaigns heuristically
  const scaleCandidates = campaigns.filter(c => {
    const roas = c.spend > 0 ? c.revenue / c.spend : c.roas || 0;
    return roas >= Math.max(avgRoas * 1.1, 1.5) && c.revenue > 0 && c.conversions >= 3;
  });

  const reviewCandidates = campaigns.filter(c => {
    const roas = c.spend > 0 ? c.revenue / c.spend : c.roas || 0;
    return c.spend > 100 && (roas < 0.8 || c.conversions === 0);
  });

  const observeCandidates = campaigns.filter(c => {
    return c.spend <= 100 || (c.conversions > 0 && c.conversions < 3);
  });

  const recommendations = [];

  if (scaleCandidates.length > 0) {
    const top = scaleCandidates[0];
    const roasVal = top.spend > 0 ? (top.revenue / top.spend).toFixed(2) : top.roas?.toFixed(2) || '0.00';
    const revShare = totalRevenue > 0 ? Math.round((top.revenue / totalRevenue) * 100) : 0;
    recommendations.push({
      id: 'scale',
      type: 'scale' as const,
      icon: TrendingUp,
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      title: `Avaliar aumento de investimento: ${top.name}`,
      reason: `Essa campanha possui retorno e faturamento significativamente acima da média da conta.`,
      usedData: [
        `${top.conversions} vendas atribuídas`,
        `ROAS de ${roasVal}x`,
        `${revShare}% do faturamento total (R$ ${top.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
      ],
      actionSuggested: 'Avaliar aumento gradual de orçamento (10% a 20%) mantendo a monitoria de ROAS.',
      campaignName: top.name,
      campaignId: top.id,
      buttonText: 'Ver campanha'
    });
  }

  if (reviewCandidates.length > 0) {
    const target = reviewCandidates[0];
    const roasVal = target.spend > 0 ? (target.revenue / target.spend).toFixed(2) : target.roas?.toFixed(2) || '0.00';
    recommendations.push({
      id: 'review',
      type: 'review' as const,
      icon: AlertTriangle,
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      title: `Revisar eficiência: ${target.name}`,
      reason: `Investimento acumulado sem retorno proporcional nas vendas auditadas.`,
      usedData: [
        `R$ ${target.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} investidos`,
        `${target.conversions} vendas rastreadas`,
        `ROAS atual de ${roasVal}x`
      ],
      actionSuggested: 'Revisar segmentação de público ou criativos antes de manter o nível de gastos.',
      campaignName: target.name,
      campaignId: target.id,
      buttonText: 'Analisar no ranking'
    });
  }

  if (observeCandidates.length > 0 && recommendations.length < 3) {
    const target = observeCandidates[0];
    recommendations.push({
      id: 'observe',
      type: 'observe' as const,
      icon: Eye,
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      title: `Manter em observação: ${target.name}`,
      reason: `Maturidade estatística ainda em construção no período.`,
      usedData: [
        `${target.conversions} vendas registradas`,
        `Investimento inicial de R$ ${target.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      ],
      actionSuggested: 'Aguardar mais volume de dados antes de tomar decisão de corte ou escala.',
      campaignName: target.name,
      campaignId: target.id,
      buttonText: 'Acompanhar'
    });
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#111C44]/40 border border-[#2B3674] rounded-xl p-5 mb-6 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-indigo-400" />
        <h3 className="text-base font-semibold text-white">Recomendações de crescimento</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 ml-auto">
          Auditável por Dados
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recommendations.map((rec) => {
          const Icon = rec.icon;
          return (
            <div
              key={rec.id}
              className="bg-[#0B1437]/80 border border-[#1B255A] rounded-lg p-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${rec.badgeColor} inline-flex items-center gap-1.5`}>
                    <Icon className="w-3.5 h-3.5" />
                    {rec.type === 'scale' ? 'Escala Sugerida' : rec.type === 'review' ? 'Revisão Sugerida' : 'Observação'}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-white mb-2">{rec.title}</h4>

                <div className="space-y-2 text-xs text-slate-300 mb-3">
                  <p><strong className="text-slate-200">Motivo:</strong> {rec.reason}</p>

                  <div className="bg-[#0B1437] border border-[#1B255A] p-2.5 rounded space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Dados usados:
                    </span>
                    {rec.usedData.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-indigo-300 pt-1"><strong className="text-indigo-200">Ação sugerida:</strong> {rec.actionSuggested}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#1B255A]">
                {onReviewAction && rec.type === 'scale' && (
                  <button
                    type="button"
                    onClick={() => onReviewAction(rec.campaignName, rec.campaignId)}
                    className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Revisar proposta (+10%)</span>
                  </button>
                )}

                {onSelectCampaign && (
                  <button
                    onClick={() => onSelectCampaign(rec.campaignName)}
                    className="text-xs font-medium text-slate-400 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                  >
                    {rec.buttonText}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
