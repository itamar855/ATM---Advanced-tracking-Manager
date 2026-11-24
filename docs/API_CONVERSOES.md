# API universal de conversões do ATM

Use esta API para mandar vendas e eventos de funil **do seu servidor** para o ATM: API de PIX própria, web app com assinatura ou qualquer checkout que não tenha integração pronta. O ATM manda o evento para a Meta (CAPI), grava no painel e dispara as notificações.

## Endereço e autenticação

```
POST https://atmtracking.vercel.app/api/v1/conversions/<ID_DA_LOJA>
Authorization: Bearer <TOKEN_DA_LOJA>
Content-Type: application/json
```

- `<ID_DA_LOJA>` é o UUID da loja/projeto no ATM.
- `<TOKEN_DA_LOJA>` é o mesmo token que aparece no fim das URLs de webhook da Vega e da Zedy (`?token=...`), em **ATM → Integrações**.
- O token também pode ir no cabeçalho `x-atm-webhook-token` ou em `?token=`.
- Guarde o token **só no servidor**, nunca no navegador.

## Na página (pixel v5)

Cole antes de `</head>` em todas as páginas: vendas, checkout e obrigado. O trecho pronto, já com o ID da loja, está em **ATM → Integrações → Página própria**.

```html
<script>
  window.atmq = window.atmq || []; function atm(){ atmq.push(arguments); }
  window.__ATM_CTX__ = { offer: { id: "curso-x", name: "Curso X", value: 97.00 } };
</script>
<script src="https://atmtracking.vercel.app/api/v1/pixel/site/script.js?store=<ID_DA_LOJA>" async></script>
```

O que o script faz sozinho:
- PageView;
- captura de fbp e fbc, e as UTMs. As UTMs ficam guardadas por 30 dias, então continuam valendo nas páginas seguintes;
- Lead quando a pessoa digita o e-mail ou o WhatsApp num formulário;
- InitiateCheckout no clique de "comprar" ou "checkout", com o valor de `offer.value`;
- coloca `track_id`, fbp, fbc e UTMs nos links de checkout externo (Kiwify, Hotmart, Cakto...).

Pelo código:
```js
atm("identify", { email, phone, name });   // depois do cadastro
atm("track", "Lead");                       // ou CompleteRegistration, StartTrial, Subscribe...
const tracking = ATM.getAttribution();      // mande ao seu backend e repasse na API abaixo
atm("track", "Purchase", { order_id: "txn_123", value: 97 }); // opcional na página de obrigado
```
Sem código, em qualquer botão ou link: `data-atm-event="InitiateCheckout" data-atm-value="97"`.

O `Purchase` da página usa o event_id `Purchase_<order_id>`, o mesmo que a API manda. Por isso a Meta conta uma vez só.

## Eventos

| `event` | Apelido em português | Vai para a Meta como | Precisa de `value` |
|---|---|---|---|
| `lead` | `cadastro` | Lead | não |
| `checkout_started` | `checkout_iniciado` | InitiateCheckout | não |
| `payment_pending` | `pix_gerado`, `boleto_gerado` | AddPaymentInfo | sim |
| `purchase` | `compra_aprovada` | Purchase | sim |
| `trial_started` | `trial_iniciado` | StartTrial | não |
| `subscription_started` | `assinatura_iniciada` | Purchase (1ª cobrança) | sim |
| `subscription_renewed` | `assinatura_renovada` | **não envia** (só registra) | sim |
| `subscription_canceled` | `assinatura_cancelada` | **não envia** (só registra) | não |
| `refund` / `chargeback` | `reembolso`, `estorno` | **não envia** (marca o pedido como estornado) | não |

Renovação, cancelamento e estorno não vão para a Meta. Assim o algoritmo não aprende que uma renovação é uma venda nova da campanha.

**Assinatura:** mande `subscription_started` na **primeira** cobrança, em vez de `purchase`. Nas seguintes, mande `subscription_renewed`, cada uma com um `id` próprio (o ID da fatura).

### Assinaturas (web app)
- Todo evento de assinatura (`trial_started`, `subscription_started`, `subscription_renewed`, `subscription_canceled`) **precisa** de `subscription.id` (ou `subscription_id` no topo): o ID da assinatura no seu sistema. Sem ele a resposta é 400.
- `subscription.interval`: `day`, `week`, `month`, `quarter`, `semester` ou `year`. Também aceita `diário`, `semanal`, `mensal`, `trimestral`, `semestral`, `anual` e `monthly`/`yearly`. Outro valor dá 400. Sem intervalo, conta como mensal.
- O ATM guarda tudo na tabela `subscriptions`: status, plano, valor mensal (MRR), nº de cobranças, receita total e a campanha da **primeira** visita. A campanha vem de `utm_campaign` no formato `nome|id`, ou de `tracking.utm_id` / `tracking.campaign_id`. Se mandar só `track_id`, as UTMs vêm da visita.
- `refund` / `chargeback` com o `id` da cobrança tiram o valor da receita da assinatura.
- Mandar a mesma cobrança duas vezes não soma duas vezes. Pagamento depois de cancelado reativa a assinatura.
- Os números aparecem em **Assinaturas** no painel: MRR, ativos, novos, churn, LTV, CAC, payback e trial→pago, também por campanha.
- Pré-requisito: a migration `supabase/migrations/029_create_subscriptions.sql` rodada no Supabase. Sem ela, os eventos de assinatura viram pedidos comuns e a tela avisa que falta a migration.

## Corpo

Só `event` e `id` são obrigatórios. Quanto mais dados, melhor a correspondência na Meta.

```json
{
  "event": "purchase",
  "id": "txn_8f2a",
  "value": 97.00,
  "currency": "BRL",
  "payment_method": "pix",
  "occurred_at": "2026-11-23T14:05:00-03:00",
  "customer": {
    "email": "cliente@email.com",
    "phone": "11999990000",
    "name": "Nome Sobrenome",
    "id": "user_123"
  },
  "products": [{ "id": "curso-x", "name": "Curso X", "quantity": 1, "price": 97.00 }],
  "tracking": {
    "track_id": "valor de ATM.getTrackId() na página",
    "fbp": "cookie _fbp",
    "fbc": "cookie _fbc",
    "utm_source": "facebook",
    "utm_campaign": "nome|id_da_campanha",
    "utm_medium": "", "utm_content": "", "utm_term": "",
    "utm_id": "id_da_campanha (opcional)",
    "ip": "IP do comprador",
    "user_agent": "navegador do comprador",
    "page_url": "https://seudominio.com/oferta"
  },
  "subscription": { "id": "sub_1", "plan": "Pro mensal", "interval": "month" },
  "test": false
}
```

- `value` em reais. Se preferir, mande `value_in_cents`.
- `payment_method`: `pix`, `boleto`, `card` ou `other`.
- `event_id` (opcional): se o pixel do navegador também mandou o mesmo evento, use o mesmo ID para a Meta deduplicar.
- O mesmo `event` + `id` enviado duas vezes é ignorado na segunda (resposta `"duplicate": true`).

### O que liga a venda ao anúncio
A Meta atribui a venda à campanha pelos sinais do comprador. Em ordem de importância:
1. **`track_id`**: o ATM busca sozinho fbp, fbc, IP, navegador e UTMs da visita. Ele vem do pixel do ATM na sua página. Guarde-o quando a pessoa gera o PIX ou cria a conta: `ATM.getTrackId()` na página, ou `ATM.getAttribution()`, que já devolve o objeto `tracking` inteiro.
2. `fbp` / `fbc`, se você já os tem.
3. E-mail e telefone.

## Teste

Mande `"test": true`. O ATM **não grava nada** e:
- se a integração Meta da loja tiver um *código de teste* configurado, envia para o **Testar eventos** da Meta;
- se não tiver, só monta o evento e devolve em `metaResponse.preview`, sem enviar.

## Respostas

| HTTP | Quando |
|---|---|
| 200 `"ok": true` | Aceito (veja `sentToMeta`, `duplicate`, `dryRun`) |
| 200 `"ok": false` | Registrado, mas a Meta recusou ou a loja não tem integração Meta (motivo em `error`) |
| 400 | Corpo inválido. A mensagem em `error` diz qual campo. |
| 401 | Token ausente ou de outra loja |
| 413 | Corpo maior que 256 KB |

## Exemplos

**curl (PIX pago):**
```bash
curl -X POST "https://atmtracking.vercel.app/api/v1/conversions/$ATM_STORE_ID" \
  -H "Authorization: Bearer $ATM_TOKEN" -H "Content-Type: application/json" \
  -d '{"event":"compra_aprovada","id":"txn_8f2a","value":97,"payment_method":"pix","customer":{"email":"cliente@email.com"},"tracking":{"track_id":"..."}}'
```

**Node (dentro do webhook do seu gateway de PIX):**
```js
await fetch(`https://atmtracking.vercel.app/api/v1/conversions/${process.env.ATM_STORE_ID}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.ATM_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "purchase",
    id: charge.id,
    value: charge.amount / 100,
    payment_method: "pix",
    customer: { email: charge.customer.email, phone: charge.customer.phone, name: charge.customer.name },
    tracking: { track_id: charge.metadata.atm_track_id },
  }),
});
```
