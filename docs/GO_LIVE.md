# Colocar o ATM no ar

Passo a passo para deixar o ATM funcionando em produção (atmtracking.vercel.app).
Nenhuma chave aparece aqui: cada item diz **onde** ela é colada.

## 1. Banco (Supabase)

O site usa o projeto Supabase que está em `NEXT_PUBLIC_SUPABASE_URL` na Vercel.
Em 24/11 era o `ntujbzsuesfgdlxfnbtk`.

Conferência feita em 24/11, só leitura e com a chave pública:
- **ntujbz:** só tinha as tabelas até a migration 010. `orders`, `sessions` e `events` estavam num formato antigo, sem `value`, `order_paid_at`, `status`… Sem isso, gravar e ler vendas falha.
- **rridx:** é o banco antigo, cujas chaves ficaram no repositório público. Está num formato ainda mais antigo (`stores.id` em texto). **Não usar.**

**O que fazer:**
1. Supabase → projeto do site → **SQL Editor** → **New query**.
2. Colar o arquivo inteiro `supabase/setup_producao.sql` e clicar em **Run**.
3. No fim aparece uma tabela. O esperado é uma linha `tudo certo`. Se aparecer alguma falha, copie a tabela e mande para o Claude.
   - O script pode rodar quantas vezes quiser.
   - Ele não apaga nada.
   - Ele cria o que falta, completa as colunas das tabelas antigas e libera as colunas velhas que travariam os INSERT.
4. Em **Authentication → URL Configuration**:
   - Site URL = `https://atmtracking.vercel.app`
   - Redirect URLs: incluir `https://atmtracking.vercel.app/**`

O `setup_producao.sql` é gerado a partir das migrations com `node scripts/build-setup-sql.js`. Depois de criar uma migration nova, rode o gerador de novo.

## 2. Variáveis na Vercel

Vercel → projeto `atm-advanced-tracking-manager` → Settings → Environment Variables (Production).
Depois de mudar qualquer variável, faça **Redeploy**.

| Variável | Obrigatória? | O que é |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | chave `anon` (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | chave `service_role` do **mesmo** projeto |
| `ATM_ENCRYPTION_KEY` | sim | 64 caracteres hexadecimais. Gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Não trocar depois: os tokens salvos deixam de abrir. |
| `NEXT_PUBLIC_APP_URL` | sim | `https://atmtracking.vercel.app` |
| `ATM_WEBHOOK_SECRET` | recomendada | gera os `?token=` das URLs de webhook. Sem ela, usa a `ATM_ENCRYPTION_KEY`. Se trocar, as URLs de webhook mudam. |
| `CRON_SECRET` | recomendada | texto aleatório longo. A Vercel manda no cron diário de custos (`web/vercel.json`). Sem ela, o cron é recusado. |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | para o login da Meta | app da Meta (developers.facebook.com) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | para notificação push | gerar par novo com `npx web-push generate-vapid-keys`. Sem elas, o código usa um par que está no repositório público. |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | só loja Shopify | app da Shopify |
| `MERCADOPAGO_ACCESS_TOKEN` | só cobrança do plano do ATM | Mercado Pago |
| `META_ACCESS_TOKEN` / `META_PIXEL_ID` | opcional | reserva global. O certo é cada projeto ter o seu pixel e token em Integrações. |

## 3. Apps externos

- **Meta (developers.facebook.com → app → Login do Facebook → Configurações):** URI de redirecionamento OAuth válido = `https://atmtracking.vercel.app/api/auth/facebook/callback`
- **Shopify (se usar):** App URL e redirect = `https://atmtracking.vercel.app/api/auth/shopify/callback`

## 4. Primeiro acesso

1. Abrir `https://atmtracking.vercel.app/register` e criar a conta. As contas do banco antigo não existem no banco novo.
2. **Configurações → Projeto:** criar cada projeto com o tipo certo (Loja, Infoproduto ou Web app) e o domínio.
3. **Integrações:**
   - colar o Pixel ID e o token da Meta do projeto;
   - copiar o script do pixel para a página de vendas;
   - copiar as URLs de webhook com `?token=` para o checkout (Zedy, Vega, Gateway7) ou para a sua API de PIX.
4. **Custos & Taxas:** cadastrar taxa do gateway, imposto e, em infoproduto, afiliado e coprodução.
5. Fazer uma venda de teste de valor baixo e ver se ela aparece em **Pedidos** e no **Resumo**.

**Atenção:** projeto sem Pixel ID cadastrado usa um pixel padrão que está fixo no código. Cadastre o pixel em todos os projetos antes de ligar o tráfego.

## 5. Teste rápido depois do deploy

- `https://atmtracking.vercel.app/login` abre.
- Depois do login, o Resumo carrega sem aviso de erro.
- `Configurações → Projeto` salva o tipo do projeto sem o aviso "migration 030".
