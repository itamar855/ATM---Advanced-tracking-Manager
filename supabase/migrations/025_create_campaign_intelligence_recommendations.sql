-- =============================================================================
-- Migration 025: Campaign Intelligence Recommendations (Fase 10.1 Copilot Mode)
-- Projeto: ATM - Advanced Tracking Manager ADS
-- =============================================================================
-- Tabela para historizar e gerenciar recomendações de campanha assistidas (Copilot Mode)
-- geradas pelo cruzamento do Campaign Profit Engine com o Meta Asset Intelligence Guard.

CREATE TABLE IF NOT EXISTS public.campaign_intelligence_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    
    -- Ação Recomendada Padronizada para o Campaign Action Engine
    action TEXT NOT NULL CHECK (
        action IN ('SCALE_BUDGET_PERCENT', 'REDUCE_BUDGET_PERCENT', 'PAUSE_CAMPAIGN', 'NO_ACTION')
    ),
    budget_change_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    -- Permissão de Ativo do Asset Guard (SAFE, RESTRICTED, BLOCKED)
    asset_permission TEXT NOT NULL DEFAULT 'SAFE' CHECK (
        asset_permission IN ('SAFE', 'RESTRICTED', 'BLOCKED')
    ),
    
    -- Score de Confiança Tri-Fator (50% profit, 30% asset, 20% data maturity)
    confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    data_maturity_score INTEGER NOT NULL CHECK (data_maturity_score IN (40, 70, 100)),
    
    -- Auditoria e Justificativas Detalhadas com Componentes de Confiança
    reason TEXT NOT NULL,
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Hash de Deduplicação e Cooldown (store_id + campaign_id + action + budget_change_percent + 24h window)
    recommendation_hash TEXT NOT NULL UNIQUE,
    dedupe_key TEXT,
    
    -- Governança Copilot
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
        status IN ('created', 'pending_review', 'approved', 'rejected', 'executed')
    ),
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de alta performance para consulta por loja, status, data e hash de recomendação
CREATE INDEX IF NOT EXISTS idx_camp_rec_store_created 
    ON public.campaign_intelligence_recommendations (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camp_rec_campaign 
    ON public.campaign_intelligence_recommendations (campaign_id);

CREATE INDEX IF NOT EXISTS idx_camp_rec_status 
    ON public.campaign_intelligence_recommendations (status);

CREATE INDEX IF NOT EXISTS idx_camp_rec_hash 
    ON public.campaign_intelligence_recommendations (recommendation_hash);

-- Habilita Row Level Security para segurança multi-tenant
ALTER TABLE public.campaign_intelligence_recommendations ENABLE ROW LEVEL SECURITY;

-- Política RLS: Acesso total para service_role
CREATE POLICY service_role_all_camp_rec
    ON public.campaign_intelligence_recommendations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_intelligence_recommendations IS 'ATM Campaign Intelligence Bridge - Recomendações assistidas (Copilot Mode) cruzando saúde de ativos e rentabilidade contábil';
