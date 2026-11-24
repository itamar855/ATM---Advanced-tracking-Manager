"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/contexts/StoreContext";
import { Repeat, Users, TrendingUp, TrendingDown, Wallet, Target, Hourglass, RotateCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionMetrics } from "@/lib/subscriptions/metrics";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "12 meses" },
];

const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const months = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${v === 1 ? "mês" : "meses"}`;

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "blue" | "green" | "red" | "amber";
}) {
  const tones = {
    blue: "bg-[#2997ff]/10 border-[#2997ff]/20 text-[#2997ff]",
    green: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
    red: "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]",
    amber: "bg-[#ff9f0a]/10 border-[#ff9f0a]/20 text-[#ff9f0a]",
  };
  return (
    <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 block mb-1.5">{label}</span>
        <span className="text-2xl font-bold text-white tracking-tight tabular-nums">{value}</span>
        {hint && <span className="text-[11.5px] text-white/40 block mt-1">{hint}</span>}
      </div>
      <div className={cn("w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0", tones[tone])}>
        <Icon size={18} />
      </div>
    </div>
  );
}

interface LoadResult {
  key: string;
  metrics: SubscriptionMetrics | null;
  error: string | null;
  setupRequired: boolean;
}

export default function SubscriptionsPage() {
  const { activeStore } = useStore();
  const [days, setDays] = useState(30);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // Chave da consulta atual: muda com a loja, o período ou o botão de atualizar.
  const key = activeStore ? `${activeStore.id}:${days}:${reloadTick}` : null;
  const loading = key !== null && result?.key !== key;

  useEffect(() => {
    if (!activeStore || !key) return;
    let cancelled = false;
    fetch(`/api/v1/subscriptions/metrics?store_id=${activeStore.id}&days=${days}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setResult((prev) => ({
            key,
            metrics: prev?.metrics ?? null,
            error: data.error || "Não foi possível carregar as métricas.",
            setupRequired: Boolean(data.setupRequired),
          }));
        } else {
          setResult({ key, metrics: data.metrics, error: null, setupRequired: false });
        }
      })
      .catch(() => {
        if (!cancelled) setResult((prev) => ({ key, metrics: prev?.metrics ?? null, error: "Sem conexão com o servidor.", setupRequired: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeStore, days, key]);

  const metrics = result?.metrics ?? null;
  const error = result?.key === key ? result.error : null;
  const setupRequired = result?.key === key ? result.setupRequired : false;

  const m = metrics;
  const isEmpty = m && m.activeSubscribers === 0 && m.trialingSubscribers === 0 && m.newSubscribers === 0 && m.canceledSubscribers === 0;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Repeat size={22} className="text-[#2997ff]" />
            Assinaturas
          </h1>
          <p className="text-[13px] text-white/50 mt-1">
            Receita recorrente dos seus web apps, cancelamentos e quanto cada campanha traz de assinante.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-0.5" role="tablist" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                role="tab"
                aria-selected={days === p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer",
                  days === p.days ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/80"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/90 font-semibold text-xs border border-white/[0.08] transition-all disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={12} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className={cn("p-4 rounded-2xl border text-[13px]", setupRequired ? "bg-[#ff9f0a]/10 border-[#ff9f0a]/20 text-[#ff9f0a]" : "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]")}>
          {error}
        </div>
      )}

      {loading && !m && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />
          ))}
        </div>
      )}

      {m && isEmpty && (
        <div className="rounded-3xl border border-white/[0.06] bg-[#18181a] p-8 text-center space-y-3">
          <Repeat size={28} className="mx-auto text-white/30" />
          <h2 className="text-base font-semibold text-white">Nenhuma assinatura registrada ainda</h2>
          <p className="text-[13px] text-white/50 max-w-lg mx-auto leading-relaxed">
            Seu web app ou gateway manda para a API de conversões os eventos <code className="text-[#2997ff]">assinatura_iniciada</code>,{" "}
            <code className="text-[#2997ff]">assinatura_renovada</code> e <code className="text-[#2997ff]">assinatura_cancelada</code>,
            sempre com o <code className="text-[#2997ff]">subscription.id</code>.
          </p>
          <Link href="/dashboard/settings/integrations" className="inline-block text-xs font-semibold text-[#2997ff] hover:underline">
            Ver URL e token da API em Integrações →
          </Link>
        </div>
      )}

      {m && !isEmpty && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard label="MRR" value={brl(m.mrr)} hint={`ARR ${brl(m.arr)}`} icon={Wallet} tone="green" />
            <StatCard
              label="Assinantes ativos"
              value={m.activeSubscribers.toLocaleString("pt-BR")}
              hint={m.trialingSubscribers ? `+ ${m.trialingSubscribers} em trial` : `Ticket mensal ${brl(m.arpu)}`}
              icon={Users}
            />
            <StatCard
              label="Novos no período"
              value={m.newSubscribers.toLocaleString("pt-BR")}
              hint={`+ ${brl(m.newMrr)} de MRR`}
              icon={TrendingUp}
              tone="green"
            />
            <StatCard
              label="Churn no período"
              value={pct(m.churnRate)}
              hint={`${m.canceledSubscribers} cancelamento(s) · − ${brl(m.churnedMrr)}`}
              icon={TrendingDown}
              tone="red"
            />
            <StatCard
              label="Receita no período"
              value={brl(m.revenueInPeriod - m.refundsInPeriod)}
              hint={m.refundsInPeriod ? `${brl(m.revenueInPeriod)} bruto, ${brl(m.refundsInPeriod)} estornado` : "Cobranças pagas (1ª + renovações)"}
              icon={Wallet}
            />
            <StatCard
              label="LTV"
              value={brl(m.estimatedLtv ?? m.avgRealizedLtv)}
              hint={m.estimatedLtv !== null ? `Estimado · já recebido ${brl(m.avgRealizedLtv)} por assinante` : "Já recebido por assinante"}
              icon={Target}
              tone="amber"
            />
            <StatCard
              label="CAC"
              value={brl(m.cac)}
              hint={m.paybackMonths !== null ? `Payback em ${months(m.paybackMonths)}` : m.totalSpend ? `Gasto ${brl(m.totalSpend)}` : "Sem gasto de anúncio no período"}
              icon={Target}
            />
            <StatCard
              label="Trial → pago"
              value={pct(m.trialConversionRate)}
              hint={m.trialsStarted ? `${m.trialsConverted} de ${m.trialsStarted} trials do período` : "Nenhum trial no período"}
              icon={Hourglass}
            />
          </div>

          <div className="rounded-3xl border border-white/[0.06] bg-[#18181a] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Por campanha</h2>
                <p className="text-[11.5px] text-white/40 mt-0.5">
                  A campanha é a do primeiro clique do assinante (UTM <code>utm_campaign</code> no formato nome|id).
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-white/40">
                    <th className="px-5 py-3 font-semibold">Campanha</th>
                    <th className="px-3 py-3 font-semibold text-right">Novos</th>
                    <th className="px-3 py-3 font-semibold text-right">Ativos</th>
                    <th className="px-3 py-3 font-semibold text-right">MRR</th>
                    <th className="px-3 py-3 font-semibold text-right">Gasto</th>
                    <th className="px-3 py-3 font-semibold text-right">CAC</th>
                    <th className="px-3 py-3 font-semibold text-right">LTV recebido</th>
                    <th className="px-5 py-3 font-semibold text-right">Payback</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byCampaign.map((c) => (
                    <tr key={c.key} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white/90 max-w-[260px]">
                        <span className="block truncate" title={c.name}>{c.name}</span>
                        {c.campaignId && <span className="block text-[10.5px] text-white/30 font-mono">{c.campaignId}</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-white/80">{c.newSubscribers}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white/80">{c.activeSubscribers}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{brl(c.mrr)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white/70">{c.spend ? brl(c.spend) : "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white/70">{brl(c.cac)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white/70">{brl(c.avgRealizedLtv)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-white/70">{months(c.paybackMonths)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11.5px] text-white/35 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-px" />
            Churn = cancelamentos de assinantes pagos no período ÷ ativos no início. LTV estimado = ticket mensal ÷ churn mensal.
            CAC = gasto da campanha no período ÷ novos assinantes dela. Valores em reais.
          </p>
        </>
      )}
    </div>
  );
}
