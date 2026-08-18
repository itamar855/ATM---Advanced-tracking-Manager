-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 008: Create campaign_costs and product_costs tables
-- ========================================

CREATE TABLE IF NOT EXISTS public.campaign_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.integrations(id),
    date DATE NOT NULL,
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    spend DECIMAL(12,2) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    reach BIGINT DEFAULT 0,
    cpm DECIMAL(10,4),
    cpc DECIMAL(10,4),
    ctr DECIMAL(8,6),
    currency TEXT DEFAULT 'BRL',
    synced_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, date, COALESCE(campaign_id, ''), COALESCE(adset_id, ''), COALESCE(ad_id, ''))
);

CREATE TABLE IF NOT EXISTS public.product_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_name TEXT,
    variant_name TEXT,
    cost_price DECIMAL(12,2),
    currency TEXT DEFAULT 'BRL',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, shopify_product_id, COALESCE(shopify_variant_id, ''))
);

-- RLS via store ownership
ALTER TABLE public.campaign_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own campaign costs"
    ON public.campaign_costs FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Tenant can manage own product costs"
    ON public.product_costs FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_campaign_costs_store_date ON public.campaign_costs(store_id, date DESC);
CREATE INDEX idx_campaign_costs_campaign ON public.campaign_costs(campaign_id, date);
CREATE INDEX idx_product_costs_store ON public.product_costs(store_id, shopify_product_id);

-- Updated_at trigger for product_costs
CREATE TRIGGER on_product_costs_updated
    BEFORE UPDATE ON public.product_costs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
