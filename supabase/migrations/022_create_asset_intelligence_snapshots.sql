-- =================================================================
-- MIGRATION 022: Meta Asset Intelligence Snapshots (Fase 9.1)
-- =================================================================
-- Tabela para historizar e auditar a saúde de ativos Meta Ads
-- (Ad Accounts, BMs, Pixels, Domínios) com cálculo autônomo de risco e escala.

CREATE TABLE IF NOT EXISTS public.meta_asset_health_snapshots (
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
);

-- Índices de alta performance para consultas por loja e tipo de ativo
CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_store_type 
  ON public.meta_asset_health_snapshots (store_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_asset_id 
  ON public.meta_asset_health_snapshots (asset_id);

CREATE INDEX IF NOT EXISTS idx_meta_asset_snapshots_date 
  ON public.meta_asset_health_snapshots (snapshot_date DESC);

-- Habilita RLS para segurança multi-tenant
ALTER TABLE public.meta_asset_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Política RLS: Acesso total apenas via service_role ou loja do tenant
CREATE POLICY service_role_all_meta_asset_snapshots
  ON public.meta_asset_health_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.meta_asset_health_snapshots IS 'ATM Meta Asset Intelligence Engine - Histórico diário de saúde e apetite de escala de ativos Meta';
