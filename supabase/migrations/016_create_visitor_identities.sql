-- =============================================================================
-- Migration 016: Criação da Tabela de Costura de Identidade (visitor_identities)
-- Projeto: ATM - Tracking Manager
-- Objetivo: Grafo de identidade unificado por loja para o Identity Stitcher
-- =============================================================================

-- 1. Criação da Tabela Principal
CREATE TABLE IF NOT EXISTS public.visitor_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,

    -- Cluster de fusão multi-dispositivo / multi-sessão
    identity_cluster_id UUID DEFAULT gen_random_uuid(),

    -- Identificador técnico de sessão/navegador (pode ser nulo em eventos server-side)
    track_id TEXT,

    -- Cookies de primeiro clique e pixel da Meta
    fbp TEXT,
    fbc TEXT,

    -- Hashes oficiais canônicos para Meta CAPI (SHA-256)
    email_hash TEXT,
    phone_hash TEXT,

    -- Dados legíveis sanitizados para painel administrativo / suporte ao cliente
    raw_email TEXT,
    raw_phone TEXT,

    -- Dados cadastrais
    first_name TEXT,
    last_name TEXT,

    -- Endereço e geolocalização
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT DEFAULT 'BR',

    -- ID de cliente no e-commerce / CRM / checkout externo
    external_id TEXT,

    -- Origem do registro de identidade ('browser' | 'checkout' | 'webhook' | 'stitcher')
    identity_source TEXT DEFAULT 'browser',

    -- Pontuação de qualidade/confiança (0: Anônimo, 50: Lead/Formulário, 100: Compra faturada)
    confidence_score INT DEFAULT 0,

    -- Ponteiro para fusão de identidades (quando este perfil for mesclado a outro mais completo)
    merged_into UUID REFERENCES public.visitor_identities(id) ON DELETE SET NULL,

    -- Metadados temporais
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),

    -- Restrição de unicidade: 1 registro por track_id dentro da mesma loja
    CONSTRAINT uq_identity_store_track UNIQUE (store_id, track_id)
);

-- =============================================================================
-- 2. Índices Parciais de Alta Performance (Supabase Postgres Best Practices)
-- Filtram linhas não-nulas para evitar inchaço de disco e economizar RAM/IOPS
-- =============================================================================

-- Busca rápida de visitante pelo cookie _fbp
CREATE INDEX IF NOT EXISTS idx_identity_fbp 
ON public.visitor_identities (store_id, fbp) 
WHERE fbp IS NOT NULL;

-- Busca rápida de visitante pelo hash do e-mail
CREATE INDEX IF NOT EXISTS idx_identity_email 
ON public.visitor_identities (store_id, email_hash) 
WHERE email_hash IS NOT NULL;

-- Busca rápida de visitante pelo hash do telefone
CREATE INDEX IF NOT EXISTS idx_identity_phone 
ON public.visitor_identities (store_id, phone_hash) 
WHERE phone_hash IS NOT NULL;

-- Busca rápida de visitante pelo identificador externo (customer_id do lojista)
CREATE INDEX IF NOT EXISTS idx_identity_external 
ON public.visitor_identities (store_id, external_id) 
WHERE external_id IS NOT NULL;

-- Busca e agrupamento de sessões do mesmo cluster de identidade
CREATE INDEX IF NOT EXISTS idx_identity_cluster 
ON public.visitor_identities (store_id, identity_cluster_id) 
WHERE identity_cluster_id IS NOT NULL;

-- =============================================================================
-- 3. Blindagem de Segurança (Row Level Security - RLS)
-- Isolamento absoluto: proíbe acesso público/anônimo e restringe ao backend
-- =============================================================================

-- Habilita proteção RLS
ALTER TABLE public.visitor_identities ENABLE ROW LEVEL SECURITY;

-- Revoga quaisquer permissões das chaves públicas (anon / authenticated)
REVOKE ALL ON public.visitor_identities FROM anon, authenticated;

-- Concede privilégios totais exclusivamente para o backend autenticado
GRANT ALL ON public.visitor_identities TO service_role;
