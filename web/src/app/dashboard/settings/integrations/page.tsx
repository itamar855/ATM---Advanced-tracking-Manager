"use client";

import { useState, useEffect } from "react";
import { Plug, Zap, CheckCircle2, AlertCircle, Copy, Check, ShieldCheck, Loader2, Link } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [savedConfig, setSavedConfig] = useState<any>(null);
  const [storeId, setStoreId] = useState("sua-loja-id");

  // Script do Web Pixel do ATM para ser colado no Shopify Customer Events
  const pixelScriptCode = `// Web Pixel Extension do ATM — Advanced Tracking Manager
analytics.subscribe("checkout_completed", async (event) => {
  const zedyParams = JSON.parse(localStorage.getItem("zedy_tracking_params") || "{}");
  
  const payload = {
    event_type: "orders/paid",
    order_id: event.data.checkout.order.id,
    value: event.data.checkout.totalPrice.amount,
    currency: event.data.checkout.totalPrice.currencyCode,
    track_id: zedyParams.track_id,
    fbp: zedyParams.fbp,
    fbc: zedyParams.fbc,
    fbclid: zedyParams.fbclid
  };

  fetch("https://${typeof window !== 'undefined' ? window.location.host : 'atmtracking.vercel.app'}/api/v1/webhook/sua-loja-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
});`;

  const zedyWebhookUrl = `https://${typeof window !== 'undefined' ? window.location.host : 'atmtracking.vercel.app'}/api/v1/webhook/zedy/${storeId}`;

  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Busca a loja do tenant
        const { data: store } = await supabase
          .from("stores")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (store) {
          setStoreId(store.id);
          // Busca a integração ativa da Meta
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
    navigator.clipboard.writeText(pixelScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(zedyWebhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
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

        {/* Right: Pixel script installer helper */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-400)]/10 flex items-center justify-center text-[var(--color-brand-300)]">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Instalação na Shopify (Web Pixel)
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Instale nosso Pixel customizado na Shopify em 1 minuto
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-default)]">
              <ol className="text-xs space-y-2 text-[var(--color-text-secondary)] list-decimal pl-4">
                <li>Acesse o painel da sua Shopify.</li>
                <li>Vá em <b>Configurações</b> &gt; <b>Eventos de Clientes</b>.</li>
                <li>Clique em <b>Adicionar pixel personalizado</b>.</li>
                <li>Cole o código abaixo e clique em <b>Salvar</b> e <b>Conectar</b>.</li>
              </ol>
            </div>

            <div className="relative">
              <pre className="text-[10px] leading-relaxed bg-[var(--color-bg-surface)] p-3 rounded-lg overflow-x-auto text-[var(--color-text-secondary)] max-h-40 border border-[var(--color-border-subtle)]">
                {pixelScriptCode}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-[var(--color-bg-card)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] transition-colors"
                title="Copiar código"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 text-[11px] text-[var(--color-text-muted)]">
            <AlertCircle size={14} className="text-[var(--color-brand-300)] shrink-0" />
            <span>Este script garante cookies primários no iOS (Safari)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
