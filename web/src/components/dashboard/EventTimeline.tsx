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
  Network
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

  return (
    <div className="relative">
      <div className="glass-card">
        <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Eventos Recentes
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Últimos eventos enviados à Meta (clique em um evento para ver detalhes)
              </p>
            </div>
            <button className="btn-secondary py-1.5 px-3 text-xs">
              Ver todos
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => setSelectedEvent(event)}
              className="px-5 py-3.5 hover:bg-[var(--color-bg-card-hover)] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                {/* Status Icon */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    event.status === "accepted" &&
                      "bg-[var(--color-success-500)]/15",
                    event.status === "rejected" &&
                      "bg-[var(--color-danger-500)]/15",
                    event.status === "pending" &&
                      "bg-[var(--color-warning-500)]/15",
                    event.status === "deduped" &&
                      "bg-[var(--color-brand-400)]/15"
                  )}
                >
                  {event.status === "accepted" && (
                    <CheckCircle2 size={16} className="text-[var(--color-success-400)]" />
                  )}
                  {event.status === "rejected" && (
                    <XCircle size={16} className="text-[var(--color-danger-400)]" />
                  )}
                  {event.status === "pending" && (
                    <Clock size={16} className="text-[var(--color-warning-400)]" />
                  )}
                  {event.status === "deduped" && (
                    <ShoppingBag size={16} className="text-[var(--color-brand-300)]" />
                  )}
                </div>

                {/* Event Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {event.eventName}
                    </span>
                    <span
                      className={cn(
                        "badge text-[9px] px-1.5 py-0",
                        event.source === "server" ? "badge-info" : "badge-warning"
                      )}
                    >
                      {event.source === "server" ? "Server" : "Browser"}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {event.orderId}
                    </span>
                  </div>

                  {/* Signal Dots */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <SignalDot active={event.signals.fbp} label="fbp" />
                    <SignalDot active={event.signals.fbc} label="fbc" />
                    <SignalDot active={event.signals.ip} label="IP" />
                    <SignalDot active={event.signals.ua} label="UA" />
                    <SignalDot active={event.signals.email} label="em" />
                    <SignalDot active={event.signals.phone} label="ph" />
                    <SignalDot active={event.signals.externalId} label="ext" />
                    <SignalDot active={event.signals.address} label="addr" />
                  </div>
                </div>

                {/* Value & Score */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    R$ {event.value.toLocaleString("pt-BR")}
                  </p>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <span
                      className={cn(
                        "text-[11px] font-bold",
                        event.healthScore >= 85
                          ? "text-[var(--color-success-400)]"
                          : event.healthScore >= 60
                          ? "text-[var(--color-warning-400)]"
                          : "text-[var(--color-danger-400)]"
                      )}
                    >
                      {event.healthScore}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      / 100
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight
                  size={14}
                  className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over Modal para Detalhes do Evento (Sem background escuro completo e sem travar a navegação lateral) */}
      {selectedEvent && (
        <div className="fixed top-16 right-0 bottom-0 w-80 bg-[var(--color-bg-card)] border-l border-[var(--color-border-default)] z-40 flex flex-col justify-between shadow-xl animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-4 py-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <FileCode size={14} className="text-[var(--color-brand-300)]" />
                Detalhes do Evento
              </h3>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5 font-mono">
                ID: {selectedEvent.id}
              </p>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1 rounded hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Event Overview Card */}
            <div className="p-3 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-muted)]">Nome</span>
                <span className="font-bold text-[var(--color-text-primary)]">{selectedEvent.eventName}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-muted)]">Origem</span>
                <span className="badge badge-info text-[9px] px-1 py-0">{selectedEvent.source}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-muted)]">Status</span>
                <span className="badge badge-success text-[9px] px-1 py-0">{selectedEvent.status}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-muted)]">Pedido ID</span>
                <span className="font-semibold text-[var(--color-text-primary)] text-[10px] font-mono">{selectedEvent.orderId}</span>
              </div>
            </div>

            {/* Health Score */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Qualidade de Dados (EMQ)
              </h4>
              <div className="p-3 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-secondary)]">Score</span>
                <span className="text-base font-black text-emerald-400">{selectedEvent.healthScore} / 100</span>
              </div>
            </div>

            {/* Payload Signals */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1">
                <Network size={12} className="text-[var(--color-brand-300)]" />
                Sinais Enviados
              </h4>
              <div className="grid grid-cols-1 gap-1.5">
                <SignalInfoCard label="fbp (Browser ID)" active={selectedEvent.signals.fbp} />
                <SignalInfoCard label="fbc (Click ID)" active={selectedEvent.signals.fbc} />
                <SignalInfoCard label="Endereço IP" active={selectedEvent.signals.ip} />
                <SignalInfoCard label="User Agent" active={selectedEvent.signals.ua} />
                <SignalInfoCard label="E-mail Hasheado" active={selectedEvent.signals.email} />
                <SignalInfoCard label="Telefone Hasheado" active={selectedEvent.signals.phone} />
                <SignalInfoCard label="External ID Hasheado" active={selectedEvent.signals.externalId} />
                <SignalInfoCard label="Localidade / Endereço" active={selectedEvent.signals.address} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3.5 border-t border-[var(--color-border-default)]">
            <button
              onClick={() => setSelectedEvent(null)}
              className="btn-secondary w-full py-1.5 text-xs font-semibold"
            >
              Fechar Painel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium",
        active
          ? "bg-[var(--color-success-500)]/10 text-[var(--color-success-400)]"
          : "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]"
      )}
      title={`${label}: ${active ? "presente" : "ausente"}`}
    >
      <span
        className={cn(
          "w-1 h-1 rounded-full",
          active ? "bg-[var(--color-success-400)]" : "bg-[var(--color-text-muted)]"
        )}
      />
      {label}
    </div>
  );
}

function SignalInfoCard({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      "px-2.5 py-1.5 rounded border text-[10px] flex items-center justify-between",
      active
        ? "bg-[var(--color-success-500)]/5 border-[var(--color-success-500)]/15 text-[var(--color-success-400)]"
        : "bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)]"
    )}>
      <span className="font-medium">{label}</span>
      <span className="font-bold text-[9px]">
        {active ? "Disponível" : "Ausente"}
      </span>
    </div>
  );
}
