"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/contexts/StoreContext";
import {
  Bell,
  Smartphone,
  Volume2,
  CheckCircle2,
  Clock,
  ShoppingCart,
  Sparkles,
  Save,
  Send,
  AlertCircle,
  Moon,
  DollarSign,
  HelpCircle,
  Laptop,
  Check,
  Play,
  RotateCcw,
} from "lucide-react";
import { playNotificationSound } from "@/lib/notifications/sound-effects";
import { NotificationConfig, DEFAULT_NOTIFICATION_CONFIG } from "@/lib/notifications/web-push";

const AVAILABLE_TAGS = [
  { tag: "{valor}", label: "Valor (ex: R$ 197,90)", desc: "Valor total do pedido" },
  { tag: "{cliente_nome}", label: "Nome Completo", desc: "Nome do cliente" },
  { tag: "{cliente_primeiro_nome}", label: "Primeiro Nome", desc: "Primeiro nome do cliente" },
  { tag: "{metodo_pagamento}", label: "Método", desc: "PIX, Cartão ou Boleto" },
  { tag: "{loja}", label: "Nome da Loja", desc: "Nome configurado da loja" },
  { tag: "{pedido_id}", label: "ID do Pedido", desc: "Número do pedido (ex: #4829)" },
];

export default function NotificationSettingsPage() {
  const { activeStore } = useStore();
  const storeId = activeStore?.id || "dckb5g-7d";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Status de suporte e inscrição do dispositivo local
  const [isPushSupported, setIsPushSupported] = useState(true);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");
  const [isSubscribedOnThisDevice, setIsSubscribedOnThisDevice] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [connectedDevicesCount, setConnectedDevicesCount] = useState(0);

  // Configurações da loja
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [activeTab, setActiveTab] = useState<"approved" | "pending" | "abandoned">("approved");

  // Refs para inserção de variáveis nos inputs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [lastFocusedField, setLastFocusedField] = useState<"title" | "body">("body");

  // Carrega configurações da loja e verifica inscrição local
  useEffect(() => {
    loadSettings();
    checkLocalPushSubscription();
  }, [storeId]);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/notifications/subscribe?store_id=${storeId}`);
      const data = await res.json();
      if (data.ok && data.config) {
        setConfig(data.config);
        setConnectedDevicesCount(data.subscriptions_count || 0);
      }
    } catch (err: any) {
      console.warn("Erro ao carregar configurações:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkLocalPushSubscription() {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
      setIsPushSupported(false);
      return;
    }

    setPermissionState(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribedOnThisDevice(Boolean(sub));
    } catch {
      setIsSubscribedOnThisDevice(false);
    }
  }

  // Ativar Notificações no iPhone / Android / PC
  async function handleSubscribeDevice() {
    setSubscribing(true);
    setFeedbackMsg(null);

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("Notificações Push não são suportadas neste navegador. No iPhone, certifique-se de adicionar o app à Tela de Início primeiro.");
        return;
      }

      // 1. Pede permissão nativa
      const perm = await Notification.requestPermission();
      setPermissionState(perm);

      if (perm !== "granted") {
        setFeedbackMsg({
          type: "error",
          text: "Permissão de notificação negada. Ative as notificações nas configurações do seu aparelho.",
        });
        return;
      }

      // 2. Busca chave pública VAPID
      const infoRes = await fetch(`/api/v1/notifications/subscribe?store_id=${storeId}`);
      const info = await infoRes.json();
      if (!info.vapid_public_key) throw new Error("Chave VAPID não configurada.");

      // Converte chave para Uint8Array
      const convertedVapidKey = urlBase64ToUint8Array(info.vapid_public_key);

      // 3. Registra inscrição no PushManager
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      // 4. Identifica tipo de dispositivo
      const ua = navigator.userAgent.toLowerCase();
      let deviceType: "ios" | "android" | "desktop" = "desktop";
      let deviceName = "Computador / Desktop";
      if (/iphone|ipad|ipod/.test(ua)) {
        deviceType = "ios";
        deviceName = "Apple iPhone / iPad";
      } else if (/android/.test(ua)) {
        deviceType = "android";
        deviceName = "Smartphone Android";
      } else if (/mac/.test(ua)) {
        deviceName = "Apple Mac";
      } else if (/win/.test(ua)) {
        deviceName = "Windows PC";
      }

      // 5. Envia inscrição para a API da loja
      const saveRes = await fetch("/api/v1/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          subscription: subscription.toJSON(),
          device_name: deviceName,
          device_type: deviceType,
        }),
      });

      const saveData = await saveRes.json();
      if (saveData.ok) {
        setIsSubscribedOnThisDevice(true);
        setConnectedDevicesCount((prev) => prev + 1);
        setFeedbackMsg({
          type: "success",
          text: `🎉 ${deviceName} conectado com sucesso! As vendas desta loja vão apitar aqui.`,
        });
        // Toca som de boas-vindas
        playNotificationSound(config.sound);
      } else {
        throw new Error(saveData.error || "Erro ao registrar inscrição");
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: `Erro ao ativar notificações: ${err.message}`,
      });
    } finally {
      setSubscribing(false);
    }
  }

  // Disparar teste imediato no iPhone
  async function handleSendTest() {
    setTesting(true);
    setFeedbackMsg(null);

    // Toca som localmente para demonstração imediata
    playNotificationSound(config.sound);

    try {
      const res = await fetch("/api/v1/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          type: activeTab,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFeedbackMsg({
          type: "success",
          text: "🚀 Notificação de teste enviada! Olhe a tela do seu iPhone / aparelho agora.",
        });
      } else {
        setFeedbackMsg({
          type: "error",
          text: data.error || "Não foi possível disparar o teste.",
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: `Falha no teste: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  }

  // Salvar configurações
  async function handleSaveConfig() {
    setSaving(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch("/api/v1/notifications/subscribe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          config,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFeedbackMsg({
          type: "success",
          text: "Configurações e templates de notificação salvos com sucesso!",
        });
      } else {
        throw new Error(data.error || "Erro ao salvar.");
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: `Erro ao salvar: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  // Inserir tag dinâmica no campo em foco
  function insertTag(tag: string) {
    if (lastFocusedField === "title") {
      const field = titleKeyForTab(activeTab);
      setConfig((prev) => ({
        ...prev,
        [field]: (prev[field] || "") + tag,
      }));
    } else {
      const field = bodyKeyForTab(activeTab);
      setConfig((prev) => ({
        ...prev,
        [field]: (prev[field] || "") + tag,
      }));
    }
  }

  function titleKeyForTab(tab: "approved" | "pending" | "abandoned") {
    if (tab === "approved") return "template_approved_title";
    if (tab === "pending") return "template_pending_title";
    return "template_abandoned_title";
  }

  function bodyKeyForTab(tab: "approved" | "pending" | "abandoned") {
    if (tab === "approved") return "template_approved_body";
    if (tab === "pending") return "template_pending_body";
    return "template_abandoned_body";
  }

  // Renderiza prévia simulada da notificação no iPhone
  const currentTitleTemplate = config[titleKeyForTab(activeTab)];
  const currentBodyTemplate = config[bodyKeyForTab(activeTab)];

  const previewVars: Record<string, string> = {
    "{valor}": "R$ 247,90",
    "{cliente_nome}": "Itamar Almeida",
    "{cliente_primeiro_nome}": "Itamar",
    "{metodo_pagamento}": activeTab === "pending" ? "PIX" : "Cartão de Crédito",
    "{loja}": activeStore?.name || "Atacadão das Gaiolas",
    "{pedido_id}": "#4829",
    "{produtos}": "1x Gaiola de Luxo Fibra",
  };

  let simulatedTitle = currentTitleTemplate;
  let simulatedBody = currentBodyTemplate;
  for (const [k, v] of Object.entries(previewVars)) {
    simulatedTitle = simulatedTitle.replace(new RegExp(k, "g"), v);
    simulatedBody = simulatedBody.replace(new RegExp(k, "g"), v);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Notificações Push
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                  iOS 16.4+ & Android
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                Receba alertas em tempo real no seu iPhone com som de venda e personalize todos os textos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSendTest}
            disabled={testing || connectedDevicesCount === 0}
            className="btn-secondary py-2 px-3 text-xs gap-1.5 cursor-pointer disabled:opacity-50"
            title="Dispara um push de teste imediato para o seu iPhone"
          >
            <Send size={14} className={testing ? "animate-spin" : "text-amber-400"} />
            <span>{testing ? "Disparando..." : "Testar no iPhone"}</span>
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn-primary py-2 px-4 text-xs gap-1.5 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
          >
            <Save size={14} />
            <span>{saving ? "Salvando..." : "Salvar Alterações"}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium animate-in fade-in slide-in-from-top-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* CARD 1: Status de Conexão do Aparelho (iPhone / Android / PC) */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Smartphone size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Status deste Dispositivo</h3>
                {isSubscribedOnThisDevice ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Conectado para Notificações
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
                    Não conectado neste aparelho
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {isSubscribedOnThisDevice
                  ? `Seu aparelho está autorizado. Você tem ${connectedDevicesCount} dispositivo(s) cadastrado(s) para receber notificações desta loja.`
                  : "Clique abaixo para autorizar este iPhone ou computador a apitar vendas em segundo plano."}
              </p>
            </div>
          </div>

          <div>
            {isSubscribedOnThisDevice ? (
              <button
                onClick={handleSendTest}
                disabled={testing}
                className="btn-secondary py-2 px-3 text-xs gap-1.5 cursor-pointer"
              >
                <Sparkles size={14} className="text-amber-400" />
                <span>Ouvir Som de Teste</span>
              </button>
            ) : (
              <button
                onClick={handleSubscribeDevice}
                disabled={subscribing}
                className="btn-primary py-2.5 px-4 text-xs gap-2 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-500/20"
              >
                <Bell size={15} />
                <span>{subscribing ? "Autorizando..." : "🔔 Ativar Notificações no iPhone"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARD 2: Gatilhos de Notificação (Quais eventos avisar) */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>Gatilhos de Eventos</span>
          <span className="text-xs font-normal text-zinc-400">(Escolha quando seu iPhone deve apitar)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Venda Aprovada */}
          <div
            onClick={() => setConfig((p) => ({ ...p, notify_approved: !p.notify_approved }))}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              config.notify_approved
                ? "bg-emerald-500/10 border-emerald-500/40 text-white"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className={config.notify_approved ? "text-emerald-400" : "text-zinc-500"} />
                <span className="text-xs font-bold">Vendas Aprovadas</span>
              </div>
              <input
                type="checkbox"
                checked={config.notify_approved}
                onChange={() => {}}
                className="rounded accent-emerald-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              PIX pago, cartão aprovado e boletos compensados.
            </p>
          </div>

          {/* Pedido Pendente */}
          <div
            onClick={() => setConfig((p) => ({ ...p, notify_pending: !p.notify_pending }))}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              config.notify_pending
                ? "bg-amber-500/10 border-amber-500/40 text-white"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className={config.notify_pending ? "text-amber-400" : "text-zinc-500"} />
                <span className="text-xs font-bold">Pedidos Pendentes</span>
              </div>
              <input
                type="checkbox"
                checked={config.notify_pending}
                onChange={() => {}}
                className="rounded accent-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              PIX gerado aguardando cópia e boletos impressos.
            </p>
          </div>

          {/* Checkout Abandonado */}
          <div
            onClick={() => setConfig((p) => ({ ...p, notify_abandoned: !p.notify_abandoned }))}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              config.notify_abandoned
                ? "bg-purple-500/10 border-purple-500/40 text-white"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className={config.notify_abandoned ? "text-purple-400" : "text-zinc-500"} />
                <span className="text-xs font-bold">Checkout / Lead</span>
              </div>
              <input
                type="checkbox"
                checked={config.notify_abandoned}
                onChange={() => {}}
                className="rounded accent-purple-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Cliente que iniciou o checkout mas não finalizou a compra.
            </p>
          </div>
        </div>
      </div>

      {/* CARD 3: Personalizador de Templates + Mockup do iPhone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor de Mensagem (7 colunas) */}
        <div className="lg:col-span-7 bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-blue-400" />
              <span>Personalizar Textos</span>
            </h3>

            {/* Abas dos tipos de evento */}
            <div className="flex items-center gap-1 bg-[#141824] p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setActiveTab("approved")}
                className={`text-[11px] px-2.5 py-1 rounded font-medium transition-all ${
                  activeTab === "approved" ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                Venda Aprovada
              </button>
              <button
                onClick={() => setActiveTab("pending")}
                className={`text-[11px] px-2.5 py-1 rounded font-medium transition-all ${
                  activeTab === "pending" ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                Pendente
              </button>
              <button
                onClick={() => setActiveTab("abandoned")}
                className={`text-[11px] px-2.5 py-1 rounded font-medium transition-all ${
                  activeTab === "abandoned" ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                Abandono
              </button>
            </div>
          </div>

          {/* Campo Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300">Título da Notificação</label>
            <input
              ref={titleInputRef}
              type="text"
              value={config[titleKeyForTab(activeTab)]}
              onFocus={() => setLastFocusedField("title")}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  [titleKeyForTab(activeTab)]: e.target.value,
                }))
              }
              className="input text-xs w-full font-mono bg-[#141824] border-zinc-800"
              placeholder="Ex: 💰 Venda Aprovada! ({loja})"
            />
          </div>

          {/* Campo Corpo / Mensagem */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300">Corpo da Notificação</label>
            <textarea
              ref={bodyInputRef}
              rows={3}
              value={config[bodyKeyForTab(activeTab)]}
              onFocus={() => setLastFocusedField("body")}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  [bodyKeyForTab(activeTab)]: e.target.value,
                }))
              }
              className="input text-xs w-full font-mono bg-[#141824] border-zinc-800 resize-none"
              placeholder="Ex: {cliente_nome} comprou {valor} via {metodo_pagamento}"
            />
          </div>

          {/* Variáveis Dinâmicas Disponíveis (Clique para inserir) */}
          <div className="space-y-2 pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Clique na variável para inserir no texto:
              </span>
              <span className="text-[10px] text-zinc-500">
                Campo selecionado: <strong className="text-blue-400">{lastFocusedField === "title" ? "Título" : "Mensagem"}</strong>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => insertTag(t.tag)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-[#181D2D] hover:bg-blue-600/30 border border-zinc-700/60 hover:border-blue-500/50 text-blue-300 font-mono transition-all flex items-center gap-1 cursor-pointer"
                  title={t.desc}
                >
                  <span>{t.tag}</span>
                  <span className="text-[9px] text-zinc-500 hidden sm:inline">({t.label})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mockup do iPhone: Prévia ao Vivo da Notificação (5 colunas) */}
        <div className="lg:col-span-5 bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone size={14} className="text-blue-400" />
            Prévia na Tela do seu iPhone
          </span>

          {/* Carcaça simulada do iPhone */}
          <div className="w-[280px] bg-gradient-to-b from-zinc-900 to-black rounded-[36px] p-3 border-4 border-zinc-700/60 shadow-2xl relative">
            {/* Ilha Dinâmica / Dynamic Island */}
            <div className="w-20 h-4 bg-black rounded-full mx-auto mb-4 border border-zinc-800/80 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-zinc-900 ml-auto mr-1.5"></div>
            </div>

            {/* Hora da tela bloqueada */}
            <div className="text-center text-zinc-300 font-light text-2xl tracking-tight mb-4">
              12:38
            </div>

            {/* Banner da Notificação iOS estilo Glassmorphism */}
            <div className="bg-zinc-800/85 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-3 shadow-2xl space-y-1.5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[8px] font-bold">
                    ⚡
                  </div>
                  <span className="text-[10px] font-bold text-zinc-200 uppercase tracking-tight">ATM PRO</span>
                </div>
                <span className="text-[9px] text-zinc-400">Agora</span>
              </div>

              <div className="text-xs font-bold text-white tracking-tight leading-snug">
                {simulatedTitle}
              </div>

              <div className="text-[11px] text-zinc-300 leading-tight">
                {simulatedBody}
              </div>
            </div>

            <div className="h-12 flex items-center justify-center">
              <div className="w-24 h-1 bg-zinc-600 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 4: Seletor de Sons & Feedback */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Volume2 size={18} className="text-amber-400" />
            <span>Som da Notificação de Venda</span>
          </h3>
          <span className="text-xs text-zinc-400">Toque em "Ouvir" para escutar cada som</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: "chaching", label: "Caixa Registradora", icon: "💰", desc: "Clássico som de venda aprovada" },
            { id: "coin", label: "Moedas Metálicas", icon: "🪙", desc: "Som de moedas caindo" },
            { id: "subtle", label: "Sino Suave", icon: "🔔", desc: "Alerta discreto e agradável" },
            { id: "silent", label: "Silencioso", icon: "🔕", desc: "Apenas vibração e banner" },
          ].map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setConfig((p) => ({ ...p, sound: s.id as any }));
                playNotificationSound(s.id);
              }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                config.sound === s.id
                  ? "bg-amber-500/15 border-amber-500/50 text-white shadow-lg shadow-amber-500/10"
                  : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xl">{s.icon}</span>
                  {config.sound === s.id && <Check size={16} className="text-amber-400" />}
                </div>
                <div className="text-xs font-bold">{s.label}</div>
                <div className="text-[10px] text-zinc-400 mt-1">{s.desc}</div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playNotificationSound(s.id);
                }}
                className="mt-3 py-1 px-2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-[10px] text-zinc-300 flex items-center justify-center gap-1 transition-colors"
              >
                <Play size={10} />
                <span>Ouvir som</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CARD 5: Filtros Avançados & Modo Não Perturbe */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Moon size={16} className="text-indigo-400" />
          <span>Filtros & Horários de Silêncio</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Valor mínimo */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-400" />
              <span>Notificar apenas vendas acima de:</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">R$</span>
              <input
                type="number"
                min="0"
                step="10"
                value={config.min_value}
                onChange={(e) => setConfig((p) => ({ ...p, min_value: Number(e.target.value) || 0 }))}
                className="input pl-9 text-xs w-full font-mono bg-[#141824] border-zinc-800"
                placeholder="0 = Notificar todas as vendas"
              />
            </div>
            <span className="text-[10px] text-zinc-500">Deixe R$ 0 para receber alertas de todos os valores.</span>
          </div>

          {/* Modo Não Perturbe */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Moon size={14} className="text-indigo-400" />
                <span>Modo Silencioso Noturno</span>
              </label>
              <input
                type="checkbox"
                checked={config.quiet_hours_enabled}
                onChange={(e) => setConfig((p) => ({ ...p, quiet_hours_enabled: e.target.checked }))}
                className="rounded accent-indigo-500 cursor-pointer"
              />
            </div>

            {config.quiet_hours_enabled && (
              <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                <div className="flex-1">
                  <span className="text-[10px] text-zinc-400 block mb-1">Início:</span>
                  <input
                    type="time"
                    value={config.quiet_hours_start}
                    onChange={(e) => setConfig((p) => ({ ...p, quiet_hours_start: e.target.value }))}
                    className="input text-xs w-full font-mono bg-[#141824] border-zinc-800 py-1"
                  />
                </div>
                <span className="text-zinc-600 text-xs pt-4">até</span>
                <div className="flex-1">
                  <span className="text-[10px] text-zinc-400 block mb-1">Fim:</span>
                  <input
                    type="time"
                    value={config.quiet_hours_end}
                    onChange={(e) => setConfig((p) => ({ ...p, quiet_hours_end: e.target.value }))}
                    className="input text-xs w-full font-mono bg-[#141824] border-zinc-800 py-1"
                  />
                </div>
              </div>
            )}
            <span className="text-[10px] text-zinc-500 block">
              Silencia as notificações durante a madrugada (Horário de Brasília).
            </span>
          </div>
        </div>
      </div>

      {/* Barra Inferior com Botão de Salvar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800/80">
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="btn-primary py-2.5 px-6 text-xs gap-2 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20"
        >
          <Save size={15} />
          <span>{saving ? "Salvando Alterações..." : "Salvar Configurações de Notificação"}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Utilitário para converter string VAPID Base64 em Uint8Array para o PushManager do navegador
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
