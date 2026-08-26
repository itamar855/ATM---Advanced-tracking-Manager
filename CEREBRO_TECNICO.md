# CÉREBRO TÉCNICO & OPERACIONAL — ATM TRACKING

Este documento é a fonte única de verdade da arquitetura, decisões técnicas, convenções de código e logs de depuração do **ATM (Advanced Tracking Manager ADS)**. Ele deve ser atualizado a cada nova feature, correção de falhas ou mudança arquitetural para guiar o desenvolvimento sem perda de contexto.

---

## 1. Diretrizes de Desenvolvimento e Continuidade

*   **Evitar Redundância:** Não redesenhar a arquitetura atual ou reescrever rotas sem uma evidência clara de falha documentada no ledger.
*   **Depuração Guiada:** 1 problema → 1 hipótese → 1 teste → 1 resultado → 1 decisão.
*   **Logs Limpos:** Nunca imprimir tokens, segredos, chaves privadas ou dados sensíveis de usuários (PII) sem hash nos logs do servidor.
*   **Independência de Gateway:** As regras financeiras de cálculo do P&L devem ser calculadas no banco de dados com base na receita recebida e no custo das mercadorias vendidas (COGS) fornecido pelo lojista, subtraindo o custo de anúncios (Meta Marketing API).

---

## 2. Arquitetura do Sistema e Rotas

A plataforma é estruturada como um SaaS Multi-Tenant. As APIs operam de forma dinâmica utilizando identificadores isolados.

```
/web/src/app/api/
├── auth/shopify/             # GET: Inicia o fluxo de instalação e OAuth
├── auth/shopify/callback/    # GET: Troca o código temporário e persiste o token
├── v1/capture/               # POST: Bridge de sessão — persiste fbp, fbc, IP, UA, UTMs no Supabase
├── v1/events/browser/        # POST: Recebe eventos de funil do browser (PageView, ViewContent,
│                             #       AddToCart, InitiateCheckout, AddPaymentInfo, Purchase)
│                             #       → Hasha PII server-side e despacha para Meta CAPI
└── v1/webhook/[store]/       # POST: Webhook orders/paid — evento Purchase server-side
```

### Arquivo de Script Shopify

- `shopify-pixel-script.liquid`: Script completo para instalar no `theme.liquid`. Captura sessão,
  dispara todos os eventos do funil e coleta PII disponível via Liquid (email, phone, endereço).

---

## 3. Modelo de Dados (Supabase / PostgreSQL)

O schema está estruturado em migrações incrementais na pasta `supabase/migrations/`:

*   `001_create_tenants.sql`: Tabela de organizações/assinaturas com RLS ativado por `auth.uid()`.
*   `002_create_stores.sql`: Lojas integradas da Shopify vinculadas a um tenant. Guarda as credenciais criptografadas de acesso.
*   `003_create_integrations.sql`: Configurações de pixels (Meta, Google, TikTok) e tokens das plataformas de anúncios.
*   `004_create_sessions.sql`: Ponte de atribuição. Armazena `track_id`, `fbp`, `fbc`, `fbclid`, IP real e User-Agent do comprador.
*   `005_create_orders.sql`: Relação de pedidos sincronizados com UTMs e hashes de dados pessoais para envio CAPI.
*   `006_create_events.sql` & `event_attempts.sql`: Log de auditoria de eventos despachados para as CAPI com rastreamento de latência e erros.
*   `007_create_diagnostics.sql`: Alertas automáticos do sistema (Score baixo, falha de conexão, duplicidade de emissores).
*   `008_create_costs.sql`: Valores de custo de anúncios sincronizados das APIs de Marketing e COGS inseridos.

---

## 4. Regras Críticas de Negócio para o Meta CAPI

Para garantir a máxima pontuação de correspondência de eventos (EMQ) e evitar penalidades da Meta, as seguintes regras são **obrigatórias** e estão codificadas em [event-builder.ts](file:///c:/Users/Hard%20Work/Desktop/ATM%20-%20Advanced%20Tracking%20Manager%20ADS/web/src/lib/tracking/event-builder.ts):

### 4.1 Identificação e Deduplicação
*   **Event ID:** Todos os eventos de compra do Servidor devem usar o formato exato `Purchase_${orderId}`. O Pixel do Navegador (Shopify Web Pixels API) deve utilizar o mesmo ID para permitir a deduplicação.
*   **Event ID (funil):** Eventos de funil (ViewContent, AddToCart, etc.) usam UUID v4 gerado no browser.
*   **External ID:** Deve ser um hash SHA-256 estável baseado em `customer_id` ou no par `email`/`telefone`. **NUNCA use o order_id como external_id**, pois ele representa a transação e não o comprador.

### 4.2 Higienização de PII (Dados Pessoais)
Todos os campos abaixo são normalizados e hasheados com **SHA-256** antes do envio:

| Campo Meta | Normalização antes do hash |
|---|---|
| `em` (email) | lowercase + trim |
| `ph` (phone) | somente dígitos |
| `fn` (first name) | lowercase + trim + remover acentos |
| `ln` (last name) | lowercase + trim + remover acentos |
| `ct` (city) | lowercase + trim + remover acentos e pontuação |
| `st` (state) | código 2 letras lowercase |
| `zp` (zip/CEP) | somente dígitos |
| `co` (country) | código ISO 2 letras lowercase |
| `db` (date of birth) | formato YYYYMMDD |
| `ge` (gender) | "m" ou "f" |
| `external_id` | prefixo `customer:` + SHA-256 |

*   **Parâmetros de Sessão:** `fbp` e `fbc` **NÃO** devem ser hasheados — enviados como recebidos.
*   **fbc (Click ID):** Não fabrique ou gere IDs falsos de `fbc` retroativamente. Construir a partir do `fbclid` **apenas se ele estiver presente na URL no momento do clique**.

### 4.3 IP e User-Agent
*   O IP e o User-Agent enviados nos eventos do servidor devem corresponder ao **dispositivo do comprador** (capturados via `/api/v1/capture` no navegador) e nunca aos IPs dos servidores.

### 4.4 Funil Completo de Eventos
O ATM envia todos os eventos do funil para maximizar o score do Meta:

| Evento | Trigger | Source |
|---|---|---|
| `PageView` | Toda página carregada | Browser → CAPI |
| `ViewContent` | Página de produto | Browser → CAPI |
| `AddToCart` | Submit do form de carrinho | Browser → CAPI |
| `InitiateCheckout` | Entrada no /checkout | Browser → CAPI |
| `AddPaymentInfo` | Step de pagamento | Browser → CAPI |
| `Purchase` | Webhook orders/paid | Servidor → CAPI |
| `Purchase` | Página thank_you | Browser → CAPI (dedup) |

---

## 5. Ledger de Alterações e Histórico

Abaixo está o registro de modificações importantes no projeto.

| Versão | Data | Tipo | Descrição | Autor |
| :--- | :--- | :--- | :--- | :--- |
| **v1.0.0** | 18/08/2026 | **Setup** | Inicialização do Monorepo Next.js 15, design system premium com css e utilitários. | Antigravity |
| **v1.1.0** | 18/08/2026 | **Feature** | Criação das migrations SQL multi-tenant e ativação de RLS no Supabase. | Antigravity |
| **v1.2.0** | 18/08/2026 | **Feature** | Implementação de Shopify OAuth (/api/auth/shopify e callback) e API de captura. | Antigravity |
| **v1.3.0** | 18/08/2026 | **Feature** | Implementação do Meta CAPI Dispatcher e CAPI Event Builder com PII Hasher. | Antigravity |
| **v1.4.0** | 18/08/2026 | **Feature** | Criação do Dedup-Engine (motor de idempotência em banco) para travar concorrência. | Antigravity |
| **v1.5.0** | 18/08/2026 | **Feature** | Conclusão do pipeline de Webhook processando lock, fbp/fbc, CAPI dispatch e health score. | Antigravity |
| **v1.6.0** | 18/08/2026 | **Feature** | Integração com a Meta Marketing API e criação da API Cron de sincronização de gastos. | Antigravity |
| **v1.7.0** | 18/08/2026 | **Feature** | Implementação do Dashboard-Service e API de cálculo de métricas agregadas e P&L. | Antigravity |
| **v1.8.0** | 18/08/2026 | **Feature** | Integração de Billing com Mercado Pago (Checkout API, Webhook IPN e tela de planos). | Antigravity |
| **v1.9.0** | 18/08/2026 | **Feature** | Implementação de UI de integrações do Facebook Ads e módulo instalador de Web Pixel. | Antigravity |
| **v2.0.0** | 26/08/2026 | **Bugfix** | Fix crítico: `/api/v1/capture` agora persiste sessões no Supabase (upsert real). Sem este fix, todos os eventos eram enviados sem fbp/fbc/IP/UA. | Antigravity |
| **v2.1.0** | 26/08/2026 | **Feature** | `dedup-engine.ts` generalizado para `reserveEvent()` / `updateEventResult()` — suporta qualquer evento e source (server/browser). | Antigravity |
| **v2.2.0** | 26/08/2026 | **Feature** | `event-builder.ts` expandido com `buildBrowserEvent()`. SHA-256 em todos os campos PII: em, ph, fn, ln, ct, st, zp, co, **db** (nascimento), **ge** (gênero). Normalização correta por campo. | Antigravity |
| **v2.3.0** | 26/08/2026 | **Feature** | Nova rota `/api/v1/events/browser` — endpoint universal de eventos de funil. Deduplica, recupera sessão, hasha PII e despacha à CAPI. | Antigravity |
| **v2.4.0** | 26/08/2026 | **Feature** | `shopify-pixel-script.liquid` — script completo com PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo e Purchase (deduplicado). Coleta PII via Liquid. | Antigravity |
| **v2.5.0** | 26/08/2026 | **Refactor & Fix** | Configuração do banco Supabase oficial (`rridxhzbkitgcodzyctu`), unificação de persistência com `updateEventResult()`, desativação de proteção Vercel e domínio oficial `trackingatm.vercel.app`. | Antigravity |
| **v2.6.0** | 26/08/2026 | **Feature & Arquitetura** | Implementação de Meta Facebook OAuth 1-Click oficial (`/api/auth/facebook` e callback com Long-Lived Token Exchange de 60 dias), Seletor de Contas de Anúncio (`act_...`), Gerenciador de Campanhas em 3 Níveis hierárquicos (Campanhas ➔ Conjuntos/AdSets ➔ Anúncios/Ads) com sincronização em tempo real (15s), Universal `external_id` SHA-256 em 100% dos eventos e remoção de códigos de teste em produção. | Antigravity |
| **v2.7.0** | 26/08/2026 | **Feature & Refinamento** | Dashboard Principal reestruturada com Card Master de Lucro Líquido Real, Cotação Comercial USD/BRL em tempo real (`currency.ts`), conversão cambial automática de gastos e orçamentos em USD para BRL, disparo universal de `InitiateCheckout` no navegador e 100% de cobertura EMQ (13 parâmetros PII). | Antigravity |
| **v2.8.0** | 26/08/2026 | **UI/UX Master & Otimização** | Redesenho completo do Gerenciador de Campanhas estilo UTMify PRO (Super Otimizado): Navegação em 4 abas de drill-down (`Contas`, `Campanhas`, `CJs`, `ADs`), Toggle Switches iOS animados de Play/Pause instantâneo, Cartões de crédito e ciclos de cobrança da Meta, Métricas completas (IC, CPI, Margem, ROI, Lucro, ROAS, CPA), edição inline de orçamento e Linha de Totais no Rodapé. | Antigravity |
| **v2.9.0** | 26/08/2026 | **Dashboard Resumo & Sidebar Master** | Redesenho completo da Dashboard Principal (Resumo) estilo UTMify PRO com 12 Cards Financeiros (Faturamento Líquido, Gastos em Ads convertidos, ROAS, Lucro Líquido Real, Vendas Pendentes, Margem, Taxas, ROI, CPA, ARPU, Reembolso, Chargeback e Taxa de Aprovação), Gráfico Donut de Meios de Pagamento (Pix, Cartão, Boleto), Barras de Fontes de Tráfego e Menu Lateral hierárquico reestruturado. | Antigravity |

