-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 004: Create sessions table
-- ========================================

CREATE TABLE IF NOT EXISTS public.sessions (
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
);

-- RLS via store ownership
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own sessions"
    ON public.sessions FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_sessions_store_track ON public.sessions(store_id, track_id);
CREATE INDEX idx_sessions_expires ON public.sessions(expires_at);
CREATE INDEX idx_sessions_created ON public.sessions(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER on_sessions_updated
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
