-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 006: Create events and event_attempts tables
-- ========================================

CREATE TABLE IF NOT EXISTS public.events (
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
);

CREATE TABLE IF NOT EXISTS public.event_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    status_code INT,
    response JSONB,
    latency_ms INT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS via store ownership
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own events"
    ON public.events FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Tenant can view own event attempts"
    ON public.event_attempts FOR SELECT
    USING (event_id IN (
        SELECT id FROM public.events
        WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid())
    ));

-- Indexes
CREATE INDEX idx_events_store_name ON public.events(store_id, event_name, created_at DESC);
CREATE INDEX idx_events_order ON public.events(order_id);
CREATE INDEX idx_events_status ON public.events(status, created_at);
CREATE INDEX idx_events_store_date ON public.events(store_id, created_at DESC);
CREATE INDEX idx_event_attempts_event ON public.event_attempts(event_id, attempt);
