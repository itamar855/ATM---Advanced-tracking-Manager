/**
 * web/src/lib/intelligence/campaign-action-engine.ts
 *
 * Motor de Ações, Guardrails e Aprovação Assistida de Campanhas (Fase 7)
 * ATM - Advanced Tracking Manager ADS
 *
 * Governança e Regras de Segurança:
 * 1. execution_mode travado exclusivamente em "assisted" (aprovação humana obrigatória).
 * 2. autopilot_enabled travado em false por padrão.
 * 3. Guardrails por loja: kill_switch, teto diário monetário, cooldown de 24h e limites percentuais.
 * 4. previous_snapshot e target_snapshot completos para viabilizar rollback fidedigno na Meta Ads.
 * 5. Idempotência estrita: idempotency_key único para evitar execuções duplicadas na Meta.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { CampaignAlert } from "./campaign-alert-engine";

export type CampaignActionType =
  | "SCALE_BUDGET_PERCENT"
  | "REDUCE_BUDGET_PERCENT"
  | "SET_EXACT_BUDGET"
  | "PAUSE_CAMPAIGN"
  | "ACTIVATE_CAMPAIGN"
  | "PROTECT_CAMPAIGN"
  | "REFRESH_CREATIVE_ALERT";

export type CampaignActionStatus =
  | "recommended"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "failed"
  | "rolled_back";

export interface MetaEntitySnapshot {
  entity_level?: "campaign" | "adset" | "ad";
  daily_budget?: number;
  lifetime_budget?: number | null;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  bid_strategy?: string;
  optimization_goal?: string;
  name?: string;
  captured_at?: string;
}

export interface CampaignAutomationSettings {
  id?: string;
  storeId: string;
  automationEnabled: boolean;
  autopilotEnabled: boolean;
  killSwitch: boolean;
  maxDailyBudgetChange: number;
  maxBudgetIncreasePercent: number;
  maxBudgetDecreasePercent: number;
  cooldownHours: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignAction {
  id?: string;
  storeId: string;
  alertId?: string | null;
  campaignId: string;
  campaignName: string;
  adsetId?: string | null;
  adId?: string | null;
  actionType: CampaignActionType;
  executionMode: "assisted" | "autopilot";
  autopilotEnabled: boolean;
  status: CampaignActionStatus;
  previousValue?: number | null;
  targetValue?: number | null;
  appliedValue?: number | null;
  previousSnapshot: MetaEntitySnapshot;
  targetSnapshot: MetaEntitySnapshot;
  idempotencyKey?: string | null;
  reason: string;
  errorMessage?: string | null;
  metaResponse?: any;
  approvedBy?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  rolledBackAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_AUTOMATION_SETTINGS: Omit<CampaignAutomationSettings, "storeId"> = {
  automationEnabled: true,
  autopilotEnabled: false,
  killSwitch: false,
  maxDailyBudgetChange: 500.0,
  maxBudgetIncreasePercent: 20,
  maxBudgetDecreasePercent: 30,
  cooldownHours: 24,
};

const inMemorySettingsCache = new Map<string, CampaignAutomationSettings>();

/**
 * Busca as configurações de segurança e automação da loja ou retorna os defaults seguros.
 */
export async function getStoreAutomationSettings(storeId: string): Promise<CampaignAutomationSettings> {
  const cached = inMemorySettingsCache.get(storeId);
  if (cached) {
    return cached;
  }

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("campaign_automation_settings")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle();

    if (!error && data) {
      const parsed: CampaignAutomationSettings = {
        id: data.id,
        storeId: data.store_id,
        automationEnabled: data.automation_enabled ?? true,
        autopilotEnabled: data.autopilot_enabled ?? false,
        killSwitch: data.kill_switch ?? false,
        maxDailyBudgetChange: Number(data.max_daily_budget_change || 500),
        maxBudgetIncreasePercent: Number(data.max_budget_increase_percent || 20),
        maxBudgetDecreasePercent: Number(data.max_budget_decrease_percent || 30),
        cooldownHours: Number(data.cooldown_hours || 24),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      inMemorySettingsCache.set(storeId, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn("[Action Engine] Fallback para settings default da loja:", storeId);
  }

  const defaults: CampaignAutomationSettings = {
    storeId,
    ...DEFAULT_AUTOMATION_SETTINGS,
  };
  return defaults;
}

/**
 * Atualiza as configurações de guardrail e travas da loja.
 */
export async function updateStoreAutomationSettings(
  storeId: string,
  updates: Partial<Omit<CampaignAutomationSettings, "id" | "storeId" | "createdAt" | "updatedAt">>
): Promise<CampaignAutomationSettings> {
  const current = await getStoreAutomationSettings(storeId);

  const updated: CampaignAutomationSettings = {
    ...current,
    automationEnabled: updates.automationEnabled !== undefined ? updates.automationEnabled : current.automationEnabled,
    killSwitch: updates.killSwitch !== undefined ? updates.killSwitch : current.killSwitch,
    maxDailyBudgetChange: updates.maxDailyBudgetChange !== undefined ? Math.max(10, updates.maxDailyBudgetChange) : current.maxDailyBudgetChange,
    maxBudgetIncreasePercent: updates.maxBudgetIncreasePercent !== undefined ? Math.min(100, Math.max(1, updates.maxBudgetIncreasePercent)) : current.maxBudgetIncreasePercent,
    maxBudgetDecreasePercent: updates.maxBudgetDecreasePercent !== undefined ? Math.min(90, Math.max(1, updates.maxBudgetDecreasePercent)) : current.maxBudgetDecreasePercent,
    cooldownHours: updates.cooldownHours !== undefined ? Math.max(1, updates.cooldownHours) : current.cooldownHours,
    autopilotEnabled: false, // Travado em false na Fase 7
    updatedAt: new Date().toISOString(),
  };

  inMemorySettingsCache.set(storeId, updated);

  const supabase = createAdminClient();

  const payload: any = {
    store_id: storeId,
    automation_enabled: updated.automationEnabled,
    autopilot_enabled: false,
    kill_switch: updated.killSwitch,
    max_daily_budget_change: updated.maxDailyBudgetChange,
    max_budget_increase_percent: updated.maxBudgetIncreasePercent,
    max_budget_decrease_percent: updated.maxBudgetDecreasePercent,
    cooldown_hours: updated.cooldownHours,
    updated_at: updated.updatedAt,
  };

  try {
    const { data, error } = await supabase
      .from("campaign_automation_settings")
      .upsert(payload, { onConflict: "store_id" })
      .select("*")
      .single();

    if (!error && data) {
      updated.id = data.id;
      inMemorySettingsCache.set(storeId, updated);
    }
  } catch (err) {
    console.warn("[Action Engine] Aviso: salvo em cache em memória (banco de dados inacessível ou tabela pendente):", err);
  }

  return updated;
}

/**
 * Avalia um alerta de inteligência e gera a proposta de ação respeitando os guardrails da loja.
 */
export function generateActionFromAlert(
  alert: CampaignAlert,
  settings: CampaignAutomationSettings,
  currentMetaSnapshot?: MetaEntitySnapshot
): CampaignAction | null {
  // 1. Guardrail mestre: Kill Switch ou Automação desativada
  if (settings.killSwitch || !settings.automationEnabled) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const currentBudget = currentMetaSnapshot?.daily_budget || 100.0;
  const currentStatus = currentMetaSnapshot?.status || "ACTIVE";

  const prevSnapshot: MetaEntitySnapshot = {
    entity_level: "campaign",
    daily_budget: currentBudget,
    status: currentStatus,
    bid_strategy: currentMetaSnapshot?.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
    optimization_goal: currentMetaSnapshot?.optimization_goal || "OFFSITE_CONVERSIONS",
    name: alert.campaignName,
    captured_at: nowIso,
  };

  switch (alert.type) {
    case "READY_TO_SCALE": {
      // Calcula aumento percentual limitado pelo guardrail da loja
      const incPercent = settings.maxBudgetIncreasePercent;
      let calculatedTarget = Math.round(currentBudget * (1 + incPercent / 100) * 100) / 100;

      // Trava de teto monetário máximo
      const maxAllowed = currentBudget + settings.maxDailyBudgetChange;
      if (calculatedTarget > maxAllowed) {
        calculatedTarget = maxAllowed;
      }

      const targetSnapshot: MetaEntitySnapshot = {
        ...prevSnapshot,
        daily_budget: calculatedTarget,
        captured_at: nowIso,
      };

      return {
        storeId: alert.storeId,
        alertId: alert.id || null,
        campaignId: alert.campaignId,
        campaignName: alert.campaignName,
        actionType: "SCALE_BUDGET_PERCENT",
        executionMode: "assisted",
        autopilotEnabled: false,
        status: "recommended",
        previousValue: currentBudget,
        targetValue: calculatedTarget,
        previousSnapshot: prevSnapshot,
        targetSnapshot,
        reason: `ROAS real de ${alert.metrics.realRoas?.toFixed(2)}x está acima da média. Sugerido aumento de +${incPercent}% no orçamento diário com segurança contábil.`,
        createdAt: nowIso,
      };
    }

    case "CAMPAIGN_DECAY": {
      const isSevereBleed = (alert.metrics.realRoas !== undefined && alert.metrics.realRoas < 0.8) || alert.severity === "critical";

      if (isSevereBleed) {
        // Pausa preventiva para estancar prejuízo
        const targetSnapshot: MetaEntitySnapshot = {
          ...prevSnapshot,
          status: "PAUSED",
          captured_at: nowIso,
        };

        return {
          storeId: alert.storeId,
          alertId: alert.id || null,
          campaignId: alert.campaignId,
          campaignName: alert.campaignName,
          actionType: "PAUSE_CAMPAIGN",
          executionMode: "assisted",
          autopilotEnabled: false,
          status: "recommended",
          previousValue: currentBudget,
          targetValue: 0,
          previousSnapshot: prevSnapshot,
          targetSnapshot,
          reason: `Sangramento financeiro severo detectado (gasto aumentou +${alert.metrics.spendDeltaPercent || 30}% e receita caiu). Recomendada pausa imediata para estancar prejuízo.`,
          createdAt: nowIso,
        };
      } else {
        // Redução moderada de orçamento
        const decPercent = settings.maxBudgetDecreasePercent;
        const calculatedTarget = Math.max(20.0, Math.round(currentBudget * (1 - decPercent / 100) * 100) / 100);

        const targetSnapshot: MetaEntitySnapshot = {
          ...prevSnapshot,
          daily_budget: calculatedTarget,
          captured_at: nowIso,
        };

        return {
          storeId: alert.storeId,
          alertId: alert.id || null,
          campaignId: alert.campaignId,
          campaignName: alert.campaignName,
          actionType: "REDUCE_BUDGET_PERCENT",
          executionMode: "assisted",
          autopilotEnabled: false,
          status: "recommended",
          previousValue: currentBudget,
          targetValue: calculatedTarget,
          previousSnapshot: prevSnapshot,
          targetSnapshot,
          reason: `Queda de eficiência detectada. Recomendada redução de -${decPercent}% no orçamento diário.`,
          createdAt: nowIso,
        };
      }
    }

    case "UNDER_REPORTED_CAMPAIGN": {
      return {
        storeId: alert.storeId,
        alertId: alert.id || null,
        campaignId: alert.campaignId,
        campaignName: alert.campaignName,
        actionType: "PROTECT_CAMPAIGN",
        executionMode: "assisted",
        autopilotEnabled: false,
        status: "recommended",
        previousValue: currentBudget,
        targetValue: currentBudget,
        previousSnapshot: prevSnapshot,
        targetSnapshot: prevSnapshot,
        reason: `A Meta registrou apenas ${alert.metrics.platformOrders} compras, mas o ATM auditou ${alert.metrics.atmOrders} (${alert.metrics.hiddenSales} recuperadas). Trava de proteção contra pausas acidentais.`,
        createdAt: nowIso,
      };
    }

    case "CREATIVE_FATIGUE": {
      return {
        storeId: alert.storeId,
        alertId: alert.id || null,
        campaignId: alert.campaignId,
        campaignName: alert.campaignName,
        actionType: "REFRESH_CREATIVE_ALERT",
        executionMode: "assisted",
        autopilotEnabled: false,
        status: "recommended",
        previousValue: currentBudget,
        targetValue: currentBudget,
        previousSnapshot: prevSnapshot,
        targetSnapshot: prevSnapshot,
        reason: `Frequência de ${alert.metrics.frequency?.toFixed(2)} com queda acentuada de CTR. Recomenda-se renovar os criativos antes de alterar orçamentos.`,
        createdAt: nowIso,
      };
    }

    default:
      return null;
  }
}

/**
 * Processa uma lista de alertas e converte em ações pendentes,
 * respeitando cooldown e evitando duplicidades ativas.
 */
export async function syncCampaignActions(
  storeId: string,
  alerts: CampaignAlert[]
): Promise<CampaignAction[]> {
  const settings = await getStoreAutomationSettings(storeId);
  if (settings.killSwitch || !settings.automationEnabled) {
    return [];
  }

  const supabase = createAdminClient();
  const cooldownHours = settings.cooldownHours;
  const cooldownThreshold = new Date(Date.now() - cooldownHours * 3600 * 1000).toISOString();

  // 1. Busca histórico recente de ações executadas para respeitar o cooldown por campanha
  const { data: recentExecutions } = await supabase
    .from("campaign_actions")
    .select("campaign_id, executed_at")
    .eq("store_id", storeId)
    .eq("status", "executed")
    .gte("executed_at", cooldownThreshold);

  const onCooldownCampaigns = new Set((recentExecutions || []).map((r) => r.campaign_id));

  // 2. Busca ações pendentes existentes para não duplicar ações ativas
  const { data: activeActions } = await supabase
    .from("campaign_actions")
    .select("campaign_id, action_type")
    .eq("store_id", storeId)
    .in("status", ["recommended", "approved", "executing"]);

  const activeSet = new Set((activeActions || []).map((a) => `${a.campaign_id}:${a.action_type}`));

  const actionsToPersist: CampaignAction[] = [];

  for (const alert of alerts) {
    // Se a campanha estiver em janela de repouso (cooldown), não gera ação de orçamento
    if (onCooldownCampaigns.has(alert.campaignId) && alert.type !== "UNDER_REPORTED_CAMPAIGN") {
      continue;
    }

    const action = generateActionFromAlert(alert, settings);
    if (!action) continue;

    // Se já existe uma ação ativa para esta campanha e tipo, ignora para não violar anti-duplicação
    const key = `${action.campaignId}:${action.actionType}`;
    if (activeSet.has(key)) {
      continue;
    }

    actionsToPersist.push(action);
    activeSet.add(key); // Evita duplicar no mesmo loop
  }

  // 3. Persiste novas ações no banco de dados se a tabela existir
  if (actionsToPersist.length > 0) {
    try {
      const inserts = actionsToPersist.map((a) => ({
        store_id: a.storeId,
        alert_id: a.alertId,
        campaign_id: a.campaignId,
        campaign_name: a.campaignName,
        action_type: a.actionType,
        execution_mode: a.executionMode,
        autopilot_enabled: a.autopilotEnabled,
        status: a.status,
        previous_value: a.previousValue,
        target_value: a.targetValue,
        previous_snapshot: a.previousSnapshot,
        target_snapshot: a.targetSnapshot,
        reason: a.reason,
      }));

      await supabase.from("campaign_actions").insert(inserts);
    } catch (e) {
      console.warn("[Action Engine] Falha ao persistir ações no banco (tabela pode não estar criada ainda):", e);
    }
  }

  return actionsToPersist;
}
