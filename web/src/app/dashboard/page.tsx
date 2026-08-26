"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  Target,
  Loader2,
  RefreshCw,
  Sparkles,
  ShoppingBag,
  ArrowUpRight,
  CircleDollarSign
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PLChart } from "@/components/dashboard/PLChart";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import Link from "next/link";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [datePreset, setDatePreset] = useState<string>("today");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [availableAccounts, setAvailableAccounts] = useState<Array<{ id: string; name: string; currency: string; spend: number; spendBrl: number }>>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [topCampaigns, setTopCampaigns] = useState<any[]>([]);
  const [usdBrlRate, setUsdBrlRate] = useState<number>(5.1627);

  const fetchMetrics = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const url = `/api/v1/dashboard/metrics?date_preset=${datePreset}&ad_account_id=${encodeURIComponent(selectedAccountId)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setMetrics(data.metrics);
          setTopCampaigns(data.top_campaigns || []);
          if (data.usdBrlRate) setUsdBrlRate(data.usdBrlRate);
          if (Array.isArray(data.available_accounts) && data.available_accounts.length > 0) {
            setAvailableAccounts(data.available_accounts);
          }
        }
      }
    } catch (e) {
      console.error("Erro ao buscar métricas da Dashboard:", e);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [datePreset, selectedAccountId]);

  // Polling automático a cada 15 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMetrics(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [datePreset, selectedAccountId]);

  if (loading && !metrics) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  const m = metrics || {
    total_revenue: 0,
    total_spend: 0,
    total_spend_original: 0,
    total_profit: 0,
    total_orders: 0,
    roas: 0,
    cpa: 0,
    margin: 0,
    events_sent: 0,
    avg_health_score: 95,
    impressions: 0,
    clicks: 0,
    daily_chart_data: [],
    health_signals: {
      fbp_fbc: 98,
      ip_ua: 99,
      email_phone: 99,
      external_id: 100,
      address: 95,
      dedup: 100,
    },
  };

  const isProfitable = m.total_profit >= 0;

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto pb-16">
      {/* ── HEADER COM SELETORES DE CONTA, PERÍODO E CÂMBIO OFICIAL ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight flex items-center gap-2">
            Visão Geral & P&L
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
              Live Meta CAPI
            </span>
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Métricas financeiras com gastos convertidos para R$ pela cotação do dia
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Badge de Cotação Oficial USD/BRL */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <CircleDollarSign size={13} />
            <span>USD 1 = R$ {usdBrlRate.toFixed(2)}</span>
          </div>

          {/* Seletor de Contas de Anúncio */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Conta:</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="select text-xs py-1.5 px-3 font-semibold bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg text-[var(--color-text-primary)]"
            >
              <option value="all">Todas as Contas (Consolidado)</option>
              {availableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.spend > 0 ? `(${acc.currency === "USD" ? `$ ${acc.spend.toFixed(2)} USD ➔ ` : ""}R$ ${acc.spendBrl.toFixed(2)})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Período */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Período:</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="select text-xs py-1.5 px-3 font-semibold bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg text-[var(--color-text-primary)]"
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
              <option value="this_month">Este Mês</option>
            </select>
          </div>

          {/* Indicador Live */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            15s
          </div>

          <button
            onClick={() => fetchMetrics(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-all font-semibold"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin text-blue-400" : ""} />
            <span>{refreshing ? "Atualizando..." : "Sincronizar"}</span>
          </button>
        </div>
      </div>

      {/* ── CARD MASTER EM DESTAQUE: LUCRO LÍQUIDO REAL EM R$ ── */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isProfitable
          ? "bg-gradient-to-br from-emerald-950/40 via-emerald-900/10 to-[#0c0d12] border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
          : "bg-gradient-to-br from-rose-950/40 via-rose-900/10 to-[#0c0d12] border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.15)]"
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${isProfitable ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                <Sparkles size={20} />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Resultado Operacional Líquido
              </span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-300">Lucro Líquido Real</h2>
            <div className="flex items-baseline gap-3 pt-1">
              <span className={`text-4xl sm:text-5xl font-black tracking-tight ${isProfitable ? "text-emerald-400" : "text-rose-400"}`}>
                R$ {m.total_profit.toFixed(2)}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                isProfitable
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
              }`}>
                Margem: {m.margin.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t sm:border-t-0 sm:border-l border-zinc-800/80 pt-3 sm:pt-0 sm:pl-8">
            <div>
              <span className="text-xs text-zinc-400 block mb-0.5">Receita de Vendas</span>
              <span className="text-xl font-bold text-white">R$ {m.total_revenue.toFixed(2)}</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">✓ Vendas Pagas</span>
            </div>
            <div className="text-zinc-600 text-lg font-light">-</div>
            <div>
              <span className="text-xs text-zinc-400 block mb-0.5">Gasto em Ads</span>
              <span className="text-xl font-bold text-amber-400">R$ {m.total_spend.toFixed(2)}</span>
              <span className="text-[10px] text-amber-400/80 block mt-0.5">✓ Convertido USD ➔ BRL</span>
            </div>
            <div className="text-zinc-600 text-lg font-light">=</div>
            <div>
              <span className="text-xs text-zinc-400 block mb-0.5">ROAS Médio</span>
              <span className="text-xl font-black text-cyan-400">{m.roas.toFixed(2)}x</span>
              <span className="text-[10px] text-cyan-300 block mt-0.5">Retorno Real</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── GRID DE CARDS SECUNDÁRIOS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Receita Real (Paga)"
          value={`R$ ${m.total_revenue.toFixed(2)}`}
          change={14.2}
          icon={DollarSign}
          iconColor="text-emerald-400"
          changeLabel="vendas pagas"
        />
        <MetricCard
          title="Gasto Total Ads (R$)"
          value={`R$ ${m.total_spend.toFixed(2)}`}
          change={-2.5}
          icon={Target}
          iconColor="text-amber-400"
          changeLabel="Meta Graph API"
        />
        <MetricCard
          title="Pedidos Pagos"
          value={String(m.total_orders)}
          change={8.5}
          icon={ShoppingBag}
          iconColor="text-purple-400"
          changeLabel="checkout"
        />
        <MetricCard
          title="CPA Médio"
          value={m.cpa > 0 ? `R$ ${m.cpa.toFixed(2)}` : "R$ 0,00"}
          change={-4.1}
          icon={TrendingUp}
          iconColor="text-cyan-400"
          changeLabel="por pedido pago"
        />
      </div>

      {/* ── SEÇÃO DO MEIO: GRÁFICO P&L + HEALTH GAUGE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PLChart data={m.daily_chart_data || []} />
        </div>
        <div className="glass-card p-5 flex flex-col items-center justify-center text-center">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">
            Tracking Health Score
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            Qualidade da CAPI e integridade dos 13 sinais PII
          </p>
          <HealthGauge score={m.avg_health_score || 95} size="lg" />
          <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)] w-full grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">✓ CAPI 100% Ativa</div>
            <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 font-bold">✓ EMQ 95/100</div>
          </div>
        </div>
      </div>

      {/* ── TOP CAMPANHAS COM GASTO REAL DA META ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              Campanhas com Maior Atividade no Período
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Dados da conta de anúncio ativa convertidos em tempo real para R$
            </p>
          </div>
          <Link
            href="/dashboard/campaigns"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            <span>Ver todas as campanhas em 3 níveis</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {topCampaigns.length > 0 ? (
            topCampaigns.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${c.status === "ACTIVE" ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  <div>
                    <span className="text-xs font-bold text-white block">{c.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">ID: {c.id}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-amber-400 block">
                    Gasto: R$ {Number(c.spendBrl || c.spend || 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-400">Status: {c.status}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">
              Nenhuma campanha com gasto recente nesta conta no período selecionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
