"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  DollarSign,
  RotateCw,
  Info,
  X,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Detalhe do P&L devolvido por /api/v1/dashboard/metrics (custos de info e app). */
interface PnlBreakdown {
  project_type: "ecommerce" | "infoproduct" | "app";
  gateway_fees: number;
  operational_taxes: number;
  affiliate: number;
  coproduction: number;
  refunds: number;
  refund_loss: number;
  refunds_count: number;
  renewal_revenue: number;
  renewals_count: number;
  cogs: number;
  fees_configured: boolean;
  fees_estimated: boolean;
  refunds_and_renewals_included: boolean;
}

interface DashboardMetrics {
  gross_revenue?: number;
  net_revenue: number;
  ad_spend: number;
  ad_spend_original: number;
  profit: number;
  roas: number;
  pending_sales_value: number;
  margin: number;
  taxes: number;
  roi: number;
  cpa: number;
  refund_rate: number;
  arpu: number;
  chargeback_rate: number;
  approval_rate: number;
  impressions: number;
  clicks: number;
  total_orders: number;
}

interface PaymentMethods {
  total: number;
  pix: { count: number; percent: number };
  card: { count: number; percent: number };
  boleto: { count: number; percent: number };
}

interface TrafficSource {
  name: string;
  count: number;
  percent: number;
}

/* ── Metric Card Component ───────────────────────────────── */
function MetricCard({
  label,
  value,
  sub,
  color,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "blue" | "default";
  tooltip?: string;
}) {
  const valueColor = {
    green:   "text-[#30d158]",
    red:     "text-[#ff453a]",
    blue:    "text-[#2997ff]",
    default: "text-white",
  }[color ?? "default"];

  return (
    <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3 hover:border-white/[0.1] hover:bg-[#1c1c1e] transition-all group relative overflow-hidden">
      {/* Subtle top shimmer on hover */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-white/40">{label}</span>
        {tooltip && (
          <div className="group/tip relative">
            <Info size={11} className="text-white/20 hover:text-white/50 cursor-pointer transition-colors" />
            <div className="absolute right-0 top-5 z-30 hidden group-hover/tip:block bg-[#1c1c1e] border border-white/[0.1] text-[10.5px] text-white/60 p-2.5 rounded-xl shadow-2xl w-56 leading-relaxed">
              {tooltip}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={cn("text-[22px] font-bold font-mono tracking-tight leading-none", valueColor)}>
          {value}
        </span>
        {sub && (
          <span className="text-[10.5px] text-white/25 leading-none">{sub}</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */
export default function DashboardResumoPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [datePreset, setDatePreset] = useState("today");
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [showBanner, setShowBanner] = useState(true);
  const { activeStore } = useStore();
  const [pnl, setPnl] = useState<PnlBreakdown | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    net_revenue: 0,
    ad_spend: 0,
    ad_spend_original: 0,
    profit: 0,
    roas: 0,
    pending_sales_value: 0,
    margin: 0,
    taxes: 0,
    roi: 0,
    cpa: 0,
    refund_rate: 0.0,
    arpu: 0,
    chargeback_rate: 0.0,
    approval_rate: 0.0,
    impressions: 0,
    clicks: 0,
    total_orders: 0,
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods>({
    total: 0,
    pix: { count: 0, percent: 0 },
    card: { count: 0, percent: 0 },
    boleto: { count: 0, percent: 0 },
  });

  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([
    { name: "MetaAds", count: 0, percent: 0 },
    { name: "iq", count: 0, percent: 0 },
    { name: "N/A", count: 0, percent: 0 },
  ]);

  const [availableAccounts, setAvailableAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [usdBrlRate, setUsdBrlRate] = useState(5.1627);

  const loadData = async (silent = false, forceRefresh = false) => {
    if (!activeStore) return;
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const refreshParam = forceRefresh ? "&refresh=true" : "";
      const res = await fetch(
        `/api/v1/dashboard/metrics?date_preset=${datePreset}&ad_account_id=${selectedAccountId}&store_id=${activeStore.id}${refreshParam}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (data.metrics) setMetrics(data.metrics);
          setPnl(data.pnl || null);
          if (data.payment_methods) setPaymentMethods(data.payment_methods);
          if (data.traffic_sources) setTrafficSources(data.traffic_sources);
          if (data.available_accounts) setAvailableAccounts(data.available_accounts);
          if (data.usdBrlRate) setUsdBrlRate(data.usdBrlRate);
        }
      }
    } catch (e) {
      console.error("[Dashboard] Erro:", e);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [datePreset, selectedAccountId, activeStore]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadData(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [datePreset, selectedAccountId, activeStore]);

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const gross = metrics.gross_revenue || metrics.net_revenue + metrics.taxes;
  const isInfoOrApp = !!pnl && pnl.project_type !== "ecommerce";
  const profitParts = [
    `Vendido (${fmt(gross)})`,
    `Ads (${fmt(metrics.ad_spend)})`,
    `Taxas (${fmt(metrics.taxes)})`,
  ];
  if (pnl) {
    if (pnl.operational_taxes) profitParts.push(`Impostos (${fmt(pnl.operational_taxes)})`);
    if (pnl.affiliate) profitParts.push(`Afiliados (${fmt(pnl.affiliate)})`);
    if (pnl.coproduction) profitParts.push(`Coprodução (${fmt(pnl.coproduction)})`);
    if (pnl.refund_loss) profitParts.push(`Reembolsos (${fmt(pnl.refund_loss)})`);
    if (pnl.cogs) profitParts.push(`Produto (${fmt(pnl.cogs)})`);
  }
  const profitTooltip = `${profitParts.join(" − ")} = ${fmt(metrics.profit)}`;

  return (
    <div className="max-w-[1400px] mx-auto pb-20 space-y-5 fade-in select-none">

      {/* ── 1. Page Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div>
          <h1 className="text-[15px] font-semibold text-white/90 tracking-tight">
            Resumo do Dashboard
          </h1>
          <p className="text-[11.5px] text-white/30 mt-0.5">
            {activeStore?.name || "Selecione um projeto"}
          </p>
        </div>

        <button
          onClick={() => loadData(true, true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2997ff] hover:brightness-110 text-white font-semibold text-[12px] shadow-[0_4px_16px_rgba(41,151,255,0.25)] transition-all active:scale-95 disabled:opacity-50"
        >
          <RotateCw size={12} className={isRefreshing ? "animate-spin" : ""} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* ── 2. Alert banner ───────────────────────────────────── */}
      {showBanner && (
        <div className="bg-[#ff9f0a]/[0.07] border border-[#ff9f0a]/20 rounded-2xl px-4 py-3 flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-2.5 text-[#ff9f0a]/90">
            <span className="font-semibold">Grupo de avisos ATM:</span>
            <span className="text-white/40">
              Fique por dentro das atualizações e métricas em tempo real.
            </span>
            <a href="#" className="font-semibold underline text-[#ff9f0a] hover:text-white transition-colors">
              Entrar agora
            </a>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-white/25 hover:text-white/60 transition-colors ml-3">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── 3. Filters ────────────────────────────────────────── */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-4">
        <div className="flex flex-wrap gap-3">
          {/* Período */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Período
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-[12.5px] text-white/70 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
              <option value="last_60d">Últimos 60 dias</option>
              <option value="this_month">Este Mês</option>
            </select>
          </div>

          {/* Conta de Anúncio */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Conta de Anúncio
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-[12.5px] text-white/70 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
            >
              <option value="all">Qualquer</option>
              {availableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. Primary Metrics (top row) ──────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Valor Vendido Pago"
          value={fmt(gross)}
          sub={`Líquido: ${fmt(metrics.net_revenue)}`}
          tooltip="Faturamento bruto em pedidos aprovados (PIX, Cartão e Boleto pagos)."
        />
        <MetricCard
          label="Gastos com Anúncios"
          value={fmt(metrics.ad_spend)}
          sub={`USD 1 = R$ ${usdBrlRate.toFixed(4)}`}
        />
        <MetricCard
          label="ROAS"
          value={metrics.roas.toFixed(2)}
          color="green"
        />
        <MetricCard
          label="Lucro Líquido"
          value={metrics.profit >= 0 ? `+${fmt(metrics.profit)}` : fmt(metrics.profit)}
          sub={`Margem: ${metrics.margin.toFixed(1)}% · ROI: ${metrics.roi.toFixed(2)}x`}
          color={metrics.profit >= 0 ? "green" : "red"}
          tooltip={profitTooltip}
        />
      </div>

      {/* ── 5. Secondary Metrics ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Margem" value={`${metrics.margin.toFixed(1)}%`} color="green" />
        <MetricCard
          label="Taxas Gateway"
          value={fmt(metrics.taxes)}
          sub={pnl?.fees_estimated ? "Estimativa" : pnl && !pnl.fees_configured ? "Nenhuma cadastrada" : undefined}
          tooltip={
            pnl?.fees_estimated
              ? "Estimativa: 9,9% no PIX e 15% no cartão. Cadastre as taxas reais em Custos & Taxas."
              : "Taxas do gateway cadastradas em Custos & Taxas."
          }
        />
        <MetricCard label="Vendas Pendentes" value={fmt(metrics.pending_sales_value)} />
        <MetricCard label="ROI" value={metrics.roi.toFixed(2)} color="green" />
      </div>

      {/* ── 5b. Custos de infoproduto e app ────────────────────── */}
      {isInfoOrApp && pnl && (
        <>
          {!pnl.fees_configured && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 text-[12.5px] text-[#ff9f0a]">
              <span>
                Nenhum custo cadastrado: o lucro está sem taxa do gateway, imposto, afiliado e coprodução.
              </span>
              <Link
                href="/dashboard/settings/costs"
                className="px-3 py-1.5 rounded-xl bg-[#ff9f0a]/15 hover:bg-[#ff9f0a]/25 border border-[#ff9f0a]/25 font-semibold text-xs transition-colors"
              >
                Cadastrar custos
              </Link>
            </div>
          )}
          <div className={cn("grid grid-cols-2 gap-3", pnl.project_type === "app" ? "md:grid-cols-5" : "md:grid-cols-4")}>
            <MetricCard label="Impostos" value={fmt(pnl.operational_taxes)} tooltip="Impostos cadastrados em Custos & Taxas." />
            <MetricCard label="Afiliados" value={fmt(pnl.affiliate)} tooltip="Comissão de afiliado: % sobre o valor depois da taxa do gateway." />
            <MetricCard label="Coprodução" value={fmt(pnl.coproduction)} tooltip="Parte do coprodutor: % sobre o que sobra depois da taxa e do afiliado." />
            <MetricCard
              label="Reembolsos"
              value={pnl.refunds_and_renewals_included ? fmt(pnl.refunds) : "—"}
              sub={pnl.refunds_and_renewals_included ? `${pnl.refunds_count} no período · −${fmt(pnl.refund_loss)} no lucro` : "Só com a conta \"Qualquer\""}
              color={pnl.refunds > 0 ? "red" : "default"}
              tooltip="Valor devolvido no período. No lucro sai o valor menos a parte do afiliado e do coprodutor, que também é estornada."
            />
            {pnl.project_type === "app" && (
              <MetricCard
                label="Renovações"
                value={pnl.refunds_and_renewals_included ? fmt(pnl.renewal_revenue) : "—"}
                sub={pnl.refunds_and_renewals_included ? `${pnl.renewals_count} cobrança(s) · já no vendido` : "Só com a conta \"Qualquer\""}
                color="blue"
                tooltip="Cobranças de renovação no período. Entram no valor vendido e no lucro, mas não vão para a Meta como compra nova."
              />
            )}
          </div>
        </>
      )}

      {/* ── 6. Bottom row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="CPA" value={fmt(metrics.cpa)} />
        <MetricCard label="ARPU" value={fmt(metrics.arpu)} />
        <MetricCard label="Reembolso" value={`${metrics.refund_rate.toFixed(1)}%`} />
        <MetricCard label="Chargeback" value={`${metrics.chargeback_rate.toFixed(1)}%`} />
        <MetricCard label="Taxa de Aprovação (Cartão)" value={`${metrics.approval_rate.toFixed(1)}%`} color="blue" />
      </div>

      {/* ── 7. Payments + Traffic ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Vendas por Pagamento */}
        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[13px] font-semibold text-white/80">Vendas por Pagamento</span>
            <ShoppingBag size={14} className="text-white/20" />
          </div>

          {/* Donut */}
          <div className="relative flex items-center justify-center mb-5">
            <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="15.9" fill="transparent"
                stroke="#2997ff" strokeWidth="3.5"
                strokeDasharray={`${paymentMethods.pix.percent} ${100 - paymentMethods.pix.percent}`}
                strokeDashoffset="0" strokeLinecap="round"
              />
              <circle
                cx="18" cy="18" r="15.9" fill="transparent"
                stroke="#30d158" strokeWidth="3.5"
                strokeDasharray={`${paymentMethods.card.percent} ${100 - paymentMethods.card.percent}`}
                strokeDashoffset={`-${paymentMethods.pix.percent}`} strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-white/25 font-medium">Total</span>
              <span className="text-2xl font-bold text-white font-mono">{paymentMethods.total}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 text-[11px] pt-4 border-t border-white/[0.05]">
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-2 h-2 rounded-full bg-[#2997ff]" />
              Pix ({paymentMethods.pix.percent}%)
            </span>
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-2 h-2 rounded-full bg-[#30d158]" />
              Cartão ({paymentMethods.card.percent}%)
            </span>
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-2 h-2 rounded-full bg-[#ff9f0a]" />
              Boleto
            </span>
          </div>
        </div>

        {/* Vendas por Fonte */}
        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[13px] font-semibold text-white/80">Vendas por Fonte</span>
            <Info size={14} className="text-white/20" />
          </div>
          <div className="space-y-4">
            {trafficSources.map((src) => (
              <div key={src.name}>
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="font-medium text-white/60">{src.name}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-white/80">{src.count}</span>
                    <span className="text-white/25 text-[10.5px] w-9 text-right">{src.percent}%</span>
                  </div>
                </div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2997ff] to-[#0071e3] rounded-full transition-all duration-700"
                    style={{ width: `${src.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
