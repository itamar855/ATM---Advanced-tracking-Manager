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
├── v1/capture/               # POST: Recebe sessões do Pixel (fbp, fbc, IP, UA)
└── v1/webhook/[store]/       # POST: Webhook orders/paid de cada loja integrada
```

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
*   **External ID:** Deve ser um hash SHA-256 estável baseado em `customer_id` ou no par `email`/`telefone`. **NUNCA use o order_id como external_id**, pois ele representa a transação e não o comprador.

### 4.2 Higienização de PII (Dados Pessoais)
*   **Hash Obrigatório:** Todos os campos de identificação (e-mail, telefone, primeiro nome, sobrenome, cidade, estado, CEP e país) devem ser convertidos para letras minúsculas, ter os espaços em branco removidos e ser hasheados com SHA-256.
*   **Parâmetros de Sessão:** `fbp` e `fbc` **NÃO** devem ser hasheados.
*   **fbc (Click ID):** Não fabrique ou gere IDs falsos de `fbc` no momento do Purchase se ele não foi coletado no browser durante o clique original.

### 4.3 IP e User-Agent
*   O IP e o User-Agent enviados nos eventos do servidor devem corresponder ao **dispositivo do comprador** (capturados via API de Capture no navegador) e nunca aos IPs dos servidores da Zedy, Shopify ou do nosso próprio backend.

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
