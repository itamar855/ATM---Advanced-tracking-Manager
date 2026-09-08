import { createAdminClient } from "../supabase/server";
import { hashEmail, hashPhone } from "../encryption";
import { normalizeEmail, normalizePhone } from "./identity-stitcher";

export type AttributionModel = "last_click" | "first_click" | "linear" | "u_shaped";

export type AttributionMethod =
  | "native_pixel"
  | "webhook_utm"
  | "forensic_fbc"
  | "forensic_identity"
  | "forensic_utm"
  | "assisted";

export interface Touchpoint {
  index: number;
  timestamp: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  source: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  attributionMethod: AttributionMethod;
  confidenceScore: number;
  isRecovered: boolean;
  trackId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  evidence: Record<string, any>;
}

export interface CustomerJourney {
  storeId: string;
  orderId: string;
  visitorIdentityId: string | null;
  identityClusterId: string | null;
  touchpoints: Touchpoint[];
  totalTouchpoints: number;
}

export interface AttributionSlice {
  id?: string;
  store_id: string;
  order_id: string;
  event_id?: string | null;
  visitor_identity_id?: string | null;
  order_value: number;
  currency: string;
  payment_method?: string | null;
  attribution_model: AttributionModel;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  source: string;
  attribution_weight: number;
  attributed_revenue: number;
  confidence_score: number;
  attribution_method: AttributionMethod;
  is_recovered: boolean;
  is_assisted: boolean;
  touchpoint_index: number;
  total_touchpoints: number;
  evidence: Record<string, any>;
  order_paid_at: string;
}

export interface AttributionIntelligenceConfig {
  clickWindowDays?: number; // Padrão: 7 dias
  dedupWindowMinutes?: number; // Padrão: 15 minutos para mesmo anúncio/campanha
  defaultModel?: AttributionModel; // Padrão: 'last_click'
  modelsToCalculate?: AttributionModel[]; // Padrão: ['last_click', 'first_click', 'linear', 'u_shaped']
}

export interface OrderAttributionInput {
  orderId: string;
  orderValue: number;
  currency?: string;
  paymentMethod?: string | null;
  orderPaidAt?: string | null;
  eventId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  externalId?: string | null;
  trackId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  visitorIdentityId?: string | null;
  existingCampaignId?: string | null;
  existingCampaignName?: string | null;
  existingAdsetId?: string | null;
  existingAdsetName?: string | null;
  existingAdId?: string | null;
  existingAdName?: string | null;
  existingSource?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

export interface CampaignLedgerMetric {
  campaignId: string | null;
  campaignName: string | null;
  source: string;
  attributedRevenue: number;
  totalOrders: number;
  totalTouches: number;
  assistedCount: number;
  recoveredRevenue: number;
}

export interface RevenueLedgerSummary {
  storeId: string;
  attributionModel: AttributionModel;
  totalRevenue: number;
  totalOrders: number;
  totalTouchpoints: number;
  recoveredRevenue: number;
  assistedConversions: number;
  campaigns: CampaignLedgerMetric[];
}

// =============================================================================
// PARTE 1: Funções Matemáticas Puras (Pesos e Fatias Contábeis)
// =============================================================================

/**
 * Arredonda um número para 4 casas decimais com precisão
 */
function round4(val: number): number {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

/**
 * Arredonda valor financeiro para 2 casas decimais (centavos)
 */
function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula a distribuição de pesos de um modelo de atribuição para N touchpoints.
 * Garante rigorosamente: sum(weights) === 1.0000 e 0 <= weight <= 1.
 */
export function computeModelWeights(totalTouchpoints: number, model: AttributionModel): number[] {
  if (totalTouchpoints <= 0) {
    return [];
  }

  // Toque único recebe 100% em qualquer modelo
  if (totalTouchpoints === 1) {
    return [1.0];
  }

  const N = totalTouchpoints;

  switch (model) {
    case "last_click": {
      const weights = new Array(N).fill(0.0);
      weights[N - 1] = 1.0;
      return weights;
    }

    case "first_click": {
      const weights = new Array(N).fill(0.0);
      weights[0] = 1.0;
      return weights;
    }

    case "linear": {
      const base = round4(1.0 / N);
      const weights = new Array(N).fill(base);
      // Compensação contábil no último item para fechar 1.0000
      let sumPrev = 0;
      for (let i = 0; i < N - 1; i++) {
        sumPrev += weights[i];
      }
      weights[N - 1] = round4(1.0 - sumPrev);
      return weights;
    }

    case "u_shaped": {
      if (N === 2) {
        return [0.5, 0.5];
      }

      // N >= 3: 40% First Touch, 40% Last Touch, 20% dividido entre intermediários
      const weights = new Array(N).fill(0.0);
      weights[0] = 0.4;
      weights[N - 1] = 0.4;

      const middleCount = N - 2;
      const middleShare = 0.2;
      const baseMiddle = round4(middleShare / middleCount);

      let sumMiddles = 0;
      for (let i = 1; i < N - 1; i++) {
        if (i === N - 2) {
          // Último intermediário absorve resíduo de arredondamento
          weights[i] = round4(middleShare - sumMiddles);
        } else {
          weights[i] = baseMiddle;
          sumMiddles += baseMiddle;
        }
      }

      return weights;
    }

    default: {
      const fallback = new Array(N).fill(0.0);
      fallback[N - 1] = 1.0;
      return fallback;
    }
  }
}

/**
 * Calcula as receitas atribuídas para cada fatia garantindo fechamento financeiro de centavos.
 * sum(attributedRevenue) fecha exatamente com orderValue.
 */
export function calculateAttributedRevenue(orderValue: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [round2(orderValue)];

  const rawRevenues = weights.map((w) => round2(orderValue * w));

  let currentSum = 0;
  for (let i = 0; i < rawRevenues.length; i++) {
    currentSum += rawRevenues[i];
  }
  currentSum = round2(currentSum);

  const diff = round2(orderValue - currentSum);

  if (diff !== 0) {
    // Aplica o ajuste de centavos na última fatia que possui peso > 0
    let lastNonZeroIdx = rawRevenues.length - 1;
    for (let i = rawRevenues.length - 1; i >= 0; i--) {
      if (weights[i] > 0) {
        lastNonZeroIdx = i;
        break;
      }
    }
    rawRevenues[lastNonZeroIdx] = round2(rawRevenues[lastNonZeroIdx] + diff);
  }

  return rawRevenues;
}

/**
 * Gera as fatias calculadas para uma jornada em um determinado modelo.
 */
export function calculateModelSlices(
  journey: CustomerJourney,
  orderInput: OrderAttributionInput,
  model: AttributionModel
): AttributionSlice[] {
  const { touchpoints, totalTouchpoints, visitorIdentityId, storeId, orderId } = journey;
  const weights = computeModelWeights(totalTouchpoints, model);
  const revenues = calculateAttributedRevenue(orderInput.orderValue, weights);
  const orderPaidAt = orderInput.orderPaidAt || new Date().toISOString();
  const currency = orderInput.currency || "BRL";

  return touchpoints.map((tp, idx) => {
    const weight = weights[idx] ?? 0;
    const rev = revenues[idx] ?? 0;
    const isAssisted = totalTouchpoints > 1 && idx < totalTouchpoints - 1;

    return {
      store_id: storeId,
      order_id: orderId,
      event_id: orderInput.eventId || null,
      visitor_identity_id: visitorIdentityId || null,
      order_value: round2(orderInput.orderValue),
      currency: currency,
      payment_method: orderInput.paymentMethod || null,
      attribution_model: model,
      campaign_id: tp.campaignId,
      campaign_name: tp.campaignName,
      adset_id: tp.adsetId,
      adset_name: tp.adsetName,
      ad_id: tp.adId,
      ad_name: tp.adName,
      source: tp.source,
      attribution_weight: weight,
      attributed_revenue: rev,
      confidence_score: tp.confidenceScore,
      attribution_method: tp.attributionMethod,
      is_recovered: tp.isRecovered,
      is_assisted: isAssisted,
      touchpoint_index: tp.index,
      total_touchpoints: totalTouchpoints,
      evidence: tp.evidence,
      order_paid_at: orderPaidAt,
    };
  });
}

// =============================================================================
// PARTE 2: Reconstrução da Jornada do Cliente (Cascata e Deduplicação)
// =============================================================================

function isGenericValue(val?: string | null): boolean {
  if (!val) return true;
  const clean = val.trim().toLowerCase();
  return (
    clean === "" ||
    clean === "[capi] atribuição direta" ||
    clean === "atribuição direta" ||
    clean === "direto" ||
    clean === "none" ||
    clean === "null" ||
    clean === "undefined" ||
    clean === "s/i"
  );
}

/**
 * Reconstrói a jornada completa do cliente no ATM seguindo a cascata de identidade
 * e aplicando a deduplicação inteligente de toques de anúncio.
 */
export async function buildCustomerJourney(
  storeId: string,
  input: OrderAttributionInput,
  config?: AttributionIntelligenceConfig
): Promise<CustomerJourney> {
  const supabase = createAdminClient();
  const clickWindowDays = config?.clickWindowDays ?? 7;
  const dedupWindowMinutes = config?.dedupWindowMinutes ?? 15;

  const orderTimeMs = input.orderPaidAt ? new Date(input.orderPaidAt).getTime() : Date.now();
  const windowStartIso = new Date(orderTimeMs - clickWindowDays * 86400 * 1000).toISOString();
  const windowEndIso = new Date(orderTimeMs + 5 * 60 * 1000).toISOString();

  // ---------------------------------------------------------------------------
  // Cascata de Identidade (Ajuste 2)
  // Prioridade:
  // 1. visitor_identity_id
  // 2. identity_cluster_id
  // 3. track_id
  // 4. fbp
  // 5. fbc
  // 6. email_hash
  // 7. phone_hash
  // 8. external_id
  // ---------------------------------------------------------------------------
  const associatedTrackIds = new Set<string>();
  const associatedFbps = new Set<string>();
  let recoveredVisitorIdentityId: string | null = input.visitorIdentityId || null;
  let identityClusterId: string | null = null;

  if (input.trackId) associatedTrackIds.add(input.trackId);
  if (input.fbp) associatedFbps.add(input.fbp);

  const cleanEmail = normalizeEmail(input.customerEmail);
  const cleanPhone = normalizePhone(input.customerPhone);
  const emailHash = cleanEmail ? hashEmail(cleanEmail) : null;
  const phoneHash = cleanPhone ? hashPhone(cleanPhone) : null;

  const identityConditions: string[] = [];
  if (input.visitorIdentityId) identityConditions.push(`id.eq.${input.visitorIdentityId}`);
  if (input.trackId) identityConditions.push(`track_id.eq.${input.trackId}`);
  if (input.fbp) identityConditions.push(`fbp.eq.${input.fbp}`);
  if (input.fbc) identityConditions.push(`fbc.eq.${input.fbc}`);
  if (emailHash) identityConditions.push(`email_hash.eq.${emailHash}`);
  if (phoneHash) identityConditions.push(`phone_hash.eq.${phoneHash}`);
  if (input.externalId) identityConditions.push(`external_id.eq.${input.externalId}`);

  if (identityConditions.length > 0) {
    try {
      const { data: matchedIdentities } = await supabase
        .from("visitor_identities")
        .select("id, identity_cluster_id, track_id, fbp, fbc")
        .eq("store_id", storeId)
        .or(identityConditions.join(","));

      if (matchedIdentities && matchedIdentities.length > 0) {
        if (!recoveredVisitorIdentityId) {
          recoveredVisitorIdentityId = matchedIdentities[0].id;
        }
        identityClusterId = matchedIdentities[0].identity_cluster_id || null;

        for (const row of matchedIdentities) {
          if (row.track_id) associatedTrackIds.add(row.track_id);
          if (row.fbp) associatedFbps.add(row.fbp);
          if (!identityClusterId && row.identity_cluster_id) {
            identityClusterId = row.identity_cluster_id;
          }
        }

        // Se encontrou cluster, busca os outros nós do grafo
        if (identityClusterId) {
          const { data: clusterRows } = await supabase
            .from("visitor_identities")
            .select("id, track_id, fbp, fbc")
            .eq("store_id", storeId)
            .eq("identity_cluster_id", identityClusterId);

          if (clusterRows) {
            for (const cRow of clusterRows) {
              if (cRow.track_id) associatedTrackIds.add(cRow.track_id);
              if (cRow.fbp) associatedFbps.add(cRow.fbp);
            }
          }
        }
      }
    } catch {
      // Falha não impeditiva, segue com trackId e fbp disponíveis
    }
  }

  // ---------------------------------------------------------------------------
  // Busca Sessões dentro da Janela
  // ---------------------------------------------------------------------------
  const trackIdList = Array.from(associatedTrackIds);
  const fbpList = Array.from(associatedFbps);

  let rawSessions: any[] = [];
  if (trackIdList.length > 0 || fbpList.length > 0) {
    try {
      const sessionOr: string[] = [];
      if (trackIdList.length > 0) sessionOr.push(`track_id.in.(${trackIdList.join(",")})`);
      if (fbpList.length > 0) sessionOr.push(`fbp.in.(${fbpList.join(",")})`);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("*")
        .eq("store_id", storeId)
        .or(sessionOr.join(","))
        .gte("created_at", windowStartIso)
        .lte("created_at", windowEndIso)
        .order("created_at", { ascending: true });

      if (sessions) {
        rawSessions = sessions;
      }
    } catch {
      // Ignora erro de sessão
    }
  }

  // ---------------------------------------------------------------------------
  // Converte Sessões em Candidatos a Touchpoint
  // ---------------------------------------------------------------------------
  const candidateTouches: Touchpoint[] = [];

  for (const s of rawSessions) {
    const hasCampaign = !isGenericValue(s.utm_campaign);
    const hasSource = !isGenericValue(s.utm_source);

    const source = s.utm_source || "facebook";
    const campName = s.utm_campaign || null;
    const campId = s.meta_campaign_id || null;
    const adsetId = s.meta_adset_id || null;
    const adId = s.meta_ad_id || null;

    let method: AttributionMethod = "native_pixel";
    let score = 50;

    if (s.fbc) {
      method = "forensic_fbc";
      score = 90;
    } else if (hasCampaign || hasSource) {
      method = "webhook_utm";
      score = 70;
    }

    candidateTouches.push({
      index: 0,
      timestamp: s.created_at || new Date().toISOString(),
      campaignId: campId,
      campaignName: campName,
      adsetId: adsetId,
      adsetName: null,
      adId: adId,
      adName: null,
      source: source,
      utmSource: s.utm_source || null,
      utmMedium: s.utm_medium || null,
      utmCampaign: s.utm_campaign || null,
      utmContent: s.utm_content || null,
      utmTerm: s.utm_term || null,
      attributionMethod: method,
      confidenceScore: score,
      isRecovered: false,
      trackId: s.track_id || null,
      fbp: s.fbp || null,
      fbc: s.fbc || null,
      evidence: {
        sessionId: s.id,
        referrer: s.referrer,
        landing_page: s.landing_page,
      },
    });
  }

  // Se o pedido trouxer dados próprios no checkout (webhook), adiciona como touchpoint final caso relevante
  const hasExistingMeta =
    !isGenericValue(input.existingCampaignId) ||
    !isGenericValue(input.existingCampaignName) ||
    !isGenericValue(input.utmCampaign) ||
    !isGenericValue(input.utmSource);

  if (hasExistingMeta || candidateTouches.length === 0) {
    candidateTouches.push({
      index: 0,
      timestamp: input.orderPaidAt || new Date().toISOString(),
      campaignId: input.existingCampaignId || null,
      campaignName: input.existingCampaignName || input.utmCampaign || null,
      adsetId: input.existingAdsetId || null,
      adsetName: input.existingAdsetName || null,
      adId: input.existingAdId || null,
      adName: input.existingAdName || null,
      source: input.existingSource || input.utmSource || "facebook",
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
      utmContent: input.utmContent || null,
      utmTerm: input.utmTerm || null,
      attributionMethod: input.existingCampaignId ? "native_pixel" : "webhook_utm",
      confidenceScore: input.existingCampaignId ? 90 : 70,
      isRecovered: false,
      trackId: input.trackId || null,
      fbp: input.fbp || null,
      fbc: input.fbc || null,
      evidence: { source: "order_input_payload" },
    });
  }

  // Ordena cronologicamente
  candidateTouches.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // ---------------------------------------------------------------------------
  // Deduplicação Inteligente de Touchpoints (Ajuste 3)
  // Regra:
  // Só remover se for EXATAMENTE a mesma entidade (mesmo campaign, adset, ad)
  // E intervalo < dedupWindowMinutes.
  // Se mudou anúncio, conjunto, campanha ou canal, MANTÉM intacto!
  // ---------------------------------------------------------------------------
  const dedupedTouches: Touchpoint[] = [];
  const dedupWindowMs = dedupWindowMinutes * 60 * 1000;

  for (const current of candidateTouches) {
    if (dedupedTouches.length === 0) {
      dedupedTouches.push(current);
      continue;
    }

    const prev = dedupedTouches[dedupedTouches.length - 1];
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(current.timestamp).getTime();
    const diffMs = Math.abs(currTime - prevTime);

    const sameCampaign =
      (prev.campaignId && current.campaignId && prev.campaignId === current.campaignId) ||
      (prev.campaignName && current.campaignName && prev.campaignName.toLowerCase() === current.campaignName.toLowerCase());

    const sameAdset = prev.adsetId === current.adsetId;
    const sameAd = prev.adId === current.adId;
    const sameSource = prev.source.toLowerCase() === current.source.toLowerCase();

    const isExactDuplicate = sameCampaign && sameAdset && sameAd && sameSource && diffMs <= dedupWindowMs;

    if (!isExactDuplicate) {
      dedupedTouches.push(current);
    } else {
      // Mantém os sinais mais ricos (fbc/evidência) na entrada preservada
      if (!prev.fbc && current.fbc) prev.fbc = current.fbc;
      if (current.confidenceScore > prev.confidenceScore) {
        prev.confidenceScore = current.confidenceScore;
        prev.attributionMethod = current.attributionMethod;
      }
    }
  }

  // Atribui índices 1-based sequenciais
  const finalTouches: Touchpoint[] = dedupedTouches.map((tp, i) => ({
    ...tp,
    index: i + 1,
  }));

  return {
    storeId,
    orderId: input.orderId,
    visitorIdentityId: recoveredVisitorIdentityId,
    identityClusterId,
    touchpoints: finalTouches,
    totalTouchpoints: finalTouches.length,
  };
}

// =============================================================================
// PARTE 3: Gravação Idempotente no Revenue Ledger (Ajuste 1 e Ajuste 4)
// =============================================================================

export interface RecordLedgerResult {
  storeId: string;
  orderId: string;
  totalTouchpoints: number;
  recordedSlicesCount: number;
  modelsProcessed: AttributionModel[];
  slices: AttributionSlice[];
}

/**
 * Grava as fatias contábeis de atribuição no public.revenue_ledger com idempotência garantida.
 * Utiliza upsert com onConflict determinístico: store_id, order_id, attribution_model, touchpoint_index.
 */
export async function recordOrderRevenueLedger(
  storeId: string,
  input: OrderAttributionInput,
  config?: AttributionIntelligenceConfig
): Promise<RecordLedgerResult> {
  const supabase = createAdminClient();
  const modelsToRun: AttributionModel[] = config?.modelsToCalculate || [
    "last_click",
    "first_click",
    "linear",
    "u_shaped",
  ];

  // 1. Constrói a jornada do cliente
  const journey = await buildCustomerJourney(storeId, input, config);

  // 2. Calcula as fatias contábeis para cada modelo configurado
  const allSlices: AttributionSlice[] = [];
  for (const model of modelsToRun) {
    const modelSlices = calculateModelSlices(journey, input, model);
    allSlices.push(...modelSlices);
  }

  // 3. Gravação com idempotência rigorosa via upsert (Ajuste 4)
  if (allSlices.length > 0) {
    const { error: upsertError } = await supabase.from("revenue_ledger").upsert(allSlices, {
      onConflict: "store_id,order_id,attribution_model,touchpoint_index",
    });

    if (upsertError) {
      throw new Error(`[Revenue Ledger] Falha no upsert das fatias contábeis: ${upsertError.message}`);
    }
  }

  return {
    storeId,
    orderId: input.orderId,
    totalTouchpoints: journey.totalTouchpoints,
    recordedSlicesCount: allSlices.length,
    modelsProcessed: modelsToRun,
    slices: allSlices,
  };
}

// =============================================================================
// PARTE 4: Consulta Analítica de Métricas Contábeis
// =============================================================================

/**
 * Consulta agregações contábeis do Revenue Ledger filtradas por modelo de atribuição.
 * O dashboard pode alternar entre 'last_click', 'first_click', 'linear' ou 'u_shaped' instantaneamente.
 */
export async function getRevenueLedgerMetrics(
  storeId: string,
  startDateIso: string,
  endDateIso: string,
  model: AttributionModel = "last_click"
): Promise<RevenueLedgerSummary> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("revenue_ledger")
    .select("*")
    .eq("store_id", storeId)
    .eq("attribution_model", model)
    .gte("order_paid_at", startDateIso)
    .lte("order_paid_at", endDateIso);

  if (error) {
    throw new Error(`[Revenue Ledger] Erro ao buscar métricas: ${error.message}`);
  }

  const campaignMap = new Map<string, CampaignLedgerMetric>();
  const uniqueOrders = new Set<string>();

  let totalRevenue = 0;
  let recoveredRevenue = 0;
  let assistedConversions = 0;
  let totalTouchpoints = 0;

  if (rows) {
    for (const row of rows) {
      const rev = Number(row.attributed_revenue) || 0;
      totalRevenue += rev;
      uniqueOrders.add(row.order_id);
      totalTouchpoints++;

      if (row.is_recovered) {
        recoveredRevenue += rev;
      }
      if (row.is_assisted) {
        assistedConversions++;
      }

      const campKey = row.campaign_id || row.campaign_name || "Sem Campanha";
      let campMetric = campaignMap.get(campKey);
      if (!campMetric) {
        campMetric = {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name || campKey,
          source: row.source,
          attributedRevenue: 0,
          totalOrders: 0,
          totalTouches: 0,
          assistedCount: 0,
          recoveredRevenue: 0,
        };
        campaignMap.set(campKey, campMetric);
      }

      campMetric.attributedRevenue = round2(campMetric.attributedRevenue + rev);
      campMetric.totalTouches++;
      if (row.is_assisted) campMetric.assistedCount++;
      if (row.is_recovered) campMetric.recoveredRevenue = round2(campMetric.recoveredRevenue + rev);
    }

    // Calcula pedidos por campanha de forma ponderada
    for (const campMetric of campaignMap.values()) {
      const campOrders = new Set<string>();
      for (const row of rows) {
        const rowCampKey = row.campaign_id || row.campaign_name || "Sem Campanha";
        if (rowCampKey === (campMetric.campaignId || campMetric.campaignName)) {
          campOrders.add(row.order_id);
        }
      }
      campMetric.totalOrders = campOrders.size;
    }
  }

  const campaigns = Array.from(campaignMap.values()).sort(
    (a, b) => b.attributedRevenue - a.attributedRevenue
  );

  return {
    storeId,
    attributionModel: model,
    totalRevenue: round2(totalRevenue),
    totalOrders: uniqueOrders.size,
    totalTouchpoints,
    recoveredRevenue: round2(recoveredRevenue),
    assistedConversions,
    campaigns,
  };
}
