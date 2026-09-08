-- =============================================================================
-- Migration 018: Criação da Tabela de Inteligência Financeira (revenue_ledger)
-- Projeto: ATM - Advanced Tracking Manager ADS
-- Fase 4: Attribution Intelligence & Revenue Ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    event_id TEXT,

    -- Vínculo com o grafo vivo de identidade do comprador
    visitor_identity_id UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL,

    -- Dados Financeiros Canônicos
    order_value NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT,

    -- Modelo de Atribuição
    attribution_model TEXT NOT NULL 
        CHECK (attribution_model IN ('last_click', 'first_click', 'linear', 'u_shaped')),

    -- Entidades Atribuídas da Meta/Ads
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    source TEXT NOT NULL,

    -- Ponderação Financeira (Travada estritamente entre 0% e 100%)
    attribution_weight NUMERIC(6, 4) NOT NULL DEFAULT 1.0000
        CHECK (attribution_weight >= 0 AND attribution_weight <= 1),
    attributed_revenue NUMERIC(12, 2) NOT NULL,

    -- Rastreabilidade e Auditoria Forense
    confidence_score INT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    attribution_method TEXT NOT NULL 
        CHECK (attribution_method IN ('native_pixel', 'webhook_utm', 'forensic_fbc', 'forensic_identity', 'forensic_utm', 'assisted')),
    is_recovered BOOLEAN NOT NULL DEFAULT FALSE,
    is_assisted BOOLEAN NOT NULL DEFAULT FALSE,

    -- Metadados da Jornada Multi-Touch
    touchpoint_index INT NOT NULL DEFAULT 1,
    total_touchpoints INT NOT NULL DEFAULT 1,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    order_paid_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Restrição de unicidade determinística por fatia de toque no mesmo modelo
    CONSTRAINT uq_revenue_ledger_slice 
    UNIQUE (store_id, order_id, attribution_model, touchpoint_index)
);

-- =============================================================================
-- Índices de Alta Performance (Supabase Postgres Best Practices)
-- Agregações analíticas e filtros financeiros com zero overhead de RAM/I/O
-- =============================================================================

-- Lookup rápido e direto por pedido para suporte, auditoria e modais
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_order 
ON public.revenue_ledger (store_id, order_id);

-- Agregações financeiras instantâneas para cards do dashboard
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_dashboard 
ON public.revenue_ledger (store_id, attribution_model, order_paid_at DESC);

-- Drilldown rápido por campanha e período
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_campaign 
ON public.revenue_ledger (store_id, campaign_id, order_paid_at DESC)
WHERE campaign_id IS NOT NULL;

-- Agregações de receita recuperada pelo ATM
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_recovered 
ON public.revenue_ledger (store_id, is_recovered, order_paid_at DESC)
WHERE is_recovered = true;

-- Relatório de conversões assistidas
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_assisted 
ON public.revenue_ledger (store_id, is_assisted, order_paid_at DESC)
WHERE is_assisted = true;

-- Cruzamento e lookup rápido por identidade de visitante
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_visitor 
ON public.revenue_ledger (store_id, visitor_identity_id)
WHERE visitor_identity_id IS NOT NULL;

-- =============================================================================
-- Blindagem de Segurança (Row Level Security - RLS)
-- =============================================================================

ALTER TABLE public.revenue_ledger ENABLE ROW LEVEL SECURITY;

-- Revoga acesso público de anon e authenticated
REVOKE ALL ON public.revenue_ledger FROM anon, authenticated;

-- Concede privilégios totais exclusivamente ao backend autenticado (service_role)
GRANT ALL ON public.revenue_ledger TO service_role;
