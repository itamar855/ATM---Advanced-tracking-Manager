-- =================================================================
-- MIGRATION 024: Campaign Profit Intelligence Layer (Fase 10)
-- =================================================================
-- Tabela para registrar a normalização financeira (USD -> BRL) e os snapshots
-- diários do Campaign Profit Score™ com recomendações prescritivas de orçamento.

CREATE TABLE IF NOT EXISTS public.campaign_profit_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    
    -- Camada 1: Moeda Original e Normalizada em BRL
    spend_original NUMERIC(14, 4) NOT NULL DEFAULT 0,
    currency_original TEXT NOT NULL DEFAULT 'BRL',
    spend_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
    spend_brl NUMERIC(14, 4) NOT NULL DEFAULT 0,
    exchange_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    
    -- Performance Operacional e Contábil em BRL
    revenue_brl NUMERIC(14, 4) NOT NULL DEFAULT 0,
    orders INTEGER NOT NULL DEFAULT 0,
    cpa NUMERIC(14, 4) NOT NULL DEFAULT 0,
    roas NUMERIC(10, 4) NOT NULL DEFAULT 0,
    roi NUMERIC(10, 4) NOT NULL DEFAULT 0,
    profit NUMERIC(14, 4) NOT NULL DEFAULT 0,
    
    -- Camada 2: Inteligência e Campaign Profit Score (0 a 100)
    profit_score INTEGER NOT NULL CHECK (profit_score BETWEEN 0 AND 100),
    tier TEXT NOT NULL CHECK (tier IN ('GREEN', 'YELLOW', 'RED')),
    
    -- Camada 3: Recomendações Prescritivas para o Budget Decision Engine
    recommended_action TEXT NOT NULL CHECK (recommended_action IN ('SCALE', 'MAINTAIN', 'REDUCE', 'PAUSE')),
    recommended_budget_change NUMERIC(5, 2) NOT NULL DEFAULT 0, -- ex: +30.00 (+30%), +20.00, 0.00, -20.00, -100.00 (-100%)
    reason TEXT NOT NULL,
    
    -- Auditoria e Métricas Estruturadas
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT unique_daily_campaign_profit_snapshot UNIQUE (store_id, campaign_id, date)
);

-- Índices de alta performance para consulta por loja, data, score e ação recomendada
CREATE INDEX IF NOT EXISTS idx_campaign_profit_store_date 
    ON public.campaign_profit_snapshots (store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_profit_campaign 
    ON public.campaign_profit_snapshots (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_profit_score 
    ON public.campaign_profit_snapshots (store_id, profit_score DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_profit_action 
    ON public.campaign_profit_snapshots (recommended_action);

-- Habilita Row Level Security para segurança multi-tenant
ALTER TABLE public.campaign_profit_snapshots ENABLE ROW LEVEL SECURITY;

-- Política RLS: Acesso total apenas via service_role
CREATE POLICY service_role_all_campaign_profit_snapshots
    ON public.campaign_profit_snapshots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_profit_snapshots IS 'ATM Campaign Profit Intelligence - Normalização cambial e score financeiro contábil diário por campanha';
