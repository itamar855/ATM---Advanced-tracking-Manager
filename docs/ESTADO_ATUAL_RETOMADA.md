# 📌 ATM — Documento de Retomada de Sessão (Handover de Estado)

> **Data de Atualização:** 10 de Setembro de 2026 — 20:20 (Horário de Brasília)  
> **Branch Atual:** `main`  
> **Status do Build:** ✅ `npx tsc --noEmit` (0 erros)  
> **Status dos Testes:** ✅ `17 PASSOU | 0 FALHOU` na Suíte de Asset Intelligence (Fase 9)  
> **Banco Supabase:** ✅ `meta_asset_health_snapshots` (Migration 022 aplicada e validada)

---

## 1. Onde Paramos (Status das Fases)

### ✅ Fase 8 — Unificação Contábil & Revenue Ledger
- **Status**: Concluída e auditada (Commit `f72fc43`).
- **Tabelas**: `public.revenue_ledger` (2.772 fatias) e `public.campaign_cost_snapshots` (719 snapshots de custo com cotação congelada).
- **Conciliação**: R$ 75.783,11 conciliados com 100% de consistência.
- **Dashboard**: Consome diretamente os dados contábeis consolidados, com fallback ativo para Meta Graph API ao vivo caso snapshots de um período recente ainda não tenham sido gerados.

---

### ✅ Fase 9 — ATM Asset Intelligence Guard™ + Campaign Action Engine Protection Layer

#### ✅ Fase 9.1 — Motor de Saúde de Ativos em 3 Camadas
- **Módulo**: `web/src/lib/intelligence/meta-asset-health-engine.ts`.
- **Ponderação**:
  - **Asset Trust Score (40%)**: Idade da conta, verificação da BM, estabilidade de billing (falhas de pagamento), histórico de restrições e *Historical Risk Recovery* (5% - evita penalização perpétua de ativos recuperados).
  - **Delivery Power Score (30%)**: EMQ First-Party dos eventos CAPI, Estabilidade de CPM (<15% excelente, >30% penalidade), CTR Decay e Frequency Pressure.
  - **Scaling Readiness Score (30%)**: Distância do teto diário de gastos (`adtrust_spend_limit`), ROAS recente e margem de CPA vs limite máximo tolerável.
- **Auditoria**: `node scripts/test-meta-asset-health-engine.js` (**5 PASS | 0 FAIL**).

#### ✅ Fase 9.2 — Sincronizador de Ativos e Snapshots Auditáveis
- **Módulo**: `web/src/lib/intelligence/meta-asset-sync.ts`.
- **API Endpoint**: `GET/POST /api/v1/intelligence/assets/sync`.
- **Banco de Dados**: `public.meta_asset_health_snapshots` (Migration `022_create_asset_intelligence_snapshots.sql`).
- **Constraint Única**: `(store_id, asset_type, asset_id, snapshot_date)` — snapshots diários sem duplicação.
- **Auditoria**: `node scripts/test-meta-asset-sync.js` (**6 PASS | 0 FAIL**).

#### ✅ Fase 9.3 — Camada de Proteção Pré-Execução (Execution Guard)
- **Módulo**: `web/src/lib/intelligence/asset-intelligence-guard.ts`.
- **Ponto de Interceptação Cirúrgico**: `web/src/app/api/v1/intelligence/actions/execute/route.ts`.
- **Fluxo de Decisão**:
  1. `APPROVED`: Escala total autorizada (até +30% diário).
  2. `RESTRICTED`: Escala autorizada com poda de segurança automática para no máximo +15% diário (ex: CPM subindo ou margem apertada).
  3. `BLOCKED`: Escala barrada preventivamente para proteger o capital (ex: falhas de pagamento no registro ou CPA estourado). Ação é registrada como `status: 'rejected'` com auditoria e justificativa clara.
- **Auditoria**: `node scripts/test-asset-intelligence-guard.js` (**6 PASS | 0 FAIL**).

#### ✅ Fase 9.4 — Otimização de Leitura & Camada de Cache Multi-Tenant da Meta
- **Módulos Criados/Otimizados**:
  - `web/src/lib/meta/meta-cache.ts`: Camada de cache em memória isolada por loja e hash do token com TTL rigoroso e blindagem multi-tenant.
  - `web/src/lib/meta/graph-service.ts`: Paralelização simultânea das consultas de Business Managers (degradando latência de ~15s para ~1s).
  - `web/src/app/api/v1/meta/accounts/route.ts`: Cache de 5 minutos, logs de latência (`[CACHE HIT]` / `[CACHE MISS]`) e suporte a bypass com `?refresh=true`.
  - `web/src/app/api/v1/dashboard/metrics/route.ts`: Cache de 45 segundos para métricas e fallback da Meta Graph.
  - `web/src/app/dashboard/page.tsx`: Polling otimizado para 45s com suspensão automática quando a aba do navegador estiver em segundo plano (`document.visibilityState === "hidden"`).
- **Auditoria**: `node scripts/test-meta-cache-and-concurrency.js` (**8 PASS | 0 FAIL**).

### ✅ Fase 9.5 — Meta Performance Observability Layer & Cooldown Protection
- **Auditoria**: `node scripts/test-meta-performance-observability.js` (**9 PASS | 0 FAIL**).

---

### ✅ Fase 10 — Financial Normalization & Campaign Profit Intelligence Layer™
- **Status**: Concluída, commitada e enviada para `origin/main` (Commit `d3ae049` — **29 PASS | 0 FAIL**).
- **Módulos**: `supabase/migrations/024_create_campaign_profit_intelligence.sql`, `web/src/lib/intelligence/campaign-profit-engine.ts`, `scripts/test-campaign-profit-engine.js`.
- **Guardrails**: `LEARNING_PHASE_PROTECTION`, `SCALE_VOLUME_GATE` e `RED_TIER_GOVERNANCE`.

---

### ✅ Fase 10.1 — Campaign Intelligence Bridge (Copilot Mode)
- **Status**: Concluída, commitada e enviada para `origin/main` (Commit `295db67` — **35 PASS | 0 FAIL**).
- **Módulos**: `supabase/migrations/025_create_campaign_intelligence_recommendations.sql`, `web/src/lib/intelligence/campaign-intelligence-bridge.ts`, `scripts/test-campaign-intelligence-bridge.js`.
- **Refinamentos**: Confidence Tri-Fator, Cooldown 24h via `recommendation_hash`, e Asset Guard (`SAFE`, `RESTRICTED`, `BLOCKED`).

---

### ✅ Fase 10.2 — Central de Recomendações e Auditoria (Observability & Shadow Mode)
- **Status**: Concluída, commitada e enviada para `origin/main` (Commit `9ce80e5` — **33 PASS | 0 FAIL**).
- **Módulos**: `supabase/migrations/026_create_recommendation_audit_outcomes.sql`, `web/src/lib/intelligence/campaign-recommendation-auditor.ts`, `scripts/test-campaign-recommendation-auditor.js`.
- **Refinamentos**: Proteção de avaliação temporal (janela mínima D+1/D+3 para SCALE, bloqueando falso erro intradiário com `PENDING_EVALUATION`), modo simulação (Shadow Mode) e explicabilidade comercial humanizada.

---

### ✅ Fase 10.3 — Motor de Maturidade das Decisões do ATM
- **Status**: Concluída e auditada (**40 PASS | 0 FAIL**).
- **Módulos Criados/Atualizados**:
  - `web/src/lib/intelligence/decision-maturity-engine.ts`: Motor de agregação analítica que responde "o ATM está tomando boas decisões?", com métricas globais, quebra por ação, separação de impacto contábil (`PROFIT_GENERATION`, `LOSS_PREVENTION`, `STABILITY_MAINTENANCE`), trava estrita de maturidade (mínimo de 5 escalas avaliadas para `HIGH_PERFORMANCE_MATURE`), idade da inteligência (`EARLY_LEARNING` a `MATURE_MODEL`) e Veredito Executivo em português brasileiro.
  - `web/src/app/api/v1/intelligence/maturity/route.ts`: Endpoint `GET` seguro e *read-only* com isolamento multi-tenant para consulta executiva da maturidade.
  - `scripts/test-decision-maturity-engine.js`: Suíte de testes automatizados com 40 asserções validando cálculos percentuais, travas estatísticas de escala, separação de impacto, idade da inteligência e segregação multi-tenant.
- **Preservação**: Zero escrita na Meta API, zero UI, zero auto-escala.

---

## 2. Mapa dos Testes Automatizados Disponíveis

Para validar a qualquer momento no terminal:
```bash
node scripts/test-decision-maturity-engine.js
node scripts/test-campaign-recommendation-auditor.js
node scripts/test-campaign-intelligence-bridge.js
node scripts/test-campaign-profit-engine.js
node scripts/test-meta-performance-observability.js
node scripts/test-meta-cache-and-concurrency.js
node scripts/test-meta-asset-sync.js
node scripts/test-asset-intelligence-guard.js
node scripts/test-meta-asset-health-engine.js
node scripts/test-dashboard-financial-conciliation.js
```
*(Todos retornam 100% PASS — Total: 171 testes aprovados)*

---

## 3. Arquivos da Fase 10.3 (Aguardando Autorização para Commit)

- **Novo**: `web/src/lib/intelligence/decision-maturity-engine.ts`
- **Novo**: `web/src/app/api/v1/intelligence/maturity/route.ts`
- **Novo**: `scripts/test-decision-maturity-engine.js`
- **Modificado**: `CEREBRO_TECNICO.md`
- **Modificado**: `docs/ESTADO_ATUAL_RETOMADA.md`




