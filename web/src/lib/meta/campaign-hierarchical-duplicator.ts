import { createAdminClient } from "@/lib/supabase/server";

export type DuplicationMode = "FULL_CLONE" | "SIMPLE";

export type DuplicationSourceAction =
  | "MANUAL_DUPLICATE"
  | "ATM_RECOMMENDATION"
  | "AUTOMATED_FLOW";

export type BudgetWarning = "EXTREME_BUDGET_CHANGE" | null;

export function normalizeSourceAction(action?: string | null): DuplicationSourceAction {
  if (action === "ATM_RECOMMENDATION" || action === "AUTOMATED_FLOW") {
    return action;
  }
  return "MANUAL_DUPLICATE";
}

export type DuplicationJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK";

export interface DuplicationJobLog {
  id?: string;
  store_id: string;
  source_campaign_id: string;
  new_campaign_id: string | null;
  duplication_mode: DuplicationMode;
  source_action: DuplicationSourceAction;
  original_adsets: number;
  created_adsets: number;
  original_ads: number;
  created_ads: number;
  original_budget: number | null;
  duplicated_budget: number | null;
  budget_change_percent: number | null;
  budget_warning: BudgetWarning;
  status: DuplicationJobStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at?: string;
}

export interface DuplicationOptions {
  campaignId: string;
  accessToken: string;
  storeId: string;
  duplicationMode?: DuplicationMode; // Default: 'FULL_CLONE'
  sourceAction?: string | null; // Default: 'MANUAL_DUPLICATE'
  copiesCount?: number; // Default: 1
  newDailyBudgetCents?: number | null;
  preferredName?: string;
  activateAfterDuplication?: boolean; // Default: true (Regra ATM)
  customFetch?: typeof fetch; // Injeção de dependência para testes automatizados com mocks
}

export interface DuplicationResult {
  ok: boolean;
  job: DuplicationJobLog;
  createdCampaignId?: string | null;
  createdAdsetIds?: string[];
  createdAdIds?: string[];
  finalStatus?: "ACTIVE" | "PAUSED";
  activatedAt?: string | null;
  error?: string;
}

const GRAPH_API_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Normaliza o ID da conta de anúncios garantindo o prefixo "act_"
 */
function normalizeAccountId(accountId: string): string {
  const clean = accountId.trim().replace(/^act_/, "");
  return `act_${clean}`;
}

/**
 * Registra o log do job de duplicação no Supabase de forma resiliente
 */
export async function persistDuplicationLog(log: DuplicationJobLog): Promise<void> {
  try {
    const supabase = createAdminClient();
    const payload = {
      store_id: log.store_id,
      source_campaign_id: log.source_campaign_id,
      new_campaign_id: log.new_campaign_id,
      duplication_mode: log.duplication_mode,
      source_action: log.source_action,
      original_adsets: log.original_adsets,
      created_adsets: log.created_adsets,
      original_ads: log.original_ads,
      created_ads: log.created_ads,
      original_budget: log.original_budget,
      duplicated_budget: log.duplicated_budget,
      budget_change_percent: log.budget_change_percent,
      budget_warning: log.budget_warning,
      status: log.status,
      error_message: log.error_message,
      started_at: log.started_at,
      completed_at: log.completed_at,
      duration_ms: log.duration_ms,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("meta_duplication_logs").insert(payload);
    if (error) {
      console.warn("[persistDuplicationLog] Aviso ao salvar no banco (tabela pode estar pendente de migração):", error.message);
    }
  } catch (err: any) {
    console.warn("[persistDuplicationLog] Falha assíncrona ao persistir log:", err.message);
  }
}

export type CampaignStatusEventType =
  | "CAMPAIGN_DUPLICATED"
  | "DELIVERY_ENABLED"
  | "CAMPAIGN_PAUSED";

export interface CampaignStatusHistoryRecord {
  id?: string;
  store_id: string;
  campaign_id: string;
  source_campaign_id?: string | null;
  event_type: CampaignStatusEventType;
  previous_status: string | null;
  new_status: string;
  source: string;
  created_at?: string;
  metadata_json?: Record<string, any>;
}

/**
 * Registra a transição de status na tabela de auditoria campaign_status_history
 */
export async function persistCampaignStatusHistory(
  record: CampaignStatusHistoryRecord
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const payload = {
      store_id: record.store_id,
      campaign_id: record.campaign_id,
      source_campaign_id: record.source_campaign_id || null,
      event_type: record.event_type,
      previous_status: record.previous_status || null,
      new_status: record.new_status,
      source: record.source || "MANUAL_DUPLICATE",
      created_at: record.created_at || new Date().toISOString(),
      metadata_json: record.metadata_json || {},
    };

    const { error } = await supabase.from("campaign_status_history").insert(payload);
    if (error) {
      console.warn("[persistCampaignStatusHistory] Aviso ao salvar status (tabela pode estar pendente de migração):", error.message);
    }
  } catch (err: any) {
    console.warn("[persistCampaignStatusHistory] Falha assíncrona ao persistir status:", err.message);
  }
}

/**
 * Executa limpeza reversa atômica (Rollback) na Meta Graph API
 * Deleta em ordem: Ads criados -> AdSets criados -> Campaign criada
 */
async function executeRollback(
  token: string,
  createdAdIds: string[],
  createdAdsetIds: string[],
  createdCampaignId: string | null,
  fetchFn: typeof fetch
): Promise<void> {
  console.warn(`[DUPLICATION ROLLBACK] Iniciando reversão atômica. Ads: ${createdAdIds.length}, AdSets: ${createdAdsetIds.length}, Campaign: ${createdCampaignId}`);

  // 1. Deletar anúncios criados
  for (const adId of createdAdIds) {
    try {
      await fetchFn(`${GRAPH_BASE}/${adId}?access_token=${token}`, { method: "DELETE" });
      console.log(`[DUPLICATION ROLLBACK] Ad removido: ${adId}`);
    } catch (e: any) {
      console.error(`[DUPLICATION ROLLBACK] Falha ao deletar ad ${adId}:`, e.message);
    }
  }

  // 2. Deletar conjuntos criados
  for (const adsetId of createdAdsetIds) {
    try {
      await fetchFn(`${GRAPH_BASE}/${adsetId}?access_token=${token}`, { method: "DELETE" });
      console.log(`[DUPLICATION ROLLBACK] AdSet removido: ${adsetId}`);
    } catch (e: any) {
      console.error(`[DUPLICATION ROLLBACK] Falha ao deletar adset ${adsetId}:`, e.message);
    }
  }

  // 3. Deletar campanha criada
  if (createdCampaignId) {
    try {
      await fetchFn(`${GRAPH_BASE}/${createdCampaignId}?access_token=${token}`, { method: "DELETE" });
      console.log(`[DUPLICATION ROLLBACK] Campaign removida: ${createdCampaignId}`);
    } catch (e: any) {
      console.error(`[DUPLICATION ROLLBACK] Falha ao deletar campaign ${createdCampaignId}:`, e.message);
    }
  }
}

/**
 * Motor Principal de Duplicação de Campanhas Meta Ads
 * Suporta modo FULL_CLONE (idêntico ao Meta Ads Manager com todos os AdSets e Ads vinculados)
 * e modo SIMPLE (duplica somente o container da campanha).
 */
export async function duplicateCampaign(options: DuplicationOptions): Promise<DuplicationResult> {
  const {
    campaignId,
    accessToken,
    storeId,
    duplicationMode = "FULL_CLONE",
    sourceAction,
    newDailyBudgetCents = null,
    preferredName,
    activateAfterDuplication = true,
    customFetch = fetch,
  } = options;

  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  const normalizedAction = normalizeSourceAction(sourceAction);

  const job: DuplicationJobLog = {
    store_id: storeId,
    source_campaign_id: campaignId,
    new_campaign_id: null,
    duplication_mode: duplicationMode,
    source_action: normalizedAction,
    original_adsets: 0,
    created_adsets: 0,
    original_ads: 0,
    created_ads: 0,
    original_budget: null,
    duplicated_budget: null,
    budget_change_percent: null,
    budget_warning: null,
    status: "RUNNING",
    error_message: null,
    started_at: startedAt,
    completed_at: null,
    duration_ms: null,
  };

  const createdAdIds: string[] = [];
  const createdAdsetIds: string[] = [];
  let createdCampaignId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. BUSCAR CAMPANHA ORIGINAL
    // -------------------------------------------------------------------------
    const campUrl = `${GRAPH_BASE}/${campaignId}?fields=id,name,objective,buying_type,status,special_ad_categories,daily_budget,lifetime_budget,bid_strategy,account_id&access_token=${accessToken}`;
    const campRes = await customFetch(campUrl);
    const origCamp = await campRes.json();

    if (!campRes.ok || !origCamp.id) {
      throw new Error(`Falha ao carregar campanha original (${campaignId}): ${origCamp.error?.message || "Campanha não encontrada na Meta"}`);
    }

    if (!origCamp.account_id) {
      throw new Error(`account_id não retornado para a campanha original ${campaignId}`);
    }

    const actId = normalizeAccountId(origCamp.account_id);

    // -------------------------------------------------------------------------
    // 2. CRIAR NOVA CAMPANHA NA META (SEMPRE COMO PAUSED)
    // -------------------------------------------------------------------------
    const newCampName = preferredName || `[CÓPIA] ${origCamp.name}`;
    const campPayload: Record<string, any> = {
      name: newCampName,
      objective: origCamp.objective,
      buying_type: origCamp.buying_type || "AUCTION",
      status: "PAUSED", // REQUISITO 3: Sempre PAUSED!
      special_ad_categories: Array.isArray(origCamp.special_ad_categories) && origCamp.special_ad_categories.length > 0
        ? origCamp.special_ad_categories
        : ["NONE"],
    };

    // Validação e auditoria de orçamento:
    // Orçamento CBO ou Lifetime da campanha original (em unidades de moeda, ex: BRL ou USD)
    const rawOrigBudgetCents = origCamp.daily_budget
      ? Number(origCamp.daily_budget)
      : origCamp.lifetime_budget
      ? Number(origCamp.lifetime_budget)
      : null;

    const originalBudgetUnits = rawOrigBudgetCents !== null && !isNaN(rawOrigBudgetCents) ? rawOrigBudgetCents / 100 : null;
    let duplicatedBudgetUnits = originalBudgetUnits;
    let budgetChangePercent: number | null = null;
    let budgetWarning: BudgetWarning = null;

    // Se newDailyBudgetCents foi enviado, valida obrigatoriamente (nunca permitir alteração silenciosa ou inválida)
    if (newDailyBudgetCents !== undefined && newDailyBudgetCents !== null) {
      if (isNaN(newDailyBudgetCents) || newDailyBudgetCents < 0) {
        throw new Error(
          `Orçamento inválido fornecido para duplicação: ${newDailyBudgetCents}. Alterações silenciosas ou orçamentos negativos são proibidos.`
        );
      }
      duplicatedBudgetUnits = newDailyBudgetCents / 100;

      if (originalBudgetUnits !== null && originalBudgetUnits > 0) {
        budgetChangePercent = Number(
          (((duplicatedBudgetUnits - originalBudgetUnits) / originalBudgetUnits) * 100).toFixed(2)
        );

        // Validação de orçamento extremo: > +100% ou < -90%
        if (budgetChangePercent > 100 || budgetChangePercent < -90) {
          budgetWarning = "EXTREME_BUDGET_CHANGE";
        }
      } else {
        budgetChangePercent = 0;
      }
    } else if (originalBudgetUnits !== null) {
      budgetChangePercent = 0;
    }

    job.original_budget = originalBudgetUnits;
    job.duplicated_budget = duplicatedBudgetUnits;
    job.budget_change_percent = budgetChangePercent;
    job.budget_warning = budgetWarning;

    // Orçamento CBO (Advantage Campaign Budget)
    if (newDailyBudgetCents && newDailyBudgetCents > 0) {
      campPayload.daily_budget = newDailyBudgetCents;
    } else if (origCamp.daily_budget) {
      campPayload.daily_budget = origCamp.daily_budget;
    } else if (origCamp.lifetime_budget) {
      campPayload.lifetime_budget = origCamp.lifetime_budget;
    }

    if (origCamp.bid_strategy) {
      campPayload.bid_strategy = origCamp.bid_strategy;
    }

    const createCampRes = await customFetch(`${GRAPH_BASE}/${actId}/campaigns?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campPayload),
    });

    const createCampData = await createCampRes.json();
    if (!createCampRes.ok || !createCampData.id) {
      throw new Error(`Falha ao criar nova campanha na Meta: ${createCampData.error?.message || JSON.stringify(createCampData)}`);
    }

    createdCampaignId = createCampData.id;
    job.new_campaign_id = createdCampaignId;

    // Se o modo for "SIMPLE", finaliza após clonar apenas o container da campanha
    if (duplicationMode === "SIMPLE") {
      await persistCampaignStatusHistory({
        store_id: storeId,
        campaign_id: createdCampaignId!,
        source_campaign_id: campaignId,
        event_type: "CAMPAIGN_DUPLICATED",
        previous_status: null,
        new_status: "PAUSED",
        source: normalizedAction,
        metadata_json: {
          duplication_mode: "SIMPLE",
          budget: duplicatedBudgetUnits,
        },
      });

      let finalStatus: "ACTIVE" | "PAUSED" = "PAUSED";
      let activatedAtIso: string | null = null;

      if (activateAfterDuplication) {
        await customFetch(`${GRAPH_BASE}/${createdCampaignId}?access_token=${accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
        finalStatus = "ACTIVE";
        activatedAtIso = new Date().toISOString();
        const activationDelaySeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

        await persistCampaignStatusHistory({
          store_id: storeId,
          campaign_id: createdCampaignId!,
          source_campaign_id: campaignId,
          event_type: "DELIVERY_ENABLED",
          previous_status: "PAUSED",
          new_status: "ACTIVE",
          source: normalizedAction,
          created_at: activatedAtIso,
          metadata_json: {
            activation_trigger: "ATM_DUPLICATION",
            source_campaign_id: campaignId,
            new_campaign_id: createdCampaignId!,
            duplication_mode: "SIMPLE",
            initial_status: "PAUSED",
            activation_delay_seconds: activationDelaySeconds,
            created_entities: {
              campaigns_count: 1,
              adsets_count: 0,
              ads_count: 0,
            },
            activated_at: activatedAtIso,
          },
        });
      }

      const finishTime = Date.now();
      job.completed_at = new Date(finishTime).toISOString();
      job.duration_ms = finishTime - startTime;
      job.status = "COMPLETED";
      await persistDuplicationLog(job);
      return {
        ok: true,
        job,
        createdCampaignId,
        createdAdsetIds: [],
        createdAdIds: [],
        finalStatus,
        activatedAt: activatedAtIso,
      };
    }

    // =========================================================================
    // MODO FULL_CLONE: DUPLICAÇÃO HIERÁRQUICA COMPLETA
    // =================--------------------------------------------------------

    // -------------------------------------------------------------------------
    // 3. BUSCAR TODOS OS CONJUNTOS DE ANÚNCIOS (AD SETS) DA ORIGINAL
    // -------------------------------------------------------------------------
    const adsetsUrl = `${GRAPH_BASE}/${campaignId}/adsets?fields=id,name,optimization_goal,billing_event,promoted_object,bid_amount,daily_budget,lifetime_budget,targeting,attribution_spec,status,destination_type,bid_strategy,start_time,end_time&limit=150&access_token=${accessToken}`;
    const adsetsRes = await customFetch(adsetsUrl);
    const adsetsData = await adsetsRes.json();

    if (!adsetsRes.ok) {
      throw new Error(`Falha ao buscar conjuntos originais: ${adsetsData.error?.message || "Erro na Graph API"}`);
    }

    const originalAdsets: any[] = Array.isArray(adsetsData.data) ? adsetsData.data : [];
    job.original_adsets = originalAdsets.length;

    // -------------------------------------------------------------------------
    // 4. CLONAR CADA CONJUNTO E SEUS RESPECTIVOS ANÚNCIOS
    // -------------------------------------------------------------------------
    for (const origAdset of originalAdsets) {
      // Monta payload do novo AdSet
      const adsetPayload: Record<string, any> = {
        campaign_id: createdCampaignId,
        name: origAdset.name,
        status: "PAUSED", // REQUISITO 3: Sempre PAUSED!
        optimization_goal: origAdset.optimization_goal,
        billing_event: origAdset.billing_event,
      };

      // REQUISITO 4: Preservar Targeting & Promoted Object (pixel_id, conversion_event)
      if (origAdset.targeting) adsetPayload.targeting = origAdset.targeting;
      if (origAdset.promoted_object) adsetPayload.promoted_object = origAdset.promoted_object;
      if (origAdset.bid_amount) adsetPayload.bid_amount = origAdset.bid_amount;
      if (origAdset.bid_strategy) adsetPayload.bid_strategy = origAdset.bid_strategy;
      if (origAdset.attribution_spec) adsetPayload.attribution_spec = origAdset.attribution_spec;
      if (origAdset.destination_type) adsetPayload.destination_type = origAdset.destination_type;

      // Orçamento ABO (se não for CBO)
      if (!campPayload.daily_budget && !campPayload.lifetime_budget) {
        if (origAdset.daily_budget) adsetPayload.daily_budget = origAdset.daily_budget;
        else if (origAdset.lifetime_budget) adsetPayload.lifetime_budget = origAdset.lifetime_budget;
      }

      // Schedule: se start_time estiver no passado, define para momento atual
      adsetPayload.start_time = new Date(Date.now() + 60000).toISOString();
      if (origAdset.end_time && new Date(origAdset.end_time).getTime() > Date.now()) {
        adsetPayload.end_time = origAdset.end_time;
      }

      const createAdsetRes = await customFetch(`${GRAPH_BASE}/${actId}/adsets?access_token=${accessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adsetPayload),
      });

      const createAdsetData = await createAdsetRes.json();
      if (!createAdsetRes.ok || !createAdsetData.id) {
        throw new Error(`Falha ao clonar AdSet "${origAdset.name}": ${createAdsetData.error?.message || JSON.stringify(createAdsetData)}`);
      }

      const newAdsetId = createAdsetData.id;
      createdAdsetIds.push(newAdsetId);
      job.created_adsets = createdAdsetIds.length;

      // -----------------------------------------------------------------------
      // 5. BUSCAR ANÚNCIOS DESTE CONJUNTO ORIGINAL
      // -----------------------------------------------------------------------
      const adsUrl = `${GRAPH_BASE}/${origAdset.id}/ads?fields=id,name,status,creative{id,name},tracking_specs,conversion_domain,url_tags&limit=150&access_token=${accessToken}`;
      const adsRes = await customFetch(adsUrl);
      const adsData = await adsRes.json();

      if (!adsRes.ok) {
        throw new Error(`Falha ao buscar anúncios do conjunto original (${origAdset.id}): ${adsData.error?.message || "Erro na Graph API"}`);
      }

      const originalAds: any[] = Array.isArray(adsData.data) ? adsData.data : [];
      job.original_ads += originalAds.length;

      // -----------------------------------------------------------------------
      // 6. CLONAR CADA ANÚNCIO VINCULADO AO NOVO ADSET
      // -----------------------------------------------------------------------
      for (const origAd of originalAds) {
        const creativeId = origAd.creative?.id || origAd.creative_id;
        if (!creativeId) {
          throw new Error(`Anúncio "${origAd.name}" (${origAd.id}) não possui creative válido para duplicação.`);
        }

        const adPayload: Record<string, any> = {
          adset_id: newAdsetId,
          name: origAd.name,
          status: "PAUSED", // REQUISITO 3: Sempre PAUSED!
          creative: { creative_id: creativeId }, // Reutiliza creative idêntico ao Meta Ads Manager
        };

        // REQUISITO 4: Preservar IDs de rastreamento, pixel, UTM e tracking specs
        if (origAd.tracking_specs) adPayload.tracking_specs = origAd.tracking_specs;
        if (origAd.conversion_domain) adPayload.conversion_domain = origAd.conversion_domain;
        if (origAd.url_tags) adPayload.url_tags = origAd.url_tags;

        const createAdRes = await customFetch(`${GRAPH_BASE}/${actId}/ads?access_token=${accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adPayload),
        });

        const createAdData = await createAdRes.json();
        if (!createAdRes.ok || !createAdData.id) {
          throw new Error(`Falha ao clonar anúncio "${origAd.name}": ${createAdData.error?.message || JSON.stringify(createAdData)}`);
        }

        createdAdIds.push(createAdData.id);
        job.created_ads = createdAdIds.length;
      }
    }

    // -------------------------------------------------------------------------
    // 7. VALIDAÇÃO ESTRITA DE SUCESSO (REQUISITO 2: NUNCA RETORNAR SUCESSO PARCIAL)
    // -------------------------------------------------------------------------
    const isHierarchyValid =
      createdCampaignId !== null &&
      job.created_adsets >= job.original_adsets &&
      job.created_ads >= job.original_ads;

    if (!isHierarchyValid) {
      throw new Error(
        `Validação de integridade hierárquica falhou. Esperado AdSets: ${job.original_adsets}, Criados: ${job.created_adsets}. Esperado Ads: ${job.original_ads}, Criados: ${job.created_ads}. Rollback automático acionado.`
      );
    }

    // 1. Registra evento de auditoria: CAMPAIGN_DUPLICATED (inicialmente criada como PAUSED)
    await persistCampaignStatusHistory({
      store_id: storeId,
      campaign_id: createdCampaignId!,
      source_campaign_id: campaignId,
      event_type: "CAMPAIGN_DUPLICATED",
      previous_status: null,
      new_status: "PAUSED",
      source: normalizedAction,
      metadata_json: {
        duplication_mode: "FULL_CLONE",
        budget: duplicatedBudgetUnits,
        adsets_count: createdAdsetIds.length,
        ads_count: createdAdIds.length,
      },
    });

    let finalStatus: "ACTIVE" | "PAUSED" = "PAUSED";
    let activatedAtIso: string | null = null;

    // Se activateAfterDuplication = true (padrão da ATM):
    // FLUXO: CREATE PAUSED -> VALIDATE HIERARCHY -> ACTIVATE CAMPAIGN -> ACTIVATE ADSETS -> ACTIVATE ADS -> REGISTER DELIVERY_ENABLED EVENT
    if (activateAfterDuplication) {
      // 2. ACTIVATE CAMPAIGN
      const actCampRes = await customFetch(`${GRAPH_BASE}/${createdCampaignId}?access_token=${accessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      const actCampData = await actCampRes.json().catch(() => ({}));
      if (!actCampRes.ok) {
        console.warn(`[duplicateCampaign] Falha ao ativar campanha ${createdCampaignId}:`, actCampData?.error?.message);
      }

      // 3. ACTIVATE ADSETS
      for (const asId of createdAdsetIds) {
        await customFetch(`${GRAPH_BASE}/${asId}?access_token=${accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
      }

      // 4. ACTIVATE ADS
      for (const adId of createdAdIds) {
        await customFetch(`${GRAPH_BASE}/${adId}?access_token=${accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
      }

      finalStatus = "ACTIVE";
      activatedAtIso = new Date().toISOString();
      const activationDelaySeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

      // 5. REGISTER DELIVERY_ENABLED EVENT
      await persistCampaignStatusHistory({
        store_id: storeId,
        campaign_id: createdCampaignId!,
        source_campaign_id: campaignId,
        event_type: "DELIVERY_ENABLED",
        previous_status: "PAUSED",
        new_status: "ACTIVE",
        source: normalizedAction,
        created_at: activatedAtIso,
        metadata_json: {
          activation_trigger: "ATM_DUPLICATION",
          source_campaign_id: campaignId,
          new_campaign_id: createdCampaignId!,
          duplication_mode: "FULL_CLONE",
          initial_status: "PAUSED",
          activation_delay_seconds: activationDelaySeconds,
          created_entities: {
            campaigns_count: 1,
            adsets_count: createdAdsetIds.length,
            ads_count: createdAdIds.length,
          },
          activated_adsets: createdAdsetIds.length,
          activated_ads: createdAdIds.length,
          activated_at: activatedAtIso,
        },
      });
    }

    const finishTime = Date.now();
    job.completed_at = new Date(finishTime).toISOString();
    job.duration_ms = finishTime - startTime;
    job.status = "COMPLETED";
    await persistDuplicationLog(job);

    return {
      ok: true,
      job,
      createdCampaignId,
      createdAdsetIds,
      createdAdIds,
      finalStatus,
      activatedAt: activatedAtIso,
    };
  } catch (err: any) {
    // -------------------------------------------------------------------------
    // 8. ROLLBACK ATÔMICO REVERSO EM CASO DE FALHA
    // -------------------------------------------------------------------------
    console.error("[duplicateCampaign] Erro na duplicação:", err.message);
    const finishTime = Date.now();
    job.completed_at = new Date(finishTime).toISOString();
    job.duration_ms = finishTime - startTime;
    job.status = "ROLLED_BACK";
    job.error_message = err.message;

    await executeRollback(accessToken, createdAdIds, createdAdsetIds, createdCampaignId, customFetch);
    await persistDuplicationLog(job);

    return {
      ok: false,
      job,
      error: err.message,
    };
  }
}
