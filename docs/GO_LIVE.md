# Colocar o ATM no ar

Passo a passo para deixar o ATM funcionando em produção (atmtracking.vercel.app).
Nenhuma chave aparece aqui: cada item diz **onde** ela é colada.

## 1. Banco (Supabase)

**Banco de produção (desde 26/11): `rridxhzbkitgcodzyctu`**, o projeto "ATM - Tracking Manager" na organização Rastreio.io (plano Pro).

Em 26/11:
- As 23 tabelas antigas, com os dados das lojas Dose Certa e Atacadão das Gaiolas até 20/10, foram movidas para o esquema `legado`. Nada foi apagado. Para consultar: `SELECT ... FROM legado.events`.
- O `setup_producao.sql` rodou no esquema `public` e deu "tudo certo": 28 tabelas, todas com RLS, e 37 policies.
- Os 2 usuários de login que já existiam ganharam tenant. Dá para entrar com a conta antiga.
- O `ntujbzsuesfgdlxfnbtk` não está na conta do Supabase em uso. Ele deixou de ser o banco do site.

**As chaves do rridx ficaram no repositório público.** Antes de ligar o site nele:
- Supabase → Project Settings → API Keys: crie chaves novas (publishable e secret).
- Desative as chaves antigas (legacy `anon`/`service_role`).
- Cole as novas na Vercel.

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
| `NEXT_PUBLIC_SUPABASE_URL` | sim | `https://rridxhzbkitgcodzyctu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | chave **publishable** nova (Settings → API Keys) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | chave **secret** nova do **mesmo** projeto |
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

1. Entrar em `https://atmtracking.vercel.app/login` com a conta que já existia no rridx, ou criar outra em `/register`.
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
