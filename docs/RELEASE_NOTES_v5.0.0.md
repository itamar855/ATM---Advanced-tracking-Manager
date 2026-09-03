# 🚀 ATM — Advanced Tracking Manager ADS
## Release v5.0.0 & v5.1.0: Meta Enterprise, Multi-BM Intelligence & UI Integrity

> **Data de Lançamento:** 03 de Setembro de 2026  
> **Status:** Produção Estável (`trackingatm.vercel.app`)  
> **Escopo:** Integração Meta Ads, Resolução Universal de Tokens, Gestão Multi-BM e Integridade de Interface

---

### 🌟 Destaques da Versão (Highlights)

Esta versão resolve de forma definitiva e estrutural a autenticação OAuth da Meta, o reconhecimento de ativos de anúncios em contas corporativas de grande porte e traz um novo design para seleção individual de Business Managers minimizadas.

---

### 🛠️ O que há de novo e melhorias (Changelog Completo)

#### 1. 🔐 Normalizador Universal de Access Tokens Meta (`token.ts`)
* **Eliminação Definitiva do Erro 190 (`Cannot parse access token`):**
  * Suporte automático para decodificação de colunas `BYTEA` do PostgreSQL com prefixo hexadecimal `\x...`.
  * Extração inteligente de tokens aninhados em objetos JSON (`{"access_token": "..."}` ou `{"token": "..."}`).
  * Descriptografia transparente AES-256-GCM com fallback de tolerância a falhas.
  * Padronização de tokens limpos (`EAAPDF...`) em 10 rotas críticas de backend (campanhas, métricas, diagnósticos, testes CAPI e webhooks).

#### 2. 🗂️ Novo Seletor Inteligente de Business Managers Minimizadas (`integrations/page.tsx`)
* **Visualização Compacta por Padrão:** As Business Managers agora carregam colapsadas/minimizadas em accordions elegantes, eliminando a sobrecarga de ter que desmarcar dezenas de contas manualmente.
* **Toggle Individual por BM (1 Clique):** Cada cabeçalho de Business Manager possui um switch direto (*"BM Adicionada"* / *"Não Adicionada"*) que adiciona ou remove a BM inteira e suas contas instantaneamente.
* **Barra de Busca em Tempo Real:** Pesquisa instantânea de BMs por nome ou ID numérico.
* **Ações Rápidas em Lote:** Botões para *"Expandir Todas"*, *"Minimizar Todas"* e *"Desmarcar Todas"* com feedback visual imediato.
* **Ajuste Fino Individual:** Accordion com botão *"Ver Contas"* para inspecionar, marcar ou desmarcar contas específicas dentro de qualquer BM.

#### 3. 🛡️ Integridade Visual e Falso-Positivo Eliminado
* **Badge de Status 100% Dinâmico:**
  * O card principal agora só exibe `• Conectado` (verde pulsante) quando há conexão ativa **e** contas reais sincronizadas (`metaConnected && profiles.length > 0`).
  * Quando não há perfil ou contas ativas, a interface passa a exibir `• Não conectado` (em cinza neutro) e a aba de Campanhas exibe `"Inativo"`.
* **Hub Central Reativo:** O cabeçalho agora sinaliza `CONFIGURAÇÃO COMPLETA` apenas quando todos os requisitos da integração com a Meta estão cumpridos, evitando falsas impressões de sincronização.

#### 4. 🏢 Resiliência Multi-Lojas no Supabase
* **Propagação Automática de Conexão:** Ao realizar a autenticação via OAuth com o Facebook, o token autenticado é propagado automaticamente para todas as lojas ativas do lojista no Supabase (`dckb5g-7d`, `044523bb...`).
* **Troca de Loja Sem Perda de Conexão:** Alternar entre lojas no menu superior nunca mais desconecta a integração da Meta.
* **Resiliência do Popup OAuth:** Injeção de tripla redundância de ID de loja (`activeStore?.id || localStorage || "dckb5g-7d"`) na abertura da janela de login.

---

### 🧪 Testes e Validação em Produção

* **Compilação Strict TypeScript:** Executado `npx tsc --noEmit` com **0 erros**.
* **Meta Graph API v23.0:**
  * Perfil: `Itamar Almeida` (`1358081193195540`).
  * Ativos Sincronizados: **13 Business Managers** e **19 Contas de Anúncio** operacionais.
  * Status da Conexão: `HTTP 200 OK` em todos os 7 passos do diagnóstico.

---

### 🌐 Endereço Oficial de Produção
* **Painel Web:** `https://trackingatm.vercel.app`
* **Central de Integrações:** `https://trackingatm.vercel.app/dashboard/settings/integrations`

---
*ATM — Advanced Tracking Manager ADS • Desenvolvido com foco em alta precisão de dados e performance financeira.*
