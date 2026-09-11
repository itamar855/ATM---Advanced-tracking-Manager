/**
 * web/src/lib/meta/performance-monitor.ts
 *
 * ATM Meta Performance Observability & Cooldown Engine (Fase 9.5)
 *
 * Princípios de Arquitetura:
 * 1. Zero Latência (Non-Blocking / Fire-and-Forget): Nenhuma requisição do usuário aguarda gravação no Supabase.
 * 2. Amostragem Anti-Inundação (Anti-Spam Sampling):
 *    - Cache HITs ultrarrápidos (<50ms) usam amostragem de 1% para evitar milhões de registros dispensáveis.
 *    - Erros, Cooldowns, Graph API lentas (>1000ms) e Cache MISS são gravados 100%.
 * 3. Proteção Ativa com Cooldown Inteligente:
 *    - Monitora janela de chamadas live por loja.
 *    - Se ultrapassar teto seguro, ativa cooldown temporário com `cooldown_until` e `reason`.
 *    - NUNCA bloqueia a leitura de cache existente (entrega o cache disponível).
 *    - Suporta bypass manual imediato caso `refresh=true`.
 * 4. Contexto de Negócio & Criticidade:
 *    - Contextos: dashboard | integration | asset_sync | campaign_sync.
 *    - Criticidade: low | medium | high.
 */

import { createAdminClient } from "@/lib/supabase/server";

export type PerformanceContext = "dashboard" | "integration" | "asset_sync" | "campaign_sync";
export type PerformanceCriticality = "low" | "medium" | "high";
export type PerformanceCacheStatus = "HIT" | "MISS" | "BYPASS" | "COOLDOWN";

export interface PerformanceLogInput {
  tenant_id: string;
  user_id?: string;
  endpoint: string;
  operation: string;
  context: PerformanceContext;
  criticality?: PerformanceCriticality;
  duration_ms: number;
  cache_status: PerformanceCacheStatus;
  graph_calls_count: number;
  status_code?: number;
  error_message?: string;
}

export interface CooldownCheckResult {
  inCooldown: boolean;
  cooldownUntil: number | null;
  cooldownUntilIso: string | null;
  reason: string | null;
  remainingMs: number;
  callsInWindow: number;
}

interface TenantRateState {
  callsInWindow: number;
  windowStart: number;
  cooldownUntil: number | null;
  reason: string | null;
}

// Limites operacionais de Cooldown
const RATE_WINDOW_MS = 30 * 1000; // Janela de 30 segundos
const MAX_LIVE_CALLS_PER_WINDOW = 25; // Máximo de 25 chamadas live à Meta por loja em 30s
const COOLDOWN_DURATION_MS = 45 * 1000; // 45 segundos de cooldown recuperável

class MetaPerformanceMonitor {
  private rateLimits = new Map<string, TenantRateState>();

  /**
   * Avalia a criticidade com base na duração, erros ou status de cooldown
   */
  public resolveCriticality(
    context: PerformanceContext,
    durationMs: number,
    hasError: boolean,
    inCooldown: boolean
  ): PerformanceCriticality {
    if (hasError || inCooldown) return "high";
    if (durationMs > 2000) return "high";
    if (durationMs > 800) return "medium";
    return "low";
  }

  /**
   * Checa se o log deve ser persistido no Supabase ou descartado por amostragem
   */
  public shouldSample(input: PerformanceLogInput): boolean {
    const hasError = !!input.error_message || (input.status_code !== undefined && input.status_code >= 400);
    const isCooldown = input.cache_status === "COOLDOWN";
    const isSlow = input.duration_ms >= 1000;
    const isMiss = input.cache_status === "MISS";

    // 100% de persistência para eventos críticos, lentos, erros e cache miss
    if (hasError || isCooldown || isSlow || isMiss) {
      return true;
    }

    // Para Cache HITs ultra-rápidos (<50ms), aplica amostragem de 1%
    if (input.cache_status === "HIT" && input.duration_ms < 50) {
      return Math.random() < 0.01;
    }

    return true;
  }

  /**
   * Checagem de Cooldown por loja
   * - Permite bypass manual se isManualRefresh = true
   * - Nunca bloqueia leitura de cache existente
   */
  public checkCooldown(tenantId: string, isManualRefresh = false): CooldownCheckResult {
    const now = Date.now();
    const state = this.rateLimits.get(tenantId);

    if (!state) {
      return {
        inCooldown: false,
        cooldownUntil: null,
        cooldownUntilIso: null,
        reason: null,
        remainingMs: 0,
        callsInWindow: 0,
      };
    }

    // Se houver refresh manual do usuário, faz bypass do cooldown imediatamente
    if (isManualRefresh) {
      return {
        inCooldown: false,
        cooldownUntil: state.cooldownUntil,
        cooldownUntilIso: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
        reason: "MANUAL_REFRESH_OVERRIDE",
        remainingMs: 0,
        callsInWindow: state.callsInWindow,
      };
    }

    // Se o cooldown expirou, limpa o estado ativo
    if (state.cooldownUntil && now >= state.cooldownUntil) {
      state.cooldownUntil = null;
      state.reason = null;
      state.callsInWindow = 0;
      state.windowStart = now;
    }

    const inCooldown = !!state.cooldownUntil && now < state.cooldownUntil;
    const remainingMs = inCooldown ? Math.max(0, (state.cooldownUntil || 0) - now) : 0;

    return {
      inCooldown,
      cooldownUntil: state.cooldownUntil,
      cooldownUntilIso: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
      reason: state.reason,
      remainingMs,
      callsInWindow: state.callsInWindow,
    };
  }

  /**
   * Rastreia chamadas live feitas à Meta Graph API e aciona Cooldown se exceder o teto seguro
   */
  public registerGraphCalls(tenantId: string, count = 1): CooldownCheckResult {
    const now = Date.now();
    let state = this.rateLimits.get(tenantId);

    if (!state) {
      state = {
        callsInWindow: 0,
        windowStart: now,
        cooldownUntil: null,
        reason: null,
      };
      this.rateLimits.set(tenantId, state);
    }

    // Renova a janela de contagem caso o tempo tenha decorrido
    if (now - state.windowStart > RATE_WINDOW_MS) {
      state.callsInWindow = 0;
      state.windowStart = now;
    }

    state.callsInWindow += count;

    // Se exceder a taxa limite de chamadas live, aciona o Cooldown
    if (state.callsInWindow > MAX_LIVE_CALLS_PER_WINDOW && !state.cooldownUntil) {
      state.cooldownUntil = now + COOLDOWN_DURATION_MS;
      state.reason = `Limite seguro atingido: ${state.callsInWindow} chamadas à Graph API em 30s. Cooldown preventivo ativado para proteger a cota da Meta.`;
      console.warn(`[PERFORMANCE] 🚨 COOLDOWN ATIVADO para ${tenantId}: ${state.reason}`);
    }

    return this.checkCooldown(tenantId, false);
  }

  /**
   * Registra log de performance de forma estritamente NON-BLOCKING (Fire-and-Forget)
   */
  public log(input: PerformanceLogInput): void {
    const criticality = input.criticality || this.resolveCriticality(
      input.context,
      input.duration_ms,
      !!input.error_message || (input.status_code !== undefined && input.status_code >= 400),
      input.cache_status === "COOLDOWN"
    );

    // 1. Output estruturado no console do servidor para observabilidade em tempo real
    console.log(
      `[PERFORMANCE]\n` +
      `endpoint: ${input.endpoint}\n` +
      `duration: ${input.duration_ms}ms\n` +
      `cache: ${input.cache_status}\n` +
      `tenant: ${input.tenant_id}\n` +
      `graph_calls: ${input.graph_calls_count}\n` +
      `context: ${input.context}\n` +
      `criticality: ${criticality}`
    );

    // 2. Filtro de amostragem inteligente (evita saturar o banco com milhões de linhas)
    if (!this.shouldSample(input)) {
      return;
    }

    // 3. Gravação Assíncrona Totalmente Desacoplada (Fire-and-Forget)
    // O retorno da função não aguarda o Supabase — zero latência para o usuário final
    const payload = {
      tenant_id: input.tenant_id,
      user_id: input.user_id || null,
      endpoint: input.endpoint,
      operation: input.operation,
      context: input.context,
      criticality,
      duration_ms: input.duration_ms,
      cache_status: input.cache_status,
      graph_calls_count: input.graph_calls_count,
      status_code: input.status_code || 200,
      error_message: input.error_message || null,
      created_at: new Date().toISOString(),
    };

    Promise.resolve().then(async () => {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase.from("meta_performance_logs").insert(payload);
        if (error) {
          // Falha silenciosa para nunca quebrar a aplicação principal
          console.warn("[PERFORMANCE] Aviso na persistência assíncrona:", error.message);
        }
      } catch (err: any) {
        console.warn("[PERFORMANCE] Erro ao gravar telemetria:", err?.message);
      }
    }).catch(() => {});
  }

  /**
   * Reseta o estado de rate limit de um tenant (para testes e manutenção)
   */
  public resetTenant(tenantId: string): void {
    this.rateLimits.delete(tenantId);
  }

  /**
   * Limpa todo o estado do monitor (para suítes de teste)
   */
  public clear(): void {
    this.rateLimits.clear();
  }
}

// Singleton global para persistência em memória do processo Node.js
const globalForPerf = globalThis as unknown as { metaPerfMonitor?: MetaPerformanceMonitor };
export const performanceMonitor = globalForPerf.metaPerfMonitor || new MetaPerformanceMonitor();
if (process.env.NODE_ENV !== "production") {
  globalForPerf.metaPerfMonitor = performanceMonitor;
}
