-- =============================================================================
-- Migration 028: Campaign Status History & Delivery Audit
-- Projeto: ATM - Advanced Tracking Manager ADS
-- =============================================================================
-- Registra a evolução de status de campanhas (criação pausada, ativação pós-validação,
-- pausas operacionais) para auditoria, rastreabilidade e governança de veiculação.

CREATE TABLE IF NOT EXISTS public.campaign_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    source_campaign_id TEXT,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('CAMPAIGN_DUPLICATED', 'DELIVERY_ENABLED', 'CAMPAIGN_PAUSED')
    ),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL_DUPLICATE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata_json JSONB DEFAULT '{}'::jsonb
);

-- Índices otimizados para consulta rápida por loja, campanha e tipo de evento
CREATE INDEX IF NOT EXISTS idx_campaign_status_history_store_created 
    ON public.campaign_status_history (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign 
    ON public.campaign_status_history (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_status_history_source_campaign 
    ON public.campaign_status_history (source_campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_status_history_event_type 
    ON public.campaign_status_history (event_type);

-- Habilita Row Level Security
ALTER TABLE public.campaign_status_history ENABLE ROW LEVEL SECURITY;

-- Política permissiva total para service role
CREATE POLICY service_role_all_campaign_status_history
    ON public.campaign_status_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_status_history IS 'Histórico de transições de status e ativação de entrega de campanhas Meta Ads com rastreabilidade da campanha de origem';
