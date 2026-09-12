import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata um valor numérico na moeda especificada (USD, BRL, GBP, EUR, etc.)
 *
 * Exemplos:
 * - USD: US$ 10.95
 * - BRL: R$ 10,95
 * - GBP: £10.95
 * - EUR: €10,95
 */
export function formatCurrency(value?: number | null, currency = "BRL"): string {
  const n = typeof value === "number" && !isNaN(value) ? value : 0;
  const curr = String(currency || "BRL").toUpperCase().trim();

  switch (curr) {
    case "USD":
      return `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "BRL":
      return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "GBP":
      return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "EUR":
      return `€${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: curr,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      } catch {
        return `${curr} ${n.toFixed(2)}`;
      }
  }
}

/**
 * Format a number as percentage
 */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/**
 * Format a number with compact notation
 */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a date relative to now
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return target.toLocaleDateString("pt-BR");
}

/**
 * Get health score color and label
 */
export function getHealthScoreInfo(score: number) {
  if (score >= 85) return { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Excelente", emoji: "🟢" };
  if (score >= 60) return { color: "text-amber-400", bg: "bg-amber-500/20", label: "Bom", emoji: "🟡" };
  return { color: "text-red-400", bg: "bg-red-500/20", label: "Crítico", emoji: "🔴" };
}
