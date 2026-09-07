import { createAdminClient } from "../supabase/server";
import { hashEmail, hashPhone } from "../encryption";
import { normalizeEmail, normalizePhone } from "./identity-stitcher";

export interface AttributionInvestigationInput {
  orderId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  externalId?: string | null;
  trackId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  orderCreatedAt?: string | null;
  existingCampaign?: string | null;
  existingSource?: string | null;
}

export interface AttributionConfig {
  clickWindowDays?: number; // Padrão: 7 dias
  viewWindowDays?: number;  // Padrão: 1 dia
}

export interface AttributionRecoveryResult {
  orderId: string;
  storeId: string;
  recovered: boolean;
  alreadyAttributed: boolean;
  confidenceScore: number; // 0 | 50 | 70 | 90 | 100
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adId: string | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  identityClusterId: string | null;
  evidence: Record<string, any>;
}

/**
 * Verifica se um valor de campanha é válido ou apenas um placeholder genérico
 */
function isGenericCampaign(campaign?: string | null): boolean {
  if (!campaign) return true;
  const clean = campaign.trim().toLowerCase();
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
 * Extrai fbclid de um cookie fbc (formato: fb.1.1699999999.IwAR3...)
 */
export function extractFbclidFromFbc(fbc?: string | null): string | null {
  if (!fbc) return null;
  const parts = fbc.split(".");
  if (parts.length >= 4) {
    return parts.slice(3).join(".");
  }
  return null;
}

/**
 * 1. recoverOrderAttribution
 * Motor Forense de Investigação e Recuperação de Atribuição por Pedido
 */
export async function recoverOrderAttribution(
  storeId: string,
  input: AttributionInvestigationInput,
  config: AttributionConfig = {}
): Promise<AttributionRecoveryResult> {
  const finalStoreId = storeId || "dckb5g-7d";
  const clickWindowDays = config.clickWindowDays ?? 7;
  const viewWindowDays = config.viewWindowDays ?? 1;

  // 0. Regra Inviolável: Nunca sobrescrever atribuições existentes
  if (input.existingCampaign && !isGenericCampaign(input.existingCampaign)) {
    return {
      orderId: input.orderId,
      storeId: finalStoreId,
      recovered: false,
      alreadyAttributed: true,
      confidenceScore: 100,
      campaignId: null,
      campaignName: input.existingCampaign,
      adsetId: null,
      adId: null,
      source: input.existingSource || "EXISTING",
      utmSource: input.existingSource || null,
      utmMedium: null,
      utmCampaign: input.existingCampaign,
      utmContent: null,
      utmTerm: null,
      identityClusterId: null,
      evidence: { reason: "Atribuição já existente e preservada" },
    };
  }

  const supabase = createAdminClient();
  const evidence: Record<string, any> = {
    steps_executed: [],
    investigated_at: new Date().toISOString(),
  };

  // Determina timestamp de referência da compra
  const orderTime = input.orderCreatedAt ? new Date(input.orderCreatedAt).getTime() : Date.now();
  const clickWindowStart = new Date(orderTime - clickWindowDays * 24 * 60 * 60 * 1000).toISOString();
  // Tolerância de 5 minutos para relógio de banco / skew temporal
  const upperWindowLimit = input.orderCreatedAt
    ? new Date(new Date(input.orderCreatedAt).getTime() + 60 * 1000).toISOString()
    : new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // ---------------------------------------------------------------------------
  // PASSO 1: Identidade Direta em public.visitor_identities
  // ---------------------------------------------------------------------------
  evidence.steps_executed.push("1_direct_identity");
  const cleanEmail = normalizeEmail(input.customerEmail);
  const cleanPhone = normalizePhone(input.customerPhone);
  const emailHash = cleanEmail ? hashEmail(cleanEmail) : null;
  const phoneHash = cleanPhone ? hashPhone(cleanPhone) : null;
  const externalId = input.externalId?.trim() || null;

  let matchedClusterId: string | null = null;
  let associatedTrackIds = new Set<string>();
  let associatedFbps = new Set<string>();
  let recoveredFbc = input.fbc || null;
  let identityMatched = false;

  if (input.trackId) associatedTrackIds.add(input.trackId);
  if (input.fbp) associatedFbps.add(input.fbp);

  const orClauses: string[] = [];
  if (emailHash) orClauses.push(`email_hash.eq.${emailHash}`);
  if (phoneHash) orClauses.push(`phone_hash.eq.${phoneHash}`);
  if (externalId) orClauses.push(`external_id.eq.${externalId}`);
  if (input.trackId) orClauses.push(`track_id.eq.${input.trackId}`);
  if (input.fbp) orClauses.push(`fbp.eq.${input.fbp}`);

  if (orClauses.length > 0) {
    try {
      const { data: identities, error: idErr } = await supabase
        .from("visitor_identities")
        .select("*")
        .eq("store_id", finalStoreId)
        .or(orClauses.join(","));

      if (idErr) {
        evidence.identity_lookup = { error: idErr.message };
      } else if (identities && identities.length > 0) {
        identityMatched = true;
        const primary = identities[0];
        matchedClusterId = primary.identity_cluster_id || primary.id;

        for (const idRecord of identities) {
          if (idRecord.track_id) associatedTrackIds.add(idRecord.track_id);
          if (idRecord.fbp) associatedFbps.add(idRecord.fbp);
          if (idRecord.fbc && !recoveredFbc) recoveredFbc = idRecord.fbc;
        }

        // Se encontrou cluster, busca outras identidades do mesmo cluster
        if (matchedClusterId) {
          const { data: clusterMembers } = await supabase
            .from("visitor_identities")
            .select("track_id, fbp, fbc")
            .eq("store_id", finalStoreId)
            .eq("identity_cluster_id", matchedClusterId);

          if (clusterMembers) {
            for (const cm of clusterMembers) {
              if (cm.track_id) associatedTrackIds.add(cm.track_id);
              if (cm.fbp) associatedFbps.add(cm.fbp);
              if (cm.fbc && !recoveredFbc) recoveredFbc = cm.fbc;
            }
          }
        }

        evidence.identity_lookup = {
          found: true,
          cluster_id: matchedClusterId,
          matched_records: identities.length,
          associated_tracks: Array.from(associatedTrackIds),
        };
      } else {
        evidence.identity_lookup = { found: false };
      }
    } catch (e: any) {
      evidence.identity_lookup = { error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // PASSO 2: Histórico do Visitante (Sessões e Eventos dentro da Janela)
  // ---------------------------------------------------------------------------
  evidence.steps_executed.push("2_visitor_history");
  const trackIdList = Array.from(associatedTrackIds);
  const fbpList = Array.from(associatedFbps);

  let historicalSessions: any[] = [];
  if (trackIdList.length > 0 || fbpList.length > 0) {
    try {
      const sessionOr: string[] = [];
      if (trackIdList.length > 0) sessionOr.push(`track_id.in.(${trackIdList.join(",")})`);
      if (fbpList.length > 0) sessionOr.push(`fbp.in.(${fbpList.join(",")})`);

      const { data: sessions, error: sErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("store_id", finalStoreId)
        .or(sessionOr.join(","))
        .gte("created_at", clickWindowStart)
        .lte("created_at", upperWindowLimit)
        .order("created_at", { ascending: true });

      if (sErr) {
        evidence.sessions_lookup = { error: sErr.message };
      } else if (sessions && sessions.length > 0) {
        historicalSessions = sessions;
        for (const s of sessions) {
          if (s.fbc && !recoveredFbc) recoveredFbc = s.fbc;
        }
      }
    } catch (sErr: any) {
      evidence.sessions_lookup = { error: sErr.message };
    }
  }

  evidence.historical_sessions_count = historicalSessions.length;
  const firstTouchSession = historicalSessions.length > 0 ? historicalSessions[0] : null;
  const lastTouchSession = historicalSessions.length > 0 ? historicalSessions[historicalSessions.length - 1] : null;

  // ---------------------------------------------------------------------------
  // PASSO 3: Mineração de UTMs
  // ---------------------------------------------------------------------------
  evidence.steps_executed.push("3_utm_mining");
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;
  let utmContent: string | null = null;
  let utmTerm: string | null = null;

  // Cascata: Last Touch -> First Touch -> Referrer / Landing Site
  const touchCandidates = [lastTouchSession, firstTouchSession].filter(Boolean);
  for (const session of touchCandidates) {
    if (!utmCampaign && session.utm_campaign && !isGenericCampaign(session.utm_campaign)) {
      utmCampaign = session.utm_campaign;
    }
    if (!utmSource && session.utm_source) utmSource = session.utm_source;
    if (!utmMedium && session.utm_medium) utmMedium = session.utm_medium;
    if (!utmContent && session.utm_content) utmContent = session.utm_content;
    if (!utmTerm && session.utm_term) utmTerm = session.utm_term;
  }

  // Tenta extrair fbclid de fbc ou da sessão
  let fbclid = extractFbclidFromFbc(recoveredFbc);
  if (!fbclid && lastTouchSession?.fbclid) fbclid = lastTouchSession.fbclid;
  if (!fbclid && firstTouchSession?.fbclid) fbclid = firstTouchSession.fbclid;

  // Extração mágica de UTM Content caso contenha padrão Ad|id::fbclid
  if (utmContent && utmContent.includes("::")) {
    const parts = utmContent.split("::");
    for (const p of parts) {
      if (p.length > 30 && !fbclid) {
        fbclid = p;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PASSO 4: Meta Click Attribution (Cruzamento de Catálogo de Campanhas)
  // ---------------------------------------------------------------------------
  evidence.steps_executed.push("4_meta_click_attribution");
  let resolvedCampaignId: string | null = null;
  let resolvedCampaignName: string | null = utmCampaign;
  let resolvedAdsetId: string | null = null;
  let resolvedAdId: string | null = null;

  try {
    // Consulta tabela campaign_costs da mesma loja
    const { data: costs } = await supabase
      .from("campaign_costs")
      .select("campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name")
      .eq("store_id", finalStoreId)
      .limit(300);

    if (costs && costs.length > 0) {
      // 1. Tenta casar pelo nome exato ou ID da campanha
      if (utmCampaign) {
        const match = costs.find(
          (c) =>
            c.campaign_id === utmCampaign ||
            (c.campaign_name && c.campaign_name.toLowerCase() === utmCampaign.toLowerCase())
        );
        if (match) {
          resolvedCampaignId = match.campaign_id;
          resolvedCampaignName = match.campaign_name || utmCampaign;
          resolvedAdsetId = match.adset_id || null;
          resolvedAdId = match.ad_id || null;
        }
      }

      // 2. Tenta casar pelo ad_id ou adset_id contido em utm_content / utm_term
      if (!resolvedCampaignId && utmContent) {
        const matchAd = costs.find(
          (c) => c.ad_id && utmContent.includes(c.ad_id)
        );
        if (matchAd) {
          resolvedCampaignId = matchAd.campaign_id;
          resolvedCampaignName = matchAd.campaign_name || resolvedCampaignName;
          resolvedAdsetId = matchAd.adset_id;
          resolvedAdId = matchAd.ad_id;
        }
      }
    }
  } catch (cErr: any) {
    evidence.costs_lookup = { error: cErr.message };
  }

  // ---------------------------------------------------------------------------
  // PASSO 5: Cálculo do Score de Confiança Determinístico
  // ---------------------------------------------------------------------------
  evidence.steps_executed.push("5_confidence_scoring");
  let confidenceScore = 0;
  let finalSource = utmSource || (recoveredFbc || fbclid ? "FB" : null);

  const hasFbcOrFbclid = Boolean(recoveredFbc || fbclid);
  const hasCampaign = Boolean(resolvedCampaignName && !isGenericCampaign(resolvedCampaignName));
  const hasFullUtm = Boolean(utmSource && utmCampaign && !isGenericCampaign(utmCampaign));
  const hasDirectSession = Boolean(
    input.trackId && historicalSessions.some((s) => s.track_id === input.trackId)
  );

  if (hasFbcOrFbclid && hasCampaign) {
    // 100 pontos: Compra + fbc/fbclid + campanha encontrada
    confidenceScore = 100;
  } else if (hasDirectSession && hasFullUtm) {
    // 90 pontos: Compra direta + UTM completa na sessão da compra
    confidenceScore = 90;
  } else if (identityMatched && hasCampaign) {
    // 70 pontos: Compra + identidade + sessão histórica com campanha
    confidenceScore = 70;
  } else if (hasFullUtm) {
    // Fallback para UTM histórica sem sessão direta vinculada
    confidenceScore = 70;
  } else if (finalSource || utmCampaign || firstTouchSession?.landing_page) {
    // 50 pontos: Somente origem provável
    confidenceScore = 50;
  } else {
    // 0 pontos: Sem evidência
    confidenceScore = 0;
  }

  evidence.attribution_decision = {
    confidenceScore,
    hasFbcOrFbclid,
    hasCampaign,
    hasFullUtm,
    identityMatched,
    resolvedCampaignName,
    resolvedCampaignId,
  };

  const isRecovered = confidenceScore >= 50;

  // ---------------------------------------------------------------------------
  // PASSO 6: Persistência no Log de Recuperação (attribution_recovery_log)
  // ---------------------------------------------------------------------------
  try {
    await supabase.from("attribution_recovery_log").upsert(
      {
        store_id: finalStoreId,
        order_id: input.orderId,
        identity_cluster_id: matchedClusterId,
        campaign_id: resolvedCampaignId,
        adset_id: resolvedAdsetId,
        ad_id: resolvedAdId,
        source: finalSource || "DIRECT_UNKNOWN",
        confidence_score: confidenceScore,
        evidence,
        created_at: new Date().toISOString(),
      },
      { onConflict: "store_id, order_id" }
    );
  } catch (logErr: any) {
    console.warn("[Attribution Recovery] Aviso ao gravar attribution_recovery_log:", logErr.message);
  }

  // ---------------------------------------------------------------------------
  // PASSO 7: Atualização da Venda Recuperada (Sem sobrescrever atribuições)
  // ---------------------------------------------------------------------------
  if (isRecovered && resolvedCampaignName) {
    try {
      // Atualiza evento Purchase correspondente se existir
      const { data: purchaseEvents } = await supabase
        .from("events")
        .select("id, meta_response")
        .eq("store_id", finalStoreId)
        .eq("event_name", "Purchase")
        .eq("order_id", input.orderId)
        .limit(1);

      if (purchaseEvents && purchaseEvents.length > 0) {
        const ev = purchaseEvents[0];
        const prevResp = ev.meta_response || {};
        const customData = prevResp.custom_data || {};
        const orderDetails = prevResp.order_details || {};

        // Só preenche se estava nulo ou genérico
        if (isGenericCampaign(orderDetails.utm_campaign) && isGenericCampaign(customData.utm_campaign)) {
          const updatedCustom = {
            ...customData,
            utm_source: finalSource || customData.utm_source,
            utm_campaign: resolvedCampaignName,
            utm_medium: utmMedium || customData.utm_medium,
            utm_content: utmContent || customData.utm_content,
            utm_term: utmTerm || customData.utm_term,
            attribution_recovered: true,
            attribution_confidence: confidenceScore,
          };

          const updatedDetails = {
            ...orderDetails,
            utm_source: finalSource || orderDetails.utm_source,
            utm_campaign: resolvedCampaignName,
            utm_medium: utmMedium || orderDetails.utm_medium,
            utm_content: utmContent || orderDetails.utm_content,
            attribution_recovered: true,
            attribution_confidence: confidenceScore,
          };

          await supabase
            .from("events")
            .update({
              meta_response: {
                ...prevResp,
                custom_data: updatedCustom,
                order_details: updatedDetails,
              },
            })
            .eq("id", ev.id);
        }
      }
    } catch (upErr: any) {
      console.warn("[Attribution Recovery] Aviso ao enriquecer evento Purchase:", upErr.message);
    }
  }

  return {
    orderId: input.orderId,
    storeId: finalStoreId,
    recovered: isRecovered,
    alreadyAttributed: false,
    confidenceScore,
    campaignId: resolvedCampaignId,
    campaignName: resolvedCampaignName,
    adsetId: resolvedAdsetId,
    adId: resolvedAdId,
    source: finalSource,
    utmSource: finalSource,
    utmMedium,
    utmCampaign: resolvedCampaignName,
    utmContent,
    utmTerm,
    identityClusterId: matchedClusterId,
    evidence,
  };
}

/**
 * 2. batchRecoverUntrackedOrders
 * Executa o motor forense para todas as vendas sem campanha de uma loja
 */
export async function batchRecoverUntrackedOrders(
  storeId: string,
  config: AttributionConfig = {}
): Promise<{ processed: number; recovered: number; results: AttributionRecoveryResult[] }> {
  const finalStoreId = storeId || "dckb5g-7d";
  const supabase = createAdminClient();

  // 1. Busca eventos de compra da loja
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("store_id", finalStoreId)
    .eq("event_name", "Purchase")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !events) {
    return { processed: 0, recovered: 0, results: [] };
  }

  const results: AttributionRecoveryResult[] = [];
  let recoveredCount = 0;

  for (const ev of events) {
    const orderDetails = ev.meta_response?.order_details || {};
    const customData = ev.meta_response?.custom_data || {};
    const existingCamp = orderDetails.utm_campaign || customData.utm_campaign || null;

    // Se já tiver campanha válida, pula
    if (!isGenericCampaign(existingCamp)) {
      continue;
    }

    const orderId = ev.order_id || ev.event_id?.replace("Purchase_", "") || ev.id;
    const customerEmail = orderDetails.customer_email || customData.customer_email || null;
    const customerPhone = orderDetails.customer_phone || customData.customer_phone || null;

    const res = await recoverOrderAttribution(
      finalStoreId,
      {
        orderId,
        customerEmail,
        customerPhone,
        existingCampaign: existingCamp,
        orderCreatedAt: ev.created_at,
      },
      config
    );

    results.push(res);
    if (res.recovered) recoveredCount++;
  }

  return {
    processed: results.length,
    recovered: recoveredCount,
    results,
  };
}
