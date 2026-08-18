/**
 * ATM — Tracking Health Score Calculator
 *
 * Score 0-100 baseado na cobertura de sinais de cada evento.
 * Preserva as regras do Cérebro Técnico:
 * - fbc não é obrigatório quando não há fbclid (tráfego orgânico)
 * - fbclid:false NÃO é problema quando fbc:true
 * - IP e UA devem vir do bridge (browser), não do webhook
 */

export interface EventSignals {
  hasFbp: boolean;
  hasFbc: boolean;
  hasFbclid: boolean;
  hasClientIp: boolean;
  hasClientUserAgent: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasExternalId: boolean;
  hasCity: boolean;
  hasState: boolean;
  hasZip: boolean;
  hasCountry: boolean;
  hasContentIds: boolean;
  hasContents: boolean;
  hasConsistentEventId: boolean;
  metaAccepted: boolean;
  isMetaClick: boolean; // true when there was a Meta ad click (fbclid present)
}

export interface HealthScoreResult {
  score: number;
  level: "excellent" | "good" | "critical";
  breakdown: HealthScoreBreakdown[];
  missingSignals: string[];
}

export interface HealthScoreBreakdown {
  signal: string;
  label: string;
  weight: number;
  earned: number;
  present: boolean;
}

const SIGNAL_WEIGHTS = {
  fbp: { label: "Browser ID (fbp)", weight: 12 },
  fbc: { label: "Click ID (fbc)", weight: 12 },
  clientIp: { label: "IP do Navegador", weight: 10 },
  clientUserAgent: { label: "User-Agent", weight: 10 },
  email: { label: "E-mail", weight: 12 },
  phone: { label: "Telefone", weight: 8 },
  externalId: { label: "External ID", weight: 8 },
  address: { label: "Endereço", weight: 8 },
  contentIds: { label: "Produtos", weight: 5 },
  eventId: { label: "Event ID", weight: 10 },
  metaAccepted: { label: "Meta Aceita", weight: 5 },
} as const;

export function calculateHealthScore(signals: EventSignals): HealthScoreResult {
  const breakdown: HealthScoreBreakdown[] = [];
  const missingSignals: string[] = [];
  let totalEarned = 0;
  let totalPossible = 0;

  // fbp
  const fbpEarned = signals.hasFbp ? SIGNAL_WEIGHTS.fbp.weight : 0;
  breakdown.push({
    signal: "fbp",
    label: SIGNAL_WEIGHTS.fbp.label,
    weight: SIGNAL_WEIGHTS.fbp.weight,
    earned: fbpEarned,
    present: signals.hasFbp,
  });
  totalEarned += fbpEarned;
  totalPossible += SIGNAL_WEIGHTS.fbp.weight;
  if (!signals.hasFbp) missingSignals.push("fbp");

  // fbc — só penaliza quando é um clique Meta (fbclid existe)
  if (signals.isMetaClick) {
    const fbcEarned = signals.hasFbc ? SIGNAL_WEIGHTS.fbc.weight : 0;
    breakdown.push({
      signal: "fbc",
      label: SIGNAL_WEIGHTS.fbc.label,
      weight: SIGNAL_WEIGHTS.fbc.weight,
      earned: fbcEarned,
      present: signals.hasFbc,
    });
    totalEarned += fbcEarned;
    totalPossible += SIGNAL_WEIGHTS.fbc.weight;
    if (!signals.hasFbc) missingSignals.push("fbc");
  } else {
    // Tráfego orgânico/direto — não penaliza ausência de fbc
    breakdown.push({
      signal: "fbc",
      label: SIGNAL_WEIGHTS.fbc.label + " (não aplicável)",
      weight: 0,
      earned: 0,
      present: false,
    });
  }

  // IP
  const ipEarned = signals.hasClientIp ? SIGNAL_WEIGHTS.clientIp.weight : 0;
  breakdown.push({
    signal: "clientIp",
    label: SIGNAL_WEIGHTS.clientIp.label,
    weight: SIGNAL_WEIGHTS.clientIp.weight,
    earned: ipEarned,
    present: signals.hasClientIp,
  });
  totalEarned += ipEarned;
  totalPossible += SIGNAL_WEIGHTS.clientIp.weight;
  if (!signals.hasClientIp) missingSignals.push("IP");

  // User-Agent
  const uaEarned = signals.hasClientUserAgent
    ? SIGNAL_WEIGHTS.clientUserAgent.weight
    : 0;
  breakdown.push({
    signal: "clientUserAgent",
    label: SIGNAL_WEIGHTS.clientUserAgent.label,
    weight: SIGNAL_WEIGHTS.clientUserAgent.weight,
    earned: uaEarned,
    present: signals.hasClientUserAgent,
  });
  totalEarned += uaEarned;
  totalPossible += SIGNAL_WEIGHTS.clientUserAgent.weight;
  if (!signals.hasClientUserAgent) missingSignals.push("User-Agent");

  // Email
  const emailEarned = signals.hasEmail ? SIGNAL_WEIGHTS.email.weight : 0;
  breakdown.push({
    signal: "email",
    label: SIGNAL_WEIGHTS.email.label,
    weight: SIGNAL_WEIGHTS.email.weight,
    earned: emailEarned,
    present: signals.hasEmail,
  });
  totalEarned += emailEarned;
  totalPossible += SIGNAL_WEIGHTS.email.weight;
  if (!signals.hasEmail) missingSignals.push("email");

  // Phone
  const phoneEarned = signals.hasPhone ? SIGNAL_WEIGHTS.phone.weight : 0;
  breakdown.push({
    signal: "phone",
    label: SIGNAL_WEIGHTS.phone.label,
    weight: SIGNAL_WEIGHTS.phone.weight,
    earned: phoneEarned,
    present: signals.hasPhone,
  });
  totalEarned += phoneEarned;
  totalPossible += SIGNAL_WEIGHTS.phone.weight;
  if (!signals.hasPhone) missingSignals.push("phone");

  // External ID
  const extIdEarned = signals.hasExternalId
    ? SIGNAL_WEIGHTS.externalId.weight
    : 0;
  breakdown.push({
    signal: "externalId",
    label: SIGNAL_WEIGHTS.externalId.label,
    weight: SIGNAL_WEIGHTS.externalId.weight,
    earned: extIdEarned,
    present: signals.hasExternalId,
  });
  totalEarned += extIdEarned;
  totalPossible += SIGNAL_WEIGHTS.externalId.weight;
  if (!signals.hasExternalId) missingSignals.push("external_id");

  // Address (combined: city + country minimum)
  const hasAddress = signals.hasCity && signals.hasCountry;
  const addressEarned = hasAddress ? SIGNAL_WEIGHTS.address.weight : 0;
  breakdown.push({
    signal: "address",
    label: SIGNAL_WEIGHTS.address.label,
    weight: SIGNAL_WEIGHTS.address.weight,
    earned: addressEarned,
    present: hasAddress,
  });
  totalEarned += addressEarned;
  totalPossible += SIGNAL_WEIGHTS.address.weight;
  if (!hasAddress) missingSignals.push("endereço");

  // Content IDs
  const contentEarned = signals.hasContentIds
    ? SIGNAL_WEIGHTS.contentIds.weight
    : 0;
  breakdown.push({
    signal: "contentIds",
    label: SIGNAL_WEIGHTS.contentIds.label,
    weight: SIGNAL_WEIGHTS.contentIds.weight,
    earned: contentEarned,
    present: signals.hasContentIds,
  });
  totalEarned += contentEarned;
  totalPossible += SIGNAL_WEIGHTS.contentIds.weight;
  if (!signals.hasContentIds) missingSignals.push("content_ids");

  // Consistent Event ID
  const eventIdEarned = signals.hasConsistentEventId
    ? SIGNAL_WEIGHTS.eventId.weight
    : 0;
  breakdown.push({
    signal: "eventId",
    label: SIGNAL_WEIGHTS.eventId.label,
    weight: SIGNAL_WEIGHTS.eventId.weight,
    earned: eventIdEarned,
    present: signals.hasConsistentEventId,
  });
  totalEarned += eventIdEarned;
  totalPossible += SIGNAL_WEIGHTS.eventId.weight;
  if (!signals.hasConsistentEventId) missingSignals.push("event_id");

  // Meta Accepted
  const metaEarned = signals.metaAccepted
    ? SIGNAL_WEIGHTS.metaAccepted.weight
    : 0;
  breakdown.push({
    signal: "metaAccepted",
    label: SIGNAL_WEIGHTS.metaAccepted.label,
    weight: SIGNAL_WEIGHTS.metaAccepted.weight,
    earned: metaEarned,
    present: signals.metaAccepted,
  });
  totalEarned += metaEarned;
  totalPossible += SIGNAL_WEIGHTS.metaAccepted.weight;

  // Calculate final score (normalized to 100)
  const score =
    totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

  const level: "excellent" | "good" | "critical" =
    score >= 85 ? "excellent" : score >= 60 ? "good" : "critical";

  return { score, level, breakdown, missingSignals };
}
