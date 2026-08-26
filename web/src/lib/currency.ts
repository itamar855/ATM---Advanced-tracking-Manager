/**
 * Serviço de Cotação Cambial Oficial em Tempo Real
 * Converte USD -> BRL com a taxa de câmbio comercial do dia.
 */

let cachedRate: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export async function getUsdBrlRate(): Promise<number> {
  const now = Date.now();

  if (cachedRate && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL", {
      next: { revalidate: 1800 },
    });

    if (res.ok) {
      const data = await res.json();
      const bid = Number(data.USDBRL?.bid);
      if (bid && !isNaN(bid) && bid > 0) {
        cachedRate = Math.round(bid * 10000) / 10000;
        lastFetchTime = now;
        return cachedRate;
      }
    }
  } catch (e) {
    console.warn("[Currency] Erro ao buscar cotação USD/BRL, usando fallback:", e);
  }

  // Fallback seguro se a API de câmbio falhar
  return cachedRate || 5.1627;
}

export function convertToBrl(amount: number, currency: string, rate: number): number {
  if (!amount || isNaN(amount)) return 0;
  const curr = (currency || "BRL").toUpperCase();
  if (curr === "USD") {
    return Math.round(amount * rate * 100) / 100;
  }
  return Math.round(amount * 100) / 100;
}
