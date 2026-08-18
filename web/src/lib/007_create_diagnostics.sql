-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 007: Create diagnostics table
-- ========================================

CREATE TABLE IF NOT EXISTS public.diagnostics (
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
);

-- RLS via store ownership
ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own diagnostics"
    ON public.diagnostics FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Tenant can update own diagnostics"
    ON public.diagnostics FOR UPDATE
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_diagnostics_store ON public.diagnostics(store_id, state, created_at DESC);
CREATE INDEX idx_diagnostics_type ON public.diagnostics(type, severity);
