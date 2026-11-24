/**
 * Custos por venda e P&L do projeto (loja, infoproduto ou web app).
 * Funções puras: sem banco e sem rede, para dar para testar.
 *
 * Regras vêm da tabela taxes_and_duties (tela Custos & Taxas):
 *  - duty: taxa do gateway, por forma de pagamento, em % ou R$ fixo por venda
 *  - tax: imposto, em % sobre o faturamento ("revenue_value") ou sobre a sua comissão ("commission_value")
 *  - affiliate: comissão de afiliado, em % sobre o valor depois da taxa do gateway
 *  - coproduction: parte do coprodutor, em % sobre o que sobra depois da taxa e do afiliado
 *
 * Ordem do cálculo de uma venda de R$ 100 com gateway 5%, afiliado 40% e coprodução 20%:
 *   taxa = 5 → sobra 95 → afiliado = 38 → sobra 57 → coprodução = 11,40 → sua comissão = 45,60.
 *
 * Sem nenhuma regra cadastrada, a loja (ecommerce) mantém a estimativa antiga do painel
 * (15% no cartão, 9,9% no resto). Infoproduto e app ficam com taxa zero e o painel avisa.
 */

import type { ProjectType } from "@/lib/projects/types";

export type CostRuleType = "tax" | "duty" | "affiliate" | "coproduction";
export type PaymentKind = "pix" | "card" | "boleto" | "other";

export interface CostRule {
  type: CostRuleType | string;
  calculation_rule?: "revenue_value" | "commission_value" | string | null;
  payment_method?: "all" | "credit_card" | "pix" | "boleto" | "other" | string | null;
  value_type?: "percentage" | "fixed" | string | null;
  value: number | string | null;
}

export interface SaleCosts {
  gatewayFee: number;
  operationalTax: number;
  affiliate: number;
  coproduction: number;
  /** O que sobra para o produtor antes do anúncio e do custo de produto. */
  net: number;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Forma de pagamento a partir do texto do checkout. Vazio conta como PIX (padrão do painel). */
export function paymentKindOf(method: string | null | undefined): PaymentKind {
  const m = String(method || "").toLowerCase();
  if (m.includes("card") || m.includes("cartao") || m.includes("cartão") || m.includes("credit") || m.includes("visa") || m.includes("master")) return "card";
  if (m.includes("boleto")) return "boleto";
  if (m.includes("pix") || m === "") return "pix";
  return "other";
}

function matchesMethod(rule: CostRule, kind: PaymentKind): boolean {
  const pm = rule.payment_method || "all";
  return (
    pm === "all" ||
    (kind === "pix" && pm === "pix") ||
    (kind === "card" && pm === "credit_card") ||
    (kind === "boleto" && pm === "boleto") ||
    (kind === "other" && pm === "other")
  );
}

/** Valor da regra: % sobre a base, ou R$ fixo por venda. */
function amountOf(rule: CostRule, base: number): number {
  return rule.value_type === "fixed" ? n(rule.value) : base * (n(rule.value) / 100);
}

export function hasAnyRule(rules: CostRule[]): boolean {
  return rules.length > 0;
}

/** Custos de uma venda. */
export function saleCosts(value: number, method: string | null | undefined, rules: CostRule[], projectType: ProjectType): SaleCosts {
  const val = n(value);
  const kind = paymentKindOf(method);
  let gatewayFee = 0;

  if (rules.length === 0) {
    if (projectType === "ecommerce" && val > 0) gatewayFee = kind === "card" ? val * 0.15 : val * 0.099;
  } else {
    for (const r of rules) if (r.type === "duty" && matchesMethod(r, kind)) gatewayFee += amountOf(r, val);
  }

  const afterFee = Math.max(0, val - gatewayFee);
  let affiliate = 0;
  for (const r of rules) if (r.type === "affiliate" && matchesMethod(r, kind)) affiliate += amountOf(r, afterFee);
  affiliate = Math.min(affiliate, afterFee);

  const afterAffiliate = afterFee - affiliate;
  let coproduction = 0;
  for (const r of rules) if (r.type === "coproduction" && matchesMethod(r, kind)) coproduction += amountOf(r, afterAffiliate);
  coproduction = Math.min(coproduction, afterAffiliate);

  const commission = afterAffiliate - coproduction;
  let operationalTax = 0;
  for (const r of rules) {
    if (r.type !== "tax") continue;
    operationalTax += r.calculation_rule === "commission_value" ? amountOf(r, commission) : amountOf(r, val);
  }

  return {
    gatewayFee,
    operationalTax,
    affiliate,
    coproduction,
    net: val - gatewayFee - operationalTax - affiliate - coproduction,
  };
}

/**
 * Quanto um reembolso tira do seu lucro: o valor devolvido ao cliente, menos a parte do
 * afiliado e do coprodutor (que também é estornada). A taxa do gateway e o imposto
 * normalmente não voltam, então não são descontados.
 */
export function refundLoss(value: number, method: string | null | undefined, rules: CostRule[], projectType: ProjectType): number {
  const c = saleCosts(value, method, rules, projectType);
  return Math.max(0, n(value) - c.affiliate - c.coproduction);
}

export interface PnlTotals {
  grossRevenue: number;
  gatewayFees: number;
  operationalTaxes: number;
  affiliate: number;
  coproduction: number;
  refunds: number;
  refundLoss: number;
  cogs: number;
  adSpend: number;
}

export interface PnlSummary {
  netRevenue: number;
  profit: number;
  roas: number;
  roi: number;
  margin: number;
}

/** Fechamento: receita líquida, lucro, ROAS (sobre o bruto, como a Utmify), ROI e margem. */
export function summarizePnl(t: PnlTotals): PnlSummary {
  const netRevenue = t.grossRevenue - t.gatewayFees - t.operationalTaxes - t.affiliate - t.coproduction - t.refundLoss;
  const profit = netRevenue - t.adSpend - t.cogs;
  return {
    netRevenue,
    profit,
    roas: t.adSpend > 0 ? t.grossRevenue / t.adSpend : 0,
    roi: t.adSpend > 0 ? profit / t.adSpend : 0,
    margin: netRevenue > 0 ? (profit / netRevenue) * 100 : 0,
  };
}
