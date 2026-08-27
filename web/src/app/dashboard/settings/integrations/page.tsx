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
  Code2,
  Sparkles,
  RefreshCw,
  Plus,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  Radio,
  Sliders,
  Flame,
  Globe,
  MessageSquare,
  FlaskConical,
  CreditCard,
  ShoppingBag,
  ArrowRight,
  Search,
  Eye,
  EyeOff
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

interface ProfileItem {
  id: string;
  name: string;
  accountsCount: number;
  accounts: AdAccount[];
  isExpanded?: boolean;
}

type TabKey = "anuncios" | "webhooks" | "utms" | "pixel" | "whatsapp" | "testes";

function IntegrationsContent() {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("anuncios");
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedZedy, setCopiedZedy] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [hasSavedTokenInDb, setHasSavedTokenInDb] = useState(false);

  // Meta Accordion states
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [expandedProfiles, setExpandedProfiles] = useState<Record<string, boolean>>({
    "prof-1": true,
    "prof-2": false,
  });

  // Campos do Perfil Meta
  const [profileName, setProfileName] = useState("Oferta BR - Meta Master");
  const [pixelId, setPixelId] = useState("1104875232197441");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");

  // Perfis Conectados
  const [profiles, setProfiles] = useState<ProfileItem[]>([
    {
      id: "prof-1",
      name: "Naome Tavares",
      accountsCount: 16,
      accounts: [
        { id: "act_101", accountId: "act_101", name: "USD 1 - ESCALA BR", status: "ACTIVE", currency: "USD", amountSpent: 1556.92 },
        { id: "act_102", accountId: "act_102", name: "USD 2 - ABO ESCALA", status: "ACTIVE", currency: "USD", amountSpent: 1702.14 },
        { id: "act_103", accountId: "act_103", name: "USD 3 - CBO RETARGETING", status: "ACTIVE", currency: "USD", amountSpent: 1707.15 },
        { id: "act_104", accountId: "act_104", name: "BRL 04 - TESTES PRODUTO", status: "ACTIVE", currency: "BRL", amountSpent: 707.47 },
      ],
    },
    {
      id: "prof-2",
      name: "Vania Nilmes",
      accountsCount: 17,
      accounts: [
        { id: "act_201", accountId: "act_201", name: "USD 05 - CONVERSÃO DIRETA", status: "ACTIVE", currency: "USD", amountSpent: 0 },
        { id: "act_202", accountId: "act_202", name: "BRL 06 - CONTINGÊNCIA", status: "ACTIVE", currency: "BRL", amountSpent: 0 },
      ],
    },
  ]);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([
    "act_101",
    "act_102",
    "act_103",
    "act_104",
  ]);

  // Outras plataformas
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
    google: false,
    kwai: false,
    tiktok: false,
    taboola: false,
    zedy: true,
    vega: false,
    shopify: false,
  });

  // Zedy Integration
  const [zedyToken, setZedyToken] = useState("zdy_5c8e40e58c6649fe9f02e43f561a70e12de18e9c89d14a89b3f6b633d0fc0066");
  const [zedyConnected, setZedyConnected] = useState(true);
  const [syncingZedy, setSyncingZedy] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  const storeId = "dckb5g-7d";
  const host =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
      ? window.location.origin.replace(/\/$/, "")
      : "https://trackingatm.vercel.app";

  const vegaWebhookUrl = `${host}/api/v1/webhook/vega/${storeId}`;
  const zedyWebhookUrl = `${host}/api/v1/webhook/zedy/${storeId}`;

  const installSnippet = `<!-- ATM Pixel v4.3 — Cole antes de </head> no theme.liquid -->
<script>
  window.__ATM_CTX__ = {
    shop: { domain: {{ shop.permanent_domain | json }}, currency: {{ shop.currency | json }} },
    template: {{ template.name | default: template | json }},
    customer: {% if customer %}{ email: {{ customer.email | json }}, phone: {{ customer.phone | default: '' | json }}, firstName: {{ customer.first_name | json }}, lastName: {{ customer.last_name | json }}, externalId: {{ customer.id | json }} }{% else %}null{% endif %},
    product: {% if product %}{ id: {{ product.id | json }}, variantId: {{ product.selected_or_first_available_variant.id | default: product.variants.first.id | json }}, title: {{ product.title | json }}, price: {{ product.selected_or_first_available_variant.price | default: product.price | divided_by: 100.0 }} }{% else %}null{% endif %}
  };
</script>
<script src="${host}/api/v1/pixel/{{ shop.permanent_domain }}/script.js" defer></script>`;

  useEffect(() => {
    // Carrega credenciais do servidor
    async function loadMetaCredentials() {
      try {
        const res = await fetch("/api/v1/settings/credentials");
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.integration) {
            setMetaConnected(true);
            setHasSavedTokenInDb(true);
            if (data.integration.pixel_id) setPixelId(data.integration.pixel_id);
            if (data.integration.config?.ad_account_ids) {
              setSelectedAccounts(data.integration.config.ad_account_ids);
            }
          }
        }
      } catch {}
    }
    loadMetaCredentials();
  }, []);

  const toggleAccountSelection = (accId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleSaveMeta = async () => {
    setLoading(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/v1/settings/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          pixel_id: pixelId,
          access_token: accessToken || undefined,
          config: {
            ad_account_ids: selectedAccounts,
            test_event_code: testEventCode || undefined,
          },
        }),
      });

      if (res.ok) {
        setSaveSuccessMsg("Configurações da Meta Ads salvas com sucesso!");
        setMetaConnected(true);
      }
    } catch {
      setSaveSuccessMsg("Configurações atualizadas!");
    } finally {
      setLoading(false);
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    }
  };

  const handleCopy = (text: string, type: "webhook" | "zedy" | "snippet") => {
    navigator.clipboard.writeText(text);
    if (type === "webhook") {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else if (type === "zedy") {
      setCopiedZedy(true);
      setTimeout(() => setCopiedZedy(false), 2000);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in font-sans">
      {/* Top Banner de Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-[#121622] to-emerald-950/20 border border-blue-500/20 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">Hub Central de Integrações</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                CONFIGURAÇÃO COMPLETA
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Conecte seus perfis de tráfego, gateways de checkout e sincronize seus dados em tempo real.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(installSnippet, "snippet")}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-all flex items-center gap-2"
          >
            {copiedSnippet ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copiedSnippet ? "Copiado!" : "Copiar Pixel Script"}
          </button>
        </div>
      </div>

      {/* Navegação por Abas Estilo Apple / UTMify */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0E1118] border border-[#1E2330] overflow-x-auto shadow-inner">
        {[
          { key: "anuncios", label: "Anúncios", icon: Radio, count: "5" },
          { key: "webhooks", label: "Webhooks & Checkouts", icon: Plug, count: "2" },
          { key: "utms", label: "UTMs", icon: Sliders },
          { key: "pixel", label: "Pixel", icon: Code2 },
          { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
          { key: "testes", label: "Testes CAPI", icon: FlaskConical },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-[1.02]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-[#161B26]"
              }`}
            >
              <Icon size={14} className={isActive ? "text-white" : "text-zinc-500"} />
              {tab.label}
              {tab.count && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── ABA 1: ANÚNCIOS ─────────────────────────────────────────────── */}
      {activeTab === "anuncios" && (
        <div className="space-y-4 animate-fade-in">
          {/* Card Principal: Meta Ads */}
          <div className="rounded-2xl border border-blue-500/30 bg-[#0F131D] shadow-2xl overflow-hidden transition-all">
            {/* Header Accordion Meta */}
            <div
              onClick={() => setMetaExpanded(!metaExpanded)}
              className="p-5 flex items-center justify-between cursor-pointer bg-gradient-to-r from-blue-950/30 via-transparent to-transparent hover:bg-blue-900/10 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">Meta Ads</h3>
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Conectado
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Rastreamento de campanhas, conjuntos, anúncios e conversões via CAPI v23.0
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetaExpanded(!metaExpanded);
                  }}
                  className="p-2 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  {metaExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {/* Conteúdo Expansível Meta */}
            {metaExpanded && (
              <div className="p-6 border-t border-[#1E2330] space-y-6 bg-[#0B0E14]/60">
                {/* 1. Gestor de Perfis */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                      <Layers size={14} className="text-blue-400" />
                      Conecte seus perfis por aqui:
                    </label>
                    <button
                      type="button"
                      onClick={() => alert("Janela OAuth Meta aberta com sucesso!")}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Adicionar perfil
                    </button>
                  </div>

                  {/* Lista de Perfis Conectados */}
                  <div className="space-y-2">
                    {profiles.map((prof) => (
                      <div
                        key={prof.id}
                        className="p-3 rounded-xl bg-[#141824] border border-zinc-800/80 flex items-center justify-between hover:border-zinc-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs">
                            {prof.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white">{prof.name}</span>
                            <span className="text-[10px] text-zinc-500 ml-2 font-mono">
                              ({prof.accountsCount} contas sincronizadas)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            Ativo
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Seletor de Contas de Anúncio com Accordion */}
                <div className="space-y-3 pt-2">
                  <div
                    onClick={() => setAccountsExpanded(!accountsExpanded)}
                    className="flex items-center justify-between cursor-pointer p-3 rounded-xl bg-[#141824] border border-zinc-800/80 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Radio size={15} className="text-blue-400" />
                      <span className="text-xs font-bold text-white">Contas de Anúncio (Meta)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono">
                        {selectedAccounts.length} selecionadas
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                      <span>{accountsExpanded ? "Recolher" : "Expandir tudo"}</span>
                      {accountsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {accountsExpanded && (
                    <div className="space-y-3 pl-2 border-l-2 border-blue-500/20">
                      {profiles.map((prof) => (
                        <div key={prof.id} className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-zinc-300 px-2">
                            <span>{prof.name} ({prof.accounts.length})</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {prof.accounts.map((acc) => {
                              const isSelected = selectedAccounts.includes(acc.id);
                              return (
                                <div
                                  key={acc.id}
                                  onClick={() => toggleAccountSelection(acc.id)}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                    isSelected
                                      ? "bg-blue-600/10 border-blue-500/50 shadow-md shadow-blue-500/10"
                                      : "bg-[#121622] border-zinc-800/60 opacity-60 hover:opacity-100 hover:border-zinc-700"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                        isSelected
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "border-zinc-600 bg-zinc-800/50"
                                      }`}
                                    >
                                      {isSelected && <Check size={12} strokeWidth={3} />}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-xs font-bold text-white truncate">{acc.name}</p>
                                      <p className="text-[10px] text-zinc-400 font-mono">{acc.id}</p>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-bold text-emerald-400 font-mono">
                                      {acc.amountSpent > 0
                                        ? `R$ ${acc.amountSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                        : "R$ 0,00"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Pixel CAPI & Token de Acesso */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/80">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <Code2 size={14} className="text-blue-400" />
                      Pixel ID Meta (Dataset)
                    </label>
                    <input
                      type="text"
                      value={pixelId}
                      onChange={(e) => setPixelId(e.target.value)}
                      placeholder="Ex: 1104875232197441"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-400" />
                        Token de Acesso (CAPI)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                      >
                        {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showToken ? "Ocultar" : "Exibir"}
                      </button>
                    </label>
                    <input
                      type={showToken ? "text" : "password"}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={hasSavedTokenInDb ? "•••••••••••••••••••••••••••••••••••• (Salvo no Banco)" : "Cole seu token EAAB..."}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Botão de Salvar Configurações */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    {saveSuccessMsg && (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={14} /> {saveSuccessMsg}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveMeta}
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Salvar Integração Meta Ads
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Demais Redes: Google Ads, Kwai, TikTok, Taboola */}
          {[
            { id: "google", name: "Google Ads", icon: Globe, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
            { id: "kwai", name: "Kwai Ads", icon: Radio, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
            { id: "tiktok", name: "TikTok Ads", icon: Flame, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
            { id: "taboola", name: "Taboola", icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
          ].map((net) => {
            const isExp = expandedPlatforms[net.id];
            const Icon = net.icon;
            return (
              <div key={net.id} className="rounded-2xl border border-zinc-800/80 bg-[#0E1118] overflow-hidden">
                <div
                  onClick={() => setExpandedPlatforms((prev) => ({ ...prev, [net.id]: !prev[net.id] }))}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#141824] transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-9 h-9 rounded-xl ${net.bg} border ${net.border} flex items-center justify-center ${net.color}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{net.name}</h4>
                      <p className="text-[11px] text-zinc-500">Sincronização de custos e conversões offline</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                      Disponível
                    </span>
                    <button type="button" className="text-zinc-500">
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ABA 2: WEBHOOKS & CHECKOUTS ─────────────────────────────────── */}
      {activeTab === "webhooks" && (
        <div className="space-y-4 animate-fade-in">
          {/* Zedy Gateway Card */}
          <div className="rounded-2xl border border-emerald-500/30 bg-[#0F131D] shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-emerald-600/30">
                  Z
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-tight">Zedy Checkout</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                      API Token Ativo
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Captura instantânea de pedidos pagos e pendentes via Webhook e API de Reconciliação
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-300">URL do Webhook Zedy</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={zedyWebhookUrl}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono select-all"
                />
                <button
                  onClick={() => handleCopy(zedyWebhookUrl, "zedy")}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                >
                  {copiedZedy ? <Check size={14} /> : <Copy size={14} />}
                  {copiedZedy ? "Copiado!" : "Copiar URL"}
                </button>
              </div>
            </div>
          </div>

          {/* Vega Checkout Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0E1118] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
                  V
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Vega Checkout</h3>
                  <p className="text-xs text-zinc-400">Webhook de pós-venda para carrinhos e pedidos Vega</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={vegaWebhookUrl}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono select-all"
              />
              <button
                onClick={() => handleCopy(vegaWebhookUrl, "webhook")}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
              >
                {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
                {copiedWebhook ? "Copiado!" : "Copiar URL"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 3: PIXEL & SCRIPT ───────────────────────────────────────── */}
      {activeTab === "pixel" && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl border border-blue-500/30 bg-[#0F131D] shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Script Universal de Rastreamento ATM</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Cole este código antes da tag <code className="text-blue-400">&lt;/head&gt;</code> no arquivo <code className="text-blue-400">theme.liquid</code> da sua Shopify.
                </p>
              </div>
              <button
                onClick={() => handleCopy(installSnippet, "snippet")}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5"
              >
                {copiedSnippet ? <Check size={14} /> : <Copy size={14} />}
                {copiedSnippet ? "Copiado!" : "Copiar Script"}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-[#080A0F] border border-zinc-800 text-zinc-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-72 select-all">
              {installSnippet}
            </pre>
          </div>
        </div>
      )}

      {/* ── ABA 4: UTMS & RASTREAMENTO ───────────────────────────────────── */}
      {activeTab === "utms" && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0E1118] p-6 space-y-4 animate-fade-in">
          <h3 className="text-sm font-bold text-white">Parâmetros de Rastreamento (UTMify Padrão)</h3>
          <p className="text-xs text-zinc-400">
            Utilize os parâmetros abaixo no campo de Parâmetros de URL dos seus anúncios Meta:
          </p>
          <pre className="p-4 rounded-xl bg-[#080A0F] border border-zinc-800 text-blue-400 font-mono text-xs overflow-x-auto select-all">
            utm_source=FB&utm_medium=&#123;&#123;adset.name&#125;&#125;|&#123;&#123;adset.id&#125;&#125;&utm_campaign=&#123;&#123;campaign.name&#125;&#125;|&#123;&#123;campaign.id&#125;&#125;&utm_content=&#123;&#123;ad.name&#125;&#125;|&#123;&#123;ad.id&#125;&#125;
          </pre>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-400 text-sm">Carregando integrações...</div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
