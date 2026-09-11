-- =============================================================================
-- Migration 026: Recommendation Audit Outcomes & Simulation (Fase 10.2)
-- Projeto: ATM - Advanced Tracking Manager ADS
-- =============================================================================
-- Expande public.campaign_intelligence_recommendations para suportar:
-- 1. Modo Simulação / Shadow Mode (is_simulation, simulation_thought)
-- 2. Camada de Explicação Humana (human_explanation JSONB)
-- 3. Snapshots comparativos de auditoria (metrics_before, metrics_after)
-- 4. Perfil de Confiança (confidence_profile DEFAULT 'BALANCED' para expansão futura)
-- 5. Avaliação de Desfecho pós-janela temporal (outcome_result com PENDING_EVALUATION, outcome_reason_code, outcome_reason, outcome_metrics_delta)

ALTER TABLE public.campaign_intelligence_recommendations
    ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS simulation_thought TEXT,
    ADD COLUMN IF NOT EXISTS human_explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metrics_before JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metrics_after JSONB,
    ADD COLUMN IF NOT EXISTS confidence_profile TEXT NOT NULL DEFAULT 'BALANCED',
    ADD COLUMN IF NOT EXISTS evaluation_window_hours INTEGER NOT NULL DEFAULT 72,
    ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outcome_result TEXT DEFAULT 'PENDING_EVALUATION' CHECK (
        outcome_result IN ('ACERTO', 'ERRO', 'NEUTRO', 'PENDING_EVALUATION', 'PENDING')
    ),
    ADD COLUMN IF NOT EXISTS outcome_reason_code TEXT,
    ADD COLUMN IF NOT EXISTS outcome_reason TEXT,
    ADD COLUMN IF NOT EXISTS outcome_metrics_delta JSONB;

-- Índices otimizados para acompanhamento de desfecho e auditoria do algoritmo
CREATE INDEX IF NOT EXISTS idx_camp_rec_simulation 
    ON public.campaign_intelligence_recommendations (is_simulation);

CREATE INDEX IF NOT EXISTS idx_camp_rec_outcome 
    ON public.campaign_intelligence_recommendations (outcome_result, evaluated_at);

CREATE INDEX IF NOT EXISTS idx_camp_rec_eval_pending 
    ON public.campaign_intelligence_recommendations (store_id, created_at)
    WHERE outcome_result IN ('PENDING_EVALUATION', 'PENDING');

COMMENT ON COLUMN public.campaign_intelligence_recommendations.is_simulation IS 'Flag indicando se a recomendação foi gerada em modo simulação (Shadow Mode)';
COMMENT ON COLUMN public.campaign_intelligence_recommendations.outcome_result IS 'Desfecho auditado após a janela temporal: ACERTO, ERRO, NEUTRO ou PENDING_EVALUATION';
COMMENT ON COLUMN public.campaign_intelligence_recommendations.outcome_reason_code IS 'Código canônico padronizado do desfecho (ex: PROFIT_GROWTH_AFTER_SCALE, SCALE_MARGIN_COLLAPSE, EVALUATION_WINDOW_NOT_ELAPSED)';
COMMENT ON COLUMN public.campaign_intelligence_recommendations.confidence_profile IS 'Perfil de ponderação da confiança (BALANCED por padrão nesta fase)';
