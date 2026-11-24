# Plano: ATM para infoproduto e web app com assinatura

Data: 2026-11-23. Situação: **Fase 2 implementada** (local, sem commit). As outras fases ainda são proposta.

## Fase 2: o que foi feito (23/11)
- Motor único em `web/src/lib/conversions/engine.ts`. Os adaptadores ficam em `lib/conversions/adapters/`: `generic-checkout` (Vega e Gateway7), `zedy` e `atm-api`.
- As rotas da Vega, Gateway7 e Zedy viraram arquivos de cerca de 10 linhas cada: saíram ~1.540 linhas repetidas.
- Nova API universal `POST /api/v1/conversions/<loja>`, documentada em `docs/API_CONVERSOES.md`.
- Mudanças de comportamento, todas de propósito:
  - Só usa a integração Meta **da própria loja**. Antes Vega e Gateway7 pegavam a de qualquer loja, e a Zedy caía na de outra loja.
  - A Zedy usava o cliente sem sessão para ler a integração, então provavelmente nunca achava nada. Agora usa o cliente admin.
  - Não inventa mais IP (`186.216.52.196`), navegador nem `fbp`. Sem navegador do comprador, o evento vai como `system_generated`.
  - A busca reversa da Vega e Gateway7 pegava a sessão mais recente de **qualquer visitante**. Isso foi removido: agora é só por `track_id`/`fbp` da própria loja.
  - Sessão buscada por loja + `track_id`.
  - Modo teste não envia para o pixel de produção sem código de teste e não grava nada.
  - Deduplicação também para AddPaymentInfo/InitiateCheckout na Vega e Gateway7. A notificação de PIX pendente agora sai depois da trava, sem duplicar.
  - Agora o pedido também é gravado em `orders`: pendente, pago ou estornado.
- O webhook da Shopify ainda não usa o motor. Fica para quando mexermos nele.
- Testes: `scripts/test-conversions.js` (41 testes), mais um teste de ponta a ponta local com Supabase falso.

## Fase 3: o que foi feito (23/11, sem commit)
- Pixel v5 em `web/src/lib/tracking/pixel-script.ts`. A rota `pixel/[domain]/script.js` só escolhe a loja.
- API pública `window.ATM` (`track`, `identify`, `getTrackId`, `getAttribution`, `decorate`) e a fila `atm(...)` para chamar antes do carregamento.
- Modo página própria, detectado sozinho: sem carrinho e sem o valor fixo de R$ 172,88. O valor vem de `__ATM_CTX__.offer` ou de `data-atm-value`, e `data-atm-event` serve para marcar botões sem código.
- UTMs guardadas por 30 dias. A rota `/capture` não sobrescreve mais campos com vazio: o heartbeat de 15 s apagava UTMs e fbclid quando a pessoa mudava de página.
- Bugs corrigidos no script antigo:
  - `isZedyLink` não existia e dava erro em todo clique em link;
  - o checkout lia o cookie `atm_track_id`, que nunca era criado, então o `track_id` não ia para os links;
  - qualquer página com `?id=` disparava uma compra falsa de R$ 0;
  - o `event_id` da compra no navegador ("order_X") era diferente do servidor ("Purchase_X"), e a Meta não deduplicava.
- Busca da loja pelo script: `?store=<uuid>`, depois o domínio exato ou `custom_domains`, depois o domínio parcial só se casar com uma loja. Antes, o domínio entrava sem validar no filtro e, sem loja, caía na loja fixa "dckb5g-7d". Agora loja não encontrada recebe um script vazio.
- Integrações ganhou o card "Página própria: infoproduto e web app" (script, exemplos, URL e cabeçalho da API).
- Removido da página de Integrações um **token da Zedy** que estava fixo no código (repositório público): precisa ser trocado na Zedy.
- `StartTrial` aceito nos eventos do navegador.
- Testes: `scripts/test-pixel-script.js` (22 testes em navegador simulado), mais um teste no navegador real com página própria local.

## Fase 5: o que foi feito (24/11, sem commit)
- Migration `031_info_cost_rules.sql`: a tabela de custos (`taxes_and_duties`) aceita `affiliate` e `coproduction`, além de imposto e taxa de gateway. Percentual fica entre 0 e 100.
- Testada num Postgres real (PGlite): 7 de 7, e rodar duas vezes não quebra.
- Cálculo em `web/src/lib/pnl/project-pnl.ts`, por venda e nesta ordem:
  1. taxa do gateway (por forma de pagamento, % e/ou R$ fixo);
  2. afiliado: % sobre o que sobra;
  3. coprodução: % sobre o que sobra depois do afiliado;
  4. imposto: % sobre o faturamento ou sobre a sua comissão.
- Exemplo: R$ 100 com gateway 5%, afiliado 40% e coprodução 20% dá taxa 5, afiliado 38, coprodução 11,40 e sobra 45,60.
- Reembolso (infoproduto e app): sai do lucro o valor devolvido menos a parte do afiliado e do coprodutor, que também é estornada. A taxa e o imposto não voltam.
- Web app: as renovações (que não vão para a Meta) entram no vendido e no lucro. A 1ª cobrança não conta duas vezes.
- Reembolsos e renovações só entram com a conta de anúncio "Qualquer", porque não têm a conta gravada.
- Sem nenhum custo cadastrado, a loja continua com a estimativa antiga (9,9% no PIX, 15% no cartão). Infoproduto e app ficam com taxa zero, e o Resumo mostra um aviso com o botão "Cadastrar custos".
- A rota `/api/v1/dashboard/metrics` devolve um bloco `pnl` com taxa, imposto, afiliado, coprodução, reembolsos, renovações e custo de produto. O `refund_rate` passou a ser real em info e app.
- Resumo: em info e app aparece uma linha com Impostos, Afiliados, Coprodução, Reembolsos (e Renovações no app). A dica do Lucro lista cada desconto. Tirada a dica errada "6,99% + R$ 1,99 no PIX" das taxas.
- Custos & Taxas:
  - card novo "Afiliados e Coprodução";
  - o custo de produto (COGS) só aparece em loja;
  - o texto do imposto "sobre a comissão" agora vale de verdade (antes era ignorado).
- Bugs corrigidos em Custos & Taxas:
  - apagar uma regra apagava a errada da lista (o índice era da lista filtrada);
  - a tela caía numa loja fixa "dckb5g-7d" quando não havia projeto ativo.
- Na loja, o cálculo dá o mesmo resultado de antes. Conferido em 140 combinações de regra, forma de pagamento e valor. Só muda o imposto "sobre a comissão", que antes era calculado sobre o faturamento.
- Testes:
  - `scripts/test-pnl.js`: 11;
  - teste ponta a ponta local da rota do Resumo, com login falso, para um web app e para uma loja.

## Fase 1: o que foi feito (24/11, sem commit)
- Migration `030_add_project_type.sql`: coluna `stores.project_type` (`ecommerce`, `infoproduct` ou `app`). Lojas que já existem ficam como `ecommerce`. A plataforma passou a aceitar `custom` (página própria).
- Testada num Postgres real (PGlite): 6 de 6, e rodar duas vezes não quebra.
- `web/src/lib/projects/types.ts`: textos e regras de cada tipo, e a limpeza do domínio digitado.
- Cadastro (Configurações → Projeto): escolha do tipo no topo, textos do domínio conforme o tipo, domínio limpo sozinho ("https://www.Site.com/oferta" vira "site.com"), aviso de domínio já usado em outro projeto. Dá para abrir já com um tipo: `/dashboard/settings/store?new=true&type=app`.
- Menu: "Assinaturas" só aparece em web app; "Pedidos & Vendas" vira "Vendas" (infoproduto) ou "Cobranças & Vendas" (app). "Loja" virou "Projeto", e "Adicionar loja" virou "Novo projeto". A lista de projetos mostra o tipo de cada um.
- Telas: em infoproduto e app somem a sincronização da Shopify (Pedidos), o card da Shopify e o script do `theme.liquid` (Integrações).
- Sem a migration 030 nada quebra: tudo conta como loja e o cadastro avisa que o tipo não foi salvo.
- Testes: `scripts/test-projects.js` (9), mais a tela testada no navegador local.
- A tabela continua se chamando `stores` e a coluna `store_id`: só a tela fala em "projeto". Renomear no banco quebraria tudo sem ganho.

## Fase 4: o que foi feito (24/11, sem commit)
- Migration `029_create_subscriptions.sql`: tabela `subscriptions` (uma linha por assinatura, com MRR, status, nº de cobranças, receita total e campanha da primeira visita) e a coluna `orders.subscription_id`.
- Função `atm_record_subscription_event` no banco: grava a cobrança e atualiza a assinatura de uma vez só. Cobrança repetida não soma duas vezes, estorno desconta da receita, pagamento depois de cancelar reativa. Só o service_role pode chamar.
- Testada num Postgres real (PGlite): 16 de 16, e rodar a migration duas vezes não quebra.
- Motor: eventos de assinatura, estorno e chargeback vão para essa função. Se a migration não foi rodada, cai no pedido comum e avisa no log.
- API: `subscription.id` obrigatório nos eventos de assinatura, intervalo validado (aceita "mensal", "anual"...), `tracking.utm_id` aceito.
- Cálculo em `web/src/lib/subscriptions/metrics.ts`: MRR, ARR, ARPU, novos, churn (só de quem já pagou), LTV recebido e estimado, CAC, payback, trial→pago, e tudo por campanha cruzando com o gasto de `campaign_cost_snapshots`.
- Rota `GET /api/v1/subscriptions/metrics?store_id&days` e tela **Assinaturas** no menu (o antigo item "Assinatura" das configurações virou "Plano do ATM").
- Testes: `scripts/test-subscriptions.js` (20), mais um teste ponta a ponta local: o evento pela API chega na função do banco com a campanha certa.
- Falta: rodar a migration 029 no Supabase e saber qual gateway cobra as assinaturas, para ligar o webhook dele direto.

## Objetivo
Hoje o ATM rastreia bem a **loja de drop na Shopify**. A ideia é rastrear também:
- **Infoproduto** vendido por **API de PIX própria** (e outras plataformas, deixando a porta aberta);
- **Web app com assinatura** (SaaS), com a página de vendas em **domínio próprio**.

## O que hoje prende o ATM à Shopify/drop
| Onde | Problema |
|---|---|
| Tabela `stores` | `shop_domain` é obrigatório e único, e `platform` só aceita `shopify`, `woocommerce`, `yampi` e `cartpanda`. Não existe "projeto de infoproduto" nem "app". |
| Webhooks | Zedy, Vega e Gateway7 são cópias de cerca de 500 linhas cada (Vega e Gateway7 são idênticos). Cada checkout novo vira mais uma cópia. Não existe uma porta de entrada genérica. |
| Pixel (`script.js`) | Ele é feito para loja: lê preço do carrinho e do produto, procura botões de checkout pelo nome (zedy, vega, yampi…) e tem um **valor reserva fixo de R$ 172,88** para o InitiateCheckout. Não tem `identify()` nem `track('Lead')` para página de captura. |
| Pedidos (`orders`) | Só existe venda avulsa (`created`, `pix_pending`, `paid`, `refunded`, `cancelled`). Não há assinatura, renovação, trial, cancelamento nem churn. |
| Painel e P&L | O lucro considera custo de produto, frete e imposto de importação. Infoproduto tem taxa de gateway, coprodução e afiliado. SaaS precisa de MRR, churn, LTV e CAC. |

## Proposta (em fases)

### Fase 0: base segura (pré-requisito)
Commit e deploy das correções de segurança já prontas: login nas rotas, token nos webhooks e chaves só por variável de ambiente. As novas portas de entrada usam esse mesmo esquema, então isso vem primeiro.

### Fase 1: "projetos" em vez de só "lojas"
- Migration: `stores.kind` com os valores `ecommerce`, `infoproduto` e `app`. `shop_domain` deixa de ser obrigatório (passa a valer o domínio da página). O CHECK de `platform` é ampliado para aceitar `custom`.
- Tela de criar projeto, em que você escolhe o tipo e o domínio da página de vendas.
- O painel mostra os cartões certos para cada tipo.

### Fase 2: motor único de conversão + API universal
- Tirar a lógica repetida dos webhooks e colocá-la numa função só, `processConversion(evento normalizado)`. Ela faz deduplicação, envio para a CAPI, `orders`, `revenue_ledger`, costura de identidade e notificação.
- Zedy, Vega, Gateway7 e Shopify viram **adaptadores** pequenos que só traduzem o JSON de cada um. Ficam bem menos linhas, e um checkout novo custa uns 50 linhas.
- **Nova API universal:** `POST /api/v1/conversions/<projeto>`, com token do projeto. Sua API de PIX e o seu web app mandam direto do servidor eventos como:
  - `lead` (cadastro), `pix_gerado`, `compra_aprovada`, `reembolso`, `chargeback`
  - `trial_iniciado`, `assinatura_iniciada`, `assinatura_renovada`, `assinatura_cancelada`
- Cada evento vira o evento certo na Meta (Lead, InitiateCheckout/AddPaymentInfo, Purchase, StartTrial, Subscribe), com `event_id` para não duplicar com o pixel.
- Fica fácil plugar depois adaptadores prontos (Mercado Pago, Efí, Asaas, Stripe, Hotmart, Kiwify) sem mexer no motor.

### Fase 3: pixel/SDK genérico para página própria
- Novo modo "página própria" do script, sem nada de carrinho:
  - `ATM.track('Lead' | 'ViewContent' | 'InitiateCheckout', {...})`
  - `ATM.identify({ email, phone })` no formulário
  - `ATM.getTrackId()` para o seu checkout de PIX ou o web app mandar o `track_id` junto quando gera a cobrança. É isso que liga a venda ao clique do anúncio.
- Remover o valor fixo de R$ 172,88.
- Um trecho de código pronto para copiar na tela de Integrações, com exemplo em JS e em `curl`.

### Fase 4: assinaturas (web app)
- Tabela `subscriptions` com cliente, plano, valor mensal, status, `started_at`, `canceled_at`, `track_id`/identidade e campanha de origem.
- A primeira cobrança é atribuída à campanha. As renovações somam no **LTV da campanha**, mas não são mandadas de novo como "compra nova" para a Meta. Assim o algoritmo não aprende errado.
- Painel do app: MRR, novos assinantes, churn, trial→pago, LTV e CAC por campanha, e payback.

### Fase 5: P&L para info
- Custos configuráveis por projeto: % do gateway, taxa fixa por PIX, % de coprodução e de afiliado, e imposto.
- O ROAS e o lucro do painel passam a usar esses custos quando o projeto é de infoproduto ou de app.

## Ordem sugerida
0 → 2 → 3 → 1 → 4 → 5. O motor único e a API universal já deixam você rastrear PIX e web app mesmo antes da tela bonita de projetos.

## Dúvidas para fechar antes da Fase 4
- Qual gateway cobra a assinatura do web app (Stripe, Mercado Pago, Asaas, outro)?
- O web app e a API de PIX são seus? Dá para colocar uma chamada HTTP no servidor deles?
