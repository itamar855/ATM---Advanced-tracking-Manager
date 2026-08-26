"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShoppingBag,
  X,
  FileCode,
  DollarSign
} from "lucide-react";
import { useState } from "react";

interface Event {
  id: string;
  orderId: string;
  eventName: string;
  source: "server" | "browser";
  status: "accepted" | "rejected" | "pending" | "deduped";
  healthScore: number;
  value: number;
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
}

interface EventTimelineProps {
  events: Event[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const purchaseCount = events.filter((e) => e.eventName === "Purchase").length;
  const checkoutCount = events.filter((e) => e.eventName === "InitiateCheckout").length;
  const cartCount = events.filter((e) => e.eventName === "AddToCart").length;
  const pageviewCount = events.filter((e) => e.eventName === "PageView").length;

  const filteredEvents = events.filter((ev) => {
    if (activeFilter === "all") return true;
    return ev.eventName.toLowerCase() === activeFilter.toLowerCase();
  });

  return (
    <div className="relative">
      <div className="glass-card">
        <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Eventos Recentes ({events.length || 500})
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Exibindo os últimos 500 eventos despachados para a Meta Conversions API (CAPI)
              </p>
            </div>

            {/* Filtros Rápidos */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg font-medium transition-all",
                  activeFilter === "all"
                    ? "bg-blue-500 text-white font-bold"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-subtle)]"
                )}
              >
                Todos ({events.length})
              </button>
              <button
                onClick={() => setActiveFilter("Purchase")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1",
                  activeFilter === "Purchase"
                    ? "bg-emerald-500 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    : "bg-[var(--color-bg-surface)] text-emerald-400 hover:bg-[var(--color-border-subtle)]"
                )}
              >
                💰 Compras ({purchaseCount})
              </button>
              <button
                onClick={() => setActiveFilter("InitiateCheckout")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1",
                  activeFilter === "InitiateCheckout"
                    ? "bg-amber-500 text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    : "bg-[var(--color-bg-surface)] text-amber-400 hover:bg-[var(--color-border-subtle)]"
                )}
              >
                🚀 Checkouts ({checkoutCount})
              </button>
              <button
                onClick={() => setActiveFilter("AddToCart")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg font-medium transition-all",
                  activeFilter === "AddToCart"
                    ? "bg-purple-500 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                    : "bg-[var(--color-bg-surface)] text-purple-400 hover:bg-[var(--color-border-subtle)]"
                )}
              >
                🛒 Carrinhos ({cartCount})
              </button>
              <button
                onClick={() => setActiveFilter("PageView")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg font-medium transition-all",
                  activeFilter === "PageView"
                    ? "bg-cyan-500 text-white font-bold"
                    : "bg-[var(--color-bg-surface)] text-cyan-400 hover:bg-[var(--color-border-subtle)]"
                )}
              >
                👁️ PageViews ({pageviewCount})
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)] max-h-[650px] overflow-y-auto pr-1">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => {
              const isPurchase = event.eventName === "Purchase";
              const isCheckout = event.eventName === "InitiateCheckout";
              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className={cn(
                    "px-5 py-3.5 hover:bg-[var(--color-bg-card-hover)] transition-colors cursor-pointer group",
                    isPurchase && "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-2 border-emerald-400",
                    isCheckout && "bg-amber-500/5 hover:bg-amber-500/10"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        isPurchase
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : isCheckout
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : event.status === "accepted"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      )}
                    >
                      <CheckCircle2 size={16} />
                    </div>

                    {/* Event Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-xs font-bold",
                            isPurchase
                              ? "text-emerald-400 text-sm"
                              : isCheckout
                              ? "text-amber-400"
                              : "text-[var(--color-text-primary)]"
                          )}
                        >
                          {isPurchase
                            ? "💰 Purchase (Venda Paga)"
                            : isCheckout
                            ? "🚀 InitiateCheckout"
                            : event.eventName}
                        </span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                            event.source === "server"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          )}
                        >
                          {event.source}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                          {event.orderId}
                        </span>
                      </div>

                      {/* Sinais em badges */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={cn("text-[9px] font-mono", event.signals.fbp ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •fbp
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.fbc ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •fbc
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.ip ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •IP
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.ua ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •UA
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.email ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •em
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.phone ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •ph
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.externalId ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •ext
                        </span>
                        <span className={cn("text-[9px] font-mono", event.signals.address ? "text-emerald-400 font-bold" : "text-zinc-600")}>
                          •addr
                        </span>
                      </div>
                    </div>

                    {/* Valor e Score */}
                    <div className="text-right shrink-0">
                      <div
                        className={cn(
                          "text-xs font-black",
                          isPurchase
                            ? "text-emerald-400 text-sm"
                            : isCheckout
                            ? "text-amber-400"
                            : "text-[var(--color-text-primary)]"
                        )}
                      >
                        {event.value > 0 ? `R$ ${event.value.toFixed(2)}` : "R$ 0,00"}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-bold">
                        {event.healthScore} <span className="text-[var(--color-text-muted)] font-normal">/ 100</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">
              Nenhum evento encontrado para este filtro.
            </div>
          )}
        </div>
      </div>

      {/* Modal Lateral de Detalhes do Evento */}
      {selectedEvent && (
        <div className="fixed inset-y-0 right-0 w-96 bg-[#0E0F14] border-l border-[var(--color-border-default)] shadow-2xl p-6 z-50 overflow-y-auto space-y-6 fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCode size={16} className="text-blue-400" />
              Detalhes do Evento
            </h3>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-800">
              <span className="text-zinc-400">Nome</span>
              <span className="font-bold text-white">{selectedEvent.eventName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800">
              <span className="text-zinc-400">Origem</span>
              <span className="font-bold text-blue-400">{selectedEvent.source}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800">
              <span className="text-zinc-400">Status</span>
              <span className="font-bold text-emerald-400">{selectedEvent.status}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800">
              <span className="text-zinc-400">Pedido ID</span>
              <span className="font-mono text-zinc-300">{selectedEvent.orderId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800">
              <span className="text-zinc-400">Valor</span>
              <span className="font-bold text-emerald-400">R$ {selectedEvent.value.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-300 block">Sinais Enviados à Meta (EMQ):</span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {Object.entries(selectedEvent.signals).map(([sig, active]) => (
                <div
                  key={sig}
                  className={cn(
                    "p-2 rounded border flex items-center justify-between",
                    active
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 font-bold"
                      : "bg-zinc-900 border-zinc-800 text-zinc-600"
                  )}
                >
                  <span className="capitalize">{sig}</span>
                  <span>{active ? "Disponível" : "Ausente"}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSelectedEvent(null)}
            className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
          >
            Fechar Painel
          </button>
        </div>
      )}
    </div>
  );
}
