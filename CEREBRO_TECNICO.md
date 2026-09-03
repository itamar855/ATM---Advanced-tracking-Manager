# CÉREBRO TÉCNICO & OPERACIONAL — ATM TRACKING (ADVANCED TRACKING MANAGER)

Este documento é a fonte única de verdade da arquitetura, decisões técnicas, convenções de código, integrações de APIs e logs de depuração do **ATM (Advanced Tracking Manager ADS)**.

---

## 1. Visão Geral da Arquitetura

O ATM opera como uma infraestrutura de rastreamento server-side e atribuição First-Party de altíssima performance para e-commerce e tráfego direto.

```
                               ┌─────────────────────────────┐
                               │  Navegador do Comprador     │
                               │  (Script ATM v4.0 Dinâmico) │
                               └──────────────┬──────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │ (Primeiro ms: _fbp, _fbc, IP, UA, UTMs)           │
                    ▼                                                   ▼
       ┌─────────────────────────┐                         ┌─────────────────────────┐
       │  POST /api/v1/capture   │                         │ POST /events/browser    │
       │  (Bridge de Sessão)     │                         │ (PageView, IC, ATC, etc)│
       └────────────┬────────────┘                         └────────────┬────────────┘
                    │                                                   │
                    ▼                                                   ▼
       ┌─────────────────────────┐                         ┌─────────────────────────┐
       │   Supabase PostgreSQL   │                         │  Meta Conversions API   │
       │   (Sessões & Eventos)   │◄────────────────────────┤  (CAPI v23.0 - SHA-256) │
       └────────────▲────────────┘                         └────────────▲────────────┘
                    │                                                   │
                    │      ┌─────────────────────────────┐              │
                    └──────┤   POST /api/v1/webhook/*    ├──────────────┘
                           │   (Vega Checkout / Shopify) │
                           └─────────────────────────────┘
```

---

## 2. Mapa Completo de Rotas de API (`/web/src/app/api/`)

| Rota | Método | Função |
| :--- | :--- | :--- |
| `/api/auth/facebook` | `GET` | Inicia o fluxo de autorização OAuth 2.0 com a Meta Graph API. |
| `/api/auth/facebook/callback` | `GET` | Troca o `code` temporário pelo **Long-Lived Access Token (60 dias)** e persiste no Supabase. |
| `/api/v1/capture` | `POST` | **Bridge de Atribuição:** Registra ou atualiza a sessão do visitante com `fbp`, `fbc`, `fbclid`, IP real, UA e UTMs. |
| `/api/v1/pixel/[domain]/script.js` | `GET` | **Pixel Engine v4.0:** Serve dinamicamente o script com **Input Harvester**, captura de `AddToCart` com preço da variante, `InitiateCheckout` com valor real e detector universal de **Thank You Page (`Purchase`)**. |
| `/api/v1/events/browser` | `POST` | Recebe eventos do navegador, enriquece dados PII com busca reversa, gera hashes SHA-256 e despacha para a Meta CAPI com deduplicação. |
| `/api/v1/events/list` | `GET` | Retorna os **últimos 500 eventos** ao vivo com contagem de Compras, Checkouts, Carrinhos e PageViews. |
| `/api/v1/webhook/vega/[store]` | `POST` | Webhook oficial do **Vega Checkout**: Processa compras aprovadas, carrinhos abandonados e PIX/Boleto gerados com 13 parâmetros PII. |
| `/api/v1/webhook/[store]` | `POST` | Webhook universal do **Shopify** para `orders/paid` e `orders/create`. |
| `/api/v1/webhook/zedy/[store]` | `POST` | Webhook para o checkout **Zedy**. |
| `/api/v1/dashboard/metrics` | `GET` | Retorna o P&L consolidado: Faturamento Líquido, Gasto em Ads convertido para BRL com cotação do dia, Lucro Líquido Real, ROAS, Vendas Pendentes, Donut de Métodos de Pagamento e Fontes de Tráfego. |
| `/api/v1/meta/campaigns/list` | `GET` | **Gerenciador de 4 Níveis (Estilo UTMify PRO):** Retorna `accounts` (com Cartões e Ciclos da Meta), `campaigns`, `adsets` e `ads` com métricas completas (IC, CPI, Margem, ROI, Lucro, ROAS, CPA). |
| `/api/v1/meta/campaigns/manage` | `POST` | **Central de Controle:** Executa Play/Pause, Alteração de Orçamento diário (com conversão USD/BRL), Duplicação e Exclusão direto na Graph API. |
| `/api/v1/orders/list` | `GET` | Lista todos os pedidos rastreados com atribuição CAPI direta e detalhes de cliente e UTMs. |
| `/api/v1/live` | `GET` | Contador em tempo real de clientes online navegando e clientes no checkout. |

---

## 3. Conversão Cambial em Tempo Real (`USD ➔ BRL`)

Implementada no serviço [`web/src/lib/currency.ts`](file:///c:/Users/Hard%20Work/Desktop/ATM%20-%20Advanced%20Tracking%20Manager%20ADS/web/src/lib/currency.ts):
- Conecta-se à API comercial oficial do Banco Central / AwesomeAPI (`https://economia.awesomeapi.com.br/last/USD-BRL`).
- Taxa comercial atual: `USD 1 = R$ 5.1627`.
- Converte automaticamente gastos e orçamentos das contas faturadas em Dólar (`USD 1`, `USD 2`, `USD 3`, `USD 04 - BM NOVA`) para Reais para cálculo exato de **Lucro Líquido Real**, **ROAS** e **CPA**.

---

## 4. Regras de Qualidade Meta CAPI (EMQ 100% & Deduplicação)

### 4.1 Higienização Rigorosa de 13 Sinais PII
| Sinal Meta | Parâmetro | Normalização antes do SHA-256 |
| :--- | :--- | :--- |
| E-mail | `em` | `lowercase + trim` |
| Telefone | `ph` | Apenas números com DDI (`5511999999999`) |
| Primeiro Nome | `fn` | `lowercase + trim + sem acentos` |
| Sobrenome | `ln` | `lowercase + trim + sem acentos` |
| Cidade | `ct` | `lowercase + trim + sem acentos` |
| Estado | `st` | UF com 2 letras minúsculas (ex: `sp`, `rj`) |
| CEP | `zp` | Apenas 8 dígitos numéricos |
| País | `co` | `br` em minúsculo |
| Identificador Universal | `external_id` | SHA-256 baseado em `customer:email` ou `visitor:fbp` |
| Cookie de 1ª Parte | `fbp` | `fb.1.{timestamp}.{rand}` (NÃO hasheado) |
| Click ID de 1ª Parte | `fbc` | `fb.1.{timestamp}.{fbclid}` (NÃO hasheado) |
| IP Real do Dispositivo | `client_ip_address` | IP do visitante capturado no navegador |
| User-Agent Real | `client_user_agent` | UA exato do navegador do visitante |

### 4.2 Deduplicação Tripla
1. **Client-Side:** Trava em `sessionStorage` com chave `atm_purchase_{orderId}` contra F5 na página de obrigado.
2. **Server-Side:** Idempotência no banco via `reserveEvent(storeId, eventName, eventId, source)`.
3. **Meta CAPI Engine:** Janela de 48 horas unificando o evento do navegador com o evento do webhook do servidor com base no par `(event_name, event_id)`.

---

## 5. Ledger de Versões e Alterações

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
| **v3.0.0** | 26/08/2026 | **Scale & High Throughput** | Limite do Event Explorer expandido para 500 eventos ao vivo para suportar alto tráfego simultâneo (165+ usuários online), detecção universal de Thank You Page no Pixel v4.0 com fallback para Shopify Checkout e tela de Pedidos & Vendas reformulada. | Antigravity |
| **v4.0.0** | 27/08/2026 | **Zedy Sync & Workaround** | Identificado bloqueio da API nativa da Zedy (uso de Clerk Auth para endpoints privados). Implementado workaround temporário via importação JSON e Reset Diário na UI de Pedidos. Consolidação do `dedup-engine.ts` para idempotência robusta de vendas duplicadas e proteção contra faturamento duplo. | Antigravity |
| **v4.1.0** | 28/08/2026 | **Shopify Native Sync** | Pivô arquitetural para usar a Shopify Admin API como "Fonte da Verdade". Nova rota `/api/v1/sync/shopify/route.ts` que puxa pedidos `paid` via `shpat_` token, formata valores centesimais para decimais de forma nativa e extrai as UTMs originais embutidas em `note_attributes` e referenciadores de URL. | Antigravity |
| **v4.2.0** | 29/08/2026 | **UI / UX Refactor** | Reestruturação da tela de Integrações: Inclusão do gerenciamento do Token Shopify com mini-tutorial embutido. Integração e injeção do componente "Construtor de UTMs" diretamente na aba "UTMs" da tela de Integrações para reduzir ruído visual na Sidebar. | Antigravity |
| **v4.3.0** | 29/08/2026 | **Deploy Stability** | Correção de compilação Strict Mode do TypeScript no Vercel (Next.js Build). Padronização de hooks de estado e contextos (remoção de falhas de `activeStore` isoladas). | Antigravity |
| **v4.4.0** | 29/08/2026 | **Pixel Engine v4.4** | Evolução da tag Liquid nativa da Shopify. Injeção direta do objeto `cart` inteiro (com `total_price`, `item_count`, IDs e Variant IDs) no escopo global `window.__ATM_CTX__`. Garante rastreio Server+Browser com 100% de precisão de ROAS e SKUs no evento de `InitiateCheckout`, eliminando valores genéricos ou perda de pacotes multi-produtos. | Antigravity |
| **v4.5.0** | 02/09/2026 | **Feature & UI** | Edição inline de nome de campanhas, conjuntos e anúncios com persistência na Meta Graph API (`/api/v1/meta/campaigns/manage`). Identificação visual e cálculo correto de orçamento para campanhas CBO (orçamento a nível de campanha) e ABO (soma dos orçamentos diários dos conjuntos ativos). Desbloqueio e otimização de navegação da aba ADs com cache em memória (25s) e tags de drill-down com botão de limpar (`[X]`). | Antigravity |
| **v4.6.0** | 02/09/2026 | **Refinamento** | Ordenação hierárquica estrita implementada no frontend e backend: 1º Campanhas Ativas (`active`); 2º Ordenadas pelo maior Lucro Líquido decrescente (desempate por gasto); 3º Campanhas Desativadas (`paused`) no final da lista. | Antigravity |
| **v4.7.0** | 02/09/2026 | **Tracking & CAPI** | Propagação universal de UTMs e sinais CAPI para todos os checkouts e carrinhos (Shopify `/checkout`, Vega, Zedy, Cartpanda, etc.). Eliminação de UTMs "N/D" via injeção automática em `sendEvent()` e persistência no banco (`meta_response.custom_data` e `order_details`). Extração real de contagem de IC (`actions.initiate_checkout` e `omni_initiated_checkout`) e cálculo do CPI nos 4 níveis de gestão. Cache rápido SWR (60s) para carregamento < 100ms. | Antigravity |
| **v4.8.0** | 02/09/2026 | **Timezone & Fix Contábil** | Correção de fuso horário de Brasília (`America/Sao_Paulo` UTC-3) no cálculo de intervalos de data do Dashboard Resumo e Campanhas. Eliminação da contagem indevida de vendas das últimas 3 horas de ontem em "Hoje" (reduzindo a contagem inflada de 25 vendas para as 14 vendas reais). Deduplicação de pedidos por `order_id` com `seenOrderIds`. | Antigravity |
| **v4.9.0** | 02/09/2026 | **Conciliação Financeira & COGS** | Reformulação completa da tela de Custos, Impostos e Taxas (`/dashboard/settings/costs`): remoção total de dados mockados (Gummies/CBD), suporte a cadastro 100% manual de alíquotas de imposto, taxas de gateway e produtos COGS com importação inteligente das compras recentes. Conciliação automática do cálculo de Faturamento Líquido, Taxas, Impostos e Lucro Líquido na Dashboard e Campanhas. Relatório técnico detalhado arquivado em `docs/RELATORIO_TECNICO_CORRECOES.md`. | Antigravity |
| **v5.0.0** | 03/09/2026 | **Meta Enterprise & Multi-BM** | Resolução definitiva da autenticação OAuth Meta e reconhecimento de ativos: Criação do normalizador universal `resolveMetaAccessToken` em `token.ts` para tratar tokens hex BYTEA (`\x...`), invólucros JSON e criptografia AES-256-GCM, eliminando o erro 190. Redesenho completo da interface de Business Managers (`integrations/page.tsx`) com carregamento minimizado por padrão em accordions, toggle individual por BM (1 clique), barra de pesquisa e desmarcação em lote. Propagação resiliente de OAuth para todas as lojas da conta no Supabase e sincronização com a Vercel. | Antigravity |
| **v5.1.0** | 03/09/2026 | **UI Integrity & Multi-Domain Sync** | Eliminação de falso-positivo de status no Hub Central e card Meta (`integrations/page.tsx`): o badge `• Conectado` e a etiqueta `Ativo` agora são estritamente condicionais à validação real do perfil (`metaConnected && profiles.length > 0`), exibindo `Não conectado` e `Inativo` quando não há ativos sincronizados. Documentação e conciliação de apontamentos de domínio de produção na Vercel (`trackingatm.vercel.app`) e padronização do ambiente local de desenvolvimento com chaves reais em `.env.local`. | Antigravity |
| **v5.2.0** | 03/09/2026 | **CAPI Identity Stitching & 2m Buffer** | Motor de Cruzamento Progressivo de Identidade (`identity-stitcher.ts`) e Buffer Inteligente de 2 Minutos para `PageView`: Retém o envio do `PageView` anônimo por 120 segundos para aguardar preenchimento de WhatsApp/Email no carrinho ou checkout. Assim que o cliente digita contato ou converte (`AddToCart`, `InitiateCheckout`, `Lead`, `Purchase` ou Webhook de checkout), os dados PII (`ph`, `em`, `fn`, `ln`, `addr`) são cruzados via `track_id`/`fbp` e retroalimentam o `PageView` e eventos de funil. Despacho antecipado (Flush) automático com 100% dos sinais verdes (`+ph`, `+em`, `+fbp`, `+fbc`, `+ip`, `+ua`, `+ext`, `+addr`), elevando o EMQ Score para 86-100%. | Antigravity |
| **v5.3.0** | 03/09/2026 | **Enterprise PWA (PC, Android & iOS)** | Transformação oficial do ATM PRO em Progressive Web App (PWA) instalável: Criação do W3C `manifest.json` com identidade visual Dark (`#0B0E14`), modo `standalone` e shortcuts diretos para Campanhas, Eventos e Integrações. Geração do pacote de ícones em alta resolução (192x192, 512x512, maskable e apple-touch-icon). Service Worker (`sw.js`) com cache inteligente de assets estáticos e proteção estrita Network-First para rotas de API (`/api/*`), garantindo dados financeiros e CAPI em tempo real. Adaptação responsiva da interface com Drawer lateral retrátil e backdrop para dispositivos móveis, preservando 100% do layout desktop no PC. Suporte a instalação nativa no Windows/Mac (janela independente), Android e iOS Safari. | Antigravity |
| **v5.4.0** | 03/09/2026 | **Hub de Notificações Push Customizáveis** | Sistema completo de Web Push nativo para iPhone (iOS 16.4+), Android e PC com personalização absoluta: Protocolo VAPID seguro (`web-push.ts`), tela dedicada de gerenciamento (`settings/notifications`) com status de conexão do aparelho, botão de teste imediato, editor de templates com variáveis dinâmicas (`{valor}`, `{cliente_nome}`, `{metodo_pagamento}`, `{loja}`, `{pedido_id}`) e mockup de iPhone com preview ao vivo. Sintetizador Web Audio API de sons de venda (Caixa Registradora "Cha-ching", Moedas, Suave, Silencioso). Filtro por valor mínimo e modo Não Perturbe (horário de silêncio de Brasília). Disparo automático e resiliente nos webhooks de checkout (Zedy, Vega, Gateway7) com limpeza de tokens revogados. | Antigravity |






