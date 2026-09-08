-- =============================================================================
-- Migration 020: Criação das Tabelas de Configurações de Segurança e Ações de Campanhas
-- Projeto: ATM - Advanced Tracking Manager ADS
-- Fase 7: Campaign Action Engine (Ações Assistidas, Guardrails, Idempotência & Rollback Real)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela de Configurações de Segurança e Automação por Loja
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_automation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL UNIQUE,

    -- Chaves Mestras de Automação
    automation_enabled BOOLEAN NOT NULL DEFAULT true,
    autopilot_enabled BOOLEAN NOT NULL DEFAULT false,   -- Travado em false na Fase 7
    kill_switch BOOLEAN NOT NULL DEFAULT false,         -- Botão mestre de emergência

    -- Limites de Segurança Financeira (Guardrails)
    max_daily_budget_change NUMERIC(12, 2) NOT NULL DEFAULT 500.00, -- Teto R$ de variação diária
    max_budget_increase_percent INT NOT NULL DEFAULT 20,           -- Máximo +20% por ciclo
    max_budget_decrease_percent INT NOT NULL DEFAULT 30,           -- Máximo -30% por ciclo
    cooldown_hours INT NOT NULL DEFAULT 24,                        -- Janela de repouso algorítmico

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices e RLS para campaign_automation_settings
CREATE INDEX IF NOT EXISTS idx_automation_settings_store 
    ON public.campaign_automation_settings(store_id);

ALTER TABLE public.campaign_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants view their store automation settings"
    ON public.campaign_automation_settings
    FOR SELECT
    USING (
        store_id IN (
            SELECT id FROM public.stores WHERE tenant_id = auth.uid()
        )
    );

CREATE POLICY "Tenants update their store automation settings"
    ON public.campaign_automation_settings
    FOR UPDATE
    USING (
        store_id IN (
            SELECT id FROM public.stores WHERE tenant_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access to automation settings"
    ON public.campaign_automation_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_automation_settings IS 'Parâmetros de guardrail, tetos orçamentários e travas de segurança operacional por loja';

-- -----------------------------------------------------------------------------
-- 2. Tabela de Ações e Auditoria de Campanhas (Rollback Fidedigno)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    alert_id UUID REFERENCES public.campaign_intelligence_alerts(id) ON DELETE SET NULL,

    -- Entidade Meta Ads Afetada
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    adset_id TEXT,
    ad_id TEXT,

    -- Tipo da Ação
    action_type TEXT NOT NULL CHECK (
        action_type IN (
            'SCALE_BUDGET_PERCENT',    -- Aumentar orçamento diário
            'REDUCE_BUDGET_PERCENT',   -- Reduzir orçamento diário
            'SET_EXACT_BUDGET',        -- Ajuste para valor fixo auditado
            'PAUSE_CAMPAIGN',          -- Pausa preventiva de sangramento
            'ACTIVATE_CAMPAIGN',       -- Reativação planejada
            'PROTECT_CAMPAIGN',        -- Trava visual contra pausa acidental
            'REFRESH_CREATIVE_ALERT'   -- Notificação de troca de criativo
        )
    ),

    -- Modo de Execução: Somente 'assisted' ativo na Fase 7
    execution_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (
        execution_mode IN ('assisted', 'autopilot')
    ),
    autopilot_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Ciclo de Vida da Ação
    status TEXT NOT NULL DEFAULT 'recommended' CHECK (
        status IN (
            'recommended',   -- Sugerida pela IA, aguardando aprovação
            'approved',      -- Aprovada pelo usuário
            'rejected',      -- Descartada pelo usuário
            'executing',     -- Enviando comando para Meta Graph API
            'executed',      -- Confirmada com sucesso pela Meta
            'failed',        -- Erro retornado pela Meta
            'rolled_back'    -- Revertida para o estado original
        )
    ),

    -- Valores Numéricos de Referência
    previous_value NUMERIC(12, 2),
    target_value NUMERIC(12, 2),
    applied_value NUMERIC(12, 2),

    -- Snapshots Completos para Rollback Fidedigno na Meta Ads
    previous_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Idempotência de Execução
    idempotency_key TEXT,

    -- Justificativa e Auditoria
    reason TEXT NOT NULL,
    error_message TEXT,
    meta_response JSONB,

    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único parcial anti-duplicação: bloqueia apenas ações ativas pendentes
-- Permitindo histórico completo de ações executadas, revertidas ou descartadas
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_campaign_action
    ON public.campaign_actions(store_id, campaign_id, action_type)
    WHERE status IN ('recommended', 'approved', 'executing');

-- Índice único de idempotência para evitar dupla execução na Meta
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_idempotency_key
    ON public.campaign_actions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Índices Otimizados para Consulta Rápida
CREATE INDEX IF NOT EXISTS idx_actions_store_status 
    ON public.campaign_actions(store_id, status);

CREATE INDEX IF NOT EXISTS idx_actions_campaign 
    ON public.campaign_actions(store_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_actions_created_at 
    ON public.campaign_actions(created_at DESC);

-- RLS para campaign_actions
ALTER TABLE public.campaign_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants view their store actions"
    ON public.campaign_actions
    FOR SELECT
    USING (
        store_id IN (
            SELECT id FROM public.stores WHERE tenant_id = auth.uid()
        )
    );

CREATE POLICY "Tenants update their store actions"
    ON public.campaign_actions
    FOR UPDATE
    USING (
        store_id IN (
            SELECT id FROM public.stores WHERE tenant_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access to actions"
    ON public.campaign_actions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_actions IS 'Fila de aprovação de decisões de campanha, histórico de execuções assistidas e snapshots de rollback';
