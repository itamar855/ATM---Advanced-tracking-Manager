-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 030: tipo de projeto (loja, infoproduto ou web app)
-- ========================================
-- Cada "loja" passa a ser um projeto com tipo. O tipo muda o cadastro,
-- o menu e as telas do painel. Lojas que já existem ficam como 'ecommerce'.
-- Pode rodar mais de uma vez.

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'ecommerce';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stores_project_type_check' AND conrelid = 'public.stores'::regclass
    ) THEN
        ALTER TABLE public.stores
            ADD CONSTRAINT stores_project_type_check
            CHECK (project_type IN ('ecommerce', 'infoproduct', 'app'));
    END IF;
END $$;

-- Página própria (infoproduto / web app) não é Shopify, WooCommerce, Yampi nem Cartpanda.
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_platform_check;
ALTER TABLE public.stores
    ADD CONSTRAINT stores_platform_check
    CHECK (platform IN ('shopify', 'woocommerce', 'yampi', 'cartpanda', 'custom'));

COMMENT ON COLUMN public.stores.project_type IS
    'ecommerce = loja (Shopify/drop); infoproduct = infoproduto com página própria; app = web app com assinatura';
