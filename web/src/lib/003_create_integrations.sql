-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 003: Create integrations table
-- ========================================

CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    platform TEXT NOT NULL
        CHECK (platform IN ('meta', 'google', 'tiktok', 'pinterest')),
    pixel_id TEXT NOT NULL,
    access_token_enc BYTEA NOT NULL,
    api_version TEXT DEFAULT 'v23.0',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'error', 'expired')),
    config JSONB DEFAULT '{}',
    last_health_check TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, platform, pixel_id)
);

-- RLS via store ownership
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can manage integrations"
    ON public.integrations FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_integrations_store ON public.integrations(store_id);

-- Updated_at trigger
CREATE TRIGGER on_integrations_updated
    BEFORE UPDATE ON public.integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
