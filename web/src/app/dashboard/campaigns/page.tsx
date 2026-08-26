"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Loader2,
  RefreshCw,
  Layers,
  DollarSign,
  ShieldCheck,
  Radio
} from "lucide-react";
import { CampaignTable, Campaign } from "@/components/campaigns/CampaignTable";

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [availableAccounts, setAvailableAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const loadCampaigns = async (silent = false, accountIdOverride?: string) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const targetAcc = accountIdOverride !== undefined ? accountIdOverride : selectedAccountId;
      const url = targetAcc
        ? `/api/v1/meta/campaigns/list?ad_account_id=${encodeURIComponent(targetAcc)}`
        : `/api/v1/meta/campaigns/list`;

      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (Array.isArray(data.availableAccounts) && data.availableAccounts.length > 0) {
            setAvailableAccounts(data.availableAccounts);
          }
          if (data.selectedAccountId && !selectedAccountId) {
            setSelectedAccountId(data.selectedAccountId);
          }
          if (Array.isArray(data.campaigns)) {
            setCampaigns(data.campaigns);
          }
          setLastUpdated(new Date());
        }
      }
    } catch (error) {
      console.error("Erro ao carregar campanhas:", error);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  // Carrega inicialmente
  useEffect(() => {
    loadCampaigns();
  }, []);

  // Polling automático a cada 15 segundos (taxa ultrarrápida de 15s)
  useEffect(() => {
    const interval = setInterval(() => {
      loadCampaigns(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [selectedAccountId]);

  // Cálculos Consolidados
  const totalSpend = campaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenue || 0), 0);
  const totalProfit = totalRevenue - totalSpend;
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalConversions = campaigns.reduce((acc, c) => acc + (c.conversions || 0), 0);

  if (loading && campaigns.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto pb-16">
      {/* Header com Seletor de Contas e Status do Live Stream */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Performance & Gestão de Campanhas
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Hierarquia completa em 3 níveis (Campanhas ➔ Conjuntos ➔ Anúncios) com sincronização em tempo real (15s)
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Seletor de Contas de Anúncio Reais */}
          {availableAccounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Conta:</span>
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedAccountId(newId);
                  loadCampaigns(false, newId);
                }}
                className="select text-xs py-1.5 px-3 font-semibold bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg text-[var(--color-text-primary)]"
              >
                {availableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live (15s)
          </div>

          <button
            onClick={() => loadCampaigns(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-all font-semibold"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin text-blue-400" : ""} />
            <span>{refreshing ? "Atualizando..." : "Sincronizar"}</span>
          </button>
        </div>
      </div>

      {/* ── Cards de Métricas Consolidadas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-4 border-l-blue-500">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Gasto Meta</span>
          <span className="text-xl font-black text-[var(--color-text-primary)]">
            R$ {totalSpend.toFixed(2)}
          </span>
          <span className="text-[10px] text-blue-400 block mt-1">✓ Sincronizado com a Graph API</span>
        </div>

        <div className="glass-card p-4 border-l-4 border-l-purple-500">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Receita ATM</span>
          <span className="text-xl font-black text-purple-400">
            R$ {totalRevenue.toFixed(2)}
          </span>
          <span className="text-[10px] text-purple-300 block mt-1">✓ Atribuição CAPI First-Party</span>
        </div>

        <div className="glass-card p-4 border-l-4 border-l-emerald-500">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Lucro Líquido Real</span>
          <span className={`text-xl font-black ${totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            R$ {totalProfit.toFixed(2)}
          </span>
          <span className="text-[10px] text-emerald-300 block mt-1">✓ Receita menos Gasto de Anúncios</span>
        </div>

        <div className="glass-card p-4 border-l-4 border-l-cyan-500">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">ROAS Médio ATM</span>
          <span className="text-xl font-black text-cyan-400">
            {avgRoas.toFixed(2)}x
          </span>
          <span className="text-[10px] text-cyan-300 block mt-1">✓ {totalConversions} compras rastreadas</span>
        </div>
      </div>

      {/* Tabela de Campanhas em 3 Níveis */}
      <CampaignTable campaigns={campaigns} onRefresh={() => loadCampaigns(true)} />
    </div>
  );
}
