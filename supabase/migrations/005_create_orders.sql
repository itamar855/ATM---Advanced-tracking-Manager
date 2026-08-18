-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 005: Create orders table
-- ========================================

CREATE TABLE IF NOT EXISTS public.orders (
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
);

-- RLS via store ownership
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own orders"
    ON public.orders FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_orders_store_order ON public.orders(store_id, order_id);
CREATE INDEX idx_orders_store_date ON public.orders(store_id, order_paid_at DESC);
CREATE INDEX idx_orders_session ON public.orders(session_id);
CREATE INDEX idx_orders_track ON public.orders(store_id, track_id);
