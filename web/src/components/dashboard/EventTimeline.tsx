"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShoppingBag,
  X,
  FileCode,
  DollarSign,
  Search,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  ExternalLink,
  User,
  CreditCard,
  Layers,
  Globe
} from "lucide-react";

export interface EventItem {
  id: string;
  orderId: string;
  eventName: string;
  source: string;
  status: string;
  healthScore: number;
  value: number;
  fbtraceId?: string;
  paymentMethod?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  utms?: {
    source?: string | null;
    campaign?: string | null;
    medium?: string | null;
    content?: string | null;
    term?: string | null;
  };
  createdAt: string;
  signals: {
    fbp: boolean;
    fbc: boolean;
    ip: boolean;
    ua: boolean;
    email: boolean;
    phone: boolean;
    externalId: boolean;
    address: boolean;
  };
  rawMetaResponse?: any;
}

interface EventTimelineProps {
  events: EventItem[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedJson, setCopiedJson] = useState(false);

  const purchaseCount = events.filter((e) => e.eventName === "Purchase").length;
  const checkoutCount = events.filter((e) => e.eventName === "InitiateCheckout").length;
  const cartCount = events.filter((e) => e.eventName === "AddToCart").length;
  const pageviewCount = events.filter((e) => e.eventName === "PageView").length;

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Filtro por tipo de evento
      if (activeFilter !== "all" && ev.eventName.toLowerCase() !== activeFilter.toLowerCase()) {
        return false;
      }
      // Filtro por busca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOrder = ev.orderId?.toLowerCase().includes(q);
        const matchName = ev.customer?.name?.toLowerCase().includes(q);
        const matchEmail = ev.customer?.email?.toLowerCase().includes(q);
        const matchCampaign = ev.utms?.campaign?.toLowerCase().includes(q);
        const matchSource = ev.utms?.source?.toLowerCase().includes(q);
        const matchType = ev.eventName?.toLowerCase().includes(q);
        return matchOrder || matchName || matchEmail || matchCampaign || matchSource || matchType;
      }
      return true;
    });
  }, [events, activeFilter, searchQuery]);

  const handleCopyJson = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  return (
    <div className="relative font-sans space-y-4">
      {/* ── CARD PRINCIPAL DA TABELA ── */}
      <div className="rounded-3xl border border-zinc-800/80 bg-[#0C0F17] shadow-2xl overflow-hidden">
        {/* Header com Filtros & Busca */}
        <div className="p-5 border-b border-zinc-800/80 bg-[#0E121C]/80 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Fluxo de Eventos CAPI em Tempo Real
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-semibold">
                  {filteredEvents.length} listados
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Monitoramento First-Party com deduplicação e entrega via Meta Conversions API v23.0
              </p>
            </div>

            {/* Barra de Busca Rápida */}
            <div className="relative min-w-[260px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar pedido, cliente, UTM..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#141824] border border-zinc-800 text-xs text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Filtros Rápidos Estilo Apple Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { key: "all", label: "Todos", count: events.length, color: "bg-blue-600 text-white" },
              { key: "Purchase", label: "💰 Compras", count: purchaseCount, color: "bg-emerald-600 text-white" },
              { key: "InitiateCheckout", label: "🚀 Checkouts", count: checkoutCount, color: "bg-amber-600 text-white" },
              { key: "AddToCart", label: "🛒 Carrinhos", count: cartCount, color: "bg-purple-600 text-white" },
              { key: "PageView", label: "👁️ PageViews", count: pageviewCount, color: "bg-cyan-600 text-white" },
            ].map((f) => {
              const isActive = activeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? `${f.color} shadow-lg shadow-blue-500/20 scale-[1.02]`
                      : "bg-[#141824] text-zinc-400 hover:text-zinc-200 hover:bg-[#1A2030] border border-zinc-800"
                  }`}
                >
                  <span>{f.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? "bg-black/30 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de Eventos (High-Density Rows) */}
        <div className="divide-y divide-zinc-800/60 max-h-[680px] overflow-y-auto">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => {
              const isPurchase = event.eventName === "Purchase";
              const isCheckout = event.eventName === "InitiateCheckout";
              const isCart = event.eventName === "AddToCart";

              const timeFormatted = new Date(event.createdAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className={`p-4 hover:bg-[#131826] transition-colors cursor-pointer group flex items-center justify-between gap-4 ${
                    isPurchase ? "bg-emerald-950/10 hover:bg-emerald-950/20" : ""
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Ícone de Status do Evento */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isPurchase
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                          : isCheckout
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                          : isCart
                          ? "bg-purple-500/15 border-purple-500/30 text-purple-400"
                          : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                      }`}
                    >
                      <CheckCircle2 size={16} />
                    </div>

                    {/* Informações Principais */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-black tracking-tight ${
                            isPurchase
                              ? "text-emerald-400"
                              : isCheckout
                              ? "text-amber-400"
                              : isCart
                              ? "text-purple-400"
                              : "text-zinc-200"
                          }`}
                        >
                          {isPurchase
                            ? "Purchase (Venda Paga)"
                            : isCheckout
                            ? "InitiateCheckout"
                            : isCart
                            ? "AddToCart"
                            : "PageView"}
                        </span>

                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                            event.source === "server"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}
                        >
                          {event.source}
                        </span>

                        <span className="text-[11px] font-mono text-zinc-400">
                          {event.orderId}
                        </span>

                        {event.fbtraceId && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ Meta CAPI: {event.fbtraceId.slice(0, 10)}...
                          </span>
                        )}

                        <span className="text-[10px] text-zinc-500 font-mono">
                          {timeFormatted}
                        </span>
                      </div>

                      {/* Badges de Sinais PII */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { key: "fbp", label: "fbp", active: event.signals.fbp },
                          { key: "fbc", label: "fbc", active: event.signals.fbc },
                          { key: "ip", label: "IP", active: event.signals.ip },
                          { key: "ua", label: "UA", active: event.signals.ua },
                          { key: "email", label: "em", active: event.signals.email },
                          { key: "phone", label: "ph", active: event.signals.phone },
                          { key: "ext", label: "ext", active: event.signals.externalId },
                          { key: "addr", label: "addr", active: event.signals.address },
                        ].map((sig) => (
                          <span
                            key={sig.key}
                            className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              sig.active
                                ? "bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20"
                                : "text-zinc-600 bg-zinc-900 border border-zinc-800"
                            }`}
                          >
                            •{sig.label}
                          </span>
                        ))}
                        {event.customer?.name && (
                          <span className="text-[10px] text-zinc-400 font-medium ml-1 truncate max-w-[140px]">
                            👤 {event.customer.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Valor, Método de Pagamento e EMQ Score */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-xs font-black text-white font-mono">
                      {event.value > 0
                        ? `R$ ${event.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "R$ 0,00"}
                    </div>
                    {event.paymentMethod && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono uppercase inline-block">
                        {event.paymentMethod}
                      </span>
                    )}
                    <div className="text-[10px] text-emerald-400 font-bold font-mono">
                      {event.healthScore} <span className="text-zinc-500 font-normal">/ 100</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-xs text-zinc-500 space-y-2">
              <Layers size={28} className="mx-auto text-zinc-600" />
              <p className="font-semibold text-zinc-400">Nenhum evento encontrado para este filtro.</p>
              <p className="text-[11px]">Os eventos capturados pelo Pixel e Webhook aparecerão aqui automaticamente.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── DRAWER LATERAL DE INSPEÇÃO PROFUNDA (DEEP EVENT INSPECTOR) ── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-md bg-[#0F131E] border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto space-y-6 text-white animate-slide-left">
            {/* Header do Drawer */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FileCode size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Inspeção Profunda do Evento</h3>
                  <p className="text-[10px] text-zinc-400 font-mono">{selectedEvent.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Resumo do Evento */}
            <div className="space-y-2 rounded-2xl bg-[#141824] border border-zinc-800 p-4 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Nome do Evento:</span>
                <span className="font-bold text-white">{selectedEvent.eventName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Pedido ID:</span>
                <span className="font-mono text-blue-400 font-bold">{selectedEvent.orderId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Origem:</span>
                <span className="font-bold text-purple-400 uppercase">{selectedEvent.source}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Valor Transacionado:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  R$ {selectedEvent.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-400">EMQ Score Meta:</span>
                <span className="font-bold text-emerald-400 font-mono">{selectedEvent.healthScore} / 100</span>
              </div>
            </div>

            {/* Dados do Cliente (PII) */}
            {selectedEvent.customer && (
              <div className="space-y-3 rounded-2xl bg-[#141824] border border-zinc-800 p-4 text-xs">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <User size={13} className="text-blue-400" />
                  Dados do Cliente Higienizados (SHA-256)
                </h4>
                <div className="space-y-1.5 text-zinc-300">
                  <p><span className="text-zinc-500">Nome:</span> {selectedEvent.customer.name || "N/D"}</p>
                  <p><span className="text-zinc-500">Email:</span> {selectedEvent.customer.email || "N/D"}</p>
                  <p><span className="text-zinc-500">Telefone:</span> {selectedEvent.customer.phone || "N/D"}</p>
                </div>
              </div>
            )}

            {/* Atribuição UTMs & Tráfego */}
            {selectedEvent.utms && (
              <div className="space-y-3 rounded-2xl bg-[#141824] border border-zinc-800 p-4 text-xs">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Globe size={13} className="text-emerald-400" />
                  Parâmetros de Atribuição UTM
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono text-zinc-300 break-all">
                  <p><span className="text-zinc-500">utm_source:</span> {selectedEvent.utms.source || "N/D"}</p>
                  <p><span className="text-zinc-500">utm_campaign:</span> {selectedEvent.utms.campaign || "N/D"}</p>
                  <p><span className="text-zinc-500">utm_medium:</span> {selectedEvent.utms.medium || "N/D"}</p>
                  <p><span className="text-zinc-500">utm_content:</span> {selectedEvent.utms.content || "N/D"}</p>
                </div>
              </div>
            )}

            {/* Sinais Meta CAPI Ativos */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                Matriz de Sinais Meta CAPI (8/8):
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {Object.entries(selectedEvent.signals).map(([sig, active]) => (
                  <div
                    key={sig}
                    className={`p-2.5 rounded-xl border flex items-center justify-between ${
                      active
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold"
                        : "bg-[#141824] border-zinc-800 text-zinc-600"
                    }`}
                  >
                    <span className="capitalize">{sig}</span>
                    <span>{active ? "✓ Ativo" : "✕ Ausente"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Visualizador de JSON Bruto */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Payload Bruto Meta CAPI</span>
                <button
                  type="button"
                  onClick={() => handleCopyJson(selectedEvent.rawMetaResponse || selectedEvent)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  {copiedJson ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedJson ? "Copiado!" : "Copiar JSON"}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-[#080A0F] border border-zinc-800 text-zinc-300 font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto select-all">
                {JSON.stringify(selectedEvent.rawMetaResponse || selectedEvent, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
