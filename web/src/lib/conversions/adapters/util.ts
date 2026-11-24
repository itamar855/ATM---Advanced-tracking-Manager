import type { PaymentMethod } from "../types";

/** "Maria da Silva" → { firstName: "Maria", lastName: "da Silva" } */
export function splitName(full?: unknown): { firstName: string; lastName: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

/** Classifica o método de pagamento a partir de um texto livre. */
export function detectPaymentMethod(raw?: unknown): PaymentMethod | undefined {
  const s = String(raw || "").toLowerCase();
  if (!s) return undefined;
  if (s.includes("pix")) return "pix";
  if (s.includes("boleto") || s.includes("billet")) return "boleto";
  if (s.includes("card") || s.includes("cartao") || s.includes("cartão") || s.includes("credit")) return "card";
  return "other";
}

/** Primeiro valor que não seja vazio, como texto. */
export function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** Remove chaves vazias de um objeto de strings. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
