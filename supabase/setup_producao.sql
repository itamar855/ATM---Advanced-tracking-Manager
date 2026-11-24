-- =====================================================================
-- ATM - SETUP COMPLETO DO BANCO (gerado por scripts/build-setup-sql.js, não editar à mão)
-- Gerado a partir de 32 migrations: 001_create_tenants.sql até 032_reconcile_store_columns.sql
-- =====================================================================
-- Como usar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Pode rodar em banco vazio, em banco com parte das tabelas e quantas vezes quiser.
-- No fim aparece uma tabela: "tudo certo" ou a lista do que falhou (com o erro).
-- =====================================================================

CREATE TEMP TABLE IF NOT EXISTS atm_setup_falhas (passo TEXT, erro TEXT, comando TEXT);
TRUNCATE atm_setup_falhas;

CREATE OR REPLACE FUNCTION pg_temp.atm_exec(passo TEXT, comando TEXT) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE comando;
EXCEPTION
  -- já existe: tudo bem
  WHEN duplicate_object OR duplicate_table OR duplicate_column OR duplicate_function OR duplicate_schema THEN
    NULL;
  WHEN OTHERS THEN
    INSERT INTO atm_setup_falhas VALUES (passo, SQLSTATE || ': ' || SQLERRM, left(comando, 300));
END;
$fn$;

SELECT pg_temp.atm_exec('001_create_tenants #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'cancelled')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna id', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna name', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna email', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS email TEXT$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 unique email', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_key ON public.tenants (email)$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna plan', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'))$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna status', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled'))$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna settings', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna created_at', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #1 coluna updated_at', $atm_sql$ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #2', $atm_sql$ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #3', $atm_sql$CREATE POLICY "Users can view own tenant"
    ON public.tenants FOR SELECT
    USING (id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #4 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Users can update own tenant" ON public.tenants$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #4', $atm_sql$CREATE POLICY "Users can update own tenant"
    ON public.tenants FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #5', $atm_sql$CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #6 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_tenants_updated ON public.tenants$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #6', $atm_sql$CREATE TRIGGER on_tenants_updated
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #7', $atm_sql$CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.tenants (id, name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #8 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users$atm_sql$);
SELECT pg_temp.atm_exec('001_create_tenants #8', $atm_sql$CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user()$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.stores (
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
)$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna id', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna tenant_id', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna platform', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'shopify' CHECK (platform IN ('shopify', 'woocommerce', 'yampi', 'cartpanda'))$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna shop_domain', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shop_domain TEXT$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 unique shop_domain', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS stores_shop_domain_key ON public.stores (shop_domain)$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna custom_domains', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS custom_domains TEXT[] DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna checkout_domain', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS checkout_domain TEXT$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna shopify_access_token_enc', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_access_token_enc BYTEA$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna shopify_scope', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_scope TEXT$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna webhook_secret', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS webhook_secret TEXT$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna status', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'error', 'uninstalled'))$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna installed_at', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna created_at', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #1 coluna updated_at', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #2', $atm_sql$ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own stores" ON public.stores$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #3', $atm_sql$CREATE POLICY "Tenant can view own stores"
    ON public.stores FOR SELECT
    USING (tenant_id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #4 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can insert own stores" ON public.stores$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #4', $atm_sql$CREATE POLICY "Tenant can insert own stores"
    ON public.stores FOR INSERT
    WITH CHECK (tenant_id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #5 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can update own stores" ON public.stores$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #5', $atm_sql$CREATE POLICY "Tenant can update own stores"
    ON public.stores FOR UPDATE
    USING (tenant_id = auth.uid())
    WITH CHECK (tenant_id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can delete own stores" ON public.stores$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #6', $atm_sql$CREATE POLICY "Tenant can delete own stores"
    ON public.stores FOR DELETE
    USING (tenant_id = auth.uid())$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #7', $atm_sql$CREATE INDEX IF NOT EXISTS idx_stores_tenant ON public.stores(tenant_id)$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #8', $atm_sql$CREATE INDEX IF NOT EXISTS idx_stores_domain ON public.stores(shop_domain)$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #9 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_stores_updated ON public.stores$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #9', $atm_sql$CREATE TRIGGER on_stores_updated
    BEFORE UPDATE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('002_create_stores #10', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_api_key_enc BYTEA, ADD COLUMN IF NOT EXISTS shopify_api_secret_enc BYTEA, ADD COLUMN IF NOT EXISTS mercadopago_token_enc BYTEA$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.integrations (
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
)$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna id', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna store_id', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna platform', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS platform TEXT CHECK (platform IN ('meta', 'google', 'tiktok', 'pinterest'))$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna pixel_id', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS pixel_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna access_token_enc', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS access_token_enc BYTEA$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna api_version', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS api_version TEXT DEFAULT 'v23.0'$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna status', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'expired'))$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna config', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna last_health_check', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna last_error', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS last_error TEXT$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna created_at', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 coluna updated_at', $atm_sql$ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS integrations_store_id_platform_pixel_id_key ON public.integrations (store_id, platform, pixel_id)$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #2', $atm_sql$ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can manage integrations" ON public.integrations$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #3', $atm_sql$CREATE POLICY "Tenant can manage integrations"
    ON public.integrations FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_integrations_store ON public.integrations(store_id)$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #5 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_integrations_updated ON public.integrations$atm_sql$);
SELECT pg_temp.atm_exec('003_create_integrations #5', $atm_sql$CREATE TRIGGER on_integrations_updated
    BEFORE UPDATE ON public.integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    fbp TEXT,
    fbc TEXT,
    fbclid TEXT,
    client_ip TEXT,
    client_user_agent TEXT,
    landing_page TEXT,
    event_source_url TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    enrichment_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    UNIQUE(store_id, track_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna id', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna store_id', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna track_id', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS track_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna fbp', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS fbp TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna fbc', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS fbc TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna fbclid', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS fbclid TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna client_ip', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS client_ip TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna client_user_agent', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS client_user_agent TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna landing_page', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS landing_page TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna event_source_url', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS event_source_url TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna utm_source', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS utm_source TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna utm_medium', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS utm_medium TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna utm_campaign', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS utm_campaign TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna utm_content', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS utm_content TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna utm_term', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS utm_term TEXT$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna enrichment_count', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS enrichment_count INT DEFAULT 1$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna created_at', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna updated_at', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 coluna expires_at', $atm_sql$ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS sessions_store_id_track_id_key ON public.sessions (store_id, track_id)$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #2', $atm_sql$ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own sessions" ON public.sessions$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #3', $atm_sql$CREATE POLICY "Tenant can view own sessions"
    ON public.sessions FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_sessions_store_track ON public.sessions(store_id, track_id)$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at)$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #6', $atm_sql$CREATE INDEX IF NOT EXISTS idx_sessions_created ON public.sessions(created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #7 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_sessions_updated ON public.sessions$atm_sql$);
SELECT pg_temp.atm_exec('004_create_sessions #7', $atm_sql$CREATE TRIGGER on_sessions_updated
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    session_id UUID REFERENCES public.sessions(id),
    track_id TEXT,
    customer_email_hash TEXT,
    customer_phone_hash TEXT,
    customer_external_id TEXT,
    customer_first_name_hash TEXT,
    customer_last_name_hash TEXT,
    value DECIMAL(12,2),
    currency TEXT DEFAULT 'BRL',
    products JSONB DEFAULT '[]',
    address JSONB DEFAULT '{}',
    payment_method TEXT,
    status TEXT DEFAULT 'paid'
        CHECK (status IN ('created', 'pix_pending', 'paid', 'refunded', 'cancelled')),
    order_created_at TIMESTAMPTZ,
    order_paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    refund_value DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, order_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna store_id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna order_id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna session_id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna track_id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS track_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna customer_email_hash', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna customer_phone_hash', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna customer_external_id', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_external_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna customer_first_name_hash', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_first_name_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna customer_last_name_hash', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_last_name_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna value', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS value DECIMAL(12,2)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna currency', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna products', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna address', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna payment_method', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna status', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'paid' CHECK (status IN ('created', 'pix_pending', 'paid', 'refunded', 'cancelled'))$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna order_created_at', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_created_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna order_paid_at', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_paid_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna refunded_at', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna refund_value', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_value DECIMAL(12,2)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 coluna created_at', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS orders_store_id_order_id_key ON public.orders (store_id, order_id)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #2', $atm_sql$ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own orders" ON public.orders$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #3', $atm_sql$CREATE POLICY "Tenant can view own orders"
    ON public.orders FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_orders_store_order ON public.orders(store_id, order_id)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_orders_store_date ON public.orders(store_id, order_paid_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #6', $atm_sql$CREATE INDEX IF NOT EXISTS idx_orders_session ON public.orders(session_id)$atm_sql$);
SELECT pg_temp.atm_exec('005_create_orders #7', $atm_sql$CREATE INDEX IF NOT EXISTS idx_orders_track ON public.orders(store_id, track_id)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.integrations(id),
    order_id TEXT,
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    source TEXT NOT NULL
        CHECK (source IN ('server', 'browser')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'accepted', 'rejected', 'deduped', 'failed')),
    payload_hash TEXT,
    user_data_keys TEXT[] DEFAULT '{}',
    health_score INT CHECK (health_score >= 0 AND health_score <= 100),
    meta_response JSONB,
    latency_ms INT,
    attempt_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    UNIQUE(store_id, event_id, source)
)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna id', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna store_id', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna integration_id', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.integrations(id)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna order_id', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS order_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna event_name', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna event_id', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna source', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('server', 'browser'))$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna status', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'accepted', 'rejected', 'deduped', 'failed'))$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna payload_hash', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payload_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna user_data_keys', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS user_data_keys TEXT[] DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna health_score', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS health_score INT CHECK (health_score >= 0 AND health_score <= 100)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna meta_response', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_response JSONB$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna latency_ms', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latency_ms INT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna attempt_count', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna created_at', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 coluna sent_at', $atm_sql$ALTER TABLE public.events ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS events_store_id_event_id_source_key ON public.events (store_id, event_id, source)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2', $atm_sql$CREATE TABLE IF NOT EXISTS public.event_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    status_code INT,
    response JSONB,
    latency_ms INT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna id', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna event_id', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna attempt', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS attempt INT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna status_code', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS status_code INT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna response', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS response JSONB$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna latency_ms', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS latency_ms INT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna error', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS error TEXT$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #2 coluna created_at', $atm_sql$ALTER TABLE public.event_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #3', $atm_sql$ALTER TABLE public.events ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #4', $atm_sql$ALTER TABLE public.event_attempts ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #5 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own events" ON public.events$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #5', $atm_sql$CREATE POLICY "Tenant can view own events"
    ON public.events FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own event attempts" ON public.event_attempts$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #6', $atm_sql$CREATE POLICY "Tenant can view own event attempts"
    ON public.event_attempts FOR SELECT
    USING (event_id IN (
        SELECT id FROM public.events
        WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid())
    ))$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #7', $atm_sql$CREATE INDEX IF NOT EXISTS idx_events_store_name ON public.events(store_id, event_name, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #8', $atm_sql$CREATE INDEX IF NOT EXISTS idx_events_order ON public.events(order_id)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #9', $atm_sql$CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status, created_at)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #10', $atm_sql$CREATE INDEX IF NOT EXISTS idx_events_store_date ON public.events(store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('006_create_events #11', $atm_sql$CREATE INDEX IF NOT EXISTS idx_event_attempts_event ON public.event_attempts(event_id, attempt)$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.diagnostics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL
        CHECK (severity IN ('info', 'warning', 'critical')),
    entity_type TEXT
        CHECK (entity_type IN ('event', 'session', 'integration', 'store', 'order')),
    entity_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    evidence JSONB DEFAULT '{}',
    state TEXT DEFAULT 'open'
        CHECK (state IN ('open', 'acknowledged', 'resolved', 'dismissed')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna id', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna store_id', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna type', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS type TEXT$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna severity', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('info', 'warning', 'critical'))$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna entity_type', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS entity_type TEXT CHECK (entity_type IN ('event', 'session', 'integration', 'store', 'order'))$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna entity_id', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS entity_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna title', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS title TEXT$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna description', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS description TEXT$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna evidence', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna state', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved', 'dismissed'))$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna resolved_at', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #1 coluna created_at', $atm_sql$ALTER TABLE public.diagnostics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #2', $atm_sql$ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own diagnostics" ON public.diagnostics$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #3', $atm_sql$CREATE POLICY "Tenant can view own diagnostics"
    ON public.diagnostics FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #4 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can update own diagnostics" ON public.diagnostics$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #4', $atm_sql$CREATE POLICY "Tenant can update own diagnostics"
    ON public.diagnostics FOR UPDATE
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_diagnostics_store ON public.diagnostics(store_id, state, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('007_create_diagnostics #6', $atm_sql$CREATE INDEX IF NOT EXISTS idx_diagnostics_type ON public.diagnostics(type, severity)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_costs (
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
    
    
    UNIQUE NULLS NOT DISTINCT (store_id, date, campaign_id, adset_id, ad_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna integration_id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.integrations(id)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna date', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS date DATE$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna adset_id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS adset_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna adset_name', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS adset_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna ad_id', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS ad_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna ad_name', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS ad_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna spend', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS spend DECIMAL(12,2) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna impressions', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna clicks', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna reach', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS reach BIGINT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna cpm', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS cpm DECIMAL(10,4)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna cpc', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS cpc DECIMAL(10,4)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna ctr', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS ctr DECIMAL(8,6)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna currency', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 coluna synced_at', $atm_sql$ALTER TABLE public.campaign_costs ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS campaign_costs_store_id_date_campaign_id_adset_id_ad_id_key ON public.campaign_costs (store_id, date, campaign_id, adset_id, ad_id) NULLS NOT DISTINCT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2', $atm_sql$CREATE TABLE IF NOT EXISTS public.product_costs (
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
    UNIQUE NULLS NOT DISTINCT (store_id, shopify_product_id, shopify_variant_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna id', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna store_id', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna shopify_product_id', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS shopify_product_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna shopify_variant_id', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna product_name', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS product_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna variant_name', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS variant_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna cost_price', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna currency', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna created_at', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 coluna updated_at', $atm_sql$ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #2 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS product_costs_store_id_shopify_product_id_shopify_variant_id_ke ON public.product_costs (store_id, shopify_product_id, shopify_variant_id) NULLS NOT DISTINCT$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #3', $atm_sql$ALTER TABLE public.campaign_costs ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #4', $atm_sql$ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #5 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own campaign costs" ON public.campaign_costs$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #5', $atm_sql$CREATE POLICY "Tenant can view own campaign costs"
    ON public.campaign_costs FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can manage own product costs" ON public.product_costs$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #6', $atm_sql$CREATE POLICY "Tenant can manage own product costs"
    ON public.product_costs FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #7', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_costs_store_date ON public.campaign_costs(store_id, date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #8', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_costs_campaign ON public.campaign_costs(campaign_id, date)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #9', $atm_sql$CREATE INDEX IF NOT EXISTS idx_product_costs_store ON public.product_costs(store_id, shopify_product_id)$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #10 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_product_costs_updated ON public.product_costs$atm_sql$);
SELECT pg_temp.atm_exec('008_create_costs #10', $atm_sql$CREATE TRIGGER on_product_costs_updated
    BEFORE UPDATE ON public.product_costs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.taxes_and_duties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('tax', 'duty')), 
    calculation_rule TEXT NOT NULL
        CHECK (calculation_rule IN ('revenue_value', 'commission_value')), 
    payment_method TEXT NOT NULL DEFAULT 'all'
        CHECK (payment_method IN ('all', 'credit_card', 'pix', 'boleto', 'other')),
    value_type TEXT NOT NULL DEFAULT 'percentage'
        CHECK (value_type IN ('percentage', 'fixed')),
    value DECIMAL(10,4) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna id', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna store_id', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna name', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna type', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('tax', 'duty'))$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna calculation_rule', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS calculation_rule TEXT CHECK (calculation_rule IN ('revenue_value', 'commission_value'))$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna payment_method', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'all' CHECK (payment_method IN ('all', 'credit_card', 'pix', 'boleto', 'other'))$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna value_type', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS value_type TEXT DEFAULT 'percentage' CHECK (value_type IN ('percentage', 'fixed'))$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna value', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS value DECIMAL(10,4) DEFAULT 0.00$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna created_at', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #1 coluna updated_at', $atm_sql$ALTER TABLE public.taxes_and_duties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #2', $atm_sql$ALTER TABLE public.taxes_and_duties ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can manage own taxes and duties" ON public.taxes_and_duties$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #3', $atm_sql$CREATE POLICY "Tenant can manage own taxes and duties"
    ON public.taxes_and_duties FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('009_create_taxes #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_taxes_store ON public.taxes_and_duties(store_id, type)$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.ad_account_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    ad_account_name TEXT,
    account_status INTEGER DEFAULT 1, 
    trust_score INTEGER NOT NULL DEFAULT 85, 
    compliance_score INTEGER NOT NULL DEFAULT 90, 
    billing_score INTEGER NOT NULL DEFAULT 95, 
    feedback_score DECIMAL(3,2) DEFAULT 4.80, 
    emq_score INTEGER NOT NULL DEFAULT 88, 
    active_ads_count INTEGER DEFAULT 0,
    disapproved_ads_count INTEGER DEFAULT 0,
    spend_cap_limit DECIMAL(12,2),
    currency TEXT DEFAULT 'BRL',
    risks_detected JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    last_analyzed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, ad_account_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna id', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna store_id', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna ad_account_id', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS ad_account_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna ad_account_name', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS ad_account_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna account_status', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS account_status INTEGER DEFAULT 1$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna trust_score', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 85$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna compliance_score', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS compliance_score INTEGER DEFAULT 90$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna billing_score', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS billing_score INTEGER DEFAULT 95$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna feedback_score', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS feedback_score DECIMAL(3,2) DEFAULT 4.80$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna emq_score', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS emq_score INTEGER DEFAULT 88$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna active_ads_count', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS active_ads_count INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna disapproved_ads_count', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS disapproved_ads_count INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna spend_cap_limit', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS spend_cap_limit DECIMAL(12,2)$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna currency', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna risks_detected', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS risks_detected JSONB DEFAULT '[]'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna recommendations', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna last_analyzed_at', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 coluna created_at', $atm_sql$ALTER TABLE public.ad_account_health ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS ad_account_health_store_id_ad_account_id_key ON public.ad_account_health (store_id, ad_account_id)$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #2', $atm_sql$ALTER TABLE public.ad_account_health ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #3 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own ad account health" ON public.ad_account_health$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #3', $atm_sql$CREATE POLICY "Tenant can view own ad account health"
    ON public.ad_account_health FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('010_create_ad_account_health #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_ad_account_health_store ON public.ad_account_health(store_id, ad_account_id)$atm_sql$);
SELECT pg_temp.atm_exec('011_add_pushcut_url #1', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pushcut_url TEXT$atm_sql$);
SELECT pg_temp.atm_exec('012_pushcut_preferences #1', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pushcut_notify_approved BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('012_pushcut_preferences #2', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pushcut_notify_pending BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('013_add_telegram #1', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT$atm_sql$);
SELECT pg_temp.atm_exec('013_add_telegram #2', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('013_add_telegram #3', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS telegram_notify_approved BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('013_add_telegram #4', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS telegram_notify_pending BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('approved', 'pending')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT,
    customer_name TEXT,
    items_summary TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_notifications_store_order_type UNIQUE (store_id, order_id, type)
)$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna id', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna store_id', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna order_id', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS order_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna type', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('approved', 'pending'))$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna title', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna body', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna value', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS value NUMERIC(12, 2) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna currency', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna payment_method', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS payment_method TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna customer_name', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS customer_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna items_summary', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS items_summary TEXT$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna read', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna metadata', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 coluna created_at', $atm_sql$ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_store_order_type ON public.notifications (store_id, order_id, type)$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_notifications_store_created ON public.notifications(store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_notifications_store_unread ON public.notifications(store_id, read) WHERE read = false$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_notifications_order ON public.notifications(order_id)$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #5', $atm_sql$ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Users can view notifications for their stores" ON public.notifications$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #6', $atm_sql$CREATE POLICY "Users can view notifications for their stores"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Users can update notifications for their stores" ON public.notifications$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #7', $atm_sql$CREATE POLICY "Users can update notifications for their stores"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('014_create_notifications_table #8', $atm_sql$ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.meta_entity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    
    
    source TEXT NOT NULL DEFAULT 'atm_user'
        CHECK (source IN ('atm_user', 'meta_manual', 'automation', 'ai_agent')),
    
    
    action TEXT NOT NULL
        CHECK (action IN ('budget', 'status', 'duplicate', 'delete', 'name')),
        
    
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('campaign', 'adset', 'ad')),
    entity_name TEXT,
    
    
    previous_budget NUMERIC(12, 2),
    new_budget NUMERIC(12, 2),
    
    
    old_value TEXT,
    new_value TEXT,
    
    
    sales_at_update INTEGER,
    revenue_at_update NUMERIC(12, 2),
    spend_at_update NUMERIC(12, 2),
    profit_at_update NUMERIC(12, 2),
    roas_at_update NUMERIC(8, 2),
    cpa_at_update NUMERIC(12, 2),
    
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna id', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna store_id', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna user_id', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna user_email', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS user_email TEXT$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna source', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'atm_user' CHECK (source IN ('atm_user', 'meta_manual', 'automation', 'ai_agent'))$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna action', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS action TEXT CHECK (action IN ('budget', 'status', 'duplicate', 'delete', 'name'))$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna entity_id', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS entity_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna entity_type', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS entity_type TEXT CHECK (entity_type IN ('campaign', 'adset', 'ad'))$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna entity_name', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS entity_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna previous_budget', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS previous_budget NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna new_budget', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS new_budget NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna old_value', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS old_value TEXT$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna new_value', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS new_value TEXT$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna sales_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS sales_at_update INTEGER$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna revenue_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS revenue_at_update NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna spend_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS spend_at_update NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna profit_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS profit_at_update NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna roas_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS roas_at_update NUMERIC(8, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna cpa_at_update', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS cpa_at_update NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna metadata', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #1 coluna created_at', $atm_sql$ALTER TABLE public.meta_entity_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_entity_history_lookup 
    ON public.meta_entity_history (store_id, entity_id, action, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_entity_history_store_date 
    ON public.meta_entity_history (store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_entity_history_user 
    ON public.meta_entity_history (user_id)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_entity_history_source 
    ON public.meta_entity_history (source)$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #6', $atm_sql$ALTER TABLE public.meta_entity_history ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own meta entity history" ON public.meta_entity_history$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #7', $atm_sql$CREATE POLICY "Tenant can view own meta entity history"
    ON public.meta_entity_history FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #8 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can insert own meta entity history" ON public.meta_entity_history$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #8', $atm_sql$CREATE POLICY "Tenant can insert own meta entity history"
    ON public.meta_entity_history FOR INSERT
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #9 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Service role full access on meta entity history" ON public.meta_entity_history$atm_sql$);
SELECT pg_temp.atm_exec('015_create_meta_entity_history #9', $atm_sql$CREATE POLICY "Service role full access on meta entity history"
    ON public.meta_entity_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.visitor_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,

    
    identity_cluster_id UUID DEFAULT gen_random_uuid(),

    
    track_id TEXT,

    
    fbp TEXT,
    fbc TEXT,

    
    email_hash TEXT,
    phone_hash TEXT,

    
    raw_email TEXT,
    raw_phone TEXT,

    
    first_name TEXT,
    last_name TEXT,

    
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT DEFAULT 'BR',

    
    external_id TEXT,

    
    identity_source TEXT DEFAULT 'browser',

    
    confidence_score INT DEFAULT 0,

    
    merged_into UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL,

    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),

    
    CONSTRAINT uq_identity_store_track UNIQUE (store_id, track_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna id', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna store_id', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna identity_cluster_id', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS identity_cluster_id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna track_id', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS track_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna fbp', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS fbp TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna fbc', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS fbc TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna email_hash', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS email_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna phone_hash', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS phone_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna raw_email', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS raw_email TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna raw_phone', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS raw_phone TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna first_name', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS first_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna last_name', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS last_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna city', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS city TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna state', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS state TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna zip', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS zip TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna country', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'BR'$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna external_id', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS external_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna identity_source', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS identity_source TEXT DEFAULT 'browser'$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna confidence_score', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS confidence_score INT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna merged_into', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna created_at', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna updated_at', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 coluna last_seen_at', $atm_sql$ALTER TABLE public.visitor_identities ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW()$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_store_track ON public.visitor_identities (store_id, track_id)$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_identity_fbp 
ON public.visitor_identities (store_id, fbp) 
WHERE fbp IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_identity_email 
ON public.visitor_identities (store_id, email_hash) 
WHERE email_hash IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_identity_phone 
ON public.visitor_identities (store_id, phone_hash) 
WHERE phone_hash IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_identity_external 
ON public.visitor_identities (store_id, external_id) 
WHERE external_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #6', $atm_sql$CREATE INDEX IF NOT EXISTS idx_identity_cluster 
ON public.visitor_identities (store_id, identity_cluster_id) 
WHERE identity_cluster_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #7', $atm_sql$ALTER TABLE public.visitor_identities ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #8', $atm_sql$REVOKE ALL ON public.visitor_identities FROM anon, authenticated$atm_sql$);
SELECT pg_temp.atm_exec('016_create_visitor_identities #9', $atm_sql$GRANT ALL ON public.visitor_identities TO service_role$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.attribution_recovery_log (
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

    
    CONSTRAINT uq_recovery_store_order UNIQUE (store_id, order_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna store_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna order_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS order_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna identity_cluster_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS identity_cluster_id UUID$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna campaign_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna adset_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS adset_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna ad_id', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS ad_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna source', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS source TEXT$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna confidence_score', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS confidence_score INT CHECK (confidence_score >= 0 AND confidence_score <= 100)$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna evidence', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 coluna created_at', $atm_sql$ALTER TABLE public.attribution_recovery_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_store_order ON public.attribution_recovery_log (store_id, order_id)$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_recovery_lookup 
ON public.attribution_recovery_log (store_id, order_id)$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_recovery_score 
ON public.attribution_recovery_log (store_id, confidence_score DESC)$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_recovery_cluster 
ON public.attribution_recovery_log (store_id, identity_cluster_id)
WHERE identity_cluster_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_recovery_campaign 
ON public.attribution_recovery_log (store_id, campaign_id)
WHERE campaign_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #6', $atm_sql$ALTER TABLE public.attribution_recovery_log ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #7', $atm_sql$REVOKE ALL ON public.attribution_recovery_log FROM anon, authenticated$atm_sql$);
SELECT pg_temp.atm_exec('017_create_attribution_recovery_log #8', $atm_sql$GRANT ALL ON public.attribution_recovery_log TO service_role$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.revenue_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    event_id TEXT,

    
    visitor_identity_id UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL,

    
    order_value NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT,

    
    attribution_model TEXT NOT NULL 
        CHECK (attribution_model IN ('last_click', 'first_click', 'linear', 'u_shaped')),

    
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    source TEXT NOT NULL,

    
    attribution_weight NUMERIC(6, 4) NOT NULL DEFAULT 1.0000
        CHECK (attribution_weight >= 0 AND attribution_weight <= 1),
    attributed_revenue NUMERIC(12, 2) NOT NULL,

    
    confidence_score INT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    attribution_method TEXT NOT NULL 
        CHECK (attribution_method IN ('native_pixel', 'webhook_utm', 'forensic_fbc', 'forensic_identity', 'forensic_utm', 'assisted')),
    is_recovered BOOLEAN NOT NULL DEFAULT FALSE,
    is_assisted BOOLEAN NOT NULL DEFAULT FALSE,

    
    touchpoint_index INT NOT NULL DEFAULT 1,
    total_touchpoints INT NOT NULL DEFAULT 1,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    order_paid_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    
    CONSTRAINT uq_revenue_ledger_slice 
    UNIQUE (store_id, order_id, attribution_model, touchpoint_index)
)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna store_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna order_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS order_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna event_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS event_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna visitor_identity_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS visitor_identity_id UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna order_value', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS order_value NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna currency', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna payment_method', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS payment_method TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna attribution_model', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS attribution_model TEXT CHECK (attribution_model IN ('last_click', 'first_click', 'linear', 'u_shaped'))$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna campaign_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna campaign_name', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna adset_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS adset_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna adset_name', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS adset_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna ad_id', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS ad_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna ad_name', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS ad_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna source', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS source TEXT$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna attribution_weight', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS attribution_weight NUMERIC(6, 4) DEFAULT 1.0000 CHECK (attribution_weight >= 0 AND attribution_weight <= 1)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna attributed_revenue', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS attributed_revenue NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna confidence_score', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS confidence_score INT CHECK (confidence_score >= 0 AND confidence_score <= 100)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna attribution_method', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS attribution_method TEXT CHECK (attribution_method IN ('native_pixel', 'webhook_utm', 'forensic_fbc', 'forensic_identity', 'forensic_utm', 'assisted'))$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna is_recovered', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS is_recovered BOOLEAN DEFAULT FALSE$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna is_assisted', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS is_assisted BOOLEAN DEFAULT FALSE$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna touchpoint_index', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS touchpoint_index INT DEFAULT 1$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna total_touchpoints', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS total_touchpoints INT DEFAULT 1$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna evidence', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna order_paid_at', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS order_paid_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna created_at', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 coluna updated_at', $atm_sql$ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_ledger_slice ON public.revenue_ledger (store_id, order_id, attribution_model, touchpoint_index)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_order 
ON public.revenue_ledger (store_id, order_id)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_dashboard 
ON public.revenue_ledger (store_id, attribution_model, order_paid_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_campaign 
ON public.revenue_ledger (store_id, campaign_id, order_paid_at DESC)
WHERE campaign_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_recovered 
ON public.revenue_ledger (store_id, is_recovered, order_paid_at DESC)
WHERE is_recovered = true$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #6', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_assisted 
ON public.revenue_ledger (store_id, is_assisted, order_paid_at DESC)
WHERE is_assisted = true$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #7', $atm_sql$CREATE INDEX IF NOT EXISTS idx_revenue_ledger_visitor 
ON public.revenue_ledger (store_id, visitor_identity_id)
WHERE visitor_identity_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #8', $atm_sql$ALTER TABLE public.revenue_ledger ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #9', $atm_sql$REVOKE ALL ON public.revenue_ledger FROM anon, authenticated$atm_sql$);
SELECT pg_temp.atm_exec('018_create_revenue_ledger #10', $atm_sql$GRANT ALL ON public.revenue_ledger TO service_role$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_intelligence_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,

    
    alert_type TEXT NOT NULL CHECK (
        alert_type IN (
            'UNDER_REPORTED_CAMPAIGN',
            'READY_TO_SCALE',
            'CAMPAIGN_DECAY',
            'CREATIVE_FATIGUE'
        )
    ),

    
    severity TEXT NOT NULL CHECK (
        severity IN ('info', 'warning', 'critical')
    ),

    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_action TEXT NOT NULL,

    
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

    
    status TEXT NOT NULL DEFAULT 'new' CHECK (
        status IN ('new', 'acknowledged', 'dismissed', 'resolved')
    ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,

    
    
    CONSTRAINT uq_campaign_alert_active 
    UNIQUE (store_id, campaign_id, alert_type, status)
)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna id', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna alert_type', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT CHECK ( alert_type IN ( 'UNDER_REPORTED_CAMPAIGN', 'READY_TO_SCALE', 'CAMPAIGN_DECAY', 'CREATIVE_FATIGUE' ) )$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna severity', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS severity TEXT CHECK ( severity IN ('info', 'warning', 'critical') )$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna title', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS title TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna description', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS description TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna suggested_action', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS suggested_action TEXT$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna metrics', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna status', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK ( status IN ('new', 'acknowledged', 'dismissed', 'resolved') )$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna created_at', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 coluna resolved_at', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_alert_active ON public.campaign_intelligence_alerts (store_id, campaign_id, alert_type, status)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_alerts_store_status 
    ON public.campaign_intelligence_alerts(store_id, status)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_alerts_campaign 
    ON public.campaign_intelligence_alerts(store_id, campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_alerts_created_at 
    ON public.campaign_intelligence_alerts(created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_alerts_type_severity 
    ON public.campaign_intelligence_alerts(store_id, alert_type, severity)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #6', $atm_sql$ALTER TABLE public.campaign_intelligence_alerts ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenants can view their store alerts" ON public.campaign_intelligence_alerts$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #7', $atm_sql$CREATE POLICY "Tenants can view their store alerts"
    ON public.campaign_intelligence_alerts
    FOR SELECT
    USING (
        store_id IN (
            SELECT id::text FROM public.stores WHERE tenant_id = auth.uid()
        )
    )$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #8 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Service role full access to alerts" ON public.campaign_intelligence_alerts$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #8', $atm_sql$CREATE POLICY "Service role full access to alerts"
    ON public.campaign_intelligence_alerts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('019_create_campaign_intelligence_alerts #9', $atm_sql$COMMENT ON TABLE public.campaign_intelligence_alerts IS 'Registro de oportunidades de escala, desvios de atribuição e alertas operacionais detectados pelo ATM Intelligence Engine'$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_automation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL UNIQUE,

    
    automation_enabled BOOLEAN NOT NULL DEFAULT true,
    autopilot_enabled BOOLEAN NOT NULL DEFAULT false,   
    kill_switch BOOLEAN NOT NULL DEFAULT false,         

    
    max_daily_budget_change NUMERIC(12, 2) NOT NULL DEFAULT 500.00, 
    max_budget_increase_percent INT NOT NULL DEFAULT 20,           
    max_budget_decrease_percent INT NOT NULL DEFAULT 30,           
    cooldown_hours INT NOT NULL DEFAULT 24,                        

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna id', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 unique store_id', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS campaign_automation_settings_store_id_key ON public.campaign_automation_settings (store_id)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna automation_enabled', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna autopilot_enabled', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT false$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna kill_switch', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS kill_switch BOOLEAN DEFAULT false$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna max_daily_budget_change', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS max_daily_budget_change NUMERIC(12, 2) DEFAULT 500.00$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna max_budget_increase_percent', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS max_budget_increase_percent INT DEFAULT 20$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna max_budget_decrease_percent', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS max_budget_decrease_percent INT DEFAULT 30$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna cooldown_hours', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS cooldown_hours INT DEFAULT 24$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna created_at', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #1 coluna updated_at', $atm_sql$ALTER TABLE public.campaign_automation_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_automation_settings_store 
    ON public.campaign_automation_settings(store_id)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #3', $atm_sql$ALTER TABLE public.campaign_automation_settings ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #4 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenants view their store automation settings" ON public.campaign_automation_settings$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #4', $atm_sql$CREATE POLICY "Tenants view their store automation settings"
    ON public.campaign_automation_settings
    FOR SELECT
    USING (
        store_id IN (
            SELECT id::text FROM public.stores WHERE tenant_id = auth.uid()
        )
    )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #5 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenants update their store automation settings" ON public.campaign_automation_settings$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #5', $atm_sql$CREATE POLICY "Tenants update their store automation settings"
    ON public.campaign_automation_settings
    FOR UPDATE
    USING (
        store_id IN (
            SELECT id::text FROM public.stores WHERE tenant_id = auth.uid()
        )
    )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Service role full access to automation settings" ON public.campaign_automation_settings$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #6', $atm_sql$CREATE POLICY "Service role full access to automation settings"
    ON public.campaign_automation_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #7', $atm_sql$COMMENT ON TABLE public.campaign_automation_settings IS 'Parâmetros de guardrail, tetos orçamentários e travas de segurança operacional por loja'$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    alert_id UUID REFERENCES public.campaign_intelligence_alerts(id) ON DELETE SET NULL,

    
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    adset_id TEXT,
    ad_id TEXT,

    
    action_type TEXT NOT NULL CHECK (
        action_type IN (
            'SCALE_BUDGET_PERCENT',    
            'REDUCE_BUDGET_PERCENT',   
            'SET_EXACT_BUDGET',        
            'PAUSE_CAMPAIGN',          
            'ACTIVATE_CAMPAIGN',       
            'PROTECT_CAMPAIGN',        
            'REFRESH_CREATIVE_ALERT'   
        )
    ),

    
    execution_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (
        execution_mode IN ('assisted', 'autopilot')
    ),
    autopilot_enabled BOOLEAN NOT NULL DEFAULT false,

    
    status TEXT NOT NULL DEFAULT 'recommended' CHECK (
        status IN (
            'recommended',   
            'approved',      
            'rejected',      
            'executing',     
            'executed',      
            'failed',        
            'rolled_back'    
        )
    ),

    
    previous_value NUMERIC(12, 2),
    target_value NUMERIC(12, 2),
    applied_value NUMERIC(12, 2),

    
    previous_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    
    idempotency_key TEXT,

    
    reason TEXT NOT NULL,
    error_message TEXT,
    meta_response JSONB,

    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna store_id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna alert_id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES public.campaign_intelligence_alerts(id) ON DELETE SET NULL$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna adset_id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS adset_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna ad_id', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS ad_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna action_type', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS action_type TEXT CHECK ( action_type IN ( 'SCALE_BUDGET_PERCENT', 'REDUCE_BUDGET_PERCENT', 'SET_EXACT_BUDGET', 'PAUSE_CAMPAIGN', 'ACTIVATE_CAMPAIGN', 'PROTECT_CAMPAIGN', 'REFRESH_CREATIVE_ALERT' ) )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna execution_mode', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'assisted' CHECK ( execution_mode IN ('assisted', 'autopilot') )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna autopilot_enabled', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT false$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna status', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'recommended' CHECK ( status IN ( 'recommended', 'approved', 'rejected', 'executing', 'executed', 'failed', 'rolled_back' ) )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna previous_value', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS previous_value NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna target_value', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS target_value NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna applied_value', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS applied_value NUMERIC(12, 2)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna previous_snapshot', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS previous_snapshot JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna target_snapshot', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS target_snapshot JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna idempotency_key', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS idempotency_key TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna reason', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS reason TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna error_message', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS error_message TEXT$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna meta_response', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS meta_response JSONB$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna approved_by', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna approved_at', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna executed_at', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna rolled_back_at', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna created_at', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #8 coluna updated_at', $atm_sql$ALTER TABLE public.campaign_actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #9', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_active_campaign_action
    ON public.campaign_actions(store_id, campaign_id, action_type)
    WHERE status IN ('recommended', 'approved', 'executing')$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #10', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_idempotency_key
    ON public.campaign_actions(idempotency_key)
    WHERE idempotency_key IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #11', $atm_sql$CREATE INDEX IF NOT EXISTS idx_actions_store_status 
    ON public.campaign_actions(store_id, status)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #12', $atm_sql$CREATE INDEX IF NOT EXISTS idx_actions_campaign 
    ON public.campaign_actions(store_id, campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #13', $atm_sql$CREATE INDEX IF NOT EXISTS idx_actions_created_at 
    ON public.campaign_actions(created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #14', $atm_sql$ALTER TABLE public.campaign_actions ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #15 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenants view their store actions" ON public.campaign_actions$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #15', $atm_sql$CREATE POLICY "Tenants view their store actions"
    ON public.campaign_actions
    FOR SELECT
    USING (
        store_id IN (
            SELECT id::text FROM public.stores WHERE tenant_id = auth.uid()
        )
    )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #16 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenants update their store actions" ON public.campaign_actions$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #16', $atm_sql$CREATE POLICY "Tenants update their store actions"
    ON public.campaign_actions
    FOR UPDATE
    USING (
        store_id IN (
            SELECT id::text FROM public.stores WHERE tenant_id = auth.uid()
        )
    )$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #17 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Service role full access to actions" ON public.campaign_actions$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #17', $atm_sql$CREATE POLICY "Service role full access to actions"
    ON public.campaign_actions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('020_create_campaign_actions_and_settings #18', $atm_sql$COMMENT ON TABLE public.campaign_actions IS 'Fila de aprovação de decisões de campanha, histórico de execuções assistidas e snapshots de rollback'$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_cost_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    ad_account_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    objective TEXT,
    date DATE NOT NULL,
    
    
    spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'BRL',
    
    
    exchange_rate NUMERIC(8, 4) NOT NULL DEFAULT 1.0000,
    spend_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    cpc NUMERIC(8, 4) DEFAULT 0.0000,
    cpm NUMERIC(8, 4) DEFAULT 0.0000,
    ctr NUMERIC(6, 4) DEFAULT 0.0000,
    
    
    raw_insights JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_source TEXT NOT NULL DEFAULT 'meta_api',
    sync_status TEXT NOT NULL DEFAULT 'success',
    
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    
    CONSTRAINT uq_campaign_cost_snapshot UNIQUE (store_id, ad_account_id, campaign_id, date)
)$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna id', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna ad_account_id', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS ad_account_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna objective', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS objective TEXT$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna date', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS date DATE$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna spend', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS spend NUMERIC(12, 2) DEFAULT 0.00$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna currency', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna exchange_rate', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(8, 4) DEFAULT 1.0000$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna spend_brl', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS spend_brl NUMERIC(12, 2) DEFAULT 0.00$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna impressions', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna clicks', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna cpc', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS cpc NUMERIC(8, 4) DEFAULT 0.0000$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna cpm', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS cpm NUMERIC(8, 4) DEFAULT 0.0000$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna ctr', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS ctr NUMERIC(6, 4) DEFAULT 0.0000$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna raw_insights', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS raw_insights JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna sync_source', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'meta_api'$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna sync_status', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'success'$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna fetched_at', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 coluna updated_at', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_cost_snapshot ON public.campaign_cost_snapshots (store_id, ad_account_id, campaign_id, date)$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_date 
ON public.campaign_cost_snapshots (store_id, date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_camp_date 
ON public.campaign_cost_snapshots (store_id, campaign_id, date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_cost_snapshots_store_acc_date 
ON public.campaign_cost_snapshots (store_id, ad_account_id, date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #5', $atm_sql$ALTER TABLE public.campaign_cost_snapshots ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #6', $atm_sql$REVOKE ALL ON public.campaign_cost_snapshots FROM anon, authenticated$atm_sql$);
SELECT pg_temp.atm_exec('021_create_campaign_cost_snapshots #7', $atm_sql$GRANT ALL ON public.campaign_cost_snapshots TO service_role$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.meta_asset_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('business_manager', 'ad_account', 'pixel', 'domain')),
  asset_id TEXT NOT NULL,
  asset_name TEXT,
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  health_tier TEXT NOT NULL CHECK (health_tier IN ('critical', 'warning', 'healthy', 'excellent')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  decision TEXT NOT NULL CHECK (decision IN ('SAFE_TO_SCALE', 'RESTRICTED_SCALE', 'DO_NOT_SCALE')),
  metrics JSONB DEFAULT '{}'::jsonb NOT NULL,
  recommendations JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT unique_daily_asset_health_snapshot UNIQUE (store_id, asset_type, asset_id, snapshot_date)
)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna id', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna store_id', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna asset_type', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS asset_type TEXT CHECK (asset_type IN ('business_manager', 'ad_account', 'pixel', 'domain'))$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna asset_id', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS asset_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna asset_name', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS asset_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna health_score', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS health_score INTEGER CHECK (health_score BETWEEN 0 AND 100)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna health_tier', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS health_tier TEXT CHECK (health_tier IN ('critical', 'warning', 'healthy', 'excellent'))$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna risk_level', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna decision', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS decision TEXT CHECK (decision IN ('SAFE_TO_SCALE', 'RESTRICTED_SCALE', 'DO_NOT_SCALE'))$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna metrics', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna recommendations', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna created_at', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 coluna snapshot_date', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ADD COLUMN IF NOT EXISTS snapshot_date DATE DEFAULT CURRENT_DATE$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS unique_daily_asset_health_snapshot ON public.meta_asset_health_snapshots (store_id, asset_type, asset_id, snapshot_date)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_store_type 
  ON public.meta_asset_health_snapshots (store_id, asset_type)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_asset_id 
  ON public.meta_asset_health_snapshots (asset_id)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_date 
  ON public.meta_asset_health_snapshots (snapshot_date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #5', $atm_sql$ALTER TABLE public.meta_asset_health_snapshots ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #6 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_meta_asset_snapshots ON public.meta_asset_health_snapshots$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #6', $atm_sql$CREATE POLICY service_role_all_meta_asset_snapshots
  ON public.meta_asset_health_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('022_create_asset_intelligence_snapshots #7', $atm_sql$COMMENT ON TABLE public.meta_asset_health_snapshots IS 'ATM Meta Asset Intelligence Engine - Histórico diário de saúde e apetite de escala de ativos Meta'$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.meta_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    endpoint TEXT NOT NULL,
    operation TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT 'integration' CHECK (
        context IN ('dashboard', 'integration', 'asset_sync', 'campaign_sync')
    ),
    criticality TEXT NOT NULL DEFAULT 'low' CHECK (
        criticality IN ('low', 'medium', 'high')
    ),
    duration_ms INTEGER NOT NULL,
    cache_status TEXT NOT NULL CHECK (
        cache_status IN ('HIT', 'MISS', 'BYPASS', 'COOLDOWN')
    ),
    graph_calls_count INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER NOT NULL DEFAULT 200,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna id', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna tenant_id', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna user_id', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS user_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna endpoint', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS endpoint TEXT$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna operation', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS operation TEXT$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna context', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS context TEXT DEFAULT 'integration' CHECK ( context IN ('dashboard', 'integration', 'asset_sync', 'campaign_sync') )$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna criticality', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT 'low' CHECK ( criticality IN ('low', 'medium', 'high') )$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna duration_ms', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna cache_status', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS cache_status TEXT CHECK ( cache_status IN ('HIT', 'MISS', 'BYPASS', 'COOLDOWN') )$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna graph_calls_count', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS graph_calls_count INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna status_code', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS status_code INTEGER DEFAULT 200$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna error_message', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS error_message TEXT$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #1 coluna created_at', $atm_sql$ALTER TABLE public.meta_performance_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_perf_tenant_created 
    ON public.meta_performance_logs (tenant_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_perf_endpoint_context 
    ON public.meta_performance_logs (endpoint, context)$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_perf_criticality 
    ON public.meta_performance_logs (criticality) 
    WHERE criticality IN ('medium', 'high')$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_perf_cache_status
    ON public.meta_performance_logs (cache_status)$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #6', $atm_sql$ALTER TABLE public.meta_performance_logs ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_meta_perf ON public.meta_performance_logs$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #7', $atm_sql$CREATE POLICY service_role_all_meta_perf
    ON public.meta_performance_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('023_create_meta_performance_logs #8', $atm_sql$COMMENT ON TABLE public.meta_performance_logs IS 'ATM Meta Performance Observability - Registro assíncrono amostrado de telemetria e gargalos operacionais'$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_profit_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    
    
    spend_original NUMERIC(14, 4) NOT NULL DEFAULT 0,
    currency_original TEXT NOT NULL DEFAULT 'BRL',
    spend_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
    spend_brl NUMERIC(14, 4) NOT NULL DEFAULT 0,
    exchange_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    
    
    revenue_brl NUMERIC(14, 4) NOT NULL DEFAULT 0,
    orders INTEGER NOT NULL DEFAULT 0,
    cpa NUMERIC(14, 4) NOT NULL DEFAULT 0,
    roas NUMERIC(10, 4) NOT NULL DEFAULT 0,
    roi NUMERIC(10, 4) NOT NULL DEFAULT 0,
    profit NUMERIC(14, 4) NOT NULL DEFAULT 0,
    
    
    profit_score INTEGER NOT NULL CHECK (profit_score BETWEEN 0 AND 100),
    tier TEXT NOT NULL CHECK (tier IN ('GREEN', 'YELLOW', 'RED')),
    
    
    recommended_action TEXT NOT NULL CHECK (recommended_action IN ('SCALE', 'MAINTAIN', 'REDUCE', 'PAUSE')),
    recommended_budget_change NUMERIC(5, 2) NOT NULL DEFAULT 0, 
    reason TEXT NOT NULL,
    
    
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT unique_daily_campaign_profit_snapshot UNIQUE (store_id, campaign_id, date)
)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna id', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna date', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna spend_original', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS spend_original NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna currency_original', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS currency_original TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna spend_usd', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS spend_usd NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna spend_brl', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS spend_brl NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna exchange_rate', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 4) DEFAULT 1.0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna revenue_brl', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS revenue_brl NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna orders', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS orders INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna cpa', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS cpa NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna roas', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS roas NUMERIC(10, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna roi', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS roi NUMERIC(10, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna profit', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS profit NUMERIC(14, 4) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna profit_score', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS profit_score INTEGER CHECK (profit_score BETWEEN 0 AND 100)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna tier', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('GREEN', 'YELLOW', 'RED'))$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna recommended_action', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS recommended_action TEXT CHECK (recommended_action IN ('SCALE', 'MAINTAIN', 'REDUCE', 'PAUSE'))$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna recommended_budget_change', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS recommended_budget_change NUMERIC(5, 2) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna reason', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS reason TEXT$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna metrics', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 coluna created_at', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS unique_daily_campaign_profit_snapshot ON public.campaign_profit_snapshots (store_id, campaign_id, date)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_profit_store_date 
    ON public.campaign_profit_snapshots (store_id, date DESC)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_profit_campaign 
    ON public.campaign_profit_snapshots (campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_profit_score 
    ON public.campaign_profit_snapshots (store_id, profit_score DESC)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_profit_action 
    ON public.campaign_profit_snapshots (recommended_action)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #6', $atm_sql$ALTER TABLE public.campaign_profit_snapshots ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_campaign_profit_snapshots ON public.campaign_profit_snapshots$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #7', $atm_sql$CREATE POLICY service_role_all_campaign_profit_snapshots
    ON public.campaign_profit_snapshots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('024_create_campaign_profit_intelligence #8', $atm_sql$COMMENT ON TABLE public.campaign_profit_snapshots IS 'ATM Campaign Profit Intelligence - Normalização cambial e score financeiro contábil diário por campanha'$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_intelligence_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    
    
    action TEXT NOT NULL CHECK (
        action IN ('SCALE_BUDGET_PERCENT', 'REDUCE_BUDGET_PERCENT', 'PAUSE_CAMPAIGN', 'NO_ACTION')
    ),
    budget_change_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    
    asset_permission TEXT NOT NULL DEFAULT 'SAFE' CHECK (
        asset_permission IN ('SAFE', 'RESTRICTED', 'BLOCKED')
    ),
    
    
    confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    data_maturity_score INTEGER NOT NULL CHECK (data_maturity_score IN (40, 70, 100)),
    
    
    reason TEXT NOT NULL,
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    
    recommendation_hash TEXT NOT NULL UNIQUE,
    dedupe_key TEXT,
    
    
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
        status IN ('created', 'pending_review', 'approved', 'rejected', 'executed')
    ),
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna id', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna campaign_name', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS campaign_name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna action', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS action TEXT CHECK ( action IN ('SCALE_BUDGET_PERCENT', 'REDUCE_BUDGET_PERCENT', 'PAUSE_CAMPAIGN', 'NO_ACTION') )$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna budget_change_percent', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS budget_change_percent NUMERIC(5, 2) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna asset_permission', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS asset_permission TEXT DEFAULT 'SAFE' CHECK ( asset_permission IN ('SAFE', 'RESTRICTED', 'BLOCKED') )$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna confidence_score', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna data_maturity_score', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS data_maturity_score INTEGER CHECK (data_maturity_score IN (40, 70, 100))$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna reason', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS reason TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna evidence_json', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS evidence_json JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna recommendation_hash', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS recommendation_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 unique recommendation_hash', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS campaign_intelligence_recommendations_recommendation_hash_key ON public.campaign_intelligence_recommendations (recommendation_hash)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna dedupe_key', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS dedupe_key TEXT$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna status', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review' CHECK ( status IN ('created', 'pending_review', 'approved', 'rejected', 'executed') )$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna requires_approval', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT true$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna created_at', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #1 coluna updated_at', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_store_created 
    ON public.campaign_intelligence_recommendations (store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_campaign 
    ON public.campaign_intelligence_recommendations (campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_status 
    ON public.campaign_intelligence_recommendations (status)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_hash 
    ON public.campaign_intelligence_recommendations (recommendation_hash)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #6', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_camp_rec ON public.campaign_intelligence_recommendations$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #7', $atm_sql$CREATE POLICY service_role_all_camp_rec
    ON public.campaign_intelligence_recommendations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('025_create_campaign_intelligence_recommendations #8', $atm_sql$COMMENT ON TABLE public.campaign_intelligence_recommendations IS 'ATM Campaign Intelligence Bridge - Recomendações assistidas (Copilot Mode) cruzando saúde de ativos e rentabilidade contábil'$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #1', $atm_sql$ALTER TABLE public.campaign_intelligence_recommendations
    ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS simulation_thought TEXT,
    ADD COLUMN IF NOT EXISTS human_explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metrics_before JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metrics_after JSONB,
    ADD COLUMN IF NOT EXISTS confidence_profile TEXT NOT NULL DEFAULT 'BALANCED',
    ADD COLUMN IF NOT EXISTS evaluation_window_hours INTEGER NOT NULL DEFAULT 72,
    ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outcome_result TEXT DEFAULT 'PENDING_EVALUATION' CHECK (
        outcome_result IN ('ACERTO', 'ERRO', 'NEUTRO', 'PENDING_EVALUATION', 'PENDING')
    ),
    ADD COLUMN IF NOT EXISTS outcome_reason_code TEXT,
    ADD COLUMN IF NOT EXISTS outcome_reason TEXT,
    ADD COLUMN IF NOT EXISTS outcome_metrics_delta JSONB$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_simulation 
    ON public.campaign_intelligence_recommendations (is_simulation)$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_outcome 
    ON public.campaign_intelligence_recommendations (outcome_result, evaluated_at)$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_camp_rec_eval_pending 
    ON public.campaign_intelligence_recommendations (store_id, created_at)
    WHERE outcome_result IN ('PENDING_EVALUATION', 'PENDING')$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #5', $atm_sql$COMMENT ON COLUMN public.campaign_intelligence_recommendations.is_simulation IS 'Flag indicando se a recomendação foi gerada em modo simulação (Shadow Mode)'$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #6', $atm_sql$COMMENT ON COLUMN public.campaign_intelligence_recommendations.outcome_result IS 'Desfecho auditado após a janela temporal: ACERTO, ERRO, NEUTRO ou PENDING_EVALUATION'$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #7', $atm_sql$COMMENT ON COLUMN public.campaign_intelligence_recommendations.outcome_reason_code IS 'Código canônico padronizado do desfecho (ex: PROFIT_GROWTH_AFTER_SCALE, SCALE_MARGIN_COLLAPSE, EVALUATION_WINDOW_NOT_ELAPSED)'$atm_sql$);
SELECT pg_temp.atm_exec('026_create_recommendation_audit_outcomes #8', $atm_sql$COMMENT ON COLUMN public.campaign_intelligence_recommendations.confidence_profile IS 'Perfil de ponderação da confiança (BALANCED por padrão nesta fase)'$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.meta_duplication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    source_campaign_id TEXT NOT NULL,
    new_campaign_id TEXT,
    duplication_mode TEXT NOT NULL DEFAULT 'FULL_CLONE' CHECK (
        duplication_mode IN ('FULL_CLONE', 'SIMPLE')
    ),
    source_action TEXT NOT NULL DEFAULT 'MANUAL_DUPLICATE' CHECK (
        source_action IN ('MANUAL_DUPLICATE', 'ATM_RECOMMENDATION', 'AUTOMATED_FLOW')
    ),
    original_adsets INTEGER NOT NULL DEFAULT 0,
    created_adsets INTEGER NOT NULL DEFAULT 0,
    original_ads INTEGER NOT NULL DEFAULT 0,
    created_ads INTEGER NOT NULL DEFAULT 0,
    original_budget NUMERIC(15, 2),
    duplicated_budget NUMERIC(15, 2),
    budget_change_percent NUMERIC(8, 2),
    budget_warning TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')
    ),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna id', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna store_id', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna source_campaign_id', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS source_campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna new_campaign_id', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS new_campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna duplication_mode', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS duplication_mode TEXT DEFAULT 'FULL_CLONE' CHECK ( duplication_mode IN ('FULL_CLONE', 'SIMPLE') )$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna source_action', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS source_action TEXT DEFAULT 'MANUAL_DUPLICATE' CHECK ( source_action IN ('MANUAL_DUPLICATE', 'ATM_RECOMMENDATION', 'AUTOMATED_FLOW') )$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna original_adsets', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS original_adsets INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna created_adsets', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS created_adsets INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna original_ads', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS original_ads INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna created_ads', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS created_ads INTEGER DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna original_budget', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS original_budget NUMERIC(15, 2)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna duplicated_budget', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS duplicated_budget NUMERIC(15, 2)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna budget_change_percent', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS budget_change_percent NUMERIC(8, 2)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna budget_warning', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS budget_warning TEXT$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna status', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING' CHECK ( status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK') )$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna error_message', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS error_message TEXT$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna started_at', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna completed_at', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna duration_ms', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #1 coluna created_at', $atm_sql$ALTER TABLE public.meta_duplication_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_duplication_store_created 
    ON public.meta_duplication_logs (store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_duplication_status 
    ON public.meta_duplication_logs (status)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_meta_duplication_source_action
    ON public.meta_duplication_logs (source_action)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #5', $atm_sql$ALTER TABLE public.meta_duplication_logs ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #6', $atm_sql$DROP POLICY IF EXISTS service_role_all_meta_duplication_logs ON public.meta_duplication_logs$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #7 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_meta_duplication_logs ON public.meta_duplication_logs$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #7', $atm_sql$CREATE POLICY service_role_all_meta_duplication_logs
    ON public.meta_duplication_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('027_create_meta_duplication_logs #8', $atm_sql$COMMENT ON TABLE public.meta_duplication_logs IS 'Auditoria de duplicação hierárquica de campanhas Meta Ads com controle transacional e rollback'$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.campaign_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    source_campaign_id TEXT,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('CAMPAIGN_DUPLICATED', 'DELIVERY_ENABLED', 'CAMPAIGN_PAUSED')
    ),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL_DUPLICATE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata_json JSONB DEFAULT '{}'::jsonb
)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna id', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna store_id', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS store_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna campaign_id', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna source_campaign_id', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS source_campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna event_type', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS event_type TEXT CHECK ( event_type IN ('CAMPAIGN_DUPLICATED', 'DELIVERY_ENABLED', 'CAMPAIGN_PAUSED') )$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna previous_status', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS previous_status TEXT$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna new_status', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS new_status TEXT$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna source', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL_DUPLICATE'$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna created_at', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #1 coluna metadata_json', $atm_sql$ALTER TABLE public.campaign_status_history ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_status_history_store_created 
    ON public.campaign_status_history (store_id, created_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_status_history_campaign 
    ON public.campaign_status_history (campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_status_history_source_campaign 
    ON public.campaign_status_history (source_campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_campaign_status_history_event_type 
    ON public.campaign_status_history (event_type)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #6', $atm_sql$ALTER TABLE public.campaign_status_history ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #7', $atm_sql$DROP POLICY IF EXISTS service_role_all_campaign_status_history ON public.campaign_status_history$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #8 (recria policy)', $atm_sql$DROP POLICY IF EXISTS service_role_all_campaign_status_history ON public.campaign_status_history$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #8', $atm_sql$CREATE POLICY service_role_all_campaign_status_history
    ON public.campaign_status_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)$atm_sql$);
SELECT pg_temp.atm_exec('028_create_campaign_status_history #9', $atm_sql$COMMENT ON TABLE public.campaign_status_history IS 'Histórico de transições de status e ativação de entrega de campanhas Meta Ads com rastreabilidade da campanha de origem'$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1', $atm_sql$CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL,                 
    source TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('trialing', 'active', 'canceled')),
    plan TEXT,
    billing_interval TEXT NOT NULL DEFAULT 'month'
        CHECK (billing_interval IN ('day', 'week', 'month', 'quarter', 'semester', 'year')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),   
    currency TEXT NOT NULL DEFAULT 'BRL',
    mrr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (mrr >= 0),         

    
    customer_email_hash TEXT,
    customer_external_id TEXT,
    track_id TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    campaign_id TEXT,

    trial_started_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,                         
    canceled_at TIMESTAMPTZ,
    last_payment_at TIMESTAMPTZ,
    payments_count INT NOT NULL DEFAULT 0 CHECK (payments_count >= 0),
    total_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,  

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_subscriptions_store_sub UNIQUE (store_id, subscription_id)
)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna store_id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna subscription_id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscription_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna source', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS source TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna status', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'canceled'))$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna plan', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna billing_interval', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'month' CHECK (billing_interval IN ('day', 'week', 'month', 'quarter', 'semester', 'year'))$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna amount', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0 CHECK (amount >= 0)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna currency', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL'$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna mrr', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mrr NUMERIC(12, 2) DEFAULT 0 CHECK (mrr >= 0)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna customer_email_hash', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS customer_email_hash TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna customer_external_id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS customer_external_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna track_id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS track_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna utm_source', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS utm_source TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna utm_medium', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS utm_medium TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna utm_campaign', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS utm_campaign TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna utm_content', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS utm_content TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna utm_term', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS utm_term TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna campaign_id', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS campaign_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna trial_started_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna started_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna canceled_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna last_payment_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna payments_count', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payments_count INT DEFAULT 0 CHECK (payments_count >= 0)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna total_revenue', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(14, 2) DEFAULT 0$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna created_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 coluna updated_at', $atm_sql$ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #1 unique', $atm_sql$CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_store_sub ON public.subscriptions (store_id, subscription_id)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #2', $atm_sql$CREATE INDEX IF NOT EXISTS idx_subscriptions_store_status ON public.subscriptions (store_id, status)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #3', $atm_sql$CREATE INDEX IF NOT EXISTS idx_subscriptions_store_started ON public.subscriptions (store_id, started_at DESC)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #4', $atm_sql$CREATE INDEX IF NOT EXISTS idx_subscriptions_store_canceled ON public.subscriptions (store_id, canceled_at DESC)
    WHERE canceled_at IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #5', $atm_sql$CREATE INDEX IF NOT EXISTS idx_subscriptions_store_campaign ON public.subscriptions (store_id, campaign_id)$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #6', $atm_sql$ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #7', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own subscriptions" ON public.subscriptions$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #8 (recria policy)', $atm_sql$DROP POLICY IF EXISTS "Tenant can view own subscriptions" ON public.subscriptions$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #8', $atm_sql$CREATE POLICY "Tenant can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #9', $atm_sql$DROP TRIGGER IF EXISTS on_subscriptions_updated ON public.subscriptions$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #10 (recria trigger)', $atm_sql$DROP TRIGGER IF EXISTS on_subscriptions_updated ON public.subscriptions$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #10', $atm_sql$CREATE TRIGGER on_subscriptions_updated
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at()$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #11', $atm_sql$ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subscription_id TEXT$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #12', $atm_sql$CREATE INDEX IF NOT EXISTS idx_orders_store_subscription ON public.orders (store_id, subscription_id)
    WHERE subscription_id IS NOT NULL$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #13', $atm_sql$CREATE OR REPLACE FUNCTION public.atm_record_subscription_event(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store UUID := (p->>'store_id')::UUID;
    v_kind TEXT := p->>'kind';
    v_sub TEXT := NULLIF(p->>'subscription_id', '');
    v_charge TEXT := NULLIF(p->>'charge_id', '');
    v_amount NUMERIC := COALESCE(NULLIF(p->>'amount', '')::NUMERIC, 0);
    v_interval TEXT := COALESCE(NULLIF(p->>'interval', ''), 'month');
    v_at TIMESTAMPTZ := COALESCE(NULLIF(p->>'occurred_at', '')::TIMESTAMPTZ, now());
    v_is_charge BOOLEAN := v_kind IN ('subscription_started', 'subscription_renewed');
    v_new_charge BOOLEAN := FALSE;
    v_mrr NUMERIC;
    v_refund_sub TEXT;
    v_refund_value NUMERIC;
BEGIN
    IF v_store IS NULL OR v_kind IS NULL THEN
        RAISE EXCEPTION 'store_id e kind são obrigatórios';
    END IF;

    -- ── Estorno / chargeback: marca o pedido e desconta da assinatura ──
    IF v_kind IN ('refund', 'chargeback') THEN
        UPDATE public.orders
           SET status = 'refunded',
               refunded_at = v_at,
               refund_value = CASE WHEN v_amount > 0 THEN v_amount ELSE value END
         WHERE store_id = v_store AND order_id = v_charge AND status <> 'refunded'
        RETURNING subscription_id, CASE WHEN v_amount > 0 THEN v_amount ELSE value END
             INTO v_refund_sub, v_refund_value;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('order_found', EXISTS (
                SELECT 1 FROM public.orders WHERE store_id = v_store AND order_id = v_charge
            ), 'applied', FALSE);
        END IF;

        IF v_refund_sub IS NOT NULL THEN
            UPDATE public.subscriptions
               SET total_revenue = total_revenue - COALESCE(v_refund_value, 0)
             WHERE store_id = v_store AND subscription_id = v_refund_sub;
        END IF;
        RETURN jsonb_build_object('order_found', TRUE, 'applied', TRUE, 'subscription_id', v_refund_sub);
    END IF;

    IF v_sub IS NULL THEN
        RAISE EXCEPTION 'subscription_id é obrigatório para %', v_kind;
    END IF;
    IF v_interval NOT IN ('day', 'week', 'month', 'quarter', 'semester', 'year') THEN
        v_interval := 'month';
    END IF;

    v_mrr := ROUND(CASE v_interval
        WHEN 'day' THEN v_amount * 365 / 12
        WHEN 'week' THEN v_amount * 52 / 12
        WHEN 'quarter' THEN v_amount / 3
        WHEN 'semester' THEN v_amount / 6
        WHEN 'year' THEN v_amount / 12
        ELSE v_amount END, 2);

    -- ── Cobrança: grava o pedido (idempotente pelo ID da cobrança) ──
    IF v_is_charge THEN
        IF v_charge IS NULL THEN
            RAISE EXCEPTION 'charge_id é obrigatório para %', v_kind;
        END IF;
        INSERT INTO public.orders AS o (
            store_id, order_id, subscription_id, track_id, customer_email_hash, customer_external_id,
            value, currency, payment_method, status, order_paid_at
        ) VALUES (
            v_store, v_charge, v_sub, NULLIF(p->>'track_id', ''), NULLIF(p->>'email_hash', ''),
            NULLIF(p->>'external_id', ''), v_amount, COALESCE(NULLIF(p->>'currency', ''), 'BRL'),
            NULLIF(p->>'payment_method', ''), 'paid', v_at
        )
        ON CONFLICT (store_id, order_id) DO UPDATE
            SET status = 'paid',
                order_paid_at = EXCLUDED.order_paid_at,
                value = EXCLUDED.value,
                subscription_id = EXCLUDED.subscription_id
          WHERE o.status IN ('created', 'pix_pending', 'cancelled');
        v_new_charge := FOUND;
    END IF;

    INSERT INTO public.subscriptions AS s (
        store_id, subscription_id, source, status, plan, billing_interval, amount, currency, mrr,
        customer_email_hash, customer_external_id, track_id,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id,
        trial_started_at, started_at, canceled_at, last_payment_at, payments_count, total_revenue
    ) VALUES (
        v_store, v_sub, NULLIF(p->>'source', ''),
        CASE v_kind WHEN 'trial_started' THEN 'trialing' WHEN 'subscription_canceled' THEN 'canceled' ELSE 'active' END,
        NULLIF(p->>'plan', ''), v_interval,
        CASE WHEN v_is_charge THEN v_amount ELSE 0 END,
        COALESCE(NULLIF(p->>'currency', ''), 'BRL'),
        CASE WHEN v_is_charge THEN v_mrr ELSE 0 END,
        NULLIF(p->>'email_hash', ''), NULLIF(p->>'external_id', ''), NULLIF(p->>'track_id', ''),
        NULLIF(p->>'utm_source', ''), NULLIF(p->>'utm_medium', ''), NULLIF(p->>'utm_campaign', ''),
        NULLIF(p->>'utm_content', ''), NULLIF(p->>'utm_term', ''), NULLIF(p->>'campaign_id', ''),
        CASE WHEN v_kind = 'trial_started' THEN v_at END,
        CASE WHEN v_is_charge THEN v_at END,
        CASE WHEN v_kind = 'subscription_canceled' THEN v_at END,
        CASE WHEN v_new_charge THEN v_at END,
        CASE WHEN v_new_charge THEN 1 ELSE 0 END,
        CASE WHEN v_new_charge THEN v_amount ELSE 0 END
    )
    ON CONFLICT (store_id, subscription_id) DO UPDATE SET
        status = CASE
            WHEN v_kind = 'subscription_canceled' THEN 'canceled'
            WHEN v_is_charge THEN 'active'
            ELSE s.status END,
        canceled_at = CASE
            WHEN v_kind = 'subscription_canceled' THEN COALESCE(s.canceled_at, v_at)
            WHEN v_is_charge THEN NULL
            ELSE s.canceled_at END,
        trial_started_at = COALESCE(s.trial_started_at, EXCLUDED.trial_started_at),
        started_at = LEAST(s.started_at, EXCLUDED.started_at),
        last_payment_at = GREATEST(s.last_payment_at, EXCLUDED.last_payment_at),
        payments_count = s.payments_count + EXCLUDED.payments_count,
        total_revenue = s.total_revenue + EXCLUDED.total_revenue,
        amount = CASE WHEN v_is_charge AND v_amount > 0 THEN v_amount ELSE s.amount END,
        mrr = CASE WHEN v_is_charge AND v_amount > 0 THEN v_mrr ELSE s.mrr END,
        billing_interval = CASE WHEN v_is_charge THEN EXCLUDED.billing_interval ELSE s.billing_interval END,
        plan = COALESCE(EXCLUDED.plan, s.plan),
        currency = CASE WHEN v_is_charge THEN EXCLUDED.currency ELSE s.currency END,
        source = COALESCE(s.source, EXCLUDED.source),
        -- Atribuição: o primeiro toque fica; só preenche o que estava vazio
        customer_email_hash = COALESCE(s.customer_email_hash, EXCLUDED.customer_email_hash),
        customer_external_id = COALESCE(s.customer_external_id, EXCLUDED.customer_external_id),
        track_id = COALESCE(s.track_id, EXCLUDED.track_id),
        utm_source = COALESCE(s.utm_source, EXCLUDED.utm_source),
        utm_medium = COALESCE(s.utm_medium, EXCLUDED.utm_medium),
        utm_campaign = COALESCE(s.utm_campaign, EXCLUDED.utm_campaign),
        utm_content = COALESCE(s.utm_content, EXCLUDED.utm_content),
        utm_term = COALESCE(s.utm_term, EXCLUDED.utm_term),
        campaign_id = COALESCE(s.campaign_id, EXCLUDED.campaign_id);

    RETURN jsonb_build_object('applied', TRUE, 'new_charge', v_new_charge, 'mrr', v_mrr);
END;
$$$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #14', $atm_sql$REVOKE ALL ON FUNCTION public.atm_record_subscription_event(JSONB) FROM PUBLIC$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #15', $atm_sql$REVOKE ALL ON FUNCTION public.atm_record_subscription_event(JSONB) FROM anon, authenticated$atm_sql$);
SELECT pg_temp.atm_exec('029_create_subscriptions #16', $atm_sql$GRANT EXECUTE ON FUNCTION public.atm_record_subscription_event(JSONB) TO service_role$atm_sql$);
SELECT pg_temp.atm_exec('030_add_project_type #1', $atm_sql$ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'ecommerce'$atm_sql$);
SELECT pg_temp.atm_exec('030_add_project_type #2', $atm_sql$DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stores_project_type_check' AND conrelid = 'public.stores'::regclass
    ) THEN
        ALTER TABLE public.stores
            ADD CONSTRAINT stores_project_type_check
            CHECK (project_type IN ('ecommerce', 'infoproduct', 'app'));
    END IF;
END $$$atm_sql$);
SELECT pg_temp.atm_exec('030_add_project_type #3', $atm_sql$ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_platform_check$atm_sql$);
SELECT pg_temp.atm_exec('030_add_project_type #4', $atm_sql$ALTER TABLE public.stores
    ADD CONSTRAINT stores_platform_check
    CHECK (platform IN ('shopify', 'woocommerce', 'yampi', 'cartpanda', 'custom'))$atm_sql$);
SELECT pg_temp.atm_exec('030_add_project_type #5', $atm_sql$COMMENT ON COLUMN public.stores.project_type IS
    'ecommerce = loja (Shopify/drop); infoproduct = infoproduto com página própria; app = web app com assinatura'$atm_sql$);
SELECT pg_temp.atm_exec('031_info_cost_rules #1', $atm_sql$ALTER TABLE public.taxes_and_duties DROP CONSTRAINT IF EXISTS taxes_and_duties_type_check$atm_sql$);
SELECT pg_temp.atm_exec('031_info_cost_rules #2', $atm_sql$ALTER TABLE public.taxes_and_duties
    ADD CONSTRAINT taxes_and_duties_type_check
    CHECK (type IN ('tax', 'duty', 'affiliate', 'coproduction'))$atm_sql$);
SELECT pg_temp.atm_exec('031_info_cost_rules #3', $atm_sql$ALTER TABLE public.taxes_and_duties DROP CONSTRAINT IF EXISTS taxes_and_duties_value_check$atm_sql$);
SELECT pg_temp.atm_exec('031_info_cost_rules #4', $atm_sql$ALTER TABLE public.taxes_and_duties
    ADD CONSTRAINT taxes_and_duties_value_check
    CHECK (value >= 0 AND (value_type <> 'percentage' OR value <= 100)) NOT VALID$atm_sql$);
SELECT pg_temp.atm_exec('032_reconcile_store_columns #1', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS name TEXT$atm_sql$);
SELECT pg_temp.atm_exec('032_reconcile_store_columns #2', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb$atm_sql$);
SELECT pg_temp.atm_exec('032_reconcile_store_columns #3', $atm_sql$ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_api_key TEXT$atm_sql$);
SELECT pg_temp.atm_exec('032_reconcile_store_columns #4', $atm_sql$INSERT INTO public.tenants (id, name, email)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.email
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT DO NOTHING$atm_sql$);

-- Colunas antigas NOT NULL que o código não conhece passam a aceitar vazio (senão os INSERT falham).
DO $relax$
DECLARE r RECORD;
BEGIN
  FOR r IN
    WITH esperado(tabela, colunas) AS (VALUES
  ('tenants', ARRAY['id', 'name', 'email', 'plan', 'status', 'settings', 'created_at', 'updated_at']),
  ('stores', ARRAY['id', 'tenant_id', 'platform', 'shop_domain', 'custom_domains', 'checkout_domain', 'shopify_access_token_enc', 'shopify_scope', 'webhook_secret', 'status', 'installed_at', 'created_at', 'updated_at', 'shopify_api_key_enc', 'shopify_api_secret_enc', 'mercadopago_token_enc', 'pushcut_url', 'pushcut_notify_approved', 'pushcut_notify_pending', 'telegram_bot_token', 'telegram_chat_id', 'telegram_notify_approved', 'telegram_notify_pending', 'project_type', 'name', 'settings', 'shopify_api_key']),
  ('integrations', ARRAY['id', 'store_id', 'platform', 'pixel_id', 'access_token_enc', 'api_version', 'status', 'config', 'last_health_check', 'last_error', 'created_at', 'updated_at']),
  ('sessions', ARRAY['id', 'store_id', 'track_id', 'fbp', 'fbc', 'fbclid', 'client_ip', 'client_user_agent', 'landing_page', 'event_source_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'enrichment_count', 'created_at', 'updated_at', 'expires_at']),
  ('orders', ARRAY['id', 'store_id', 'order_id', 'session_id', 'track_id', 'customer_email_hash', 'customer_phone_hash', 'customer_external_id', 'customer_first_name_hash', 'customer_last_name_hash', 'value', 'currency', 'products', 'address', 'payment_method', 'status', 'order_created_at', 'order_paid_at', 'refunded_at', 'refund_value', 'created_at', 'subscription_id']),
  ('events', ARRAY['id', 'store_id', 'integration_id', 'order_id', 'event_name', 'event_id', 'source', 'status', 'payload_hash', 'user_data_keys', 'health_score', 'meta_response', 'latency_ms', 'attempt_count', 'created_at', 'sent_at']),
  ('event_attempts', ARRAY['id', 'event_id', 'attempt', 'status_code', 'response', 'latency_ms', 'error', 'created_at']),
  ('diagnostics', ARRAY['id', 'store_id', 'type', 'severity', 'entity_type', 'entity_id', 'title', 'description', 'evidence', 'state', 'resolved_at', 'created_at']),
  ('campaign_costs', ARRAY['id', 'store_id', 'integration_id', 'date', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'reach', 'cpm', 'cpc', 'ctr', 'currency', 'synced_at']),
  ('product_costs', ARRAY['id', 'store_id', 'shopify_product_id', 'shopify_variant_id', 'product_name', 'variant_name', 'cost_price', 'currency', 'created_at', 'updated_at']),
  ('taxes_and_duties', ARRAY['id', 'store_id', 'name', 'type', 'calculation_rule', 'payment_method', 'value_type', 'value', 'created_at', 'updated_at']),
  ('ad_account_health', ARRAY['id', 'store_id', 'ad_account_id', 'ad_account_name', 'account_status', 'trust_score', 'compliance_score', 'billing_score', 'feedback_score', 'emq_score', 'active_ads_count', 'disapproved_ads_count', 'spend_cap_limit', 'currency', 'risks_detected', 'recommendations', 'last_analyzed_at', 'created_at']),
  ('notifications', ARRAY['id', 'store_id', 'order_id', 'type', 'title', 'body', 'value', 'currency', 'payment_method', 'customer_name', 'items_summary', 'read', 'metadata', 'created_at']),
  ('meta_entity_history', ARRAY['id', 'store_id', 'user_id', 'user_email', 'source', 'action', 'entity_id', 'entity_type', 'entity_name', 'previous_budget', 'new_budget', 'old_value', 'new_value', 'sales_at_update', 'revenue_at_update', 'spend_at_update', 'profit_at_update', 'roas_at_update', 'cpa_at_update', 'metadata', 'created_at']),
  ('visitor_identities', ARRAY['id', 'store_id', 'identity_cluster_id', 'track_id', 'fbp', 'fbc', 'email_hash', 'phone_hash', 'raw_email', 'raw_phone', 'first_name', 'last_name', 'city', 'state', 'zip', 'country', 'external_id', 'identity_source', 'confidence_score', 'merged_into', 'created_at', 'updated_at', 'last_seen_at']),
  ('attribution_recovery_log', ARRAY['id', 'store_id', 'order_id', 'identity_cluster_id', 'campaign_id', 'adset_id', 'ad_id', 'source', 'confidence_score', 'evidence', 'created_at']),
  ('revenue_ledger', ARRAY['id', 'store_id', 'order_id', 'event_id', 'visitor_identity_id', 'order_value', 'currency', 'payment_method', 'attribution_model', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'source', 'attribution_weight', 'attributed_revenue', 'confidence_score', 'attribution_method', 'is_recovered', 'is_assisted', 'touchpoint_index', 'total_touchpoints', 'evidence', 'order_paid_at', 'created_at', 'updated_at']),
  ('campaign_intelligence_alerts', ARRAY['id', 'store_id', 'campaign_id', 'campaign_name', 'alert_type', 'severity', 'title', 'description', 'suggested_action', 'metrics', 'status', 'created_at', 'resolved_at']),
  ('campaign_automation_settings', ARRAY['id', 'store_id', 'automation_enabled', 'autopilot_enabled', 'kill_switch', 'max_daily_budget_change', 'max_budget_increase_percent', 'max_budget_decrease_percent', 'cooldown_hours', 'created_at', 'updated_at']),
  ('campaign_actions', ARRAY['id', 'store_id', 'alert_id', 'campaign_id', 'campaign_name', 'adset_id', 'ad_id', 'action_type', 'execution_mode', 'autopilot_enabled', 'status', 'previous_value', 'target_value', 'applied_value', 'previous_snapshot', 'target_snapshot', 'idempotency_key', 'reason', 'error_message', 'meta_response', 'approved_by', 'approved_at', 'executed_at', 'rolled_back_at', 'created_at', 'updated_at']),
  ('campaign_cost_snapshots', ARRAY['id', 'store_id', 'ad_account_id', 'campaign_id', 'campaign_name', 'objective', 'date', 'spend', 'currency', 'exchange_rate', 'spend_brl', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr', 'raw_insights', 'sync_source', 'sync_status', 'fetched_at', 'updated_at']),
  ('meta_asset_health_snapshots', ARRAY['id', 'store_id', 'asset_type', 'asset_id', 'asset_name', 'health_score', 'health_tier', 'risk_level', 'decision', 'metrics', 'recommendations', 'created_at', 'snapshot_date']),
  ('meta_performance_logs', ARRAY['id', 'tenant_id', 'user_id', 'endpoint', 'operation', 'context', 'criticality', 'duration_ms', 'cache_status', 'graph_calls_count', 'status_code', 'error_message', 'created_at']),
  ('campaign_profit_snapshots', ARRAY['id', 'store_id', 'campaign_id', 'campaign_name', 'date', 'spend_original', 'currency_original', 'spend_usd', 'spend_brl', 'exchange_rate', 'revenue_brl', 'orders', 'cpa', 'roas', 'roi', 'profit', 'profit_score', 'tier', 'recommended_action', 'recommended_budget_change', 'reason', 'metrics', 'created_at']),
  ('campaign_intelligence_recommendations', ARRAY['id', 'store_id', 'campaign_id', 'campaign_name', 'action', 'budget_change_percent', 'asset_permission', 'confidence_score', 'data_maturity_score', 'reason', 'evidence_json', 'recommendation_hash', 'dedupe_key', 'status', 'requires_approval', 'created_at', 'updated_at', 'is_simulation', 'simulation_thought', 'human_explanation', 'metrics_before', 'metrics_after', 'confidence_profile', 'evaluation_window_hours', 'evaluated_at', 'outcome_result', 'outcome_reason_code', 'outcome_reason', 'outcome_metrics_delta']),
  ('meta_duplication_logs', ARRAY['id', 'store_id', 'source_campaign_id', 'new_campaign_id', 'duplication_mode', 'source_action', 'original_adsets', 'created_adsets', 'original_ads', 'created_ads', 'original_budget', 'duplicated_budget', 'budget_change_percent', 'budget_warning', 'status', 'error_message', 'started_at', 'completed_at', 'duration_ms', 'created_at']),
  ('campaign_status_history', ARRAY['id', 'store_id', 'campaign_id', 'source_campaign_id', 'event_type', 'previous_status', 'new_status', 'source', 'created_at', 'metadata_json']),
  ('subscriptions', ARRAY['id', 'store_id', 'subscription_id', 'source', 'status', 'plan', 'billing_interval', 'amount', 'currency', 'mrr', 'customer_email_hash', 'customer_external_id', 'track_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_id', 'trial_started_at', 'started_at', 'canceled_at', 'last_payment_at', 'payments_count', 'total_revenue', 'created_at', 'updated_at'])
    )
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN esperado e ON e.tabela = c.table_name
    WHERE c.table_schema = 'public'
      AND c.is_nullable = 'NO'
      AND c.column_default IS NULL
      AND NOT (c.column_name = ANY (e.colunas))
  LOOP
    PERFORM pg_temp.atm_exec('coluna antiga ' || r.table_name || '.' || r.column_name,
      format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name));
  END LOOP;
END
$relax$;

-- A API do Supabase passa a enxergar as tabelas e colunas novas na hora.
NOTIFY pgrst, 'reload schema';

SELECT passo, erro, comando FROM atm_setup_falhas
UNION ALL
SELECT 'tudo certo', 'nenhuma falha', NULL WHERE NOT EXISTS (SELECT 1 FROM atm_setup_falhas);
