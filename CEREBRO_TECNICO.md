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
| **v5.4.0** | 03/09/2026 | **Hub de Notificações Push Customizáveis** | Sistema completo de Web Push nativo para iPhone (iOS 16.4+), Android e PC com personalização absoluta: Protocolo VAPID seguro (`web-push.ts`), tela dedicada de gerenciamento (`settings/notifications`) com status de conexão do aparelho, botão de teste imediato, editor de templates com variáveis dinâmicas (`{valor}`, `{cliente_nome}`, `{metodo_pagamento}`, `{loja}`, `{pedido_id}`) e mockup de iPhone com preview ao vivo. Sintetizador Web Audio API de sons de venda (Caixa Registradora "Cha-ching", Moedas, Suave, Silencioso). Filtro por valor mínimo e modo Não Perturbe (horário de silêncio de Brasília). Disparo automático e resiliente nos webhooks de checkout (Zedy, Vega, Gateway de Pagamento) com limpeza de tokens revogados. | Antigravity |
| **v5.5.0** | 03/09/2026 | **Apple Mobile UI/UX & Campaign Hub** | Refinamento ergonômico mobile com foco no ecossistema Apple (iPhone/iOS) e Gerenciador de Campanhas (`UtmifyCampaignManager.tsx`): Criação da Barra de Navegação Inferior nativa do iOS (`BottomNav.tsx`) com efeito frosted glass e 5 abas rápidas (Resumo, Campanhas, Eventos, Vendas, Menu), respeitando áreas seguras (`safe-area-inset-bottom` e `viewport-fit=cover`). Novo Modo de Cards Móveis para Campanhas, Conjuntos e Anúncios com switches de 44px, badge de ROAS, grid de 4 métricas essenciais (Gasto, Faturamento, Lucro, Vendas/CPA) e edição rápida de orçamento, com alternador `[Cards] [Tabela]`. Barra de KPI consolidada no topo mobile e padronização da nomenclatura para "Gateway de Pagamento". Zero alterações em regras de backend ou integrações. | Antigravity |
| **v5.5.1** | 03/09/2026 | **iPhone Notch Inset & Full Pending Push Pipeline** | Resolução de bugs críticos de produção: (1) Eliminação de sobreposição da barra de status e Dynamic Island/Notch do iPhone no topo da aplicação (`Header.tsx` e `Sidebar.tsx`), adotando `padding-top: max(env(safe-area-inset-top), 0px)` e altura dinâmica para garantir visibilidade total dos botões e busca; (2) Habilitação do tópico `orders/create` com status pendente no webhook da Shopify (`webhook/[store]/route.ts`) com despacho Web Push imediato; (3) Suporte abrangente para pedidos pendentes (`waiting_payment`, `aguardando_pagamento`, `ORDER_CREATED`, `AddPaymentInfo`) nas rotas da Vega, Zedy e Gateway de Pagamento; (4) Busca resiliente de loja por ID e por `shop_domain` no motor de push (`web-push.ts`), validada com entrega HTTP 201 confirmada pelo APNs da Apple. | Antigravity |
| **v5.6.0** | 03/09/2026 | **High-Fidelity Push Audio Suite & Custom Sound Upload** | Implementação de áudio nativo e personalização de sons para notificações no iOS/iPhone, Android e Desktop: (1) Inclusão dos cabeçalhos obrigatórios da Apple APNs (`apns-push-type: alert`, `apns-priority: 10`, `apns-expiration: 0`) no despachante VAPID (`web-push.ts`) com `silent: false` para forçar alerta sonoro imediato no iPhone com a tela bloqueada; (2) Geração de pacote de áudio WAV 16-bit PCM de alta fidelidade em `web/public/sounds/` com o som clássico de Caixa Registradora (`chaching.wav`), Moedas no Cofre (`safe-coins.wav`) e Sino de Ouro (`bell.wav`); (3) Sistema de Upload de Som Personalizado (`settings/notifications/page.tsx`) permitindo aos lojistas enviar qualquer arquivo de áudio (`.mp3`, `.wav`, `.m4a`) até 2MB, com audição de teste ao vivo e persistência nas preferências da loja (`custom_sound_url`); (4) Atualização do Service Worker (`sw.js`) para v2 com pré-cache dos arquivos de som e disparo de evento in-app; (5) Dica ergonômica para usuários de iPhone sobre a chave de silêncio lateral e modo Foco. | Antigravity |
| **v5.6.1** | 03/09/2026 | **iOS Safari File Upload Fix for MP3** | Correção de compatibilidade para upload de arquivos de áudio no iPhone/iOS Safari: (1) Substituição do botão programático por `<label htmlFor="custom-audio-upload">` nativo, eliminando o bloqueio de segurança do WebKit em inputs de arquivo ocultos; (2) Inclusão das extensões e MIME types explícitos no atributo `accept` (`audio/*,audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/aac,.mp3,.wav,.m4a,.aac`), liberando a seleção de MP3s diretamente do app Arquivos, iCloud Drive e Downloads do iPhone; (3) Substituição de `className="hidden"` por `className="sr-only"` e limpeza automática do buffer de arquivo para disparos repetidos. | Antigravity |
| **v5.7.0** | 03/09/2026 | **Conciliação e Transparência do Lucro Líquido & Sincronização de Taxas** | Auditoria e refinamento matemático da Dashboard e custos: (1) Descoberta e resolução do desacoplamento de loja na tela de Custos (`settings/costs/page.tsx`), integrando com o `useStore()` para que a loja ativa do topo governe a gravação de taxas e custos; (2) Sincronização das taxas reais cadastradas pelo usuário (`6,99% + R$ 1,99 no PIX`) para a loja ativa (`dckb5g-7d`), eliminando o fallback genérico de 9,9% e restaurando mais de R$ 1.600 de lucro real nos relatórios; (3) Atualização do Card 1 da Dashboard (`dashboard/page.tsx`) para exibir em destaque "Valor Vendido Pago" (Bruto) com legenda "Líquido pós-taxas", tornando a conciliação na tela 100% intuitiva (`Vendido Pago - Ads - Taxas = Lucro`); (4) Adição de tooltips detalhados nos cards de Lucro Líquido e Taxas de Gateway exibindo a quebra exata da fórmula. | Antigravity |
| **v5.8.0** | 03/09/2026 | **Shopify OAuth 2.0 Flow & Multi-Browser Signed State** | Implementação do fluxo oficial de autorização OAuth 2.0 da Shopify para sincronização de pedidos pagos reais sem fake fallback: (1) Criação do helper `shopify-oauth.ts` com assinatura criptográfica HMAC SHA-256 do parâmetro `state` (`storeId:timestamp:hmac`), permitindo a cópia do link para autorização em qualquer navegador ou aba (ex: aba anônima ou navegador onde a loja Shopify está logada), eliminando erros 403 CSRF causados por cookies de sessão locais; (2) Atualização das rotas `/api/auth/shopify` e `/api/auth/shopify/callback` para realizar a troca oficial via `POST https://{shop}/admin/oauth/access_token` com `client_id`, `client_secret` e `code`; (3) Criptografia AES-256-GCM do token permanente retornado (`shpat_...`) e persistência segura no Supabase dentro do JSONB `stores.settings.shopify`; (4) Interface modernizada em `settings/integrations/page.tsx` com campos de Client ID/Secret do App Partners, botão "Copiar Link para Autorizar em Outro Navegador", conexão 1-clique e botões de ressincronização limpa de pedidos reais; (5) Atualização do sincronizador `/api/v1/sync/shopify` para ler tokens decriptografados e alimentar o Dashboard com faturamento e lucro 100% verídicos. | Antigravity |
| **v6.0.0** | 06/09/2026 | **Meta Ads Architecture: Lazy Loading sob Demanda** | Resolução do gargalo de rate limit de Development Access (Code 17 / subcode 2446079) na Meta Graph API: (1) Transição do carregamento monolítico inicial para arquitetura de Lazy Loading sob demanda; (2) Carga inicial leve retorna exclusivamente `accounts` e `campaigns` (`adsets: []`, `ads: []`, `lazy_loading: true`), reduzindo o tempo de carregamento de ~15s para < 800ms; (3) Carregamento granular de conjuntos de anúncios disparado sob demanda (`GET /campaigns/list?campaign_id=X`) com campos aninhados `/{campId}?fields=adsets{...},insights{...}` imunes a rate limit; (4) Carregamento granular de anúncios disparado sob demanda (`GET /campaigns/list?adset_id=X`); (5) Cache isolado e independente por entidade (`store_date_campaign_ID`, `store_date_adset_ID`) em memória (`MEMORY_CACHE`) e preservação acumulativa no `sessionStorage` da aplicação, mantendo métricas contábeis (ROAS, CPA, Lucro, Spend) e histórico intactos. | Antigravity |
| **v7.0.0** | 07/09/2026 | **Feature & Automação** | **Campaign Action Engine & Central de Inteligência (Fase 7):** Migrations 019 e 020 (`campaign_intelligence_alerts`, `campaign_actions`, `campaign_settings`). Motor de decisões com fila assíncrona, execução e rollback bidirecional de orçamentos e status (play/pause/scale/kill), modal de configurações com modo de aprovação manual ou autônomo, e tolerância zero a regressões validadas por testes unitários e de integração. | Antigravity |
| **v8.0.0** | 08/09/2026 | **Arquitetura & Unificação Contábil** | **Unificação Contábil Definitiva (Fases 8, 8.1, 8.2, 8.3):** Eliminação de discrepâncias entre Dashboard e Banco. (1) Backfill do `revenue_ledger` com 2.772 fatias de atribuição nos 4 modelos (last_click, first_click, linear, u_shaped) conciliando R$ 75.783,11 (100% exato); (2) Migration 021 criando `campaign_cost_snapshots` com chave única `(store_id, ad_account_id, campaign_id, date)`; (3) Backfill de custos Meta com 719 snapshots persistidos ($ 14.039,83 USD e R$ 71.454,33 BRL); (4) Migração cirúrgica da rota `/api/v1/dashboard/metrics` para ler exclusivamente de `revenue_ledger` e `campaign_cost_snapshots` com fallback resiliente; (5) Suíte de testes `test-dashboard-financial-conciliation.js` com 14/14 testes aprovados. | Antigravity |

---

## 6. Arquitetura de Lazy Loading & Blindagem Meta Ads (v6.0.0 & v6.1.0)

### 6.1 Problema Estrutural Resolvido (Development Access & Code 17)
Apps Meta em modo *Development Access* possuem cota global reduzida por conta de anúncio (`error_subcode: 2446079`). O modelo anterior que realizava varredura exaustiva paginada de todos os AdSets e Ads de todas as contas simultaneamente causava exaustão de chamadas e timeouts 504.

### 6.2 O Pipeline Lazy Loading em 3 Modos
1. **Modo Inicial (`mode: "initial"`):**
   - Requisição: `GET /api/v1/meta/campaigns/list?store_id=X&date_preset=today`
   - Busca exclusivamente Contas (`accounts`) e Campanhas (`campaigns`).
   - Retorno instantâneo: `adsets: []`, `ads: []`, `lazy_loading: true`.
2. **Modo Campanha (`mode: "campaign"`):**
   - Requisição: `GET /api/v1/meta/campaigns/list?campaign_id=CAMP_ID&store_id=X&date_preset=today`
   - Consulta direta aninhada no nó da campanha: `/{campId}?fields=id,name,account_id,adsets.limit(250){...},insights.level(adset)...`
   - Retorna os adsets da campanha com métricas atribuídas e histórico.
3. **Modo AdSet (`mode: "adset"`):**
   - Requisição: `GET /api/v1/meta/campaigns/list?adset_id=ADSET_ID&store_id=X&date_preset=today`
   - Consulta direta aninhada no nó do conjunto: `/{adsetId}?fields=id,name,campaign_id,account_id,ads.limit(250){...},insights.level(ad)...`
   - Retorna os anúncios pertencentes ao adset.

### 6.3 Mecanismos de Blindagem Implementados
- **In-Flight Lock (Frontend):** Controlado por `inFlightCampaignsRef` e `inFlightAdsetsRef` (`useRef<Set<string>>`) em `page.tsx`. Disparos concomitantes para o mesmo identificador são descartados antes de gerar chamada HTTP.
- **Diferenciação Semântica (Caso A vs Caso B):**
  - **Caso A (Vazio Legítimo):** Consulta concluiu com sucesso (`ok: true`), exibindo `"Esta campanha não possui conjuntos de anúncios"` ou `"Este conjunto não possui anúncios"`.
  - **Caso B (Falha da Meta):** Consulta retornou erro ou timeout (`ok: false`, `error_type`), exibindo aviso âmbar com detalhe e botão interativo `[Tentar novamente]`.
- **Contrato Universal 100% Preservado:** Todas as respostas da API contêm as coleções completas (`accounts`, `campaigns`, `adsets`, `ads`), garantindo retrocompatibilidade total com clientes e testes.
- **Observabilidade Estruturada:** Logs JSON de uma linha sob a flag de ambiente `META_LAZY_OBSERVABILITY_ENABLED=true` sem qualquer dado pessoal (PII) ou tokens.

---

## 7. Arquitetura Contábil & Unificação Financeira (v8.0.0)

### 7.1 A Causa Raiz das Divergências Resolvida
Historicamente, as três interfaces financeiras do ATM calculavam métricas por caminhos heterogêneos:
- **Dashboard Resumo**: Varredura direta na tabela `events` (Purchase accepted) + Meta Graph API ao vivo.
- **Campanhas**: `events` + parseamento regex de UTMs inline + Meta Graph API ao vivo.
- **Atribuição**: `revenue_ledger` (que até a Fase 7 não recebia backfill retroativo).

### 7.2 O Novo Pipeline Contábil Unificado
1. **Camada de Receita (`public.revenue_ledger`):**
   - Todo pedido aprovado gera fatias auditáveis nos 4 modelos de atribuição (`last_click`, `first_click`, `linear`, `u_shaped`).
   - A Dashboard lê a receita contábil consolidada (`order_paid_at`), eliminando divergências de datas UTC/fuso de webhook.
2. **Camada de Custo (`public.campaign_cost_snapshots`):**
   - Snapshots diários consolidados com constraint `UNIQUE(store_id, ad_account_id, campaign_id, date)`.
   - Cotação comercial congelada no dia (`exchange_rate`) para conversão de USD para BRL, eliminando oscilações retrospectivas.
   - Preserva `spend`, `spend_brl`, `impressions`, `clicks`, `cpc`, `cpm`, `ctr`.
3. **Métricas Finais (ROAS, CPA, ROI):**
   - `Real ROAS = Receita Ledger / Spend Snapshots`
   - `Real CPA = Spend Snapshots / Total Pedidos Únicos`
   - `Real ROI = (Receita Líquida - Spend Snapshots - COGS) / Spend Snapshots`
4. **Resiliência Operacional com Fallback:**
   - Caso uma loja ou período novo ainda não possua snapshots sincronizados, o endpoint `/api/v1/dashboard/metrics` ativa automaticamente a busca ao vivo na Meta Graph API e na tabela `events`, mantendo a aplicação 100% funcional.

---

## 8. ATM Asset Intelligence Engine & Pre-Execution Guard™ (v9.0.0)

### 8.1 Motivação e Governança
O Campaign Action Engine não pode tomar decisões de escala e aumento orçamentário no vácuo. Injetar orçamento em uma campanha com bom ROAS pontual, mas associada a uma conta de anúncios com falhas de faturamento, restrições iminentes ou leilões em disparada (CPM em escalada abrupta) causa queima de capital e bloqueios de ativos.

### 8.2 As 3 Camadas de Avaliação Contínua
1. **Asset Trust Score (Ponderação 40%):**
   - Integridade jurídica e financeira do ativo Meta.
   - Analisa idade da conta de anúncio, status de verificação da Business Manager (`bm_verification_status`), histórico de falhas de cobrança (`payment_failures`), conformidade de status da conta (`account_status = 1`) e **Historical Risk Recovery** (5% de bônus seguro para ativos recuperados).
2. **Delivery Power Score (Ponderação 30%):**
   - Qualidade do sinal e entrega no leilão.
   - Analisa EMQ First-Party dos eventos CAPI locais, estabilidade de CPM (<15% excelente, >30% penalidade severa), degradação de CTR (sinal de fadiga criativa) e pressão de frequência de público (>2.5 saturação).
3. **Scaling Readiness Score (Ponderação 30%):**
   - Apetite financeiro e margem de escala.
   - Distância para o teto de gastos diário imposto pela Meta (`adtrust_spend_limit`), ROAS recente e distância do CPA atual para o CPA máximo tolerável da operação.

### 8.3 Interceptação Pré-Execução (Asset Intelligence Guard)
- **Localização:** `web/src/lib/intelligence/asset-intelligence-guard.ts` interceptando `web/src/app/api/v1/intelligence/actions/execute/route.ts`.
- **Três Níveis de Decisão:**
  - `APPROVED`: Ativo saudável com sinal verde para escala integral (até +30% diário).
  - `RESTRICTED`: Ativo com sinais de alerta moderados; teto de aumento é podado automaticamente para no máximo +15% diário.
  - `BLOCKED`: Ativo em risco crítico (falha de faturamento, conta desativada ou CPA acima do aceitável). Ação é rejeitada para execução, gravada na tabela `campaign_actions` como `status: 'rejected'` para fins de auditoria, e o erro 403 detalha exatamente os motivos do bloqueio.

### 8.4 Persistência Auditável (`meta_asset_health_snapshots`)
- Snapshots diários com chave única composta `(store_id, asset_type, asset_id, snapshot_date)`.
- Políticas RLS rigorosas de isolamento multi-tenant garantindo segregação total entre lojas.

### 8.5 Otimização de Leitura & Cache Multi-Tenant da Meta
- **Módulo**: `web/src/lib/meta/meta-cache.ts`.
- **Paralelização de Descoberta**: As consultas a nós de Business Managers (`/owned_ad_accounts` e `/client_ad_accounts`) foram migradas de um loop sequencial para execução concorrente com `Promise.allSettled`, reduzindo o tempo de resposta de 15s para ~1s.
- **Isolamento Multi-Tenant**: Chaves formatadas com hash criptográfico seguro do token (`${scope}:${storeId}:${tokenHash}`). Entradas com `storeId` divergente são sumariamente descartadas.
- **TTL e Invalidação**: TTL padrão de 5 minutos para contas e 45s para a Dashboard, com invalidação atômica manual via parâmetro `?refresh=true` e no salvamento de configurações (POST).
- **Polling Inteligente**: Frontend suspende polling quando a aba do navegador estiver oculta (`document.visibilityState === "hidden"`), preservando limites de cota da Graph API.

### 8.6 Meta Performance Observability Layer & Cooldown Protection
- **Módulo**: `web/src/lib/meta/performance-monitor.ts`.
- **Tabela**: `public.meta_performance_logs` (Migration `023_create_meta_performance_logs.sql`).
- **Arquitetura Fire-and-Forget**: A persistência é estritamente desacoplada e assíncrona; nenhuma resposta ao usuário aguarda escrita no banco de dados.
- **Filtro de Amostragem Inteligente (Anti-Inundação)**:
  - Cache HITs sub-50ms usam amostragem de 1% (`Math.random() < 0.01`), impedindo o acúmulo de milhões de linhas irrelevantes no banco.
  - Erros (`status_code >= 400` ou `error_message`), Cooldowns, Graph API lenta (>1000ms) e Cache MISS são gravados 100%.
- **Governança de Cooldown**:
  - Se uma loja atinge a taxa limite de chamadas live (25 chamadas em 30s), entra em Cooldown recuperável (45s).
  - Nunca bloqueia leitura de cache: o usuário continua recebendo dados locais imediatamente.
  - Suporta override/bypass imediato quando o usuário clica em atualizar manualmente (`refresh=true`).
- **Contextos de Negócio**: Métricas catalogadas por contexto (`dashboard`, `integration`, `asset_sync`, `campaign_sync`) e criticidade operacional (`low`, `medium`, `high`).

---

## 9. Financial Normalization & Campaign Profit Intelligence Layer™ (Fase 10)

### 9.1 Motivação e Imunização contra Falso ROAS
Contas de anúncio configuradas em USD com vendas ocorrendo em BRL geravam distorções severas:
- **Exemplo Real:** Gasto de $ 100 USD vs Receita de R$ 350 BRL.
- Sem normalização cambial, a visualização superficial aparentava um ROAS de $3.5\times$.
- Com a taxa comercial real (USD 1 = R$ 5,40), o custo operacional real é de R$ 540,00, gerando um ROAS real de $0.65\times$ e prejuízo de -R$ 190,00.
- A Camada 10 detecta ativamente essa anomalia (`false_roas_detected: true`) e força ação defensiva imediata (`PAUSE` ou `REDUCE`).

### 9.2 As 3 Camadas da Fase 10
1. **Camada 1 — Currency Normalization Engine:**
   - Converte gastos para a moeda operacional BRL (`spend_brl`) utilizando taxa de câmbio comercial do dia.
   - **Regra de Imutabilidade:** Valores originais (`spend_original`, `currency_original`) são estritamente preservados para auditoria.
   - Registra `exchange_rate` e `conversion_timestamp`.
2. **Camada 2 — Campaign Profit Score (5 Pilares Ponderados: 0 a 100):**
   - **Profitability Score (40%):** Lucro líquido real deduzido de COGS e custos operacionais, margem e ROI em BRL.
   - **CPA Efficiency Score (25%):** CPA real versus CPA máximo aceitável definido pelo lojista.
   - **ROAS Stability Score (15%):** Consistência temporal e alinhamento com ROAS target.
   - **Conversion Volume Score (10%):** Confiabilidade estatística contra conversões isoladas de sorte (volume de pedidos).
   - **Spend Efficiency Score (10%):** Capacidade de alocar orçamento sustentavelmente mantendo retorno positivo.
3. **Camada 3 — Financial Decision Ready API:**
   - Classificação em 3 Tiers:
     - 🟢 **GREEN ($\ge 85$):** Ação `SCALE` (+20% ou +30% de orçamento diário).
     - 🟡 **YELLOW ($70 \dots 84$):** Ação `MAINTAIN` (0% de alteração, manter e observar).
     - 🔴 **RED ($< 70$):** Ação `REDUCE` (-20%) ou `PAUSE` (-100% em caso de prejuízo severo, CPA descontrolado ou falso ROAS).
   - Justificativa textual auditável (`reason`) para governança financeira.

### 9.3 Tabela de Snapshots Diários (`campaign_profit_snapshots`)
- Migration: `supabase/migrations/024_create_campaign_profit_intelligence.sql`.
- Chave composta única: `(store_id, campaign_id, date)`.
- RLS habilitado para garantia total de isolamento multi-tenant.
- Métricas detalhadas preservadas em coluna `metrics` (JSONB).

---

## 10. Campaign Intelligence Bridge™ — Modo Copilot (Fase 10.1)

### 10.1 Arquitetura e Fusão de Sinais
A **Campaign Intelligence Bridge** conecta o motor financeiro (**Campaign Profit Engine**) e o motor de segurança jurídica/operacional de contas (**Meta Asset Intelligence Guard**) para geração de recomendações auditáveis assistidas (`requires_approval: true`), sem execução autônoma na Meta Graph API.

```
Campaign Profit Engine (Score 0-100, BRL) ──┐
                                            ▼
                               Campaign Intelligence Bridge
                                            ▲
Meta Asset Intelligence Guard (Health 0-100)─┘
                                            │
                                            ▼
               public.campaign_intelligence_recommendations
                               (status: pending_review)
```

### 10.2 Confidence Score Tri-Fator
Diferente de uma simples média, o índice de confiança contábil-operacional pondera maturidade estatística:
$$\text{confidence\_score} = 50\% \times \text{profit\_score} + 30\% \times \text{asset\_health\_score} + 20\% \times \text{data\_maturity\_score}$$
* **Data Maturity Score:**
  - $< 5$ pedidos: 40 pontos (estatisticamente preliminar)
  - $5 \dots 20$ pedidos: 70 pontos (volume representativo)
  - $> 20$ pedidos: 100 pontos (amostra madura)

### 10.3 Refinamento de Governança do Asset Guard na Escala (`asset_permission`)
Ao avaliar ações de aumento orçamentário (`SCALE`), o nível de permissão retornado é:
* `SAFE` ($\text{asset\_score} \ge 85$): Permite `SCALE` normal (+20% a +30%).
* `RESTRICTED` ($\text{asset\_score} \in [70, 84]$): Permite somente escala conservadora (poda de segurança para no máximo +15% diário).
* `BLOCKED` ($\text{asset\_score} < 70$): Impede qualquer escala (`action: "NO_ACTION"` com `reason: BLOCKED_BY_ASSET_GUARD` e `blocked_by_asset_guard: true`).

### 10.4 Cooldown e Deduplicação Determinística (`recommendation_hash`)
* Composição: `${store_id}:${campaign_id}:${action}:${budget_change_percent}:${date_window_24h}`.
* Se existir recomendação idêntica dentro da janela de 24 horas: nenhum novo registro é criado (`skipped: true, deduped: true`).
* Persistência na tabela `public.campaign_intelligence_recommendations` (Migration `025_create_campaign_intelligence_recommendations.sql`).

### 10.5 Motivação Comercial e Finalidade Estratégica

#### Por que o Confidence Score não mede apenas performance financeira?
A confiança da recomendação não representa apenas resultado financeiro momentâneo. Ela quantifica o **grau de certeza e solidez da decisão**, fundindo três pilares indissociáveis:
1. **Resultado Financeiro (`profit_score` — 50%)**: Garante que a campanha gera lucro líquido contábil real em BRL.
2. **Saúde e Integridade do Ativo (`asset_health_score` — 30%)**: Garante que o ativo Meta (conta, BM, score de entrega, histórico de billing) suporta a manobra sem risco de restrição, ban ou elevação de CPM.
3. **Volume Estatístico de Conversões (`data_maturity_score` — 20%)**: Avalia a robustez da amostragem para distinguir consistência de variância aleatória.

> **Princípio Fundamental:** Uma campanha pode apresentar lucro elevado (ex.: ROAS 5.0x com 2 compras) e ainda assim possuir baixa confiança global devido à escassa amostragem estatística. Essa regra protege o gestor contra falsos positivos e decisões precipitadas de escala em dados imaturos.

#### Por que o Recommendation Cooldown é mandatório?
Em mídia de performance, alterações sucessivas de orçamento no mesmo dia desestabilizam o leilão, reiniciam a fase de aprendizado e encarecem o CPA. O cooldown via `recommendation_hash` atua estrategicamente como:
- **Proteção Contra Ansiedade Algorítmica**: Impede que execuções frequentes de análise gerem recomendações duplicadas ou cumulativas em cascata.
- **Filtro de Ruído para o Gestor**: Mantém uma única recomendação consolidada e auditável por campanha a cada 24 horas, eliminando poluição de backlog.
- **Respeito ao Tempo de Resposta do Leilão**: Assegura a janela mínima necessária para o algoritmo da Meta calibrar antes de qualquer nova movimentação.

#### O Papel do Modo Copilot
O verdadeiro diferencial do ATM não é automatizar botões de API na Meta. O diferencial é **construir uma camada de inteligência com discernimento analítico superior ao gestor médio**, onde cada sugestão é explicável, embasada e sujeita à aprovação humana soberana (`requires_approval: true`).

---

## 11. Central de Recomendações e Auditoria (Fase 10.2)

### 11.1 Arquitetura de Observabilidade e Feedback Loop (24h / 48h / 72h)
A **Central de Recomendações e Auditoria** atua como o laboratório empírico do ATM. Antes de autorizar qualquer automação autônoma de orçamento, o sistema avalia o desfecho das suas próprias decisões passadas, comparando o snapshot inicial de métricas (`metrics_before`) com as métricas consolidadas após o leilão (`metrics_after`).

```
Recomendação Gerada (metrics_before)
               │
               ▼ (Janela de 24h / 48h / 72h)
  Extração de metrics_after
               │
               ▼
  Classificador Contábil de Desfecho
  ├── ACERTO  (Impacto financeiro líquido positivo)
  ├── ERRO    (Destruição de margem ou sangramento)
  └── NEUTRO  (Amostragem preliminar ou estabilidade)
               │
               ▼
  Cálculo do Hit Rate Histórico (%)
```

### 11.2 Regra de Ouro: Julgamento por Impacto Financeiro Líquido
Uma recomendação de escala (`SCALE`) **nunca é classificada como ERRO apenas pelo aumento absoluto do CPA**. No leilão da Meta, absorver escala com leve aumento de CPA é fisiológico (retornos marginais decrescentes), contanto que o volume absoluto de lucro líquido aumente e o CPA permaneça dentro do limite operacional.

* **ACERTO**:
  - Lucro incremental aumentou ($\Delta \text{profit} > 0$).
  - ROI permaneceu saudável e acima do limite ($\text{ROI} \ge 10\%$ e $\text{ROAS} \ge 1.15\text{x}$).
  - CPA permaneceu dentro do limite operacional ($\text{CPA} \le \text{max\_acceptable\_cpa}$).
* **ERRO**:
  - Aumento de orçamento destruiu margem.
  - Lucro líquido caiu ($\Delta \text{profit} < 0$) ou gasto subiu sem novos pedidos.
  - CPA ultrapassou o limite crítico tolerado pela operação ($\text{CPA} > \text{max\_acceptable\_cpa}$).
* **NEUTRO**:
  - Dados insuficientes ou período sem significância estatística ($< 5$ pedidos).

### 11.3 Tabela Canônica de `reason_code`
Cada avaliação pós-janela recebe um código determinístico padronizado:
| `reason_code` | Classificação | Significado Contábil |
| :--- | :---: | :--- |
| `PROFIT_GROWTH_AFTER_SCALE` | **ACERTO** | Lucro líquido expandiu com CPA absorvido dentro do teto operacional. |
| `SCALE_MARGIN_COLLAPSE` | **ERRO** | Escala destruiu margem ou CPA estourou o limite tolerado. |
| `LOSS_PREVENTION_AFTER_REDUCE` | **ACERTO** | Redução conteve perdas e restaurou a eficiência de CPA. |
| `BLEEDING_HALTED_AFTER_PAUSE` | **ACERTO** | Pausa estancou sangramento ativo em campanha sem conversões. |
| `PREMATURE_PAUSE_DETECTED` | **ERRO** | Campanha lucrativa com amostragem válida foi pausada indevidamente. |
| `STABLE_PERFORMANCE_MAINTAINED` | **ACERTO** | Campanha manteve equilíbrio contábil e entrega saudável. |
| `UNCONTAINED_PERFORMANCE_DROP` | **ERRO** | Campanha entrou em colapso sem contenção prévia. |
| `INSUFFICIENT_DATA` | **NEUTRO** | Amostragem insuficiente para validação conclusiva (< 5 pedidos). |
| `EVALUATION_WINDOW_NOT_ELAPSED` | **PENDING_EVALUATION** | Janela temporal mínima não transcorrida. Julgamento prematuro bloqueado. |

### 11.4 Proteção de Avaliação Temporal (Janela Mínima & D+1 / D+3)
* **Prevenção de Falso Negativo Intradiário**: Se uma escala for recomendada às 10h, até as 14h a campanha consumiu orçamento mas a curva de conversão ainda não se consolidou (delay natural de tráfego pago e compras no período noturno). Julgar a recomendação antes da janela mínima geraria um falso `ERRO`.
* **Regra de Bloqueio**:
  - Enquanto `elapsed_hours < min_required_hours`, nenhuma recomendação pode ser classificada como `ACERTO` ou `ERRO`. O classificador retorna compulsoriamente `outcome_result: "PENDING_EVALUATION"` com `reason_code: "EVALUATION_WINDOW_NOT_ELAPSED"`.
  - Para `SCALE`: Exige análise consolidada D+1 (mínimo 24h) ou D+3 (72h), proibindo classificação baseada puramente em flutuação intradiária.
  - Após a janela transcorrida: Avalia o impacto financeiro líquido. Caso a amostragem seja preliminar (< 5 pedidos), retorna `NEUTRO` com `INSUFFICIENT_DATA`.

### 11.5 Modo Simulação (Shadow Mode)
Operação invisível de auditoria com flag `is_simulation: true` e registro do raciocínio analítico:
`simulation_thought: "O ATM teria recomendado SCALE_BUDGET_PERCENT (+30%)"`.
Zero chamadas enviadas à Meta Ads API. O sistema atua como um analista silencioso acumulando histórico de assertividade.

### 11.6 Camada de Explicabilidade Humana (Human-First Copywriting)
Em vez de retornar apenas códigos brutos de máquina (`SCALE_BUDGET_PERCENT, +30%`), o ATM gera um objeto estruturado de comunicação comercial:
* **Headline Persuasivo**: *"🚀 O ATM recomenda aumentar orçamento (+30%)"*
* **Resumo Executivo**: Diagnóstico em uma frase.
* **Bullet Points de Evidências**: Métricas reais com checagem (compras confirmadas, margem de segurança do CPA, integridade do ativo).
* **Badge Visual**: Score, rótulo humanizado (*"Altíssima Confiança"*) e cor de destaque.
* **Nota de Simulação**: Transparência sobre o modo observacional.

### 11.7 Estrutura de Perfil (`confidence_profile`)
A estrutura de perfis de risco está arquitetada na tabela e nos tipos para expansão futura, com o baseline **`BALANCED`** (50% profit, 30% asset, 20% maturidade) travado como padrão para garantir que nenhuma variação artificial altere o aprendizado nesta fase.

---

## 12. Motor de Maturidade das Decisões do ATM™ (Fase 10.3)

### 12.1 Objetivo Estratégico
Transformar o histórico auditado de recomendações em uma camada analítica consolidada que responde à pergunta executiva do gestor:
> **"O ATM está tomando boas decisões?"**

Sem depender de interface visual (zero UI) e sem tocar na Meta Graph API (zero write API), o motor sintetiza o volume de acertos, erros e pendências, quantificando o valor econômico entregue em R$ (BRL).

### 12.2 Validação Estrita de Maturidade Estatística
O status **`HIGH_PERFORMANCE_MATURE`** não é concedido apenas por uma alta taxa de acerto em decisões defensivas (redução ou pausa). Ele exige cumulativamente:
1. `total_evaluated >= 20` (Volume estatístico suficiente).
2. `decisive_hit_rate_percent >= 75%` (Mínimo de 75% de acertos nas decisões conclusivas).
3. **`total_scale_evaluated >= 5`** (No mínimo 5 recomendações de escala de orçamento avaliadas e auditadas).

Se a conta possuir alta assertividade mas menos de 5 escalas avaliadas, o status permanece em **`PROMISING_ACCUMULATION`**, apontando nas áreas de atenção o volume restante de escalas para a maturidade plena.

### 12.3 Categorização do Impacto das Decisões (`decision_impact_type`)
O valor gerado é decomposto em três dimensões contábeis:
* **`PROFIT_GENERATION`** (Geração de Lucro): Lucro incremental consolidado gerado por recomendações de escala (`SCALE_BUDGET_PERCENT`) onde $\Delta \text{profit} > 0$.
* **`LOSS_PREVENTION`** (Prevenção de Prejuízo): Capital protegido e sangramento estancado por intervenções de redução (`REDUCE_BUDGET_PERCENT`) ou pausa imediata (`PAUSE_CAMPAIGN`).
* **`STABILITY_MAINTENANCE`** (Preservação de Estabilidade): Quantidade de campanhas em equilíbrio contábil mantidas ativas (`NO_ACTION`) sem oscilações desnecessárias.
* **`total_value_delivered_brl`**: Soma de lucro gerado + prejuízo evitado.

### 12.4 Idade da Inteligência (`intelligence_age_days`)
Mede o tempo de maturação do aprendizado algorítmico para a loja:
* **`0 a 7 dias`**: `EARLY_LEARNING` (Aprendizado Inicial).
* **`8 a 30 dias`**: `INITIAL_CALIBRATION` (Calibração Inicial).
* **`31 a 90 dias`**: `OPERATIONAL_LEARNING` (Aprendizado Operacional).
* **`90+ dias`**: `MATURE_MODEL` (Modelo Maduro).

### 12.5 Veredito Executivo em Português Brasileiro
O motor sintetiza os dados em um relatório estruturado:
* **Headline Executivo**: Resposta direta e sem jargões obscuros (*"Sim. O ATM demonstra alta assertividade..."*).
* **Ação Mais Assertiva**: Identifica qual intervenção possui melhor equilíbrio entre taxa de acerto, amostragem e retorno financeiro.
* **Áreas de Atenção**: Alerta sobre escalas preliminares, desfechos de erro a calibrar e pendências temporais.
* **Índice de Confiabilidade**: Score de 0 a 100 indicando a robustez estatística da amostra.
* **Pontos Chave**: Bullet points contábeis com dados em reais (BRL).





















