/**
 * Métricas de assinatura (web apps / SaaS), calculadas a partir das linhas do banco.
 * Funções puras: sem banco e sem rede, para dar para testar.
 *
 * Definições:
 *  - Ativo: status "active". Trial não conta como assinante pago.
 *  - MRR: soma do valor mensal equivalente dos ativos (anual / 12, trimestral / 3...).
 *  - Churn do período: cancelamentos de assinantes PAGOS no período ÷ ativos no início do período.
 *  - Churn mensal: churn do período levado a 30 dias (para o LTV estimado).
 *  - LTV realizado: receita já recebida por assinante (líquida de estornos).
 *  - LTV estimado: ticket médio mensal (ARPU) ÷ churn mensal.
 *  - CAC: gasto da campanha no período ÷ novos assinantes dela no período.
 *  - Payback: meses para o MRR de um assinante novo pagar o CAC.
 */

export interface SubscriptionRow {
  subscription_id: string;
  status: "trialing" | "active" | "canceled";
  mrr: number | string | null;
  plan?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  campaign_id?: string | null;
  trial_started_at?: string | null;
  started_at?: string | null;
  canceled_at?: string | null;
  payments_count?: number | null;
  total_revenue?: number | string | null;
}

export interface ChargeRow {
  value: number | string | null;
  status: string;
  refund_value?: number | string | null;
  order_paid_at?: string | null;
  refunded_at?: string | null;
}

export interface SpendRow {
  campaign_id: string;
  campaign_name?: string | null;
  spend_brl: number | string | null;
}

export interface CampaignSubscriptionMetrics {
  key: string;
  campaignId: string | null;
  name: string;
  newSubscribers: number;
  activeSubscribers: number;
  mrr: number;
  newMrr: number;
  realizedRevenue: number;
  avgRealizedLtv: number | null;
  spend: number;
  cac: number | null;
  paybackMonths: number | null;
}

export interface SubscriptionMetrics {
  period: { start: string; end: string; days: number };
  activeSubscribers: number;
  trialingSubscribers: number;
  mrr: number;
  arr: number;
  arpu: number | null;
  newSubscribers: number;
  newMrr: number;
  canceledSubscribers: number;
  churnedMrr: number;
  activeAtStart: number;
  churnRate: number | null;
  monthlyChurnRate: number | null;
  revenueInPeriod: number;
  refundsInPeriod: number;
  trialsStarted: number;
  trialsConverted: number;
  trialConversionRate: number | null;
  avgRealizedLtv: number | null;
  estimatedLtv: number | null;
  totalSpend: number;
  cac: number | null;
  paybackMonths: number | null;
  byCampaign: CampaignSubscriptionMetrics[];
}

const NO_CAMPAIGN = "(sem campanha)";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const ts = (v?: string | null) => (v ? new Date(v).getTime() : NaN);
const inRange = (v: string | null | undefined, start: number, end: number) => {
  const t = ts(v);
  return Number.isFinite(t) && t >= start && t <= end;
};

/** Nome legível e ID da campanha a partir das UTMs ("Nome|123" → Nome, 123). */
export function campaignKeyOf(sub: Pick<SubscriptionRow, "campaign_id" | "utm_campaign">): { key: string; id: string | null; name: string } {
  const raw = (sub.utm_campaign || "").trim();
  const [namePart, idPart] = raw.includes("|") ? raw.split("|") : [raw, ""];
  const id = (sub.campaign_id || idPart || "").trim() || null;
  const name = namePart.trim() || (id ? `Campanha ${id}` : NO_CAMPAIGN);
  return { key: id || name.toLowerCase(), id, name };
}

export function computeSubscriptionMetrics(
  subs: SubscriptionRow[],
  charges: ChargeRow[],
  spend: SpendRow[],
  period: { start: Date; end: Date }
): SubscriptionMetrics {
  const start = period.start.getTime();
  const end = period.end.getTime();
  const days = Math.max(1, Math.round((end - start) / 86_400_000));

  const active = subs.filter((s) => s.status === "active");
  const mrr = active.reduce((acc, s) => acc + n(s.mrr), 0);
  const isNew = (s: SubscriptionRow) => inRange(s.started_at, start, end);
  const isChurned = (s: SubscriptionRow) =>
    s.status === "canceled" && !!s.started_at && inRange(s.canceled_at, start, end) && ts(s.started_at) <= ts(s.canceled_at);

  const newSubs = subs.filter(isNew);
  const churned = subs.filter(isChurned);
  const activeAtStart = subs.filter(
    (s) => s.started_at && ts(s.started_at) < start && (!s.canceled_at || ts(s.canceled_at) >= start)
  ).length;

  const churnRate = ratio(churned.length, activeAtStart);
  const monthlyChurnRate = churnRate === null ? null : Math.min(1, churnRate * (30 / days));
  const arpu = ratio(mrr, active.length);

  const trials = subs.filter((s) => inRange(s.trial_started_at, start, end));
  const trialsConverted = trials.filter((s) => !!s.started_at).length;

  const paidEver = subs.filter((s) => !!s.started_at);
  const avgRealizedLtv = ratio(paidEver.reduce((acc, s) => acc + n(s.total_revenue), 0), paidEver.length);

  let revenueInPeriod = 0;
  let refundsInPeriod = 0;
  for (const c of charges) {
    if (inRange(c.order_paid_at, start, end) && (c.status === "paid" || c.status === "refunded")) revenueInPeriod += n(c.value);
    if (c.status === "refunded" && inRange(c.refunded_at, start, end)) refundsInPeriod += n(c.refund_value ?? c.value);
  }

  // ── Por campanha ──
  const byKey = new Map<string, CampaignSubscriptionMetrics>();
  const bucket = (key: string, id: string | null, name: string) => {
    let b = byKey.get(key);
    if (!b) {
      b = { key, campaignId: id, name, newSubscribers: 0, activeSubscribers: 0, mrr: 0, newMrr: 0, realizedRevenue: 0, avgRealizedLtv: null, spend: 0, cac: null, paybackMonths: null };
      byKey.set(key, b);
    }
    return b;
  };
  const paidCount = new Map<string, number>();
  for (const s of subs) {
    const { key, id, name } = campaignKeyOf(s);
    const b = bucket(key, id, name);
    if (s.status === "active") {
      b.activeSubscribers++;
      b.mrr += n(s.mrr);
    }
    if (isNew(s)) {
      b.newSubscribers++;
      b.newMrr += n(s.mrr);
    }
    if (s.started_at) {
      b.realizedRevenue += n(s.total_revenue);
      paidCount.set(key, (paidCount.get(key) || 0) + 1);
    }
  }
  for (const row of spend) {
    const id = String(row.campaign_id || "").trim();
    if (!id) continue;
    const b = byKey.get(id) || bucket(id, id, row.campaign_name || `Campanha ${id}`);
    b.spend += n(row.spend_brl);
  }

  let totalSpend = 0;
  const byCampaign = [...byKey.values()].map((b) => {
    totalSpend += b.spend;
    const cac = b.newSubscribers > 0 && b.spend > 0 ? b.spend / b.newSubscribers : null;
    const newArpu = b.newSubscribers > 0 ? b.newMrr / b.newSubscribers : 0;
    return {
      ...b,
      mrr: round2(b.mrr),
      newMrr: round2(b.newMrr),
      realizedRevenue: round2(b.realizedRevenue),
      spend: round2(b.spend),
      avgRealizedLtv: paidCount.get(b.key) ? round2(b.realizedRevenue / (paidCount.get(b.key) as number)) : null,
      cac: cac === null ? null : round2(cac),
      paybackMonths: cac !== null && newArpu > 0 ? Math.round((cac / newArpu) * 10) / 10 : null,
    };
  });
  byCampaign.sort((a, b) => b.mrr - a.mrr || b.spend - a.spend || b.newSubscribers - a.newSubscribers);

  const newMrr = newSubs.reduce((acc, s) => acc + n(s.mrr), 0);
  const cac = newSubs.length > 0 && totalSpend > 0 ? totalSpend / newSubs.length : null;
  const newArpu = newSubs.length > 0 ? newMrr / newSubs.length : 0;

  return {
    period: { start: period.start.toISOString(), end: period.end.toISOString(), days },
    activeSubscribers: active.length,
    trialingSubscribers: subs.filter((s) => s.status === "trialing").length,
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    arpu: arpu === null ? null : round2(arpu),
    newSubscribers: newSubs.length,
    newMrr: round2(newMrr),
    canceledSubscribers: churned.length,
    churnedMrr: round2(churned.reduce((acc, s) => acc + n(s.mrr), 0)),
    activeAtStart,
    churnRate: churnRate === null ? null : Math.round(churnRate * 10000) / 10000,
    monthlyChurnRate: monthlyChurnRate === null ? null : Math.round(monthlyChurnRate * 10000) / 10000,
    revenueInPeriod: round2(revenueInPeriod),
    refundsInPeriod: round2(refundsInPeriod),
    trialsStarted: trials.length,
    trialsConverted,
    trialConversionRate: ratio(trialsConverted, trials.length),
    avgRealizedLtv: avgRealizedLtv === null ? null : round2(avgRealizedLtv),
    estimatedLtv: arpu !== null && monthlyChurnRate ? round2(arpu / monthlyChurnRate) : null,
    totalSpend: round2(totalSpend),
    cac: cac === null ? null : round2(cac),
    paybackMonths: cac !== null && newArpu > 0 ? Math.round((cac / newArpu) * 10) / 10 : null,
    byCampaign,
  };
}
