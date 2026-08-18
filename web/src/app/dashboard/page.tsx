"use client";

import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Target,
  Percent,
  BarChart3,
  Zap,
  Shield,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PLChart } from "@/components/dashboard/PLChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { EventTimeline } from "@/components/dashboard/EventTimeline";
import { HealthGauge } from "@/components/dashboard/HealthGauge";

// Mock data — será substituído por dados reais do Supabase
const chartData = [
  { date: "12/08", revenue: 8400, spend: 2100, profit: 4200 },
  { date: "13/08", revenue: 12600, spend: 2800, profit: 6800 },
  { date: "14/08", revenue: 9800, spend: 2400, profit: 5100 },
  { date: "15/08", revenue: 15200, spend: 3200, profit: 8400 },
  { date: "16/08", revenue: 11400, spend: 2600, profit: 6200 },
  { date: "17/08", revenue: 18900, spend: 3800, profit: 10800 },
  { date: "18/08", revenue: 14200, spend: 3100, profit: 7600 },
];

const campaigns = [
  {
    id: "1",
    name: "[BROAD] Campanha Topo - Interesse CBD",
    status: "active" as const,
    spend: 1240,
    revenue: 5820,
    profit: 2980,
    roas: 4.69,
    conversions: 23,
    cpa: 54,
    healthScore: 92,
  },
  {
    id: "2",
    name: "[RETARGETING] Visitantes 7D - Carrinho",
    status: "active" as const,
    spend: 680,
    revenue: 3200,
    profit: 1520,
    roas: 4.71,
    conversions: 14,
    cpa: 49,
    healthScore: 88,
  },
  {
    id: "3",
    name: "[LOOKALIKE] Compradores 30D - 1%",
    status: "active" as const,
    spend: 920,
    revenue: 2100,
    profit: 380,
    roas: 2.28,
    conversions: 8,
    cpa: 115,
    healthScore: 76,
  },
  {
    id: "4",
    name: "[CBO] Escala - Kit Especial",
    status: "paused" as const,
    spend: 540,
    revenue: 420,
    profit: -320,
    roas: 0.78,
    conversions: 2,
    cpa: 270,
    healthScore: 64,
  },
  {
    id: "5",
    name: "[ASC] Advantage+ Shopping",
    status: "active" as const,
    spend: 1580,
    revenue: 6400,
    profit: 3020,
    roas: 4.05,
    conversions: 28,
    cpa: 56,
    healthScore: 95,
  },
];

const recentEvents = [
  {
    id: "e1",
    orderId: "Z-12ABC09XYZ",
    eventName: "Purchase",
    source: "server" as const,
    status: "accepted" as const,
    healthScore: 95,
    value: 297,
    createdAt: "2026-08-18T14:02:00",
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
  {
    id: "e2",
    orderId: "Z-12DEF09UVW",
    eventName: "Purchase",
    source: "server" as const,
    status: "accepted" as const,
    healthScore: 82,
    value: 149,
    createdAt: "2026-08-18T13:48:00",
    signals: {
      fbp: true,
      fbc: false,
      ip: true,
      ua: true,
      email: true,
      phone: true,
      externalId: true,
      address: false,
    },
  },
  {
    id: "e3",
    orderId: "Z-12GHI09RST",
    eventName: "Purchase",
    source: "server" as const,
    status: "accepted" as const,
    healthScore: 68,
    value: 89,
    createdAt: "2026-08-18T13:35:00",
    signals: {
      fbp: true,
      fbc: false,
      ip: true,
      ua: false,
      email: true,
      phone: false,
      externalId: false,
      address: true,
    },
  },
  {
    id: "e4",
    orderId: "Z-12JKL09OPQ",
    eventName: "Purchase",
    source: "browser" as const,
    status: "deduped" as const,
    healthScore: 45,
    value: 297,
    createdAt: "2026-08-18T14:02:05",
    signals: {
      fbp: true,
      fbc: true,
      ip: false,
      ua: true,
      email: false,
      phone: false,
      externalId: false,
      address: false,
    },
  },
  {
    id: "e5",
    orderId: "Z-12MNO09LMN",
    eventName: "Purchase",
    source: "server" as const,
    status: "rejected" as const,
    healthScore: 22,
    value: 199,
    createdAt: "2026-08-18T13:20:00",
    signals: {
      fbp: false,
      fbc: false,
      ip: false,
      ua: false,
      email: true,
      phone: false,
      externalId: false,
      address: false,
    },
  },
];

export default function DashboardPage() {
  const totalRevenue = 90500;
  const totalSpend = 20000;
  const totalProfit = 49100;
  const totalOrders = 75;
  const roas = totalRevenue / totalSpend;
  const avgHealthScore = 87;

  return (
    <div className="space-y-6 fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Visão Geral
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Acompanhe suas métricas de tracking e performance em tempo real
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Receita"
          value={`R$ ${(totalRevenue / 1000).toFixed(1)}k`}
          change={12.5}
          icon={DollarSign}
          iconColor="text-[var(--color-success-400)]"
        />
        <MetricCard
          title="Gasto Ads"
          value={`R$ ${(totalSpend / 1000).toFixed(1)}k`}
          change={-3.2}
          icon={Target}
          iconColor="text-[var(--color-warning-400)]"
        />
        <MetricCard
          title="Lucro Líquido"
          value={`R$ ${(totalProfit / 1000).toFixed(1)}k`}
          change={18.7}
          icon={TrendingUp}
          iconColor="text-emerald-400"
        />
        <MetricCard
          title="ROAS"
          value={`${roas.toFixed(2)}x`}
          change={8.1}
          icon={BarChart3}
          iconColor="text-[var(--color-brand-300)]"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Pedidos"
          value={totalOrders.toString()}
          change={5.3}
          icon={ShoppingCart}
          iconColor="text-[var(--color-accent-400)]"
        />
        <MetricCard
          title="CPA Médio"
          value={`R$ ${(totalSpend / totalOrders).toFixed(0)}`}
          change={-6.8}
          changeLabel="CPA menor é melhor"
          icon={Percent}
          iconColor="text-[var(--color-brand-200)]"
        />
        <MetricCard
          title="Eventos CAPI"
          value="312"
          change={15.2}
          icon={Zap}
          iconColor="text-amber-400"
        />
        <MetricCard
          title="Margem"
          value={`${((totalProfit / totalRevenue) * 100).toFixed(1)}%`}
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
          <HealthGauge score={avgHealthScore} size="lg" />
          <div className="mt-6 w-full space-y-2">
            <HealthBar label="fbp/fbc" value={92} />
            <HealthBar label="IP + User-Agent" value={96} />
            <HealthBar label="Email + Phone" value={88} />
            <HealthBar label="External ID" value={78} />
            <HealthBar label="Endereço" value={72} />
            <HealthBar label="Deduplicação" value={100} />
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
