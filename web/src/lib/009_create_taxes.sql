-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 009: Create taxes and duties tables
-- ========================================

CREATE TABLE IF NOT EXISTS public.taxes_and_duties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('tax', 'duty')), -- 'tax' para impostos, 'duty' para taxas adicionais
    calculation_rule TEXT NOT NULL
        CHECK (calculation_rule IN ('revenue_value', 'commission_value')), -- valor de faturamento vs comissão
    payment_method TEXT NOT NULL DEFAULT 'all'
        CHECK (payment_method IN ('all', 'credit_card', 'pix', 'boleto', 'other')),
    value_type TEXT NOT NULL DEFAULT 'percentage'
        CHECK (value_type IN ('percentage', 'fixed')),
    value DECIMAL(10,4) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS via store ownership
ALTER TABLE public.taxes_and_duties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can manage own taxes and duties"
    ON public.taxes_and_duties FOR ALL
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

-- Indexes
CREATE INDEX idx_taxes_store ON public.taxes_and_duties(store_id, type);
