"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, Target, Zap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CampaignTable } from "@/components/campaigns/CampaignTable"; // Vamos mover a tabela para reutilização

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    async function loadCampaigns() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          const endDate = new Date().toISOString();
          const startDate = new Date(Date.now() - 7 * 86400000).toISOString();

          const response = await fetch(
            `/api/v1/dashboard/metrics?store_id=${store.id}&start_date=${startDate}&end_date=${endDate}`
          );
          const data = await response.json();
          if (data.ok) {
            setCampaigns(data.campaigns);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
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
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Performance de Campanhas
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Acompanhe o P&L, ROAS e conversões CAPI por campanha e criativo
        </p>
      </div>

      <CampaignTable campaigns={campaigns.length > 0 ? campaigns : getMockCampaigns()} />
    </div>
  );
}

function getMockCampaigns() {
  return [
    {
      campaign_id: "1",
      campaign_name: "[BROAD] Campanha Topo - Interesse CBD",
      status: "active",
      spend: 1240,
      revenue: 5820,
      profit: 2980,
      roas: 4.69,
      conversions: 23,
      cpa: 54,
      healthScore: 92,
    },
    {
      campaign_id: "2",
      campaign_name: "[RETARGETING] Visitantes 7D - Carrinho",
      status: "active",
      spend: 680,
      revenue: 3200,
      profit: 1520,
      roas: 4.71,
      conversions: 14,
      cpa: 49,
      healthScore: 88,
    }
  ];
}
