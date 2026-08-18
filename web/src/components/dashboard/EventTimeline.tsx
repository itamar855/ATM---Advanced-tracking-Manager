"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShoppingBag,
} from "lucide-react";

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
  return (
    <div className="glass-card">
      <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Eventos Recentes
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Últimos eventos enviados à Meta
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
