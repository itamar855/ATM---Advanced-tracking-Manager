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

---

## 2. Testes de Validação da Fase 9

Para validar a qualquer momento no terminal:
```bash
node scripts/test-meta-asset-health-engine.js
node scripts/test-meta-asset-sync.js
node scripts/test-asset-intelligence-guard.js
node scripts/test-meta-cache-and-concurrency.js
```
*(Todos retornam 100% PASS — Total: 25 testes aprovados)*

---

## 3. Arquivos da Fase 9 Incluídos nesta Atualização

- **Modificado**: `web/src/app/api/v1/intelligence/actions/execute/route.ts`
- **Novo**: `supabase/migrations/022_create_asset_intelligence_snapshots.sql`
- **Novo**: `web/src/lib/intelligence/meta-asset-health-engine.ts`
- **Novo**: `web/src/lib/intelligence/meta-asset-sync.ts`
- **Novo**: `web/src/lib/intelligence/asset-intelligence-guard.ts`
- **Novo**: `web/src/app/api/v1/intelligence/assets/sync/route.ts`
- **Novo**: `scripts/test-meta-asset-health-engine.js`
- **Novo**: `scripts/test-meta-asset-sync.js`
- **Novo**: `scripts/test-asset-intelligence-guard.js`
- **Modificado**: `CEREBRO_TECNICO.md`
- **Modificado**: `docs/ESTADO_ATUAL_RETOMADA.md`
