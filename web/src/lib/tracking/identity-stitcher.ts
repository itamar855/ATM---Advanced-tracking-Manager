import { createAdminClient } from "../supabase/server";
import { sendMetaCAPIEvent, MetaEvent } from "../meta/capi";
import { resolveMetaAccessToken } from "../meta/token";
import { hashEmail, hashPhone, hashState, sha256Hash } from "../encryption";

export interface VisitorPIIData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_ip?: string | null;
  client_user_agent?: string | null;
  externalId?: string | null;
}

export interface VisitorIdentityRecord {
  id?: string;
  store_id: string;
  identity_cluster_id?: string;
  track_id: string;
  fbp?: string | null;
  fbc?: string | null;
  email_hash?: string | null;
  phone_hash?: string | null;
  raw_email?: string | null;
  raw_phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  external_id?: string | null;
  identity_source?: string;
  confidence_score?: number;
  merged_into?: string | null;
  created_at?: string;
  updated_at?: string;
  last_seen_at?: string;
}

/**
 * Cache em memória ultra-rápido (0ms) para consultas de sessão ativa
 * Chaves: `storeId:trackId` e `storeId:fbp`
 */
const identityMemoryCache = new Map<string, { data: VisitorPIIData; confidence: number; updatedAt: number }>();

function getCacheKey(storeId: string, id: string): string {
  return `${storeId}:${id}`;
}

/**
 * Normaliza número de telefone brasileiro para formato numérico canônico com DDI 55
 */
export function normalizePhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;

  // Se tem 10 ou 11 dígitos, adiciona o DDI 55 (Brasil)
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return digits;
}

/**
 * Normaliza e limpa endereço de e-mail (lowercase, trim, validação básica)
 */
export function normalizeEmail(rawEmail?: string | null): string | null {
  if (!rawEmail) return null;
  const clean = rawEmail.trim().toLowerCase();
  if (clean.includes("@") && clean.includes(".") && clean.length > 5) {
    return clean;
  }
  return null;
}

/**
 * Determina a pontuação de confiança com base no tipo de evento / origem
 */
function calculateConfidenceScore(eventName?: string, source?: string, hasPii?: boolean): number {
  if (eventName === "Purchase" || source === "purchase" || source === "webhook") {
    return 100; // Máxima confiança: dado faturado e validado
  }
  if (eventName === "InitiateCheckout" || eventName === "AddPaymentInfo") {
    return hasPii ? 80 : 40;
  }
  if (eventName === "Lead" || eventName === "CompleteRegistration" || eventName === "Subscribe" || source === "form") {
    return 50; // Lead/Formulário preenchido
  }
  return hasPii ? 30 : 20; // Navegação anônima ou topo de funil
}

/**
 * 1. upsertVisitorIdentity
 * Motor central de evolução e costura de identidade por loja na tabela `public.visitor_identities`.
 * Aplica Truth Hierarchy, geração determinística de hash e unificação de cluster.
 */
export async function upsertVisitorIdentity(
  storeId: string,
  trackId: string,
  fbp?: string | null,
  fbc?: string | null,
  newPii: VisitorPIIData = {},
  eventName?: string,
  source: string = "browser"
): Promise<VisitorPIIData> {
  const finalStoreId = storeId || "dckb5g-7d";
  if (!trackId && !fbp) return newPii;

  const cleanPhone = normalizePhone(newPii.phone);
  const cleanEmail = normalizeEmail(newPii.email);
  const hasContact = Boolean(cleanPhone || cleanEmail);
  const newScore = calculateConfidenceScore(eventName, source, hasContact);

  const phoneHash = cleanPhone ? hashPhone(cleanPhone) : null;
  const emailHash = cleanEmail ? hashEmail(cleanEmail) : null;
  const rawExtId = (newPii.externalId || "").trim();
  const externalId = (rawExtId && !rawExtId.startsWith("trk_") && !rawExtId.startsWith("atm_") && !rawExtId.startsWith("visitor:"))
    ? rawExtId
    : null;

  const supabase = createAdminClient();

  // 1. Busca registro prévio em memória ou no Supabase para aplicar a Truth Hierarchy
  let existing: VisitorPIIData = {};
  let currentScore = 0;
  let existingClusterId: string | undefined;

  const cached = trackId ? identityMemoryCache.get(getCacheKey(finalStoreId, trackId)) : null;
  if (cached) {
    existing = cached.data;
    currentScore = cached.confidence;
  } else if (trackId) {
    try {
      const { data: dbRecord } = await supabase
        .from("visitor_identities")
        .select("*")
        .eq("store_id", finalStoreId)
        .eq("track_id", trackId)
        .maybeSingle();

      if (dbRecord) {
        existing = {
          email: dbRecord.raw_email,
          phone: dbRecord.raw_phone,
          firstName: dbRecord.first_name,
          lastName: dbRecord.last_name,
          city: dbRecord.city,
          state: dbRecord.state,
          zip: dbRecord.zip,
          country: dbRecord.country || "BR",
          fbp: dbRecord.fbp,
          fbc: dbRecord.fbc,
          externalId: dbRecord.external_id,
        };
        currentScore = dbRecord.confidence_score || 0;
        existingClusterId = dbRecord.identity_cluster_id;
      }
    } catch (e: any) {
      console.warn("[Identity Stitcher] Erro ao buscar visitor_identities:", e.message);
    }
  }

  // 2. Truth Hierarchy: Preservar dados de maior confiança caso o evento atual venha com menos detalhes
  const finalEmail = cleanEmail || existing.email || null;
  const finalPhone = cleanPhone || existing.phone || null;
  const finalFirstName = newPii.firstName?.trim() || existing.firstName || null;
  const finalLastName = newPii.lastName?.trim() || existing.lastName || null;
  const finalCity = newPii.city?.trim() || existing.city || null;
  const finalState = newPii.state?.trim() || existing.state || null;
  const finalZip = newPii.zip?.replace(/\D/g, "") || existing.zip || null;
  const finalCountry = newPii.country || existing.country || "BR";
  const finalFbp = fbp || newPii.fbp || existing.fbp || null;
  const finalFbc = fbc || newPii.fbc || existing.fbc || null;
  const finalExternalId = externalId || existing.externalId || null;
  const finalScore = Math.max(currentScore, newScore);

  // 3. Cluster Stitching: Busca se já existe outro perfil do mesmo cliente na MESMA loja
  let clusterId = existingClusterId;
  let mergedIntoId: string | null = null;

  if (emailHash || phoneHash || finalExternalId) {
    try {
      let clusterQuery = supabase
        .from("visitor_identities")
        .select("id, identity_cluster_id")
        .eq("store_id", finalStoreId);

      if (trackId) {
        clusterQuery = clusterQuery.neq("track_id", trackId);
      }

      const orConditions: string[] = [];
      if (emailHash) orConditions.push(`email_hash.eq.${emailHash}`);
      if (phoneHash) orConditions.push(`phone_hash.eq.${phoneHash}`);
      if (finalExternalId) orConditions.push(`external_id.eq.${finalExternalId}`);

      if (orConditions.length > 0) {
        const { data: matchedProfiles } = await clusterQuery
          .or(orConditions.join(","))
          .limit(1);

        if (matchedProfiles && matchedProfiles.length > 0) {
          clusterId = matchedProfiles[0].identity_cluster_id || clusterId;
          mergedIntoId = matchedProfiles[0].id;
        }
      }
    } catch (clusterErr: any) {
      console.warn("[Identity Stitcher] Erro no cluster matching:", clusterErr.message);
    }
  }

  // 4. Persiste na tabela `public.visitor_identities` (Upsert atômico)
  if (trackId) {
    try {
      const payloadToUpsert: VisitorIdentityRecord = {
        store_id: finalStoreId,
        track_id: trackId,
        fbp: finalFbp,
        fbc: finalFbc,
        email_hash: finalEmail ? hashEmail(finalEmail) : null,
        phone_hash: finalPhone ? hashPhone(finalPhone) : null,
        raw_email: finalEmail,
        raw_phone: finalPhone,
        first_name: finalFirstName,
        last_name: finalLastName,
        city: finalCity,
        state: finalState,
        zip: finalZip,
        country: finalCountry,
        external_id: finalExternalId,
        identity_source: source,
        confidence_score: finalScore,
        merged_into: mergedIntoId,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };

      if (clusterId) {
        payloadToUpsert.identity_cluster_id = clusterId;
      }

      await supabase
        .from("visitor_identities")
        .upsert(payloadToUpsert, { onConflict: "store_id, track_id" });
    } catch (upsertErr: any) {
      console.warn("[Identity Stitcher] Erro ao gravar visitor_identities:", upsertErr.message);
    }
  }

  // 5. Atualiza cache em memória
  const consolidated: VisitorPIIData = {
    email: finalEmail,
    phone: finalPhone,
    firstName: finalFirstName,
    lastName: finalLastName,
    city: finalCity,
    state: finalState,
    zip: finalZip,
    country: finalCountry,
    fbp: finalFbp,
    fbc: finalFbc,
    client_ip: newPii.client_ip || existing.client_ip || null,
    client_user_agent: newPii.client_user_agent || existing.client_user_agent || null,
    externalId: finalExternalId,
  };

  const now = Date.now();
  if (trackId) identityMemoryCache.set(getCacheKey(finalStoreId, trackId), { data: consolidated, confidence: finalScore, updatedAt: now });
  if (finalFbp) identityMemoryCache.set(getCacheKey(finalStoreId, finalFbp), { data: consolidated, confidence: finalScore, updatedAt: now });

  return consolidated;
}

/**
 * Wrapper de compatibilidade para stitchVisitorIdentity
 */
export async function stitchVisitorIdentity(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null,
  newPii: VisitorPIIData = {}
): Promise<VisitorPIIData> {
  return upsertVisitorIdentity(storeId, trackId || "", fbp, newPii.fbc, newPii, "Lead", "stitcher");
}

/**
 * 2. getVisitorIdentity
 * Recupera os dados PII mais completos disponíveis para este visitante
 * consultando o cache em memória (0ms) ou a tabela `public.visitor_identities` (< 2ms).
 */
export async function getVisitorIdentity(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null
): Promise<VisitorPIIData> {
  const finalStoreId = storeId || "dckb5g-7d";

  if (!trackId && !fbp) {
    return { country: "BR" };
  }

  // 1. Consulta cache em memória deste visitante específico
  if (trackId) {
    const cached = identityMemoryCache.get(getCacheKey(finalStoreId, trackId));
    if (cached && (cached.data.phone || cached.data.email || cached.data.firstName)) return cached.data;
  }
  if (fbp) {
    const cached = identityMemoryCache.get(getCacheKey(finalStoreId, fbp));
    if (cached && (cached.data.phone || cached.data.email || cached.data.firstName)) return cached.data;
  }

  const result: VisitorPIIData = { country: "BR" };

  // 2. Consulta rápida na tabela `public.visitor_identities` (via índice único ou índice parcial)
  try {
    const supabase = createAdminClient();
    let record: any = null;

    if (trackId) {
      const { data } = await supabase
        .from("visitor_identities")
        .select("*")
        .eq("store_id", finalStoreId)
        .eq("track_id", trackId)
        .maybeSingle();
      record = data;
    }

    if (!record && fbp) {
      const { data } = await supabase
        .from("visitor_identities")
        .select("*")
        .eq("store_id", finalStoreId)
        .eq("fbp", fbp)
        .order("confidence_score", { ascending: false })
        .limit(1)
        .maybeSingle();
      record = data;
    }

    if (record) {
      result.email = record.raw_email || null;
      result.phone = record.raw_phone || null;
      result.firstName = record.first_name || null;
      result.lastName = record.last_name || null;
      result.city = record.city || null;
      result.state = record.state || null;
      result.zip = record.zip || null;
      result.country = record.country || "BR";
      result.fbp = record.fbp || null;
      result.fbc = record.fbc || null;
      result.externalId = record.external_id || null;

      const now = Date.now();
      const score = record.confidence_score || 20;
      if (trackId) identityMemoryCache.set(getCacheKey(finalStoreId, trackId), { data: result, confidence: score, updatedAt: now });
      if (fbp) identityMemoryCache.set(getCacheKey(finalStoreId, fbp), { data: result, confidence: score, updatedAt: now });
    }
  } catch (err: any) {
    console.warn("[Identity Stitcher] Erro ao buscar visitante no banco:", err.message);
  }

  return result;
}

/**
 * 3. enrichAndFlushBufferedEvents
 * Encontra todos os eventos no buffer (`status = 'buffered'`) pertencentes a este visitante,
 * enriquece-os com o telefone e e-mail capturados e despacha para a Meta CAPI!
 * 
 * Regras de segurança:
 * - Match restrito a `track_id` OU `fbp` não-nulos.
 * - Lock atômico: altera status para `processing` antes do envio.
 * - Status final: `accepted` (sem reenvios futuros).
 */
export async function enrichAndFlushBufferedEvents(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null,
  pii: VisitorPIIData = {}
): Promise<{ flushed: number; errors: number }> {
  const finalStoreId = storeId || "dckb5g-7d";

  // Se não temos dados de contato novos OU não temos nenhum identificador inequívoco, aborta
  const phone = normalizePhone(pii.phone);
  const email = normalizeEmail(pii.email);
  if (!phone && !email) return { flushed: 0, errors: 0 };
  if (!trackId && !fbp) return { flushed: 0, errors: 0 };

  const supabase = createAdminClient();

  // 1. Busca eventos com status 'buffered' desta loja
  const { data: bufferedEvents, error } = await supabase
    .from("events")
    .select("*")
    .eq("store_id", finalStoreId)
    .eq("status", "buffered")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error || !bufferedEvents || bufferedEvents.length === 0) {
    return { flushed: 0, errors: 0 };
  }

  // 2. Busca credenciais da Meta
  let pixelId = process.env.META_PIXEL_ID || "1104875232197441";
  let accessToken = "";
  let testEventCode = process.env.META_TEST_EVENT_CODE || undefined;

  try {
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("platform", "meta")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (integration) {
      pixelId = integration.pixel_id || pixelId;
      accessToken = resolveMetaAccessToken(integration.access_token_enc) || "";
      testEventCode = integration.config?.test_event_code || testEventCode;
    }
  } catch {}

  if (!accessToken) accessToken = process.env.META_ACCESS_TOKEN || "";

  let flushed = 0;
  let errors = 0;

  for (const ev of bufferedEvents) {
    const evMeta = ev.meta_response || {};
    const evTrackId = evMeta.track_id;
    const evFbp = evMeta.fbp || evMeta.user_data?.fbp;

    // Regra estrita de match: DEVE bater com track_id OU fbp válidos (elimina match anônimo genérico)
    const matches = (trackId && evTrackId === trackId) || (fbp && evFbp === fbp);
    if (!matches) continue;

    // Lock atômico imediato no banco: passa para 'processing' para impedir reenvios concorrentes
    await supabase
      .from("events")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", ev.id);

    // Constrói payload Meta CAPI enriquecido
    const user_data: MetaEvent["user_data"] = {
      fbp: fbp || evFbp || undefined,
      fbc: pii.fbc || evMeta.fbc || undefined,
      client_ip_address: pii.client_ip || evMeta.client_ip || undefined,
      client_user_agent: pii.client_user_agent || evMeta.client_user_agent || undefined,
    };

    if (email) user_data.em = [hashEmail(email)!];
    if (phone) user_data.ph = [hashPhone(phone)!];
    if (pii.firstName) {
      user_data.fn = [sha256Hash(pii.firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
    }
    if (pii.lastName) {
      user_data.ln = [sha256Hash(pii.lastName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
    }
    if (pii.city) user_data.ct = [sha256Hash(pii.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
    if (pii.state) user_data.st = [hashState(pii.state)];
    if (pii.zip) user_data.zp = [sha256Hash(pii.zip.replace(/\D/g, ""))];
    user_data.country = [sha256Hash("br")];
    user_data.co = [sha256Hash("br")];

    if (email) {
      user_data.external_id = [sha256Hash(`customer:${email}`)];
    } else if (phone) {
      user_data.external_id = [sha256Hash(`customer:${phone}`)];
    } else if (fbp || evFbp) {
      user_data.external_id = [sha256Hash(`visitor:${fbp || evFbp}`)];
    }

    const eventTime = Math.floor(new Date(ev.created_at || Date.now()).getTime() / 1000);
    const metaEvent: MetaEvent = {
      event_name: ev.event_name,
      event_time: eventTime,
      event_id: ev.event_id,
      event_source_url: evMeta.event_source_url || "https://checkout.loja.com",
      action_source: "website",
      user_data,
      custom_data: evMeta.custom_data || {},
    };

    const startTime = Date.now();
    let isOk = true;
    let metaResult: any = null;

    if (accessToken) {
      const res = await sendMetaCAPIEvent(
        { pixelId, accessToken, apiVersion: "v23.0", testEventCode },
        metaEvent
      );
      isOk = res.ok;
      metaResult = res.response;
    }

    const latencyMs = Date.now() - startTime;
    const userDataKeys: string[] = ["fbp", "fbc", "ip", "ua", "addr"];
    if (email) userDataKeys.push("em");
    if (phone) userDataKeys.push("ph");
    if (user_data.external_id) userDataKeys.push("external_id");

    const newScore = Math.min(100, Math.round((userDataKeys.length / 8) * 100));

    // Atualiza status final do evento no banco para 'accepted' (nunca mais sofre reenvio)
    await supabase
      .from("events")
      .update({
        status: isOk ? "accepted" : "failed",
        sent_at: new Date().toISOString(),
        latency_ms: latencyMs,
        user_data_keys: userDataKeys,
        health_score: newScore,
        meta_response: {
          ...(evMeta || {}),
          ...(metaResult || {}),
          flushed_by: "identity_stitcher",
          enriched_before_dispatch: true,
          order_details: {
            ...(evMeta.order_details || {}),
            customer_email: email || evMeta.order_details?.customer_email,
            customer_phone: phone || evMeta.order_details?.customer_phone,
            customer_name: pii.firstName ? `${pii.firstName} ${pii.lastName || ""}`.trim() : evMeta.order_details?.customer_name,
          },
        },
      })
      .eq("id", ev.id);

    if (isOk) {
      flushed++;
      console.log(
        `[Identity Stitcher] Evento ${ev.event_name} (${ev.event_id.slice(-8)}) liberado do buffer com PH (${phone ? "✓" : "✗"}) e EM (${email ? "✓" : "✗"}) | EMQ: ${newScore}%`
      );
    } else {
      errors++;
    }
  }

  return { flushed, errors };
}

/**
 * 4. retroactivelyEnrichCompletedEvents
 * Atualiza registros no banco exclusivamente para fins de visualização de painel / relatórios.
 * REGRA INVIOLÁVEL: NUNCA REENVIA PARA A META CAPI (Eliminado sendMetaCAPIEvent).
 */
export async function retroactivelyEnrichCompletedEvents(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null,
  pii: VisitorPIIData = {}
): Promise<void> {
  const phone = normalizePhone(pii.phone);
  const email = normalizeEmail(pii.email);
  if (!phone && !email) return;
  if (!trackId && !fbp) return;

  const finalStoreId = storeId || "dckb5g-7d";
  const supabase = createAdminClient();

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    let query = supabase
      .from("events")
      .select("id, event_name, event_id, created_at, user_data_keys, meta_response, health_score")
      .eq("store_id", finalStoreId)
      .gte("created_at", twoHoursAgo);

    if (trackId && fbp) {
      query = query.or(`meta_response->>track_id.eq.${trackId},meta_response->>fbp.eq.${fbp}`);
    } else if (trackId) {
      query = query.eq("meta_response->>track_id", trackId);
    } else if (fbp) {
      query = query.eq("meta_response->>fbp", fbp);
    }

    const { data: recentEvents } = await query
      .order("created_at", { ascending: false })
      .limit(20);

    for (const ev of recentEvents || []) {
      const keys: string[] = Array.isArray(ev.user_data_keys) ? [...ev.user_data_keys] : [];
      let updated = false;

      if (email && !keys.includes("em")) { keys.push("em"); updated = true; }
      if (phone && !keys.includes("ph")) { keys.push("ph"); updated = true; }
      if (pii.firstName && !keys.includes("fn")) { keys.push("fn"); updated = true; }

      if (updated) {
        const metaResp = ev.meta_response || {};
        const od = metaResp.order_details || {};

        if (email) od.customer_email = email;
        if (phone) od.customer_phone = phone;
        if (pii.firstName) od.customer_name = `${pii.firstName} ${pii.lastName || ""}`.trim();

        // Apenas atualiza o banco para histórico visual, SEM disparos CAPI
        await supabase
          .from("events")
          .update({
            user_data_keys: keys,
            meta_response: {
              ...metaResp,
              order_details: od,
              enriched_at: new Date().toISOString(),
            },
          })
          .eq("id", ev.id);
      }
    }
  } catch (e: any) {
    console.warn("[Identity Stitcher] Falha na atualização visual de histórico:", e.message);
  }
}
