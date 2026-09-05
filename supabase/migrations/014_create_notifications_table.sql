-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 014: Create notifications table and enable Realtime
-- ========================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
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
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_store_created ON public.notifications(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_store_unread ON public.notifications(store_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_order ON public.notifications(order_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies for Authenticated Users (via store ownership)
CREATE POLICY "Users can view notifications for their stores"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

CREATE POLICY "Users can update notifications for their stores"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Enable Supabase Realtime publication for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
