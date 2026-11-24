-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 032: colunas que o código usa e que nenhuma migration criava
-- ========================================
-- stores.name, stores.settings e stores.shopify_api_key foram criadas à mão no banco antigo.
-- O código lê as três (StoreContext, notificações, sincronização da Shopify).
-- Também cria a linha em tenants para usuários que se cadastraram antes da tabela existir:
-- sem ela, cadastrar uma loja falha (stores.tenant_id aponta para tenants).
-- Pode rodar mais de uma vez.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
-- Legado: token da Shopify em texto, só lido como reserva. O certo é shopify_access_token_enc.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shopify_api_key TEXT;

INSERT INTO public.tenants (id, name, email)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.email
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT DO NOTHING;
