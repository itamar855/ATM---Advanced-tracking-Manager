-- =============================================================================
-- Migration 021: Criação da Tabela de Snapshots Históricos de Custo Meta
-- Projeto: ATM - Advanced Tracking Manager ADS
-- Fase 8.1: Campaign Cost Snapshots & Métricas Reais (ROAS/CPA/ROI)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_cost_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    ad_account_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    objective TEXT,
    date DATE NOT NULL,
    
    -- Valores na moeda original da conta Meta (ex: USD, BRL)
    spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'BRL',
    
    -- Harmonização Cambial Oficial para BRL (Câmbio Comercial congelado no dia)
    exchange_rate NUMERIC(8, 4) NOT NULL DEFAULT 1.0000,
    spend_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Métricas de Entrega e Eficiência
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    cpc NUMERIC(8, 4) DEFAULT 0.0000,
    cpm NUMERIC(8, 4) DEFAULT 0.0000,
    ctr NUMERIC(6, 4) DEFAULT 0.0000,
    
    -- Auditoria, Origem e Status de Sincronização
    raw_insights JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_source TEXT NOT NULL DEFAULT 'meta_api',
    sync_status TEXT NOT NULL DEFAULT 'success',
    
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Restrição de Unicidade: 1 snapshot diário consolidado por conta, campanha e loja
    CONSTRAINT uq_campaign_cost_snapshot UNIQUE (store_id, ad_account_id, campaign_id, date)
);

-- =============================================================================
-- Índices de Alta Performance para Consultas Analíticas e Joins Contábeis
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_date 
ON public.campaign_cost_snapshots (store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_camp_date 
ON public.campaign_cost_snapshots (store_id, campaign_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_acc_date 
ON public.campaign_cost_snapshots (store_id, ad_account_id, date DESC);

-- =============================================================================
-- Permissões e Segurança Multi-Tenant (RLS)
-- =============================================================================

ALTER TABLE public.campaign_cost_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.campaign_cost_snapshots FROM anon, authenticated;
GRANT ALL ON public.campaign_cost_snapshots TO service_role;
