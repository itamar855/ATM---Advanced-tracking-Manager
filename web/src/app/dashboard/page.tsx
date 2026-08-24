"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Target,
  Percent,
  BarChart3,
  Zap,
  Shield,
  Loader2,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PLChart } from "@/components/dashboard/PLChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { EventTimeline } from "@/components/dashboard/EventTimeline";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  const { activeStore } = useStore();

  useEffect(() => {
    let active = true;

    async function initDashboard(silent = false) {
      if (!silent) setLoading(true);
      try {
        const supabase = createClient();
        
        // 1. Obtém o usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (active) loadMockData();
          return;
        }

        // 2. Usa a loja ativa do StoreContext (suporte multi-lojas)
        const storeData = activeStore;
        if (!storeData) {
          if (active) loadMockData();
          return;
        }

        if (active) setStoreId(storeData.id);

        // Define a faixa de data dos últimos 7 dias
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - 7 * 86400000).toISOString();

        // 3. Faz o fetch das métricas agregadas da nossa API
        const response = await fetch(
          `/api/v1/dashboard/metrics?store_id=${storeData.id}&start_date=${startDate}&end_date=${endDate}`
        );
        const data = await response.json();

        if (data.ok && active) {
          setMetrics(data.metrics);
          setCampaigns(data.campaigns);
          setChartData(data.metrics.daily_chart_data || []);
        } else if (active) {
          loadMockData();
        }

        // 4. Busca os eventos recentes do banco de dados
        const { data: events } = await supabase
          .from("events")
          .select("*")
          .eq("store_id", storeData.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (events && events.length > 0 && active) {
          // Normaliza formato do banco para o componente visual
          setRecentEvents(
            events.map((e) => ({
              id: e.id,
              orderId: e.order_id || "S/I",
              eventName: e.event_name,
              source: e.source,
              status: e.status,
              healthScore: e.health_score || 0,
              value: 0,
              createdAt: e.created_at,
              signals: {
                fbp: e.user_data_keys?.includes("fbp") || false,
                fbc: e.user_data_keys?.includes("fbc") || false,
                ip: e.user_data_keys?.includes("client_ip_address") || false,
                ua: e.user_data_keys?.includes("client_user_agent") || false,
                email: e.user_data_keys?.includes("em") || false,
                phone: e.user_data_keys?.includes("ph") || false,
                externalId: e.user_data_keys?.includes("external_id") || false,
                address: e.user_data_keys?.includes("ct") || false,
              },
            }))
          );
        } else if (active) {
          loadMockEvents();
        }

      } catch (error) {
        console.error("Erro ao carregar o dashboard:", error);
        if (active) loadMockData();
      } finally {
        if (active && !silent) setLoading(false);
      }
    }

    initDashboard();

    const interval = setInterval(() => {
      initDashboard(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeStore]);

  function loadMockData() {
    // Carrega estados zerados reais em vez de mocks fictícios
    setMetrics({
      total_revenue: 0,
      total_spend: 0,
      total_profit: 0,
      total_orders: 0,
      roas: 0,
      cpa: 0,
      margin: 0,
      events_sent: 0,
      avg_health_score: 0,
      health_signals: {
        fbp_fbc: 0,
        ip_ua: 0,
        email_phone: 0,
        external_id: 0,
        address: 0,
        dedup: 0
      }
    });

    setCampaigns([]);

    const emptyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      emptyChart.push({
        date: `${day}/${month}`,
        revenue: 0,
        spend: 0,
        profit: 0
      });
    }
    setChartData(emptyChart);
  }

  function loadMockEvents() {
    setRecentEvents([
      {
        id: "e1",
        orderId: "Z-12ABC09XYZ",
        eventName: "Purchase",
        source: "server",
        status: "accepted",
        healthScore: 95,
        value: 297,
        createdAt: new Date().toISOString(),
        signals: {
          fbp: true,
          fbc: true,
          ip: true,
          ua: true,
          email: true,
          phone: true,
          externalId: true,
          address: true,
        },
      },
    ]);
  }

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Visão Geral
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Métricas de atribuição e performance da sua loja em tempo real
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Receita"
          value={`R$ ${(metrics.total_revenue / 1000).toFixed(1)}k`}
          change={12.5}
          icon={DollarSign}
          iconColor="text-[var(--color-success-400)]"
        />
        <MetricCard
          title="Gasto Ads"
          value={`R$ ${(metrics.total_spend / 1000).toFixed(1)}k`}
          change={-3.2}
          icon={Target}
          iconColor="text-[var(--color-warning-400)]"
        />
        <MetricCard
          title="Lucro Líquido"
          value={`R$ ${(metrics.total_profit / 1000).toFixed(1)}k`}
          change={18.7}
          icon={TrendingUp}
          iconColor="text-emerald-400"
        />
        <MetricCard
          title="ROAS"
          value={`${metrics.roas.toFixed(2)}x`}
          change={8.1}
          icon={BarChart3}
          iconColor="text-[var(--color-brand-300)]"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Pedidos"
          value={metrics.total_orders.toString()}
          change={5.3}
          icon={ShoppingCart}
          iconColor="text-[var(--color-accent-400)]"
        />
        <MetricCard
          title="CPA Médio"
          value={`R$ ${metrics.cpa.toFixed(0)}`}
          change={-6.8}
          changeLabel="CPA menor é melhor"
          icon={Percent}
          iconColor="text-[var(--color-brand-200)]"
        />
        <MetricCard
          title="Eventos CAPI"
          value={metrics.events_sent.toString()}
          change={15.2}
          icon={Zap}
          iconColor="text-amber-400"
        />
        <MetricCard
          title="Margem"
          value={`${metrics.margin.toFixed(1)}%`}
          change={4.3}
          icon={Shield}
          iconColor="text-cyan-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* P&L Chart */}
        <div className="lg:col-span-2">
          <PLChart data={chartData} />
        </div>

        {/* Health Score */}
        <div className="glass-card p-5 flex flex-col items-center justify-center">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-6">
            Tracking Health Score
          </h3>
          <HealthGauge score={metrics.avg_health_score} size="lg" />
          <div className="mt-6 w-full space-y-2">
            <HealthBar label="fbp/fbc" value={metrics?.health_signals?.fbp_fbc || 0} />
            <HealthBar label="IP + User-Agent" value={metrics?.health_signals?.ip_ua || 0} />
            <HealthBar label="Email + Phone" value={metrics?.health_signals?.email_phone || 0} />
            <HealthBar label="External ID" value={metrics?.health_signals?.external_id || 0} />
            <HealthBar label="Endereço" value={metrics?.health_signals?.address || 0} />
            <HealthBar label="Deduplicação" value={metrics?.health_signals?.dedup || 0} />
          </div>
        </div>
      </div>

      {/* Campaign Table */}
      <CampaignTable campaigns={campaigns} />

      {/* Event Timeline */}
      <EventTimeline events={recentEvents} />
    </div>
  );
}

function HealthBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[var(--color-text-muted)] w-24 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${
            value >= 85
              ? "bg-[var(--color-success-400)]"
              : value >= 60
              ? "bg-[var(--color-warning-400)]"
              : "bg-[var(--color-danger-400)]"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={`text-[11px] font-semibold w-8 ${
          value >= 85
            ? "text-[var(--color-success-400)]"
            : value >= 60
            ? "text-[var(--color-warning-400)]"
            : "text-[var(--color-danger-400)]"
        }`}
      >
        {value}%
      </span>
    </div>
  );
}
