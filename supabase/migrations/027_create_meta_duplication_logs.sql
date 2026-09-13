-- =============================================================================
-- Migration 027: Meta Duplication Audit Logs
-- Projeto: ATM - Advanced Tracking Manager ADS
-- =============================================================================
-- Registra jobs de duplicação hierárquica completa (FULL_CLONE) e simples (SIMPLE)
-- da Meta Graph API para auditoria, prevenção de órfãos e governança operacional.

CREATE TABLE IF NOT EXISTS public.meta_duplication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    source_campaign_id TEXT NOT NULL,
    new_campaign_id TEXT,
    duplication_mode TEXT NOT NULL DEFAULT 'FULL_CLONE' CHECK (
        duplication_mode IN ('FULL_CLONE', 'SIMPLE')
    ),
    source_action TEXT NOT NULL DEFAULT 'MANUAL_DUPLICATE' CHECK (
        source_action IN ('MANUAL_DUPLICATE', 'ATM_RECOMMENDATION', 'AUTOMATED_FLOW')
    ),
    original_adsets INTEGER NOT NULL DEFAULT 0,
    created_adsets INTEGER NOT NULL DEFAULT 0,
    original_ads INTEGER NOT NULL DEFAULT 0,
    created_ads INTEGER NOT NULL DEFAULT 0,
    original_budget NUMERIC(15, 2),
    duplicated_budget NUMERIC(15, 2),
    budget_change_percent NUMERIC(8, 2),
    budget_warning TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')
    ),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consulta rápida por loja, data, status e source_action
CREATE INDEX IF NOT EXISTS idx_meta_duplication_store_created 
    ON public.meta_duplication_logs (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_duplication_status 
    ON public.meta_duplication_logs (status);

CREATE INDEX IF NOT EXISTS idx_meta_duplication_source_action
    ON public.meta_duplication_logs (source_action);

-- Habilita Row Level Security
ALTER TABLE public.meta_duplication_logs ENABLE ROW LEVEL SECURITY;

-- Política de permissão total para o service role
DROP POLICY IF EXISTS service_role_all_meta_duplication_logs ON public.meta_duplication_logs;

CREATE POLICY service_role_all_meta_duplication_logs
    ON public.meta_duplication_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.meta_duplication_logs IS 'Auditoria de duplicação hierárquica de campanhas Meta Ads com controle transacional e rollback';
