-- =============================================================================
-- Migration 029: Assinaturas (web apps / SaaS)
-- Projeto: ATM - Advanced Tracking Manager ADS
-- =============================================================================
-- Uma linha por assinatura (por loja), com a campanha que trouxe o assinante.
-- Cada cobrança (1ª e renovações) é um pedido em public.orders com subscription_id.
-- A função atm_record_subscription_event aplica cada evento de forma atômica e
-- idempotente: a mesma cobrança enviada duas vezes não soma duas vezes.

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL,                 -- ID na origem (gateway / web app)
    source TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('trialing', 'active', 'canceled')),
    plan TEXT,
    billing_interval TEXT NOT NULL DEFAULT 'month'
        CHECK (billing_interval IN ('day', 'week', 'month', 'quarter', 'semester', 'year')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),   -- valor por ciclo
    currency TEXT NOT NULL DEFAULT 'BRL',
    mrr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (mrr >= 0),         -- valor mensal equivalente

    -- Quem é e de onde veio (primeiro toque fica gravado)
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
    started_at TIMESTAMPTZ,                         -- 1ª cobrança paga
    canceled_at TIMESTAMPTZ,
    last_payment_at TIMESTAMPTZ,
    payments_count INT NOT NULL DEFAULT 0 CHECK (payments_count >= 0),
    total_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- receita realizada (LTV) líquida de estornos

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_subscriptions_store_sub UNIQUE (store_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_store_status ON public.subscriptions (store_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_started ON public.subscriptions (store_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_canceled ON public.subscriptions (store_id, canceled_at DESC)
    WHERE canceled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_campaign ON public.subscriptions (store_id, campaign_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Tenant can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (store_id IN (SELECT id FROM public.stores WHERE tenant_id = auth.uid()));

DROP TRIGGER IF EXISTS on_subscriptions_updated ON public.subscriptions;
CREATE TRIGGER on_subscriptions_updated
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Cada cobrança de assinatura é um pedido: liga o pedido à assinatura
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subscription_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_store_subscription ON public.orders (store_id, subscription_id)
    WHERE subscription_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- atm_record_subscription_event(p jsonb) → jsonb
--   p.kind: trial_started | subscription_started | subscription_renewed |
--           subscription_canceled | refund | chargeback
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atm_record_subscription_event(p JSONB)
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
$$;

-- A função grava dados de qualquer loja: só o servidor (service_role) pode chamar
REVOKE ALL ON FUNCTION public.atm_record_subscription_event(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atm_record_subscription_event(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atm_record_subscription_event(JSONB) TO service_role;
