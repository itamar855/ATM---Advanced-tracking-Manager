-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 015: Create meta_entity_history table
-- ========================================

CREATE TABLE IF NOT EXISTS public.meta_entity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    
    -- Origem da alteração
    source TEXT NOT NULL DEFAULT 'atm_user'
        CHECK (source IN ('atm_user', 'meta_manual', 'automation', 'ai_agent')),
    
    -- Tipo da Ação (preparada para budget, status, duplicate, delete, name)
    action TEXT NOT NULL
        CHECK (action IN ('budget', 'status', 'duplicate', 'delete', 'name')),
        
    -- Entidade Meta Afetada
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('campaign', 'adset', 'ad')),
    entity_name TEXT,
    
    -- Valores Específicos de Orçamento
    previous_budget NUMERIC(12, 2),
    new_budget NUMERIC(12, 2),
    
    -- Valores Genéricos para outras ações (status 'ACTIVE'/'PAUSED', renomeação, etc.)
    old_value TEXT,
    new_value TEXT,
    
    -- Snapshot Operacional de Performance no Instante da Ação (NULL se não houver snapshot disponível)
    sales_at_update INTEGER,
    revenue_at_update NUMERIC(12, 2),
    spend_at_update NUMERIC(12, 2),
    profit_at_update NUMERIC(12, 2),
    roas_at_update NUMERIC(8, 2),
    cpa_at_update NUMERIC(12, 2),
    
    -- Metadados flexíveis
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_meta_entity_history_lookup 
    ON public.meta_entity_history (store_id, entity_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_entity_history_store_date 
    ON public.meta_entity_history (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_entity_history_user 
    ON public.meta_entity_history (user_id);

CREATE INDEX IF NOT EXISTS idx_meta_entity_history_source 
    ON public.meta_entity_history (source);

-- RLS via store ownership (idêntico a orders, integrations e events)
ALTER TABLE public.meta_entity_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own meta entity history"
    ON public.meta_entity_history FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Tenant can insert own meta entity history"
    ON public.meta_entity_history FOR INSERT
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Service role full access on meta entity history"
    ON public.meta_entity_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
