-- =============================================================================
-- Migration 017: Criação da Tabela de Recuperação de Atribuição (attribution_recovery_log)
-- Projeto: ATM - Advanced Tracking Manager ADS
-- Fase 3: Engine de Recuperação de Atribuição de Vendas Não Trackeadas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attribution_recovery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    identity_cluster_id UUID,
    campaign_id TEXT,
    adset_id TEXT,
    ad_id TEXT,
    source TEXT,
    confidence_score INT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Garante unicidade: apenas 1 registro de auditoria de recuperação por pedido na mesma loja
    CONSTRAINT uq_recovery_store_order UNIQUE (store_id, order_id)
);

-- =============================================================================
-- Índices de Alta Performance (Supabase Postgres Best Practices)
-- =============================================================================

-- Busca rápida de log por loja e pedido
CREATE INDEX IF NOT EXISTS idx_recovery_lookup 
ON public.attribution_recovery_log (store_id, order_id);

-- Ordenação e filtros por score de confiança
CREATE INDEX IF NOT EXISTS idx_recovery_score 
ON public.attribution_recovery_log (store_id, confidence_score DESC);

-- Busca e agrupamento por cluster de visitante
CREATE INDEX IF NOT EXISTS idx_recovery_cluster 
ON public.attribution_recovery_log (store_id, identity_cluster_id)
WHERE identity_cluster_id IS NOT NULL;

-- Agrupamento por campanha recuperada
CREATE INDEX IF NOT EXISTS idx_recovery_campaign 
ON public.attribution_recovery_log (store_id, campaign_id)
WHERE campaign_id IS NOT NULL;

-- =============================================================================
-- Blindagem de Segurança (Row Level Security - RLS)
-- =============================================================================

ALTER TABLE public.attribution_recovery_log ENABLE ROW LEVEL SECURITY;

-- Revoga acesso público de anon e authenticated
REVOKE ALL ON public.attribution_recovery_log FROM anon, authenticated;

-- Concede privilégios totais exclusivamente ao backend autenticado (service_role)
GRANT ALL ON public.attribution_recovery_log TO service_role;
