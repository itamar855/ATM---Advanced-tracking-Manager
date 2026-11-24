-- ========================================
-- ATM - Advanced Tracking Manager ADS
-- Migration 031: custos de infoproduto e web app
-- ========================================
-- A tabela de custos (tela Custos & Taxas) passa a aceitar, além de imposto ('tax')
-- e taxa de gateway ('duty'):
--   'affiliate'    = comissão de afiliado, em % sobre o valor depois da taxa do gateway
--   'coproduction' = parte do coprodutor, em % sobre o que sobra depois da taxa e do afiliado
-- O cálculo fica em web/src/lib/pnl/project-pnl.ts. Pode rodar mais de uma vez.

ALTER TABLE public.taxes_and_duties DROP CONSTRAINT IF EXISTS taxes_and_duties_type_check;
ALTER TABLE public.taxes_and_duties
    ADD CONSTRAINT taxes_and_duties_type_check
    CHECK (type IN ('tax', 'duty', 'affiliate', 'coproduction'));

-- Percentual não pode ser negativo nem passar de 100%.
ALTER TABLE public.taxes_and_duties DROP CONSTRAINT IF EXISTS taxes_and_duties_value_check;
ALTER TABLE public.taxes_and_duties
    ADD CONSTRAINT taxes_and_duties_value_check
    CHECK (value >= 0 AND (value_type <> 'percentage' OR value <= 100)) NOT VALID;
