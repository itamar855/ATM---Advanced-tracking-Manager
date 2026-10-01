'use me';
'use strict';
'use client';

import React from 'react';
import { Bell, TrendingUp, AlertTriangle, PieChart, ArrowRight } from 'lucide-react';

interface CampaignData {
  campaignId: string | null;
  campaignName: string;
  source: string;
  attributedRevenue: number;
  ordersCount: number;
  spend?: number;
}

interface AttributionAlertsProps {
  campaigns: CampaignData[];
  totalRevenue: number;
  spendAmount?: number | null;
  onSelectCampaign?: (campaignName: string) => void;
}

export function AttributionAlerts({
  campaigns,
  totalRevenue,
  spendAmount,
  onSelectCampaign,
}: AttributionAlertsProps) {
  if (!campaigns || campaigns.length === 0) {
    return null;
  }

  const alerts = [];

  // Base metrics
  const totalCampaignRevenue = campaigns.reduce((acc, c) => acc + (c.attributedRevenue || 0), 0);
  const totalCampaignSpend = campaigns.reduce((acc, c) => acc + (c.spend || 0), 0) || (spendAmount || 0);
  const avgRoas = totalCampaignSpend > 0 ? totalCampaignRevenue / totalCampaignSpend : 0;

  // 1. Regra 🚀 Escala: ROAS > Média e Volume de vendas relevante (>= 3)
  const scaleCandidate = campaigns.find((c) => {
    const cSpend = c.spend || (totalCampaignSpend / (campaigns.length || 1));
    const cRoas = cSpend > 0 ? c.attributedRevenue / cSpend : 0;
    return cRoas > Math.max(avgRoas * 1.1, 1.3) && c.ordersCount >= 3 && c.attributedRevenue > 0;
  });

  if (scaleCandidate) {
    alerts.push({
      id: 'scale',
      type: 'scale' as const,
      icon: TrendingUp,
      badge: '🚀 Oportunidade de Escala',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      title: `Campanha "${scaleCandidate.campaignName}" acima da média`,
      message: 'Identificamos uma oportunidade baseada nos dados atuais de vendas e faturamento.',
      actionText: 'Avaliar aumento gradual de orçamento para testar escala.',
      campaignName: scaleCandidate.campaignName,
    });
  }

  // 2. Regra ⚠️ Desperdício: spend > threshold (ex: R$ 100) E orders === 0
  const wasteCandidate = campaigns.find((c) => {
    const cSpend = c.spend || 0;
    return cSpend > 100 && c.ordersCount === 0;
  });

  if (wasteCandidate) {
    alerts.push({
      id: 'waste',
      type: 'waste' as const,
      icon: AlertTriangle,
      badge: '⚠️ Atenção a Desperdício',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      title: `Investimento sem retorno em "${wasteCandidate.campaignName}"`,
      message: 'Existe investimento acumulado sem vendas identificadas no período.',
      actionText: 'Revisar criativos, público ou pausar caso não esteja em fase inicial de teste.',
      campaignName: wasteCandidate.campaignName,
    });
  }

  // 3. Regra 🟡 Dependência: campaignRevenue / totalRevenue > 0.60
  const dominantCandidate = campaigns.find((c) => {
    return totalRevenue > 0 && c.attributedRevenue / totalRevenue > 0.60;
  });

  if (dominantCandidate) {
    const share = Math.round((dominantCandidate.attributedRevenue / totalRevenue) * 100);
    alerts.push({
      id: 'dependency',
      type: 'dependency' as const,
      icon: PieChart,
      badge: '🟡 Concentração de Receita',
      badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      title: `Forte dependência da campanha "${dominantCandidate.campaignName}"`,
      message: `Grande parte das vendas (${share}%) está concentrada nesta única campanha.`,
      actionText: 'Diversificar investimentos em outros canais/anúncios para reduzir o risco.',
      campaignName: dominantCandidate.campaignName,
    });
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#111C44]/50 border border-[#2B3674] rounded-xl p-5 mb-5 backdrop-blur-md">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-indigo-400" />
        <h3 className="text-base font-semibold text-white">Alertas Importantes</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 ml-auto">
          {alerts.length} observações ativas
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {alerts.map((alert) => {
          const Icon = alert.icon;
          return (
            <div
              key={alert.id}
              className="bg-[#0B1437]/80 border border-[#1B255A] rounded-lg p-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all"
            >
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${alert.badgeClass} inline-flex items-center gap-1`}>
                    <Icon className="w-3 h-3" />
                    {alert.badge}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white mb-1.5">{alert.title}</h4>
                <p className="text-xs text-slate-300 mb-2 leading-relaxed">{alert.message}</p>
                <p className="text-[11px] text-indigo-300"><strong className="text-indigo-200">Ação:</strong> {alert.actionText}</p>
              </div>

              {onSelectCampaign && (
                <button
                  type="button"
                  onClick={() => onSelectCampaign(alert.campaignName)}
                  className="mt-3 text-xs font-bold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 self-start transition-colors cursor-pointer"
                >
                  <span>Analisar no ranking</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
