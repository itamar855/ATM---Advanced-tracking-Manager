"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, Target, Zap, Loader2, RefreshCw } from "lucide-react";
import { CampaignTable } from "@/components/campaigns/CampaignTable";

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const loadCampaigns = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/v1/meta/campaigns/list", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.campaigns)) {
          setCampaigns(
            data.campaigns.map((c: any) => ({
              campaign_id: c.id,
              campaign_name: c.name,
              status: c.status === "Ativa" ? "active" : "paused",
              spend: c.spend || 0,
              revenue: c.revenue || 0,
              profit: c.profit || 0,
              roas: c.roas || 0,
              conversions: Math.round((c.revenue || 0) / 167.99),
              cpa: c.spend && c.revenue ? Math.round(c.spend / Math.max(1, (c.revenue / 167.99))) : 45,
              healthScore: 95,
            }))
          );
        }
      }
    } catch (error) {
      console.error("Erro ao carregar campanhas:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Performance & Gestão de Campanhas
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Acompanhe o P&L, ROAS e conversões CAPI por campanha em tempo real
          </p>
        </div>

        <button
          onClick={() => loadCampaigns()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-all font-semibold"
        >
          <RefreshCw size={13} />
          <span>Sincronizar Meta Ads</span>
        </button>
      </div>

      <CampaignTable campaigns={campaigns} />
    </div>
  );
}
