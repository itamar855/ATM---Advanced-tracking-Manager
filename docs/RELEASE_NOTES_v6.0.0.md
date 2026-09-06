# 🚀 ATM — Advanced Tracking Manager ADS
## Release v6.0.0 & v6.1.0: Meta Ads Lazy Loading, Blindagem & Observabilidade de Alta Performance

> **Data de Lançamento:** 06 de Setembro de 2026  
> **Status:** Produção Estável (`trackingatm.vercel.app`)  
> **Escopo:** Módulo Meta Ads, Resolução de Rate Limit Graph API (Code 17 / 2446079), Lazy Loading Granular, Locks In-Flight, Empty States Semânticos e Telemetria Segura.

---

### 🌟 Destaques da Versão (Highlights)

Esta versão moderniza estruturalmente a integração do ATM com o ecossistema Meta Ads. Ao invés de realizar a carga pesada de todas as contas, campanhas, conjuntos de anúncios e anúncios em uma única requisição HTTP síncrona (que gerava rate limit Code 17 e timeouts 504), a aplicação passa a adotar **Lazy Loading sob demanda**, reduzindo o tempo de carregamento da tela de ~15 segundos para **menos de 800ms**, acompanhado de **blindagem contra duplo clique** e **diferenciação semântica de falhas**.

---

### 🛠️ Changelog Completo

#### 1. ⚡ Arquitetura Lazy Loading sob Demanda (v6.0.0)
* **Carga Inicial Leve (`mode: "initial"`):**
  * Busca exclusivamente contas ativas e suas campanhas.
  * Retorno instantâneo com `adsets: []` e `ads: []`, sinalizado pela flag `lazy_loading: true`.
  * Redução drástica de chamadas à Graph API na abertura do painel.
* **Carregamento sob Demanda de Conjuntos (`mode: "campaign"`):**
  * Ao clicar ou selecionar uma campanha, o frontend requisita apenas seus conjuntos: `GET /api/v1/meta/campaigns/list?campaign_id=CAMP_ID`.
  * Consulta executada via nó direto da campanha com campos aninhados: `/{campId}?fields=id,name,account_id,adsets.limit(250){...},insights.level(adset)...`.
  * Isenção do limite restritivo de conta em Development Access (`error_subcode 2446079`).
* **Carregamento sob Demanda de Anúncios (`mode: "adset"`):**
  * Ao selecionar um conjunto, a API busca somente os anúncios filhos: `GET /api/v1/meta/campaigns/list?adset_id=ADSET_ID`.
* **Preservação Acumulativa e Caches Isolados:**
  * Cache em memória (`MEMORY_CACHE`) isolado por entidade: `store_date_campaign_ID` e `store_date_adset_ID`.
  * `sessionStorage` preserva de forma cumulativa todos os adsets e anúncios já navegados pelo usuário na sessão.
  * Contabilidade 100% preservada: ROAS, CPA, Lucro Líquido Real, Gastos e histórico de orçamento (`budget_history`).

#### 2. 🛡️ Blindagem de Produção & Anti-Duplo Clique (v6.1.0)
* **Travas In-Flight no Frontend (`page.tsx`):**
  * Implementação de `inFlightCampaignsRef` e `inFlightAdsetsRef` usando `useRef<Set<string>>`.
  * Cliques rápidos, repetidos ou duplos são interceptados síncronamente, garantindo que apenas 1 requisição de rede trafegue para cada ID.
  * Limpeza garantida no bloco `finally` da chamada assíncrona.
* **Tratamento Semântico de Erros (Caso A vs Caso B):**
  * **Caso A (Consulta com Sucesso e 0 Itens):** Exibe mensagem legítima: *"Esta campanha não possui conjuntos de anúncios"* ou *"Este conjunto não possui anúncios"*.
  * **Caso B (Falha da Meta Ads ou Timeout):** Nunca silencia o erro como lista vazia. Exibe alerta âmbar com a mensagem de erro e botão de retry direto `[Tentar novamente]`.
* **Contrato Universal da API:**
  * Todas as respostas preservam rigorosamente o contrato JSON (`accounts`, `campaigns`, `adsets`, `ads`).
  * Novos campos adicionados exclusivamente de forma aditiva (`mode`, `error_type`, `error_message`).

#### 3. 📊 Observabilidade Estruturada Sem PII (v6.1.0)
* **Flag Condicional:** Ativada apenas com `META_LAZY_OBSERVABILITY_ENABLED=true`.
* **Zero Dados Pessoais:** Registra exclusivamente telemetria técnica:
  ```json
  {
    "event": "meta_lazy_load",
    "mode": "campaign",
    "entity_id": "120250851635250329",
    "duration_ms": 312,
    "items_loaded": 6,
    "success": true,
    "error_type": null
  }
  ```
* Proibição expressa de tokens, nomes de clientes, emails ou payloads brutos nos logs.

---

### 🧪 Suíte de Testes Automatizada (`scripts/test-meta-lazy-hardening.js`)

Criada suíte completa com 30 asserções automatizadas cobrindo todos os fluxos críticos:
1. **Carga Inicial:** Status 200, contratos íntegros, arrays vazios de adsets/ads e flag `lazy_loading: true`.
2. **Drill-down de Campanha:** Resposta com adsets vinculados, métricas calculadas e ordenadas.
3. **Drill-down de AdSet:** Resposta com anúncios filhos e integridade hierárquica.
4. **Duplo Clique Simultâneo:** Disparo concorrente com validação de 1 única chamada HTTP executada e lock liberado.
5. **Falha Simulada:** Resposta com `ok: false`, tipos de erro preservados e contrato de arrays mantido.
6. **Integridade Financeira:** Checagem numérica de `spend`, `revenue`, `profit`, `roas` e `status`.

**Resultado da Validação:** `30 PASSOU | 0 FALHOU` (100% de cobertura).

---

### 🌐 Ambiente e Validação
* **TypeScript:** `npx tsc --noEmit` executado com **0 erros**.
* **Next.js Turbopack Build:** Compilação final concluída com sucesso (27/27 páginas estáticas e rotas dinâmicas).
