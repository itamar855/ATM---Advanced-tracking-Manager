"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plug,
  Zap,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Loader2,
  Link as LinkIcon,
  Code2,
  Sparkles,
  RefreshCw,
  Plus,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ExternalLink,
  Trash2,
} from "lucide-react";

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  status: string;
  currency: string;
  amountSpent: number;
  businessName?: string | null;
}

interface TokenDiagnostics {
  userName?: string;
  permissions?: string[];
  hasAdsRead?: boolean;
  hasAdsManagement?: boolean;
  tokenType?: string;
}

function IntegrationsContent() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [validatingManualAcc, setValidatingManualAcc] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedZedy, setCopiedZedy] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [hasSavedTokenInDb, setHasSavedTokenInDb] = useState(false);

  // Campos do Perfil Meta
  const [profileName, setProfileName] = useState("Perfil Principal");
  const [pixelId, setPixelId] = useState("1104875232197441");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [manualAccountIdInput, setManualAccountIdInput] = useState("");

  // Contas de anúncio puxadas da Meta
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountFetchError, setAccountFetchError] = useState("");
  const [diagnostics, setDiagnostics] = useState<TokenDiagnostics | null>(null);

  // Feedback & Guia
  const [showGuide, setShowGuide] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [oauthErrorMsg, setOauthErrorMsg] = useState("");
  const [oauthSuccessMsg, setOauthSuccessMsg] = useState("");

  const storeId = "dckb5g-7d";

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

  const vegaWebhookUrl = `${host}/api/v1/webhook/vega/${storeId}`;
  const zedyWebhookUrl = `${host}/api/v1/webhook/zedy/${storeId}`;

  // Lê parâmetros da URL para mensagens de OAuth
  useEffect(() => {
    const errorParam = searchParams.get("error");
    const oauthParam = searchParams.get("oauth");
    const profileParam = searchParams.get("profile");

    if (errorParam) {
      setOauthErrorMsg(decodeURIComponent(errorParam));
    }
    if (oauthParam === "success") {
      setOauthSuccessMsg(
        `Facebook conectado com sucesso via OAuth! Perfil: ${profileParam || "Perfil Facebook"}`
      );
    }
  }, [searchParams]);

  // Carrega configurações salvas ao abrir a página
  const loadConfig = async () => {
    setFetchingAccounts(true);
    try {
      const res = await fetch("/api/v1/meta/accounts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setMetaConnected(Boolean(data.connected));
          setHasSavedTokenInDb(Boolean(data.isFromDatabase));
          if (data.user?.name) setProfileName(data.user.name);
          if (data.pixelId) setPixelId(data.pixelId);
          if (data.diagnostics) setDiagnostics(data.diagnostics);

          if (Array.isArray(data.accounts)) {
            setAdAccounts(data.accounts);
          }
          if (Array.isArray(data.selectedAccountIds) && data.selectedAccountIds.length > 0) {
            setSelectedAccounts(data.selectedAccountIds);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar configurações da Meta:", err);
    } finally {
      setFetchingAccounts(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Testa o token (fornecido no input ou o já salvo no banco) e lista as contas
  const fetchAccountsFromApi = async (explicitToken?: string) => {
    setFetchingAccounts(true);
    setAccountFetchError("");
    setSaveSuccessMsg("");

    try {
      let url = `/api/v1/meta/accounts`;
      if (explicitToken && explicitToken.trim()) {
        url = `/api/v1/meta/accounts?token=${encodeURIComponent(explicitToken.trim())}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (data.ok) {
        setMetaConnected(true);
        if (data.user?.name) setProfileName(data.user.name);
        if (data.diagnostics) setDiagnostics(data.diagnostics);

        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          setAdAccounts(data.accounts);
          if (selectedAccounts.length === 0) {
            setSelectedAccounts(data.accounts.map((a: any) => a.id));
          }
        } else {
          setAdAccounts([]);
          if (data.fetchAccountsError) {
            setAccountFetchError(data.fetchAccountsError);
          }
        }
      } else {
        setAccountFetchError(data.error || "Não foi possível validar o token da Meta.");
      }
    } catch (err: any) {
      setAccountFetchError(err.message || "Erro de conexão ao testar token.");
    } finally {
      setFetchingAccounts(false);
    }
  };

  // Valida e adiciona uma conta de anúncio manual digitada pelo usuário
  const handleValidateAndAddAccount = async () => {
    if (!manualAccountIdInput.trim()) return;

    const rawId = manualAccountIdInput.trim();
    const cleanId = rawId.startsWith("act_") ? rawId : `act_${rawId}`;

    // Verifica se já está na lista
    if (adAccounts.some((a) => a.id === cleanId)) {
      if (!selectedAccounts.includes(cleanId)) {
        setSelectedAccounts((prev) => [...prev, cleanId]);
      }
      setManualAccountIdInput("");
      return;
    }

    setValidatingManualAcc(true);
    setAccountFetchError("");

    try {
      let url = `/api/v1/meta/accounts?validate_account_id=${encodeURIComponent(cleanId)}`;
      if (accessToken.trim()) {
        url += `&token=${encodeURIComponent(accessToken.trim())}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (data.ok && data.account) {
        setAdAccounts((prev) => [data.account, ...prev]);
        setSelectedAccounts((prev) => (prev.includes(cleanId) ? prev : [...prev, cleanId]));
        setManualAccountIdInput("");
        setSaveSuccessMsg(`Conta "${data.account.name}" (${cleanId}) validada e adicionada com sucesso!`);
        setTimeout(() => setSaveSuccessMsg(""), 4000);
      } else {
        setAccountFetchError(
          data.error || `Não foi possível validar ${cleanId}. Verifique se o token tem acesso a essa conta.`
        );
      }
    } catch (err: any) {
      setAccountFetchError(err.message || "Erro ao consultar a conta na Meta Graph API.");
    } finally {
      setValidatingManualAcc(false);
    }
  };

  const handleToggleAccount = (accId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === adAccounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(adAccounts.map((a) => a.id));
    }
  };

  const handleRemoveAccount = (accId: string) => {
    setAdAccounts((prev) => prev.filter((a) => a.id !== accId));
    setSelectedAccounts((prev) => prev.filter((id) => id !== accId));
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(installSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 3000);
  };

  const handleSaveIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveSuccessMsg("");
    setAccountFetchError("");

    try {
      const finalAccounts = selectedAccounts.length > 0
        ? selectedAccounts
        : adAccounts.map((a) => a.id);

      const res = await fetch("/api/v1/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          access_token: accessToken.trim() || undefined,
          profile_name: profileName.trim(),
          ad_account_ids: finalAccounts,
          pixel_id: pixelId.trim(),
          test_event_code: testEventCode.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setMetaConnected(true);
        setHasSavedTokenInDb(true);
        setAccessToken("");
        setSaveSuccessMsg(data.message || "Configurações da Meta salvas com sucesso!");
        setTimeout(() => setSaveSuccessMsg(""), 5000);
        await loadConfig();
      } else {
        setAccountFetchError("Erro ao salvar: " + data.error);
      }
    } catch (err: any) {
      setAccountFetchError("Erro de conexão ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Integrações & Conexão de Contas
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gerencie múltiplos perfis do Facebook, contas de anúncio e conectores de checkout com máxima precisão.
        </p>
      </div>

      {/* Alertas de Retorno OAuth */}
      {oauthSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-emerald-200">Conexão Estabelecida com Sucesso!</p>
            <p className="leading-relaxed">{oauthSuccessMsg}</p>
          </div>
        </div>
      )}

      {oauthErrorMsg && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-200">Aviso sobre Conexão 1-Clique:</p>
            <p className="leading-relaxed">{oauthErrorMsg}</p>
            <p className="text-[11px] text-amber-400/90 pt-1">
              💡 <b>Recomendação:</b> Como o OAuth direto depende de aprovação de App na Meta, utilize o método de <b>Access Token Permanente da BM</b> abaixo, que é 100% vitalício e infalível.
            </p>
          </div>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="font-semibold">{saveSuccessMsg}</span>
        </div>
      )}

      {/* ── CARD PRINCIPAL: Meta Ads & Múltiplas Contas de Anúncio ── */}
      <div className="glass-card p-6 space-y-6 border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
              <Plug size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                  Perfis & Contas de Anúncio (Meta Ads)
                </h3>
                {metaConnected ? (
                  <span className="px-2.5 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Conectado & Ativo
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-[10px] font-bold bg-zinc-700/50 text-zinc-400 rounded-full border border-zinc-600/30">
                    Desconectado
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Conecte seu Access Token para sincronizar campanhas, métricas de P&L e disparar conversões na CAPI.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/auth/facebook"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold transition-all shadow-md"
              title="Conectar automaticamente via login oficial do Facebook"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Conectar com Facebook (1-Clique)</span>
            </a>

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-all font-medium"
            >
              <HelpCircle size={13} className="text-blue-400" />
              <span>Como Gerar Token</span>
              {showGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {/* Guia Interativo: Como Gerar Token Permanente */}
        {showGuide && (
          <div className="p-5 rounded-xl bg-[var(--color-bg-surface)] border border-blue-500/20 space-y-3 fade-in text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2.5">
              <span className="font-bold text-white flex items-center gap-2">
                <Sparkles size={15} className="text-blue-400" />
                Passo a Passo: Token Permanente de Usuário do Sistema (BM)
              </span>
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">
                Recomendado & Vitalício
              </span>
            </div>
            <ol className="space-y-2 list-decimal pl-4 leading-relaxed">
              <li>
                Acesse o <b>Gerenciador de Negócios da Meta</b> (business.facebook.com) → <b>Configurações do Negócio</b>.
              </li>
              <li>
                No menu lateral esquerdo, vá em <b>Usuários</b> → <b>Usuários do Sistema</b> (System Users) e clique em <b>Adicionar</b> (função: Administrador).
              </li>
              <li>
                Clique no usuário criado → <b>Atribuir Ativos</b> → Selecione suas <b>Contas de Anúncio</b> e seu <b>Pixel/Dataset</b> com permissão total de <b>Controle Total (Gerenciar)</b>.
              </li>
              <li>
                Clique em <b>Gerar Novo Token</b> → Selecione o seu App → Marque as permissões <code>ads_management</code>, <code>ads_read</code> e <code>business_management</code> → Escolha validade: <b>Nunca (Vitalício)</b>.
              </li>
              <li>
                Copie o token gerado (começa com <code>EAAB...</code> ou <code>EAA...</code>) e cole no campo abaixo!
              </li>
            </ol>
          </div>
        )}

        {/* Diagnóstico do Token Conectado */}
        {diagnostics && (
          <div className="p-3.5 rounded-xl bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{diagnostics.userName || profileName}</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Status: <span className="text-emerald-400 font-medium">Token Ativo</span>
                  {diagnostics.permissions && diagnostics.permissions.length > 0 && (
                    <span> • Permissões: {diagnostics.permissions.join(", ")}</span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchAccountsFromApi(accessToken)}
              disabled={fetchingAccounts}
              className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={fetchingAccounts ? "animate-spin" : ""} />
              Revalidar Conexão
            </button>
          </div>
        )}

        <form onSubmit={handleSaveIntegration} className="space-y-5">
          {/* Linha 1: Dados do Perfil e Pixel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                Nome do Perfil / BM
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex: Perfil Principal"
                className="input text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                Pixel ID Principal da Meta (Dataset)
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
          </div>

          {/* Linha 2: Access Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] flex items-center gap-1.5">
                Access Token da Meta (System User / Perfil de Anúncios)
                {hasSavedTokenInDb && (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.2 rounded-full border border-emerald-500/20">
                    Token Salvo no Supabase ✓
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => fetchAccountsFromApi(accessToken)}
                disabled={fetchingAccounts}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors"
              >
                <Sparkles size={12} />
                {fetchingAccounts ? "Consultando Graph API..." : "Testar Token e Listar Contas"}
              </button>
            </div>
            <div className="relative">
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="input text-xs font-mono pr-24"
                placeholder={
                  hasSavedTokenInDb
                    ? "•••••••••••••••••••••••••••••••••••• (Token ativo no banco. Deixe vazio para manter)"
                    : "Cole seu token EAAB..."
                }
              />
              {accessToken && (
                <button
                  type="button"
                  onClick={() => fetchAccountsFromApi(accessToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-colors"
                >
                  Testar
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Você pode colar um novo token a qualquer momento ou deixar vazio para manter o token já gravado.
            </p>
          </div>

          {/* Linha 3: Adicionar Conta de Anúncio Manual com Validação Instantânea */}
          <div className="p-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Plus size={14} className="text-blue-400" />
                Vincular Conta de Anúncio Específica por ID
              </label>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Ex: act_1316835733682937 ou apenas 1316835733682937
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualAccountIdInput}
                onChange={(e) => setManualAccountIdInput(e.target.value)}
                placeholder="Insira o ID da conta (act_...)"
                className="input text-xs font-mono py-2 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleValidateAndAddAccount();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleValidateAndAddAccount}
                disabled={validatingManualAcc || !manualAccountIdInput.trim()}
                className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                {validatingManualAcc ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={13} />
                )}
                <span>Validar & Adicionar</span>
              </button>
            </div>
          </div>

          {/* Erro de busca de contas */}
          {accountFetchError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2.5">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
              <div className="space-y-1">
                <p className="font-semibold text-red-200">Falha ao consultar conta(s):</p>
                <p className="leading-relaxed">{accountFetchError}</p>
                <p className="text-[10px] text-red-400/90">
                  Dica: Se o token for de Usuário do Sistema da BM, verifique se o usuário foi adicionado como Administrador do ativo da Conta de Anúncios na BM.
                </p>
              </div>
            </div>
          )}

          {/* ── Grid de Contas de Anúncio Disponíveis ── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Layers size={14} className="text-blue-400" />
                Contas de Anúncio Vinculadas ({adAccounts.length})
              </span>
              {adAccounts.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectAllAccounts}
                    className="text-[11px] text-blue-400 hover:underline font-semibold"
                  >
                    {selectedAccounts.length === adAccounts.length
                      ? "Desmarcar Todas"
                      : "Selecionar Todas"}
                  </button>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {selectedAccounts.length} de {adAccounts.length} selecionada(s)
                  </span>
                </div>
              )}
            </div>

            {fetchingAccounts ? (
              <div className="p-8 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <span className="text-xs text-[var(--color-text-muted)]">
                  Consultando Graph API da Meta...
                </span>
              </div>
            ) : adAccounts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {adAccounts.map((acc) => {
                  const isChecked = selectedAccounts.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => handleToggleAccount(acc.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                        isChecked
                          ? "bg-blue-500/10 border-blue-500/40 text-[var(--color-text-primary)]"
                          : "bg-[var(--color-bg-primary)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate leading-tight">{acc.name}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5 flex items-center gap-2">
                            <span>{acc.id}</span>
                            <span>•</span>
                            <span>{acc.currency}</span>
                            {acc.amountSpent > 0 && (
                              <>
                                <span>•</span>
                                <span>Gasto: {acc.currency} {acc.amountSpent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                            acc.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          {acc.status}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAccount(acc.id);
                          }}
                          className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remover conta da lista"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] text-center space-y-2">
                <Layers size={24} className="text-zinc-600 mx-auto" />
                <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Nenhuma conta de anúncios listada no momento
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] max-w-md mx-auto">
                  Clique em <b>Testar Token e Listar Contas</b> acima ou cole o ID da sua conta no campo <b>Vincular Conta de Anúncio Específica</b>.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border-subtle)]">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Salvar Configurações da Meta
            </button>

            {metaConnected && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <ShieldCheck size={15} />
                <span>Integração Pronta para Rastreamento</span>
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
            <LinkIcon size={20} />
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
                setCopiedZedy(true);
                setTimeout(() => setCopiedZedy(false), 2000);
              }}
              className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold"
            >
              {copiedZedy ? <Check size={14} /> : "Copiar"}
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

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin text-blue-400" />
          <span>Carregando integrações...</span>
        </div>
      }
    >
      <IntegrationsContent />
    </Suspense>
  );
}
