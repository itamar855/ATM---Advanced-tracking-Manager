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
  EyeOff,
  Building2
} from "lucide-react";

import { useStore } from "@/contexts/StoreContext";
import UtmBuilderPage from "../../utms/page";

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  status: string;
  currency: string;
  amountSpent: number;
  businessName?: string | null;
}

interface BusinessManagerItem {
  id: string;
  name: string;
  accounts: AdAccount[];
}

interface ProfileItem {
  id: string;
  name: string;
  accountsCount: number;
  businesses?: BusinessManagerItem[];
  accounts: AdAccount[];
  isExpanded?: boolean;
}

type TabKey = "anuncios" | "webhooks" | "utms" | "pixel" | "whatsapp" | "testes";

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const { activeStore } = useStore();

  const [activeTab, setActiveTab] = useState<TabKey>("anuncios");
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedZedy, setCopiedZedy] = useState(false);
  const [copiedShopify, setCopiedShopify] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [hasSavedTokenInDb, setHasSavedTokenInDb] = useState(false);

  // Telegram states
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramNotifyApproved, setTelegramNotifyApproved] = useState(true);
  const [telegramNotifyPending, setTelegramNotifyPending] = useState(true);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

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

  // Perfis Conectados Reais (Inicializa vazio)
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  // Modal de Adicionar Perfil
  const [isAddProfileModalOpen, setIsAddProfileModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"oauth" | "token">("oauth");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileToken, setNewProfileToken] = useState("");
  const [addingProfileLoading, setAddingProfileLoading] = useState(false);
  const [addProfileError, setAddProfileError] = useState("");

  // Diagnóstico Meta em Tempo Real
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [diagnosisData, setDiagnosisData] = useState<any>(null);
  const [runningDiagnosis, setRunningDiagnosis] = useState(false);

  const handleRunDiagnosis = async (customToken?: string) => {
    setRunningDiagnosis(true);
    setIsDiagnosisModalOpen(true);
    try {
      const currentStoreId = activeStore?.id || storeId || "";
      const url = `/api/v1/meta/debug?store_id=${encodeURIComponent(currentStoreId)}${customToken ? `&token=${encodeURIComponent(customToken)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setDiagnosisData(data);
    } catch (err: any) {
      setDiagnosisData({ error: err.message });
    } finally {
      setRunningDiagnosis(false);
    }
  };

  const handleOpenMetaOAuth = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    const currentStoreId = activeStore?.id || storeId || "";
    window.open(
      `/api/auth/facebook?store_id=${encodeURIComponent(currentStoreId)}`,
      "facebook_oauth",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );
  };

  const handleAddProfileViaToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName || !newProfileToken) return;
    setAddingProfileLoading(true);
    setAddProfileError("");
    try {
      const res = await fetch(
        `https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name,currency,account_status,amount_spent&access_token=${newProfileToken}`
      );
      const data = await res.json();
      if (data.error) {
        setAddProfileError("Token inválido ou sem permissão ads_read: " + data.error.message);
        return;
      }
      const rawAccounts = Array.isArray(data.data) ? data.data : [];
      const formattedAccs: AdAccount[] = rawAccounts.map((a: any) => ({
        id: a.id,
        accountId: a.id,
        name: a.name || a.id,
        status: a.account_status === 1 ? "ACTIVE" : "DISABLED",
        currency: a.currency || "USD",
        amountSpent: Number(a.amount_spent || 0) / 100,
      }));

      const newProf: ProfileItem = {
        id: `prof-${Date.now()}`,
        name: newProfileName,
        accountsCount: formattedAccs.length || 1,
        accounts: formattedAccs.length > 0 ? formattedAccs : [
          { id: `act_${Date.now()}`, accountId: `act_${Date.now()}`, name: `${newProfileName} - Principal`, status: "ACTIVE", currency: "USD", amountSpent: 0 }
        ],
      };

      setProfiles((prev) => [...prev, newProf]);
      setIsAddProfileModalOpen(false);
      setNewProfileName("");
      setNewProfileToken("");
      setSaveSuccessMsg(`Perfil "${newProfileName}" conectado com sucesso!`);
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    } catch (err: any) {
      setAddProfileError("Erro na conexão: " + err.message);
    } finally {
      setAddingProfileLoading(false);
    }
  };

  // Zedy Integration
  const [zedyToken, setZedyToken] = useState("zdy_5c8e40e58c6649fe9f02e43f561a70e12de18e9c89d14a89b3f6b633d0fc0066");
  const [shopifyToken, setShopifyToken] = useState("");
  const [zedyConnected, setZedyConnected] = useState(true);
  const [syncingZedy, setSyncingZedy] = useState(false);
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [showShopifyHelp, setShowShopifyHelp] = useState(false);

  const storeId = activeStore?.id || "";
  const host =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
      ? window.location.origin.replace(/\/$/, "")
      : "https://trackingatm.vercel.app";

  const vegaWebhookUrl = `${host}/api/v1/webhook/vega/${storeId}`;
  const zedyWebhookUrl = `${host}/api/v1/webhook/zedy/${storeId}`;

  const installSnippet = `<!-- ATM Pixel v4.4 — Cole antes de </head> no theme.liquid -->
<script>
  window.__ATM_CTX__ = {
    shop: { domain: {{ shop.permanent_domain | json }}, currency: {{ shop.currency | json }} },
    template: {{ template.name | default: template | json }},
    customer: {% if customer %}{ email: {{ customer.email | json }}, phone: {{ customer.phone | default: '' | json }}, firstName: {{ customer.first_name | json }}, lastName: {{ customer.last_name | json }}, externalId: {{ customer.id | json }} }{% else %}null{% endif %},
    product: {% if product %}{ id: {{ product.id | json }}, variantId: {{ product.selected_or_first_available_variant.id | default: product.variants.first.id | json }}, title: {{ product.title | json }}, price: {{ product.selected_or_first_available_variant.price | default: product.price | divided_by: 100.0 }} }{% else %}null{% endif %},
    cart: {% if cart %}{ total_price: {{ cart.total_price | default: 0 }}, item_count: {{ cart.item_count | default: 0 }}, items: [ {% for item in cart.items %}{ id: {{ item.product_id | json }}, variant_id: {{ item.variant_id | json }}, price: {{ item.price | default: 0 }}, quantity: {{ item.quantity | default: 0 }} }{% unless forloop.last %},{% endunless %}{% endfor %} ] }{% else %}null{% endif %}
  };
</script>
<script src="${host}/api/v1/pixel/{{ shop.permanent_domain }}/script.js" defer></script>`;

  const handleSyncZedy = async () => {
    if (!zedyToken) {
      alert("Token da Zedy não configurado.");
      return;
    }
    setSyncingZedy(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/v1/sync/zedy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: zedyToken })
      });
      const data = await res.json();
      if (res.ok && data.ok !== false) {
        setSaveSuccessMsg(`Sincronização concluída com sucesso! ${data.synced_count || 0} vendas sincronizadas.`);
      } else {
        alert("Erro na sincronização: " + (data.error || "Desconhecido"));
      }
    } catch (e: any) {
      alert("Erro na requisição: " + e.message);
    } finally {
      setSyncingZedy(false);
      setTimeout(() => setSaveSuccessMsg(""), 6000);
    }
  };

  const handleResetAndSyncZedy = async () => {
    if (!zedyToken) {
      alert("Token da Zedy não configurado.");
      return;
    }
    if (!window.confirm("Isso apagará todas as vendas Zedy registradas HOJE e fará uma importação limpa direto da plataforma. Tem certeza?")) {
      return;
    }
    setSyncingZedy(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/v1/sync/zedy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: zedyToken, reset_today: true })
      });
      const data = await res.json();
      if (res.ok && data.ok !== false) {
        setSaveSuccessMsg(`Reset concluído! ${data.synced_count || 0} vendas sincronizadas limpas hoje.`);
      } else {
        alert("Erro no reset: " + (data.error || "Desconhecido"));
      }
    } catch (e: any) {
      alert("Erro na requisição: " + e.message);
    } finally {
      setSyncingZedy(false);
      setTimeout(() => setSaveSuccessMsg(""), 6000);
    }
  };

  const handleSaveShopifyToken = async () => {
    if (!shopifyToken) {
      alert("Token da Shopify não configurado.");
      return;
    }
    setSyncingShopify(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/v1/settings/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, shopify_api_key: shopifyToken })
      });
      const data = await res.json();
      if (res.ok && data.ok !== false) {
        setSaveSuccessMsg("Token do Shopify salvo com sucesso!");
      } else {
        alert("Erro ao salvar: " + (data.error || "Desconhecido"));
      }
    } catch (e: any) {
      alert("Erro na requisição: " + e.message);
    } finally {
      setSyncingShopify(false);
      setTimeout(() => setSaveSuccessMsg(""), 6000);
    }
  };

  const handleSaveTelegram = async () => {
    setSavingTelegram(true);
    try {
      const res = await fetch("/api/v1/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          store_id: storeId, 
          botToken: telegramBotToken,
          chatId: telegramChatId,
          notifyApproved: telegramNotifyApproved,
          notifyPending: telegramNotifyPending
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSaveSuccessMsg("Configurações do Telegram salvas com sucesso!");
      } else {
        alert("Erro: " + data.error);
      }
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setSavingTelegram(false);
      setTimeout(() => setSaveSuccessMsg(""), 6000);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await fetch("/api/v1/settings/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Push de teste enviado! Verifique seu Telegram.");
      } else {
        alert("Erro no teste: " + data.error);
      }
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setTestingTelegram(false);
    }
  };


  useEffect(() => {
    // Carrega credenciais do servidor e contas reais da Meta
    async function loadMetaCredentials() {
      try {
        const accRes = await fetch(`/api/v1/meta/accounts?store_id=${activeStore?.id}`);
        if (accRes.ok) {
          const accData = await accRes.json();
          if (accData.ok) {
            setMetaConnected(accData.connected);
            setHasSavedTokenInDb(accData.isFromDatabase);
            if (accData.pixelId) setPixelId(accData.pixelId);

            const savedAccountIds: string[] = Array.isArray(accData.selectedAccountIds)
              ? accData.selectedAccountIds
              : [];

            const rawAccounts = Array.isArray(accData.accounts) ? accData.accounts : [];
            const realAccounts: AdAccount[] = rawAccounts.map((a: any) => ({
              id: a.id,
              accountId: a.accountId || a.id.replace("act_", ""),
              name: a.name || a.id,
              status: a.status || "ACTIVE",
              currency: a.currency || "BRL",
              amountSpent: Number(a.amountSpent || a.spend || 0),
              businessName: a.businessName || null,
            }));

            const bmList: BusinessManagerItem[] =
              Array.isArray(accData.businesses) && accData.businesses.length > 0
                ? accData.businesses.map((b: any) => {
                    const bmAccs = Array.isArray(b.accounts) && b.accounts.length > 0
                      ? b.accounts.map((a: any) => ({
                          id: a.id,
                          accountId: a.accountId || a.id.replace("act_", ""),
                          name: a.name || a.id,
                          status: a.status || "ACTIVE",
                          currency: a.currency || "BRL",
                          amountSpent: Number(a.amountSpent || a.spend || 0),
                          businessName: b.name || a.businessName || null,
                        }))
                      : [];

                    return {
                      id: b.id,
                      name: b.name || `Business Manager (${b.id})`,
                      accounts: bmAccs,
                    };
                  })
                : [
                    {
                      id: "bm_main",
                      name: "Business Manager Principal",
                      accounts: realAccounts,
                    },
                  ];

            const profileName = accData.profile?.name || accData.diagnostics?.userName || accData.user?.name || "Itamar Almeida (Meta Ads)";
            const realProfile: ProfileItem = {
              id: "prof-main",
              name: profileName,
              accountsCount: realAccounts.length,
              businesses: bmList,
              accounts: realAccounts,
            };

            setProfiles([realProfile]);
            // Preserva exatamente as contas salvas no banco
            if (savedAccountIds.length > 0) {
              setSelectedAccounts(savedAccountIds);
            } else if (realAccounts.length > 0) {
              setSelectedAccounts(realAccounts.map((a) => a.id));
            }
          }
        }
        
        if (storeId) {
          const credRes = await fetch(`/api/v1/settings/credentials?store_id=${storeId}`);
          if (credRes.ok) {
            const data = await credRes.json();
            if (data.zedyToken) setZedyToken(data.zedyToken);
            if (data.shopifyToken) setShopifyToken(data.shopifyToken);
            if (data.telegramBotToken) setTelegramBotToken(data.telegramBotToken);
            if (data.telegramChatId) setTelegramChatId(data.telegramChatId);
            if (data.telegramNotifyApproved !== undefined) setTelegramNotifyApproved(data.telegramNotifyApproved);
            if (data.telegramNotifyPending !== undefined) setTelegramNotifyPending(data.telegramNotifyPending);
          }
        }
      } catch (err) {
        console.warn("[Integrations] Erro ao carregar contas reais:", err);
      }
    }
    loadMetaCredentials();
  }, [activeStore]);

  const toggleAccountSelection = (accId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleSaveMeta = async () => {
    setLoading(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/v1/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          platform: "meta",
          pixel_id: pixelId,
          access_token: accessToken.trim() ? accessToken.trim() : undefined,
          ad_account_ids: selectedAccounts,
          test_event_code: testEventCode ? testEventCode.trim() : undefined,
          profile_name: profiles[0]?.name || "Itamar Almeida (Meta Ads)",
        }),
      });

      if (res.ok) {
        setSaveSuccessMsg("Configurações e contas selecionadas salvas com sucesso!");
        setMetaConnected(true);
        setTimeout(() => setSaveSuccessMsg(""), 4000);
      } else {
        const errJson = await res.json();
        alert(errJson.error || "Erro ao salvar integração Meta.");
      }
    } catch (e: any) {
      alert("Erro ao conectar com a API: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, type: "webhook" | "zedy" | "snippet" | "shopify") => {
    navigator.clipboard.writeText(text);
    if (type === "webhook") {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else if (type === "zedy") {
      setCopiedZedy(true);
      setTimeout(() => setCopiedZedy(false), 2000);
    } else if (type === "shopify") {
      setCopiedShopify(true);
      setTimeout(() => setCopiedShopify(false), 2000);
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
          { key: "anuncios", label: "Campanhas", icon: Radio, count: "Ativo" },
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

      {/* ── ABA 1: CAMPANHAS ─────────────────────────────────────────────── */}
      {activeTab === "anuncios" && (
        <div className="space-y-4 animate-fade-in">
          {/* Card Principal: Campanhas (Meta Ads) */}
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
                    <h3 className="text-base font-bold text-white tracking-tight">Campanhas (Meta Ads)</h3>
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Conectado
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Rastreamento de contas de anúncio, campanhas, conjuntos, anúncios e conversões via CAPI v23.0
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRunDiagnosis()}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1A2133] hover:bg-[#222C44] text-blue-300 border border-blue-500/30 transition-all flex items-center gap-1.5"
                      >
                        <FlaskConical size={14} className="text-blue-400" /> Diagnosticar Conexão
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddProfileModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Adicionar perfil
                      </button>
                    </div>
                  </div>

                  {/* Lista de Perfis Conectados */}
                  {profiles.length === 0 ? (
                    <div className="p-4 rounded-xl bg-[#141824] border border-dashed border-zinc-800 text-center py-6">
                      <Layers size={24} className="mx-auto text-zinc-600 mb-2" />
                      <p className="text-xs text-zinc-400 font-medium">Nenhum perfil conectado ainda.</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Clique em "+ Adicionar perfil" para sincronizar suas contas de anúncio.</p>
                    </div>
                  ) : (
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
                  )}
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
                    <div className="space-y-4 pl-1">
                      {profiles.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-500 text-center">
                          Conecte um perfil acima para visualizar e selecionar suas contas de anúncio.
                        </div>
                      ) : (
                        profiles.map((prof) => (
                          <div key={prof.id} className="space-y-3 p-3 rounded-2xl bg-[#0B0E14] border border-zinc-800/80">
                            {/* Header do Perfil */}
                            <div className="flex items-center justify-between text-xs font-bold text-zinc-200 px-1">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">
                                  {prof.name.slice(0, 2).toUpperCase()}
                                </div>
                                <span>{prof.name}</span>
                              </div>
                              <span className="text-[11px] text-zinc-400 font-mono">
                                {prof.accounts.filter((a) => selectedAccounts.includes(a.id)).length} de {prof.accounts.length} contas selecionadas
                              </span>
                            </div>

                            {/* Agrupamento por Business Manager */}
                            {(prof.businesses && prof.businesses.length > 0
                              ? prof.businesses
                              : [{ id: "1279546367377201", name: "Business Manager Principal", accounts: prof.accounts }]
                            ).map((bm) => {
                              const allBmSelected = bm.accounts.length > 0 && bm.accounts.every((a) => selectedAccounts.includes(a.id));
                              const toggleAllBm = () => {
                                if (allBmSelected) {
                                  const bmIds = new Set(bm.accounts.map((a) => a.id));
                                  setSelectedAccounts((prev) => prev.filter((id) => !bmIds.has(id)));
                                } else {
                                  const toAdd = bm.accounts.map((a) => a.id).filter((id) => !selectedAccounts.includes(id));
                                  setSelectedAccounts((prev) => [...prev, ...toAdd]);
                                }
                              };

                              return (
                                <div key={bm.id} className="rounded-xl border border-blue-500/20 bg-[#121622] p-3.5 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                        <Building2 size={15} />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-white">{bm.name}</span>
                                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-mono">
                                            ID: {bm.id}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-zinc-400 mt-0.5">
                                          {bm.accounts.length} contas de anúncio disponíveis
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={toggleAllBm}
                                      className="text-[11px] px-2.5 py-1 rounded-lg bg-[#181D2A] hover:bg-[#1E2435] border border-zinc-700 text-zinc-300 font-semibold transition-colors"
                                    >
                                      {allBmSelected ? "Desmarcar Todas" : "Selecionar Todas"}
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                    {bm.accounts.map((acc) => {
                                      const isSelected = selectedAccounts.includes(acc.id);
                                      return (
                                        <div
                                          key={acc.id}
                                          onClick={() => toggleAccountSelection(acc.id)}
                                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                            isSelected
                                              ? "bg-blue-600/15 border-blue-500/60 shadow-md shadow-blue-500/10"
                                              : "bg-[#0E1118] border-zinc-800/60 opacity-60 hover:opacity-100 hover:border-zinc-700"
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
                              );
                            })}
                          </div>
                        ))
                      )}
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
                    Salvar Integração de Campanhas
                  </button>
                </div>
              </div>
            )}
          </div>
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

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-300">URL do Webhook Zedy</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={zedyWebhookUrl}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(zedyWebhookUrl, "zedy")}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {copiedZedy ? <Check size={14} /> : <Copy size={14} />}
                    {copiedZedy ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">API Token de Reconciliação (Zedy)</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={zedyToken}
                    onChange={(e) => setZedyToken(e.target.value)}
                    placeholder="Cole seu Token da Zedy aqui"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-emerald-500/50"
                  />
                  <button
                    onClick={handleSyncZedy}
                    disabled={syncingZedy}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {syncingZedy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Sincronizar Pedidos
                  </button>
                  <button
                    onClick={handleResetAndSyncZedy}
                    disabled={syncingZedy}
                    title="Apaga os webhooks duplicados de hoje e ressincroniza"
                    className="px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {saveSuccessMsg && (saveSuccessMsg.includes("Sincronização") || saveSuccessMsg.includes("Reset")) && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 size={16} />
                  {saveSuccessMsg}
                </div>
              )}
            </div>
          </div>

          {/* Shopify Custom App Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0E1118] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M21.2 16.5c-1.3 4.1-5.1 5.4-8.8 5.4-3.6 0-7.3-1.4-8.7-5.4C3 14 3.7 9.8 4 8c.2-.9.8-1.5 1.7-1.7l5.9-1c.6-.1 1.2.2 1.5.8.4.8.4 1.7 0 2.5l-2.4 4c-.1.2-.2.5-.2.8.2.8 1.4 1.2 2.2 1.3 1.7.2 3.6.4 5.3.6 1.4.2 2.7 1.3 2.9 2.7.2 1.2.1 2.3-.3 3.5zm-5.7-12c-1.5 0-2.8 1.1-3.2 2.5l-1.3 4c-.1.3 0 .6.2.8l2.2 2c.6.6 1.6.6 2.3.1l2.4-2.1c.4-.3.6-.8.6-1.3l-.2-4c-.1-1.1-1.1-2-2.2-2h-.8zM8.8 5.5l5.2-.9c.7-.1 1.3.4 1.4 1.1l.2 3.8-2.1 1.8-1.5-3.3c-.6-1.3-1.8-2.2-3.2-2.5zm11.7 7.7l-3.3-.4c-1.7-.2-3.4-.4-5.1-.6-.5-.1-1-.2-1.3-.6l-2-1.8c-.3-.3-.4-.7-.3-1.1L9 6.2C8.7 4.9 9.6 3.7 11 3.5l5.9-1c1.5-.3 2.9.7 3.2 2.2l.6 6.8c0 .6-.2 1.1-.6 1.5z"/></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Shopify Admin API <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Recomendado</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Permite puxar pedidos automaticamente da Shopify como Fonte da Verdade.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">Token de Acesso da API Admin (shpat_...)</label>
                  <button onClick={() => setShowShopifyHelp(!showShopifyHelp)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline">
                    Como gerar este Token?
                  </button>
                </div>
                
                {showShopifyHelp && (
                  <div className="mt-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-zinc-300 space-y-2 leading-relaxed">
                    <p className="font-bold text-blue-400">Passo a passo para gerar o Token na Shopify:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Acesse o painel da sua Shopify e vá em <b>Configurações &gt; Apps e canais de vendas</b>.</li>
                      <li>Clique em <b>Desenvolver apps</b> (ou Custom Apps) e depois em <b>Criar um app</b>.</li>
                      <li>Dê o nome de "ATM Tracking" e clique em Criar.</li>
                      <li>Vá na aba <b>Configuração</b>, encontre <b>Integração da API do Admin</b> e clique em Configurar.</li>
                      <li>Na lista de permissões, busque por "Orders" (Pedidos) e marque a caixinha <b>read_orders</b> (Ler pedidos).</li>
                      <li>Clique em Salvar. Depois vá na aba <b>Credenciais da API</b> e clique em <b>Instalar app</b>.</li>
                      <li>A Shopify vai revelar o <b>Token de acesso da API do Admin</b> apenas UMA VEZ. Ele começa com <code>shpat_</code>. Copie e cole abaixo!</li>
                    </ol>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={shopifyToken}
                    onChange={(e) => setShopifyToken(e.target.value)}
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={handleSaveShopifyToken}
                    disabled={syncingShopify || !shopifyToken.trim()}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {syncingShopify ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Salvar Token
                  </button>
                </div>
              </div>
              
              {saveSuccessMsg && saveSuccessMsg.includes("Shopify") && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 size={16} />
                  {saveSuccessMsg}
                </div>
              )}
            </div>
          </div>
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

          {/* 5. Telegram Integration */}
          <div className="bg-[#0B0E14] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                <AlertCircle size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1">Telegram (Notificações no Celular)</h3>
                <p className="text-xs text-zinc-400">Receba alertas em tempo real no app do Telegram (100% grátis) quando ocorrerem vendas.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-300">Bot Token (via BotFather)</label>
                  <input
                    type="text"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="mt-2 w-full px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-300">Chat ID</label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="-1001234567890"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                      onClick={handleSaveTelegram}
                      disabled={savingTelegram || !telegramBotToken.trim() || !telegramChatId.trim()}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {savingTelegram ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Salvar
                    </button>
                    <button
                      onClick={handleTestTelegram}
                      disabled={testingTelegram || !telegramBotToken.trim() || !telegramChatId.trim()}
                      className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {testingTelegram ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      Testar
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={telegramNotifyApproved}
                      onChange={(e) => setTelegramNotifyApproved(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5.5 rounded-full transition-colors ${telegramNotifyApproved ? 'bg-blue-600' : 'bg-zinc-800 border border-zinc-700'}`}></div>
                    <div className={`absolute left-1 top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform ${telegramNotifyApproved ? 'translate-x-4.5' : 'translate-x-0'}`}></div>
                  </div>
                  <span className="text-xs text-zinc-300 font-semibold group-hover:text-white transition-colors">
                    Notificar Vendas Aprovadas (💰)
                  </span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={telegramNotifyPending}
                      onChange={(e) => setTelegramNotifyPending(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5.5 rounded-full transition-colors ${telegramNotifyPending ? 'bg-blue-600' : 'bg-zinc-800 border border-zinc-700'}`}></div>
                    <div className={`absolute left-1 top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform ${telegramNotifyPending ? 'translate-x-4.5' : 'translate-x-0'}`}></div>
                  </div>
                  <span className="text-xs text-zinc-300 font-semibold group-hover:text-white transition-colors">
                    Notificar Vendas Pendentes / Cartão Recusado / Pix Gerado (🟡)
                  </span>
                </label>
              </div>
              
              {saveSuccessMsg && saveSuccessMsg.includes("Telegram") && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 text-blue-400 text-xs font-bold">
                  <Check size={14} />
                  {saveSuccessMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2.8: TESTES CAPI ───────────────────────────────────────── */}
      {activeTab === "testes" && (
        <div className="animate-fade-in pt-4 space-y-6">
          <div className="bg-[#0B0E14] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-purple-600/20">
                <FlaskConical size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1">Central de Testes CAPI</h3>
                <p className="text-xs text-zinc-400">Envie eventos de teste diretamente para o Pixel da Meta para validar sua integração sem precisar fazer compras reais.</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-zinc-300">Código de Teste do Gerenciador de Eventos (TESTxxxxx)</label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={testEventCode}
                    onChange={(e) => setTestEventCode(e.target.value.toUpperCase())}
                    placeholder="Ex: TEST12345"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!testEventCode.startsWith("TEST")) {
                        alert("O código deve começar com TEST (ex: TEST12345)");
                        return;
                      }
                      
                      try {
                        const btn = document.getElementById("btn-test-purchase");
                        if (btn) btn.innerHTML = "Enviando...";
                        
                        const res = await fetch("/api/v1/meta/test-event", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            store_id: storeId,
                            test_event_code: testEventCode,
                            event_name: "Purchase"
                          })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert("✅ Evento Purchase enviado com sucesso! Verifique a aba de Eventos de Teste no seu Meta.");
                        } else {
                          alert("❌ Erro: " + data.error);
                        }
                      } catch (err: any) {
                        alert("Erro de conexão: " + err.message);
                      } finally {
                        const btn = document.getElementById("btn-test-purchase");
                        if (btn) btn.innerHTML = "Disparar Teste: Purchase (Venda)";
                      }
                    }}
                    id="btn-test-purchase"
                    disabled={!testEventCode.trim() || !testEventCode.startsWith("TEST")}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20"
                  >
                    Disparar Teste: Purchase (Venda)
                  </button>
                </div>
              </div>
              
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <h4 className="text-xs font-bold text-purple-400 flex items-center gap-2 mb-2">
                  <ShieldCheck size={14} />
                  Como validar seus eventos:
                </h4>
                <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
                  <li>Acesse o <b>Gerenciador de Eventos da Meta</b> e abra o seu Pixel.</li>
                  <li>Vá na aba <b>Eventos de Teste</b>.</li>
                  <li>Copie o código gerado em <i>Testar eventos do servidor</i>.</li>
                  <li>Cole no campo acima e dispare o teste.</li>
                  <li>O evento aparecerá no Facebook em cerca de 5 a 15 segundos.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2.5: UTMs ───────────────────────────────────────── */}
      {activeTab === "utms" && (
        <div className="animate-fade-in pt-4">
          <UtmBuilderPage />
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

      {/* ── MODAL: ADICIONAR PERFIL META (OAuth / Token) ───────────────── */}
      {isAddProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0F131E] border border-blue-500/30 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 text-white relative animate-scale-in">
            {/* Header com Ícone e Fechar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Conectar Perfil Meta Ads</h3>
                  <p className="text-xs text-zinc-400">Importe e vincule suas contas de anúncio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProfileModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Alternador de Modo: OAuth vs Token */}
            <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab("oauth")}
                className={`py-2 rounded-lg transition-all ${
                  modalTab === "oauth" ? "bg-blue-600 text-white shadow-md" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Facebook Login (OAuth)
              </button>
              <button
                type="button"
                onClick={() => setModalTab("token")}
                className={`py-2 rounded-lg transition-all ${
                  modalTab === "token" ? "bg-blue-600 text-white shadow-md" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Inserir Token Direto (BM)
              </button>
            </div>

            {/* Conteúdo Aba OAuth */}
            {modalTab === "oauth" && (
              <div className="space-y-4 text-center py-2">
                <p className="text-xs text-zinc-300 leading-relaxed px-2">
                  Clique no botão abaixo para abrir a janela de autorização oficial da Meta. Você poderá escolher quais contas de anúncio deseja sincronizar com o ATM.
                </p>

                <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/20 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    Permissões Seguras Solicitadas:
                  </div>
                  <ul className="text-[11px] text-zinc-400 space-y-1 list-disc list-inside">
                    <li>Leitura de Campanhas e Gastos (<code className="text-blue-400">ads_read</code>)</li>
                    <li>Gestão de Públicos e Otimização (<code className="text-blue-400">ads_management</code>)</li>
                    <li>Acesso à Business Manager (<code className="text-blue-400">business_management</code>)</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={handleOpenMetaOAuth}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} /> Abrir Janela do Facebook Login
                </button>
              </div>
            )}

            {/* Conteúdo Aba Token Direto */}
            {modalTab === "token" && (
              <form onSubmit={handleAddProfileViaToken} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300">Nome do Perfil / Gestor</label>
                  <input
                    type="text"
                    required
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Ex: Naome Tavares - Contingência 02"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300">Token de Acesso do Perfil (EAAB...)</label>
                  <textarea
                    required
                    rows={3}
                    value={newProfileToken}
                    onChange={(e) => setNewProfileToken(e.target.value)}
                    placeholder="Cole seu token de longa duração gerado no Graph API Explorer ou BM..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {addProfileError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{addProfileError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={addingProfileLoading}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addingProfileLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Testar e Conectar Perfil
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Diagnóstico Meta em Tempo Real */}
      {isDiagnosisModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0F131D] border border-blue-500/30 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FlaskConical size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Diagnóstico da Conexão Meta Graph API</h3>
                  <p className="text-[11px] text-zinc-400">Raio-X em tempo real do token, permissões e contas retornadas pelo Facebook</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagnosisModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {runningDiagnosis ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-blue-500 mx-auto" />
                <p className="text-xs text-zinc-300 font-semibold">Consultando Meta Graph API v23.0...</p>
                <p className="text-[11px] text-zinc-500">Testando /me, /me/permissions, /me/adaccounts e /me/businesses...</p>
              </div>
            ) : diagnosisData ? (
              <div className="space-y-4">
                {/* Resumo do Status */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#141824] border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">Token Banco</span>
                    <p className="text-xs font-bold text-white mt-1">
                      {diagnosisData.database?.found_in_store ? "Loja Atual" : (diagnosisData.database?.found_in_fallback ? "Fallback Ativo" : "Não Encontrado")}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141824] border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">Validade Meta</span>
                    <p className={`text-xs font-bold mt-1 ${diagnosisData.diagnosis_summary?.token_valid ? "text-emerald-400" : "text-red-400"}`}>
                      {diagnosisData.diagnosis_summary?.token_valid ? "Válido (Ativo)" : "Inválido / Expirado"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141824] border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">Contas Descobertas</span>
                    <p className="text-xs font-bold text-blue-400 mt-1">
                      {diagnosisData.diagnosis_summary?.total_accounts_found || 0} conta(s)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141824] border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">BMs Encontradas</span>
                    <p className="text-xs font-bold text-indigo-400 mt-1">
                      {diagnosisData.diagnosis_summary?.total_bms_found || 0} BM(s)
                    </p>
                  </div>
                </div>

                {/* Recomendações e Diagnóstico */}
                {diagnosisData.diagnosis_summary?.recommendations?.length > 0 && (
                  <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/20 space-y-1.5">
                    <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-blue-400" /> Diagnóstico do Sistema:
                    </span>
                    {diagnosisData.diagnosis_summary.recommendations.map((rec: string, i: number) => (
                      <p key={i} className="text-xs text-zinc-300 leading-relaxed">
                        • {rec}
                      </p>
                    ))}
                  </div>
                )}

                {/* Visualizador do JSON Bruto */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-400">Resposta Bruta da Graph API:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(JSON.stringify(diagnosisData, null, 2), "snippet")}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white flex items-center gap-1"
                    >
                      <Copy size={11} /> Copiar JSON
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-[#090C12] border border-zinc-800/80 text-[10px] text-zinc-300 font-mono overflow-x-auto max-h-60">
                    {JSON.stringify(diagnosisData, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <button
                type="button"
                onClick={() => handleRunDiagnosis()}
                disabled={runningDiagnosis}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-2"
              >
                <RefreshCw size={13} className={runningDiagnosis ? "animate-spin" : ""} />
                Testar Novamente
              </button>
              <button
                type="button"
                onClick={() => setIsDiagnosisModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
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
