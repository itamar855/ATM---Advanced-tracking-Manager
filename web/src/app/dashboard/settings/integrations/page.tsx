"use client";

import { useState, useEffect } from "react";
import {
  Plug,
  Zap,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Loader2,
  Link,
  Code2,
  Sparkles,
  RefreshCw,
  Plus,
  Layers,
  DollarSign
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  status: string;
  currency: string;
  amountSpent: number;
  businessName?: string | null;
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);

  // Campos do Perfil Meta
  const [adAccountId, setAdAccountId] = useState("");
  const [profileName, setProfileName] = useState("Perfil Principal");
  const [pixelId, setPixelId] = useState("1104875232197441");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [savedConfig, setSavedConfig] = useState<any>(null);

  // Contas de anúncio puxadas da Meta
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountFetchError, setAccountFetchError] = useState("");

  const [storeId, setStoreId] = useState("dckb5g-7d");
  const [shopDomain, setShopDomain] = useState("dckb5g-7d.myshopify.com");

  const host =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
      ? window.location.origin.replace(/\/$/, "")
      : "https://trackingatm.vercel.app";

  const installSnippet = `<!-- ATM Pixel — Cole antes de </head> no theme.liquid -->
<script>
  window.__ATM_CTX__ = {
    shop: {
      domain: {{ shop.permanent_domain | json }},
      currency: {{ shop.currency | json }}
    },
    template: {{ template.name | default: template | json }},
    customer: {% if customer %}{
      email: {{ customer.email | json }},
      phone: {{ customer.phone | default: '' | json }},
      firstName: {{ customer.first_name | json }},
      lastName: {{ customer.last_name | json }},
      externalId: {{ customer.id | json }}
    }{% else %}null{% endif %},
    product: {% if product %}{
      id: {{ product.id | json }},
      variantId: {{ product.selected_or_first_available_variant.id | default: product.variants.first.id | json }},
      title: {{ product.title | json }},
      price: {{ product.selected_or_first_available_variant.price | default: product.price | divided_by: 100.0 }},
      currency: {{ shop.currency | json }}
    }{% else %}null{% endif %},
    checkout: {% if checkout %}{
      orderId: {{ checkout.order_id | json }},
      email: {{ checkout.email | json }},
      totalPrice: {{ checkout.total_price | divided_by: 100.0 }},
      currency: {{ shop.currency | json }},
      billingAddress: {
        firstName: {{ checkout.billing_address.first_name | json }},
        lastName: {{ checkout.billing_address.last_name | json }},
        city: {{ checkout.billing_address.city | json }},
        provinceCode: {{ checkout.billing_address.province_code | json }},
        zip: {{ checkout.billing_address.zip | json }},
        countryCode: {{ checkout.billing_address.country_code | json }}
      },
      lineItems: [
        {% for line_item in checkout.line_items %}
          {
            id: {{ line_item.variant_id | json }},
            quantity: {{ line_item.quantity }},
            price: {{ line_item.final_price | divided_by: 100.0 }}
          }{% unless forloop.last %},{% endunless %}
        {% endfor %}
      ]
    }{% else %}null{% endif %}
  };
</script>
<script src="${host}/api/v1/pixel/{{ shop.permanent_domain }}/script.js" defer></script>`;

  const vegaWebhookUrl = `${host}/api/v1/webhook/vega/${storeId || "dckb5g-7d"}`;
  const zedyWebhookUrl = `${host}/api/v1/webhook/zedy/${storeId || "dckb5g-7d"}`;

  useEffect(() => {
    async function loadConfig() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase
          .from("stores")
          .select("id, shop_domain")
          .limit(1)
          .maybeSingle();

        if (store) {
          setStoreId(store.id);
          setShopDomain(store.shop_domain || "dckb5g-7d.myshopify.com");
        }

        const { data: integration } = await supabase
          .from("integrations")
          .select("*")
          .eq("platform", "meta")
          .maybeSingle();

        if (integration) {
          setSavedConfig(integration);
          setPixelId(integration.pixel_id || "1104875232197441");
          setProfileName(integration.config?.profile_name || "Perfil Principal");
          setTestEventCode(integration.config?.test_event_code || "");
          setMetaConnected(integration.status === "active");

          if (integration.config?.ad_account_ids) {
            setSelectedAccounts(
              Array.isArray(integration.config.ad_account_ids)
                ? integration.config.ad_account_ids
                : [integration.config.ad_account_ids]
            );
          }

          // Se já temos a integração salva, tenta buscar as contas
          fetchAccountsFromApi(store?.id || "dckb5g-7d");
        }
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      }
    }
    loadConfig();
  }, []);

  // Busca as contas de anúncio na Meta Graph API
  const fetchAccountsFromApi = async (storeIdParam?: string, explicitToken?: string) => {
    setFetchingAccounts(true);
    setAccountFetchError("");
    try {
      let url = `/api/v1/meta/accounts?store_id=${storeIdParam || storeId}`;
      if (explicitToken) {
        url = `/api/v1/meta/accounts?token=${encodeURIComponent(explicitToken)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.accounts)) {
        setAdAccounts(data.accounts);
        if (data.user?.name) {
          setProfileName(data.user.name);
        }
        if (selectedAccounts.length === 0 && data.accounts.length > 0) {
          setSelectedAccounts([data.accounts[0].id]);
        }
      } else {
        setAccountFetchError(data.error || "Não foi possível listar as contas de anúncio.");
      }
    } catch (err: any) {
      setAccountFetchError(err.message || "Erro de conexão ao buscar contas.");
    } finally {
      setFetchingAccounts(false);
    }
  };

  const handleToggleAccount = (accId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(installSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 3000);
  };

  const handleSaveIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const finalAccounts = selectedAccounts.length > 0 
        ? selectedAccounts 
        : adAccountId ? [adAccountId.trim()] : [];

      const res = await fetch("/api/v1/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId || "dckb5g-7d",
          access_token: accessToken || (savedConfig ? savedConfig.access_token_enc : ""),
          profile_name: profileName,
          ad_account_ids: finalAccounts,
          pixel_id: pixelId,
          test_event_code: testEventCode,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setMetaConnected(true);
        alert("Configurações da Meta salvas com sucesso!");
      } else {
        alert("Erro ao salvar: " + data.error);
      }
    } catch (err: any) {
      alert("Erro ao conectar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-16">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Integrações & Conexão de Contas
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gerencie múltiplos perfis do Facebook, contas de anúncio e conectores de checkout.
        </p>
      </div>

      {/* ── Seção Facebook Ads & Múltiplas Contas de Anúncio ── */}
      <div className="glass-card p-6 space-y-6 border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Plug size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                  Perfis & Contas de Anúncio (Meta Ads)
                </h3>
                {metaConnected && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Conecte seu token de acesso para sincronizar e gerenciar todas as suas Contas de Anúncio pelo ATM.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchAccountsFromApi(undefined, accessToken || undefined)}
            disabled={fetchingAccounts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-all font-medium"
          >
            <RefreshCw size={12} className={fetchingAccounts ? "animate-spin text-blue-400" : ""} />
            {fetchingAccounts ? "Atualizando Contas..." : "Recarregar Contas"}
          </button>
        </div>

        <form onSubmit={handleSaveIntegration} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                Nome do Perfil / BM
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex: Perfil Principal Loja"
                className="input text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                Pixel ID Principal da Meta
              </label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="Ex: 1104875232197441"
                className="input text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                Conta de Anúncio ID (Opcional)
              </label>
              <input
                type="text"
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="Ex: act_123456789"
                className="input text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                Access Token da Meta (System User / Perfil de Anúncios)
              </label>
              {accessToken && (
                <button
                  type="button"
                  onClick={() => fetchAccountsFromApi(undefined, accessToken)}
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles size={11} /> Testar Token e Listar Contas
                </button>
              )}
            </div>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="input text-xs font-mono"
              placeholder={savedConfig ? "•••••••••••••••••••••••••••• (Token já salvo no Supabase)" : "Cole seu token EAAB..."}
              required={!savedConfig}
            />
          </div>

          {/* ── Grid de Contas de Anúncio Detectadas ── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Layers size={13} className="text-blue-400" />
                Contas de Anúncio Disponíveis ({adAccounts.length})
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {selectedAccounts.length} selecionada(s) para gestão e P&L
              </span>
            </div>

            {fetchingAccounts ? (
              <div className="p-8 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <span className="text-xs text-[var(--color-text-muted)]">
                  Consultando Graph API da Meta...
                </span>
              </div>
            ) : accountFetchError ? (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{accountFetchError}</span>
              </div>
            ) : adAccounts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {adAccounts.map((acc) => {
                  const isChecked = selectedAccounts.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => handleToggleAccount(acc.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? "bg-blue-500/10 border-blue-500/40 text-[var(--color-text-primary)]"
                          : "bg-[var(--color-bg-primary)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-bold leading-tight">{acc.name}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {acc.id} • {acc.currency}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                          acc.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        {acc.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] text-center text-xs text-[var(--color-text-muted)]">
                Insira seu Access Token acima e clique em <b>Testar Token</b> para listar suas contas.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center gap-2 shadow-lg"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Salvar Configurações da Meta
            </button>

            {metaConnected && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <ShieldCheck size={14} />
                <span>Integração Ativa</span>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ── Vega Checkout Card ── */}
      <div className="glass-card p-6 space-y-4 border-l-4 border-l-emerald-500">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Zap size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Vega Checkout (Webhooks)
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Envie eventos de compras pagas e aprovadas do Vega Checkout direto para a Meta CAPI
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Copie a URL abaixo e configure no painel do <b>Vega Checkout</b> em <b>Webhooks &gt; Adicionar Webhook</b> para o evento de pedido pago.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={vegaWebhookUrl}
              className="input text-xs font-mono select-all bg-[var(--color-bg-surface)] py-2"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(vegaWebhookUrl);
                setCopiedWebhook(true);
                setTimeout(() => setCopiedWebhook(false), 2000);
              }}
              className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold"
            >
              {copiedWebhook ? <Check size={14} /> : "Copiar"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Zedy Checkout Card ── */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-400)]/10 flex items-center justify-center text-[var(--color-brand-300)]">
            <Link size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Zedy Checkout (Webhooks)
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Envie eventos de transações aprovadas e pagas direto para a Meta Conversions API (CAPI)
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Copie a URL abaixo e configure na sua conta Zedy em <b>Configurações &gt; Webhooks &gt; Adicionar Webhook</b> para capturar compras automáticas.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={zedyWebhookUrl}
              className="input text-xs font-mono select-all bg-[var(--color-bg-surface)] py-2"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(zedyWebhookUrl);
                setCopiedWebhook(true);
                setTimeout(() => setCopiedWebhook(false), 2000);
              }}
              className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold"
            >
              {copiedWebhook ? <Check size={14} /> : "Copiar"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Instalação do Pixel Shopify (snippet único, auto-configurado) ── */}
      <div className="glass-card p-6 space-y-5 border-l-4 border-l-[var(--color-brand-400)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-400)]/10 flex items-center justify-center text-[var(--color-brand-300)] shrink-0 mt-0.5">
            <Sparkles size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Pixel Shopify — Instalação Automática
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[var(--color-brand-400)]/10 text-[var(--color-brand-300)] rounded-full border border-[var(--color-brand-400)]/20 uppercase tracking-wide">
                Zero Configuração
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Cole o snippet abaixo no <b>theme.liquid</b>, antes de <code className="text-[var(--color-brand-300)]">&lt;/head&gt;</code>. O script identifica sua loja automaticamente pelo domínio — sem editar nenhum ID.
            </p>
          </div>
        </div>

        {/* Badges de eventos */}
        <div className="flex flex-wrap gap-1.5">
          {["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase"].map((ev) => (
            <span key={ev} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
              ✓ {ev}
            </span>
          ))}
          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
            SHA-256 em todo PII
          </span>
        </div>

        {/* Snippet de código */}
        <div className="relative">
          <pre className="text-[10px] leading-relaxed bg-[var(--color-bg-surface)] p-4 rounded-lg overflow-x-auto text-[var(--color-text-secondary)] max-h-56 border border-[var(--color-border-subtle)] scrollbar-thin">
            {installSnippet}
          </pre>
          <button
            onClick={handleCopySnippet}
            className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-brand-400)] hover:bg-[var(--color-brand-300)] text-white text-[10px] font-bold transition-all shadow-lg"
          >
            {copiedSnippet ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar Snippet</>}
          </button>
        </div>

        {/* Instruções */}
        <div className="p-4 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-default)]">
          <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5">
            <Code2 size={13} className="text-[var(--color-brand-300)]" /> Como instalar
          </p>
          <ol className="text-xs space-y-1.5 text-[var(--color-text-secondary)] list-decimal pl-4">
            <li>Acesse seu painel Shopify → <b>Loja Virtual</b> → <b>Temas</b> → <b>Ações (...)</b> → <b>Editar código</b>.</li>
            <li>Abra o arquivo <b>theme.liquid</b>.</li>
            <li>Cole o snippet acima imediatamente <b>antes de <code>&lt;/head&gt;</code></b>.</li>
            <li>Clique em <b>Salvar</b>. Pronto — seus eventos serão enviados com 100% de precisão!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
