/**
 * Utilitário de Resolução de Datas e Timezones Financeiros
 *
 * Sincroniza as janelas temporais de Contas de Anúncio Meta Ads com os
 * registros de pedidos e eventos do Supabase, eliminando distorções de ROAS
 * causadas por diferenças entre o fuso da conta de anúncios (ex: America/Los_Angeles)
 * e o fuso local (America/Sao_Paulo).
 */

export interface AccountDateRange {
  since: string;       // Formato "YYYY-MM-DD" para time_range da Meta Graph API
  until: string;       // Formato "YYYY-MM-DD" para time_range da Meta Graph API
  startUtc: string;    // String ISO em UTC para filtro inicial no banco de dados
  endUtc: string;      // String ISO em UTC para filtro final no banco de dados
  timezone: string;    // Fuso horário IANA resolvido
  todayInAccount: string; // Data atual (YYYY-MM-DD) no fuso da conta
}

/**
 * Converte data e hora locais em um timezone IANA específico para o timestamp UTC exato.
 */
function getUtcForLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  tz: string
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcGuess);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  const formattedLocalAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? 0 : p.hour),
    Number(p.minute),
    Number(p.second),
    millisecond
  );
  const offsetMs = formattedLocalAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * Resolve o intervalo de datas (since/until e startUtc/endUtc) para uma conta Meta Ads.
 *
 * @param datePreset - Filtro selecionado ('today', 'yesterday', 'last_7d', 'last_30d', 'last_60d', 'this_month')
 * @param timezoneName - Identificador IANA do fuso horário da conta (ex: 'America/Los_Angeles')
 */
export function resolveAccountDateRange(
  datePreset: string,
  timezoneName?: string | null
): AccountDateRange {
  let tz = timezoneName ? timezoneName.trim() : "";
  if (!tz) {
    console.warn("[resolveAccountDateRange] timezone_name não informado. Usando fallback 'America/Sao_Paulo'.");
    tz = "America/Sao_Paulo";
  }

  // Valida se o timezone informado é suportado pelo runtime
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    console.warn(`[resolveAccountDateRange] Timezone '${tz}' inválido. Usando fallback 'America/Sao_Paulo'.`);
    tz = "America/Sao_Paulo";
  }

  const now = new Date();
  // Formato YYYY-MM-DD no fuso da conta de anúncios
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });

  const getShiftedDateStr = (daysAgo: number): string => {
    const [y, m, d] = todayStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - daysAgo);
    return dt.toISOString().slice(0, 10);
  };

  let sinceStr = todayStr;
  let untilStr = todayStr;

  switch (datePreset) {
    case "yesterday": {
      const yestStr = getShiftedDateStr(1);
      sinceStr = yestStr;
      untilStr = yestStr;
      break;
    }
    case "last_7d": {
      sinceStr = getShiftedDateStr(7);
      untilStr = todayStr;
      break;
    }
    case "last_30d": {
      sinceStr = getShiftedDateStr(30);
      untilStr = todayStr;
      break;
    }
    case "last_60d": {
      sinceStr = getShiftedDateStr(60);
      untilStr = todayStr;
      break;
    }
    case "this_month": {
      const [year, month] = todayStr.split("-");
      sinceStr = `${year}-${month}-01`;
      untilStr = todayStr;
      break;
    }
    default: // "today"
      sinceStr = todayStr;
      untilStr = todayStr;
      break;
  }

  const [sY, sM, sD] = sinceStr.split("-").map(Number);
  const [uY, uM, uD] = untilStr.split("-").map(Number);

  const startUtc = getUtcForLocal(sY, sM, sD, 0, 0, 0, 0, tz);
  const endUtc = getUtcForLocal(uY, uM, uD, 23, 59, 59, 999, tz);

  return {
    since: sinceStr,
    until: untilStr,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    timezone: tz,
    todayInAccount: todayStr,
  };
}
