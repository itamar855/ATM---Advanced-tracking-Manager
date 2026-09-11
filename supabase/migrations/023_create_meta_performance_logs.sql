-- =================================================================
-- MIGRATION 023: Meta Performance Observability Layer (Fase 9.5)
-- =================================================================
-- Tabela para registrar telemetria operacional, latências de endpoints,
-- consumo da Graph API da Meta, rate limiting e eventos de cooldown.

CREATE TABLE IF NOT EXISTS public.meta_performance_logs (
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
);

-- Índices otimizados para agregação de telemetria por loja, período e endpoint
CREATE INDEX IF NOT EXISTS idx_meta_perf_tenant_created 
    ON public.meta_performance_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_perf_endpoint_context 
    ON public.meta_performance_logs (endpoint, context);

CREATE INDEX IF NOT EXISTS idx_meta_perf_criticality 
    ON public.meta_performance_logs (criticality) 
    WHERE criticality IN ('medium', 'high');

CREATE INDEX IF NOT EXISTS idx_meta_perf_cache_status
    ON public.meta_performance_logs (cache_status);

-- Habilita Row Level Security para blindagem multi-tenant
ALTER TABLE public.meta_performance_logs ENABLE ROW LEVEL SECURITY;

-- Política: Service role possui acesso total para gravação assíncrona
CREATE POLICY service_role_all_meta_perf
    ON public.meta_performance_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.meta_performance_logs IS 'ATM Meta Performance Observability - Registro assíncrono amostrado de telemetria e gargalos operacionais';
