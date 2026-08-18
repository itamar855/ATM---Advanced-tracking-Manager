-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 002: Create stores table
-- ========================================

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'shopify'
        CHECK (platform IN ('shopify', 'woocommerce', 'yampi', 'cartpanda')),
    shop_domain TEXT NOT NULL UNIQUE,
    custom_domains TEXT[] DEFAULT '{}',
    checkout_domain TEXT,
    shopify_access_token_enc BYTEA,
    shopify_scope TEXT,
    webhook_secret TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'paused', 'error', 'uninstalled')),
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own stores"
    ON public.stores FOR SELECT
    USING (tenant_id = auth.uid());

CREATE POLICY "Tenant can insert own stores"
    ON public.stores FOR INSERT
    WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenant can update own stores"
    ON public.stores FOR UPDATE
    USING (tenant_id = auth.uid())
    WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenant can delete own stores"
    ON public.stores FOR DELETE
    USING (tenant_id = auth.uid());

-- Indexes
CREATE INDEX idx_stores_tenant ON public.stores(tenant_id);
CREATE INDEX idx_stores_domain ON public.stores(shop_domain);

-- Updated_at trigger
CREATE TRIGGER on_stores_updated
    BEFORE UPDATE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_api_key_enc BYTEA, ADD COLUMN IF NOT EXISTS shopify_api_secret_enc BYTEA, ADD COLUMN IF NOT EXISTS mercadopago_token_enc BYTEA;
