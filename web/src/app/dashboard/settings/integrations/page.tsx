"use client";

import { useState, useEffect } from "react";
import { Plug, Zap, CheckCircle2, AlertCircle, Copy, Check, ShieldCheck, Loader2, Link, Code2, ExternalLink, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [savedConfig, setSavedConfig] = useState<any>(null);
  const [storeId, setStoreId] = useState("dckb5g-7d");
  const [shopDomain, setShopDomain] = useState("dckb5g-7d.myshopify.com");

  const host = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes("localhost")
    ? window.location.origin.replace(/\/$/, "")
    : 'https://trackingatm.vercel.app';

  // ── Snippet de instalação auto-configurado (gerado com domínio permanente da loja) ──
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

  const vegaWebhookUrl = `${host}/api/v1/webhook/vega/${storeId || 'dckb5g-7d'}`;
  const zedyWebhookUrl = `${host}/api/v1/webhook/zedy/${storeId || 'dckb5g-7d'}`;

  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: store } = await supabase
          .from("stores")
          .select("id, shop_domain")
          .limit(1)
          .maybeSingle();

        if (store) {
          setStoreId(store.id);
          setShopDomain(store.shop_domain || "");
          const { data: integration } = await supabase
            .from("integrations")
            .select("*")
            .eq("store_id", store.id)
            .eq("platform", "meta")
            .maybeSingle();

          if (integration) {
            setSavedConfig(integration);
            setPixelId(integration.pixel_id || "");
            setAdAccountId(integration.config?.ad_account_id || "");
            setTestEventCode(integration.config?.test_event_code || "");
            setMetaConnected(integration.status === "active");
          }
        }
      }
    }
    loadConfig();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(testEventCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(zedyWebhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Você precisa estar logado para salvar as integrações.");
        setLoading(false);
        return;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (!store) {
        alert("Nenhuma loja configurada localizada. Conecte sua loja Shopify primeiro.");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("integrations")
        .upsert({
          store_id: store.id,
          platform: "meta",
          pixel_id: pixelId,
          access_token_enc: Buffer.from(accessToken || "token-dummy"), // Mock do bytea para dev
          status: "active",
          config: {
            ad_account_id: adAccountId,
            test_event_code: testEventCode || undefined
          }
        }, {
          onConflict: "store_id,platform,pixel_id"
        });

      if (error) {
        alert("Erro ao salvar integração: " + error.message);
      } else {
        setMetaConnected(true);
        alert("Configurações da Meta salvas com sucesso!");
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Integrações e Setup
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Conecte o checkout do Zedy e gerencie sua integração com o Facebook Ads Manager
        </p>
      </div>

      {/* Vega Checkout Integration Card */}
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
              <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">Recomendado</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Envie eventos de compras pagas e aprovadas do Vega Checkout direto para a Meta Conversions API (CAPI)
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

      {/* Zedy Checkout Integration Card */}
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
              onClick={handleCopyWebhook}
              className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold"
            >
              {copiedWebhook ? <Check size={14} /> : "Copiar"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Meta configuration form */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Plug size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Conexão Facebook Ads
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Insira as credenciais do seu Pixel e CAPI da Meta
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveIntegration} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                Pixel ID da Meta
              </label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="Ex: 1585687739835387"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                Access Token da CAPI (System User)
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="input"
                placeholder={savedConfig ? "••••••••••••••••••••" : "EAAB..."}
                required={!savedConfig}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                Conta de Anúncio ID (para sincronizar custos)
              </label>
              <input
                type="text"
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="Ex: act_1234567890"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                Test Event Code (Opcional - para depuração)
              </label>
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="Ex: TEST12345"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-xs font-semibold"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : metaConnected ? (
                "Atualizar Integração"
              ) : (
                "Salvar e Conectar"
              )}
            </button>
          </form>

          {metaConnected && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-success-500)]/10 border border-[var(--color-success-500)]/20 text-xs text-[var(--color-success-400)]">
              <ShieldCheck size={16} />
              <span>Conexão ativa e integrada com o Dispatcher da Meta</span>
            </div>
          )}
        </div>
      </div>{/* end grid */}

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

        {/* URL gerada */}
        {shopDomain && (
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-400">
              Script auto-configurado para <b>{shopDomain}</b>
            </span>
          </div>
        )}

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
            <li>Clique em <b>Salvar</b>. Pronto — nenhuma outra configuração necessária! ✅</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
