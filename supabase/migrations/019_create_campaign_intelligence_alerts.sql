-- =============================================================================
-- Migration 019: Criação da Tabela de Alertas de Inteligência de Campanhas
-- Projeto: ATM - Advanced Tracking Manager ADS
-- Fase 6: Attribution Intelligence Alerts Engine
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_intelligence_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,

    -- Tipo de Alerta
    alert_type TEXT NOT NULL CHECK (
        alert_type IN (
            'UNDER_REPORTED_CAMPAIGN',
            'READY_TO_SCALE',
            'CAMPAIGN_DECAY',
            'CREATIVE_FATIGUE'
        )
    ),

    -- Severidade Contábil/Operacional
    severity TEXT NOT NULL CHECK (
        severity IN ('info', 'warning', 'critical')
    ),

    -- Conteúdo do Alerta e Orientação Estratégica
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_action TEXT NOT NULL,

    -- Snapshot das Métricas no Momento da Detecção
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Ciclo de Vida do Alerta
    status TEXT NOT NULL DEFAULT 'new' CHECK (
        status IN ('new', 'acknowledged', 'dismissed', 'resolved')
    ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,

    -- Restrição de Unicidade / Anti-Flood:
    -- Evita duplicar alertas idênticos não resolvidos para a mesma campanha
    CONSTRAINT uq_campaign_alert_active 
    UNIQUE (store_id, campaign_id, alert_type, status)
);

-- =============================================================================
-- Índices de Alta Performance para Consulta e Agrupamento
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_alerts_store_status 
    ON public.campaign_intelligence_alerts(store_id, status);

CREATE INDEX IF NOT EXISTS idx_alerts_campaign 
    ON public.campaign_intelligence_alerts(store_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at 
    ON public.campaign_intelligence_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_type_severity 
    ON public.campaign_intelligence_alerts(store_id, alert_type, severity);

-- =============================================================================
-- Segurança e Isolamento Multi-Tenant (RLS)
-- =============================================================================

ALTER TABLE public.campaign_intelligence_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: Apenas leitura segura pelo tenant proprietário da loja
CREATE POLICY "Tenants can view their store alerts"
    ON public.campaign_intelligence_alerts
    FOR SELECT
    USING (
        store_id IN (
            SELECT id FROM public.stores WHERE tenant_id = auth.uid()
        )
    );

-- Service Role tem acesso irrestrito para inserção, cálculo e atualização
CREATE POLICY "Service role full access to alerts"
    ON public.campaign_intelligence_alerts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.campaign_intelligence_alerts IS 'Registro de oportunidades de escala, desvios de atribuição e alertas operacionais detectados pelo ATM Intelligence Engine';
