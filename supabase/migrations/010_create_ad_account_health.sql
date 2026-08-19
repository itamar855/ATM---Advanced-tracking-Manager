-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 010: Create ad_account_health table
-- ========================================

CREATE TABLE IF NOT EXISTS public.ad_account_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    ad_account_name TEXT,
    account_status INTEGER DEFAULT 1, -- 1=ACTIVE, 2=DISABLED, 3=UNSETTLED
    trust_score INTEGER NOT NULL DEFAULT 85, -- Score Geral 0 - 100
    compliance_score INTEGER NOT NULL DEFAULT 90, -- Pilar 1: Histórico de Rejeições/Políticas
    billing_score INTEGER NOT NULL DEFAULT 95, -- Pilar 2: Saúde de Pagamentos
    feedback_score DECIMAL(3,2) DEFAULT 4.80, -- Pilar 3: Feedback Score da Página (0.0 a 5.0)
    emq_score INTEGER NOT NULL DEFAULT 88, -- Pilar 4: Event Match Quality (CAPI + Cookies)
    active_ads_count INTEGER DEFAULT 0,
    disapproved_ads_count INTEGER DEFAULT 0,
    spend_cap_limit DECIMAL(12,2),
    currency TEXT DEFAULT 'BRL',
    risks_detected JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    last_analyzed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, ad_account_id)
);

-- RLS
ALTER TABLE public.ad_account_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own ad account health"
    ON public.ad_account_health FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE INDEX idx_ad_account_health_store ON public.ad_account_health(store_id, ad_account_id);
