"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  CreditCard,
  RotateCw,
  Info,
  ChevronDown,
  Layers,
  Sparkles,
  Eye,
  CheckCircle2,
  X,
  AlertCircle,
  HelpCircle,
  ShoppingBag
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function DashboardResumoPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [datePreset, setDatePreset] = useState("today");
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [trafficSourceFilter, setTrafficSourceFilter] = useState("all");
  const [showBanner, setShowBanner] = useState(true);
  const { activeStore } = useStore();

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

  const loadData = async (silent = false) => {
    if (!activeStore) return;
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch(
        `/api/v1/dashboard/metrics?date_preset=${datePreset}&ad_account_id=${selectedAccountId}&store_id=${activeStore.id}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (data.metrics) setMetrics(data.metrics);
          if (data.payment_methods) setPaymentMethods(data.payment_methods);
          if (data.traffic_sources) setTrafficSources(data.traffic_sources);
          if (data.available_accounts) setAvailableAccounts(data.available_accounts);
          if (data.usdBrlRate) setUsdBrlRate(data.usdBrlRate);
        }
      }
    } catch (e) {
      console.error("[Dashboard Resumo] Erro:", e);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [datePreset, selectedAccountId, activeStore]);

  // Polling em tempo real a cada 15s
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [datePreset, selectedAccountId, activeStore]);

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-4 fade-in select-none text-zinc-100">
      {/* ── 1. Top Header (Estilo UTMify PRO) ──────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            Dashboard - Oferta BR - Gaiolas 🚀
            <Eye size={14} className="text-zinc-500 cursor-pointer hover:text-white" />
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161B26] border border-zinc-800 text-zinc-300">
            <span>🇧🇷</span>
            <span>PT-BR</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-amber-400">🏆 Prêmios</span>
            <span className="text-white font-bold">R$ 58.6K / R$ 1M</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-300">Itamar Almeida</span>
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
              IA
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Banner de Avisos (Estilo UTMify) ─────────────────────────────── */}
      {showBanner && (
        <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-amber-950/40 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-amber-200 shadow-md">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">Grupo de avisos ATM:</span>
            <span>Fique por dentro de todas as atualizações e métricas em tempo real.</span>
            <a href="#" className="font-bold underline text-amber-300 hover:text-white ml-1">
              Entrar agora
            </a>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-amber-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 3. Toolbar de Filtros do Resumo ─────────────────────────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">Resumo</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">Atualizado agora mesmo</span>
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all active:scale-95 disabled:opacity-50"
            >
              <RotateCw size={13} className={isRefreshing ? "animate-spin" : ""} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Grid de 5 Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 text-xs">
          {/* Período */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
              Período de Visualização <Info size={11} className="text-zinc-600" />
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
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
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Conta de Anúncio</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">Qualquer</option>
              {availableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fonte de Tráfego */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Fonte de Tráfego</label>
            <select
              value={trafficSourceFilter}
              onChange={(e) => setTrafficSourceFilter(e.target.value)}
              className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">Qualquer</option>
              <option value="meta">MetaAds</option>
              <option value="google">Google Ads</option>
              <option value="direct">Direto / Orgânico</option>
            </select>
          </div>

          {/* Plataforma */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Plataforma</label>
            <select className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="all">Qualquer</option>
              <option value="shopify">Shopify</option>
              <option value="vega">Vega Checkout</option>
            </select>
          </div>

          {/* Produto */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Produto</label>
            <select className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="all">Qualquer</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. Grid de Métricas Principais (Layout 4x3 Idêntico ao UTMify) ──── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Linha 1 */}
        {/* Card 1: Valor Vendido Pago */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold text-zinc-200">Valor Vendido Pago</span>
            <div className="group/tip relative">
              <Info size={13} className="text-zinc-500 hover:text-zinc-300 cursor-pointer" />
              <div className="absolute left-0 sm:right-0 sm:left-auto top-5 z-30 hidden group-hover/tip:block bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 p-2.5 rounded-lg shadow-xl w-60">
                Faturamento bruto recebido em pedidos aprovados (PIX, Cartão e Boleto pagos).
              </div>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white font-mono tracking-tight">
              {fmt(metrics.gross_revenue || (metrics.net_revenue + metrics.taxes))}
            </span>
            <span className="text-[11px] text-zinc-400 block mt-1">
              Líquido pós-taxas: <strong className="text-zinc-200">{fmt(metrics.net_revenue)}</strong>
            </span>
          </div>
        </div>

        {/* Card 2: Gastos com anúncios */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Gastos com anúncios</span>
            <Info size={13} className="text-zinc-600 group-hover:text-zinc-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white font-mono tracking-tight">
              {fmt(metrics.ad_spend)}
            </span>
            <span className="text-[9px] text-zinc-500 block mt-0.5">
              Câmbio: USD 1 = R$ {usdBrlRate.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Card 3: ROAS */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="text-emerald-400 font-bold">ROAS</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {metrics.roas.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Card 4: Lucro Líquido */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className={metrics.profit >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
              Lucro Líquido
            </span>
            <div className="group/tip relative">
              <Info size={13} className="text-zinc-500 hover:text-zinc-300 cursor-pointer" />
              <div className="absolute right-0 top-5 z-30 hidden group-hover/tip:block bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 p-2.5 rounded-lg shadow-xl w-64 leading-relaxed">
                <span className="font-bold text-white block mb-1">Cálculo de Lucro Real:</span>
                Vendido Pago ({fmt(metrics.gross_revenue || (metrics.net_revenue + metrics.taxes))}) <br />
                − Gastos Ads ({fmt(metrics.ad_spend)}) <br />
                − Taxas Gateway ({fmt(metrics.taxes)}) <br />
                = <strong className={metrics.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmt(metrics.profit)}</strong>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <span className={cn("text-2xl font-black font-mono tracking-tight", metrics.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {metrics.profit >= 0 ? `+${fmt(metrics.profit)}` : fmt(metrics.profit)}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-1">
              Margem: {metrics.margin.toFixed(1)}% | ROI: {metrics.roi.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Linha 2 */}
        {/* Card 5: Vendas por Pagamento (Gráfico Donut) */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg row-span-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span className="font-bold text-white">Vendas por Pagamento</span>
            <Info size={13} className="text-zinc-600" />
          </div>

          {/* Donut Chart SVG */}
          <div className="relative flex items-center justify-center my-auto py-2">
            <svg viewBox="0 0 36 36" className="w-36 h-36 transform -rotate-90">
              {/* Círculo de fundo */}
              <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#1E2330" strokeWidth="4" />
              {/* Fatia Pix (Azul Escuro #0284C7) */}
              <circle
                cx="18"
                cy="18"
                r="15.91549430918954"
                fill="transparent"
                stroke="#0284C7"
                strokeWidth="4"
                strokeDasharray={`${paymentMethods.pix.percent} ${100 - paymentMethods.pix.percent}`}
                strokeDashoffset="0"
              />
              {/* Fatia Cartão (Azul Claro #38BDF8) */}
              <circle
                cx="18"
                cy="18"
                r="15.91549430918954"
                fill="transparent"
                stroke="#38BDF8"
                strokeWidth="4"
                strokeDasharray={`${paymentMethods.card.percent} ${100 - paymentMethods.card.percent}`}
                strokeDashoffset={`-${paymentMethods.pix.percent}`}
              />
            </svg>

            {/* Texto central */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-[11px] text-zinc-400 font-semibold">Total</span>
              <span className="text-2xl font-black text-white font-mono">{paymentMethods.total}</span>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center justify-center gap-4 text-[11px] pt-2 border-t border-zinc-800/60 font-semibold">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]"></span>
              Pix ({paymentMethods.pix.percent}%)
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]"></span>
              Cartão ({paymentMethods.card.percent}%)
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              Boleto
            </span>
          </div>
        </div>

        {/* Card 6: Vendas Pendentes */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Vendas Pendentes</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {fmt(metrics.pending_sales_value)}
            </span>
          </div>
        </div>

        {/* Card 7: Margem */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="text-emerald-400 font-bold">Margem</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-400 font-mono">
              {metrics.margin.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 8: Taxas */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Taxas Gateway</span>
            <div className="group/tip relative">
              <Info size={13} className="text-zinc-500 hover:text-zinc-300 cursor-pointer" />
              <div className="absolute right-0 top-5 z-30 hidden group-hover/tip:block bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 p-2.5 rounded-lg shadow-xl w-56 leading-normal">
                Taxas configuradas para sua loja (6,99% + R$ 1,99 no PIX).
              </div>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {fmt(metrics.taxes)}
            </span>
          </div>
        </div>

        {/* Card 9: Vendas por Fonte (Deslize a tela) */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span className="font-bold text-white">Vendas por Fonte</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="space-y-2 text-xs">
            {trafficSources.map((src) => (
              <div key={src.name} className="flex items-center justify-between">
                <span className="font-semibold text-zinc-300">{src.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold">{src.count}</span>
                  <div className="w-12 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${src.percent}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 w-10 text-right">{src.percent}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 10: ROI */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="text-emerald-400 font-bold">ROI</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-400 font-mono">
              {metrics.roi.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Card 11: CPA */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>CPA</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {fmt(metrics.cpa)}
            </span>
          </div>
        </div>

        {/* Linha 4 */}
        {/* Card 12: Reembolso */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Reembolso</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {metrics.refund_rate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 13: ARPU (Ticket Médio) */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>ARPU</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {fmt(metrics.arpu)}
            </span>
          </div>
        </div>

        {/* Card 14: Chargeback */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Chargeback</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {metrics.chargeback_rate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 15: Taxa de Aprovação */}
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Taxa de Aprovação</span>
            <Info size={13} className="text-zinc-600" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Cartão</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-blue-400 font-mono">
                {metrics.approval_rate.toFixed(1)}%
              </span>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
