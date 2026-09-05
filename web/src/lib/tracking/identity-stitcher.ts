import { createAdminClient } from "../supabase/server";
import { sendMetaCAPIEvent, MetaEvent } from "../meta/capi";
import { resolveMetaAccessToken } from "../meta/token";
import { hashEmail, hashPhone, hashState, sha256Hash } from "../encryption";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

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
}

/**
 * Cache rápido em memória para identidade de visitantes ativos na mesma instância.
 * Chaves: `store_id:track_id` e `store_id:fbp`
 */
const identityMemoryCache = new Map<string, { data: VisitorPIIData; updatedAt: number }>();

function getCacheKey(storeId: string, id: string): string {
  return `${storeId}:${id}`;
}

/**
 * Normaliza número de telefone brasileiro para formato E.164 ou numérico puro (DDI + DDD + 9 dígitos)
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
 * Normaliza e limpa endereço de e-mail
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
 * 1. stitchVisitorIdentity
 * Vincula e consolida os dados de identidade de um visitante (telefone, e-mail, nome, endereço)
 * associando ao `track_id` e ao `fbp`.
 */
export async function stitchVisitorIdentity(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null,
  newPii: VisitorPIIData = {}
): Promise<VisitorPIIData> {
  const finalStoreId = storeId || "dckb5g-7d";
  const cleanPhone = normalizePhone(newPii.phone);
  const cleanEmail = normalizeEmail(newPii.email);

  // Se não temos dados novos e nem identificadores, retorna vazio
  if (!trackId && !fbp) return newPii;

  // Busca dados já existentes para mesclagem inteligente
  const existing = await getVisitorIdentity(finalStoreId, trackId, fbp);

  const merged: VisitorPIIData = {
    email: cleanEmail || existing.email || null,
    phone: cleanPhone || existing.phone || null,
    firstName: newPii.firstName?.trim() || existing.firstName || null,
    lastName: newPii.lastName?.trim() || existing.lastName || null,
    city: newPii.city?.trim() || existing.city || null,
    state: newPii.state?.trim() || existing.state || null,
    zip: newPii.zip?.replace(/\D/g, "") || existing.zip || null,
    country: newPii.country || existing.country || "BR",
    fbp: fbp || newPii.fbp || existing.fbp || null,
    fbc: newPii.fbc || existing.fbc || existing.fbc || null,
    client_ip: newPii.client_ip || existing.client_ip || null,
    client_user_agent: newPii.client_user_agent || existing.client_user_agent || null,
  };

  // 1. Atualiza cache em memória
  const now = Date.now();
  if (trackId) identityMemoryCache.set(getCacheKey(finalStoreId, trackId), { data: merged, updatedAt: now });
  if (fbp) identityMemoryCache.set(getCacheKey(finalStoreId, fbp), { data: merged, updatedAt: now });

  // 2. Persiste em sessions no Supabase para perenidade
  try {
    const supabase = createAdminClient();

    // Se temos trackId, atualiza a sessão existente
    if (trackId) {
      await supabase
        .from("sessions")
        .update({
          fbp: merged.fbp || undefined,
          fbc: merged.fbc || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("store_id", finalStoreId)
        .eq("track_id", trackId);
    }
  } catch (err: any) {
    console.warn("[Identity Stitcher] Erro ao persistir sessão:", err.message);
  }

  return merged;
}

/**
 * 2. getVisitorIdentity
 * Recupera os dados PII mais completos disponíveis para este visitante
 * consultando o cache em memória, tabela sessions e eventos anteriores (IC, Lead, Purchase).
 */
export async function getVisitorIdentity(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null
): Promise<VisitorPIIData> {
  const finalStoreId = storeId || "dckb5g-7d";

  // Se não temos nem trackId nem fbp, o visitante é estritamente anônimo
  if (!trackId && !fbp) {
    return { country: "BR" };
  }

  // 1. Consulta cache em memória deste visitante específico
  if (trackId) {
    const cached = identityMemoryCache.get(getCacheKey(finalStoreId, trackId));
    if (cached && (cached.data.phone || cached.data.email)) return cached.data;
  }
  if (fbp) {
    const cached = identityMemoryCache.get(getCacheKey(finalStoreId, fbp));
    if (cached && (cached.data.phone || cached.data.email)) return cached.data;
  }

  const result: VisitorPIIData = { country: "BR" };

  try {
    const supabase = createAdminClient();

    // 2. Consulta eventos anteriores COM DADOS DE CONTATO vinculados ESTRITAMENTE a este track_id ou fbp
    let query = supabase
      .from("events")
      .select("meta_response")
      .eq("store_id", finalStoreId)
      .in("event_name", ["Purchase", "InitiateCheckout", "Lead", "AddToCart"]);

    if (trackId && fbp) {
      query = query.or(`meta_response->>track_id.eq.${trackId},meta_response->>fbp.eq.${fbp}`);
    } else if (trackId) {
      query = query.eq("meta_response->>track_id", trackId);
    } else if (fbp) {
      query = query.eq("meta_response->>fbp", fbp);
    }

    const { data: events } = await query
      .order("created_at", { ascending: false })
      .limit(5);

    for (const ev of events || []) {
      const od = ev.meta_response?.order_details || {};
      const cd = ev.meta_response?.custom_data || {};

      const candidateEmail = normalizeEmail(od.customer_email || cd.customer_email);
      const candidatePhone = normalizePhone(od.customer_phone || cd.customer_phone);

      if (candidateEmail && !result.email) result.email = candidateEmail;
      if (candidatePhone && !result.phone) result.phone = candidatePhone;
      if (od.customer_name && !result.firstName) {
        const parts = od.customer_name.trim().split(" ");
        result.firstName = parts[0];
        result.lastName = parts.slice(1).join(" ") || undefined;
      }
      if (od.customer_city && !result.city) result.city = od.customer_city;
      if (od.customer_state && !result.state) result.state = od.customer_state;
      if (od.customer_zip && !result.zip) result.zip = od.customer_zip;

      if (result.email && result.phone) break;
    }

    // Se encontrou dados deste visitante, armazena no cache em memória
    if (result.email || result.phone) {
      const now = Date.now();
      if (trackId) identityMemoryCache.set(getCacheKey(finalStoreId, trackId), { data: result, updatedAt: now });
      if (fbp) identityMemoryCache.set(getCacheKey(finalStoreId, fbp), { data: result, updatedAt: now });
    }
  } catch (err: any) {
    console.warn("[Identity Stitcher] Erro ao buscar dados de eventos anteriores do visitante:", err.message);
  }

  return result;
}

/**
 * 3. enrichAndFlushBufferedEvents
 * Encontra todos os eventos no buffer (`status = 'buffered'`) desta sessão/loja,
 * enriquece-os com o telefone e e-mail recém-descobertos e despacha imediatamente para a Meta CAPI!
 */
export async function enrichAndFlushBufferedEvents(
  storeId: string,
  trackId?: string | null,
  fbp?: string | null,
  pii: VisitorPIIData = {}
): Promise<{ flushed: number; errors: number }> {
  const finalStoreId = storeId || "dckb5g-7d";
  const supabase = createAdminClient();

  const phone = normalizePhone(pii.phone);
  const email = normalizeEmail(pii.email);

  if (!phone && !email) {
    return { flushed: 0, errors: 0 };
  }

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
    // Verifica correspondência por track_id ou fbp no meta_response
    const evMeta = ev.meta_response || {};
    const evTrackId = evMeta.track_id;
    const evFbp = evMeta.fbp || evMeta.user_data?.fbp;

    const matches = (trackId && evTrackId === trackId) || (fbp && evFbp === fbp) || (!evTrackId && !trackId);

    if (!matches) continue;

    // Constrói payload Meta CAPI enriquecido com o Telefone e E-mail capturados
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
      event_source_url: evMeta.event_source_url || "https://atacadodasgaiolas.shop",
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

    // Atualiza status do evento no banco para 'accepted' com dados completos
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
 * Atualiza retroativamente eventos da mesma sessão que já foram despachados
 * para que o painel Event Explorer e os relatórios reflitam o telefone e e-mail capturados.
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
    // 1. Busca credenciais ativas da Meta CAPI
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

    // 2. Busca eventos das últimas 2 horas dessa loja ESTRITAMENTE deste visitante
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
      .limit(30);

    for (const ev of recentEvents || []) {
      const keys: string[] = Array.isArray(ev.user_data_keys) ? [...ev.user_data_keys] : [];
      let updated = false;

      if (email && !keys.includes("em") && !keys.includes("email")) {
        keys.push("em");
        updated = true;
      }
      if (phone && !keys.includes("ph") && !keys.includes("phone")) {
        keys.push("ph");
        updated = true;
      }
      if (pii.firstName && !keys.includes("fn")) {
        keys.push("fn");
        updated = true;
      }
      if (pii.lastName && !keys.includes("ln")) {
        keys.push("ln");
        updated = true;
      }
      if (pii.city && !keys.includes("ct")) {
        keys.push("ct");
        updated = true;
      }
      if (pii.state && !keys.includes("st")) {
        keys.push("st");
        updated = true;
      }
      if (pii.zip && !keys.includes("zp")) {
        keys.push("zp");
        updated = true;
      }
      if (!keys.includes("co")) {
        keys.push("co");
      }
      if (!keys.includes("external_id") && (email || phone || fbp)) {
        keys.push("external_id");
        updated = true;
      }

      if (updated) {
        // Pesos oficiais EMQ da Meta
        const weights: Record<string, number> = {
          em: 20, ph: 15, fbp: 15, fbc: 10, external_id: 10,
          fn: 5, ln: 5, ct: 5, st: 5, zp: 4, co: 3, client_ip_address: 2, client_user_agent: 1,
        };
        let newScore = 0;
        for (const k of keys) {
          newScore += weights[k] || 0;
        }
        newScore = Math.min(100, Math.round(newScore));

        const metaResp = ev.meta_response || {};
        const od = metaResp.order_details || {};

        if (email) od.customer_email = email;
        if (phone) od.customer_phone = phone;
        if (pii.firstName) od.customer_name = `${pii.firstName} ${pii.lastName || ""}`.trim();

        // 3. Atualiza registro na tabela do Supabase com EMQ maximizado
        await supabase
          .from("events")
          .update({
            user_data_keys: keys,
            health_score: newScore,
            meta_response: {
              ...metaResp,
              order_details: od,
              retroactively_enriched: true,
              enriched_at: new Date().toISOString(),
            },
          })
          .eq("id", ev.id);

        // 4. REENVIO RETROATIVO PARA A META CAPI:
        // A Meta combina os parâmetros do mesmo event_id elevando o EMQ de todo o funil!
        if (accessToken && ev.event_id) {
          const evFbp = metaResp.fbp || metaResp.user_data?.fbp;
          const evFbc = metaResp.fbc || metaResp.user_data?.fbc;
          const evClientIp = metaResp.client_ip || metaResp.user_data?.client_ip_address;
          const evClientUa = metaResp.client_user_agent || metaResp.user_data?.client_user_agent;

          const user_data: MetaEvent["user_data"] = {
            fbp: fbp || evFbp || undefined,
            fbc: pii.fbc || evFbc || undefined,
            client_ip_address: pii.client_ip || evClientIp || undefined,
            client_user_agent: pii.client_user_agent || evClientUa || undefined,
          };

          if (email) user_data.em = [hashEmail(email)!];
          if (phone) user_data.ph = [hashPhone(phone)!];
          if (pii.firstName) {
            user_data.fn = [sha256Hash(pii.firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
          }
          if (pii.lastName) {
            user_data.ln = [sha256Hash(pii.lastName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
          }
          if (pii.city) {
            user_data.ct = [sha256Hash(pii.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))];
          }
          if (pii.state) {
            user_data.st = [hashState(pii.state)];
          }
          if (pii.zip) {
            user_data.zp = [sha256Hash(pii.zip.replace(/\D/g, ""))];
          }
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
            event_source_url: metaResp.event_source_url || "https://atacadodasgaiolas.shop",
            action_source: "website",
            user_data,
            custom_data: metaResp.custom_data || {},
          };

          sendMetaCAPIEvent(
            { pixelId, accessToken, apiVersion: "v23.0", testEventCode },
            metaEvent
          ).then((res) => {
            if (res.ok) {
              console.log(
                `[Identity Stitcher] Evento ${ev.event_name} (${ev.event_id.slice(-8)}) retroalimentado com sucesso na Meta CAPI! Novo EMQ: ${newScore}%`
              );
            }
          }).catch((capiErr) => {
            console.warn(`[Identity Stitcher] Erro ao despachar retroalimentação CAPI (${ev.event_name}):`, capiErr.message);
          });
        }
      }
    }
  } catch (e: any) {
    console.warn("[Identity Stitcher] Falha no enriquecimento retroativo:", e.message);
  }
}
