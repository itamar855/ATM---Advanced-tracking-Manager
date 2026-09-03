"use client";

import { Bell, Search, Calendar, ChevronDown, Menu } from "lucide-react";
import { useState } from "react";

const dateRanges = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "Últimos 7 dias", value: "7d" },
  { label: "Últimos 14 dias", value: "14d" },
  { label: "Últimos 30 dias", value: "30d" },
  { label: "Este mês", value: "month" },
  { label: "Mês passado", value: "last_month" },
];

export default function Header() {
  const [dateRange, setDateRange] = useState("today");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const selectedRange = dateRanges.find((r) => r.value === dateRange);

  return (
    <header className="h-16 border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      {/* Left: Mobile Menu Trigger + Search */}
      <div className="flex items-center gap-2 md:gap-4 flex-1 max-w-md">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("atm:toggle-sidebar"))}
          aria-label="Abrir menu lateral"
          className="p-2 -ml-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 md:hidden flex items-center justify-center shrink-0"
        >
          <Menu size={20} />
        </button>
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar pedidos, campanhas..."
            className="input pl-9 py-2 text-sm bg-[var(--color-bg-primary)]/60"
          />
        </div>
      </div>

      {/* Right: Date Range + Notifications */}
      <div className="flex items-center gap-3">
        {/* Date Range Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="btn-secondary py-2 px-3 text-xs gap-2"
          >
            <Calendar size={14} className="text-[var(--color-brand-300)]" />
            <span>{selectedRange?.label}</span>
            <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg shadow-xl py-1 z-50 fade-in">
              {dateRanges.map((range) => (
                <button
                  key={range.value}
                  onClick={() => {
                    setDateRange(range.value);
                    setShowDatePicker(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    dateRange === range.value
                      ? "text-[var(--color-brand-300)] bg-[var(--color-brand-400)]/10"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-success-500)]/10 border border-[var(--color-success-500)]/20">
          <div className="w-2 h-2 rounded-full bg-[var(--color-success-400)] pulse-live" />
          <span className="text-[11px] font-medium text-[var(--color-success-400)]">
            Tracking Ativo
          </span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <Bell size={18} />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-danger-400)]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg shadow-xl z-50 fade-in">
              <div className="px-4 py-3 border-b border-[var(--color-border-default)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Notificações
                </h3>
              </div>
              <div className="py-2 max-h-80 overflow-y-auto">
                <NotificationItem
                  type="warning"
                  title="Health Score baixo"
                  message="3 eventos com score abaixo de 60 nas últimas 2h"
                  time="5min atrás"
                />
                <NotificationItem
                  type="success"
                  title="Purchase aceito"
                  message="Pedido #1234 rastreado com sucesso pela Meta"
                  time="12min atrás"
                />
                <NotificationItem
                  type="danger"
                  title="Possível emissor duplicado"
                  message="Razão Server/Browser de 4.2x detectada"
                  time="1h atrás"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotificationItem({
  type,
  title,
  message,
  time,
}: {
  type: "success" | "warning" | "danger";
  title: string;
  message: string;
  time: string;
}) {
  const dotColors = {
    success: "bg-[var(--color-success-400)]",
    warning: "bg-[var(--color-warning-400)]",
    danger: "bg-[var(--color-danger-400)]",
  };

  return (
    <div className="px-4 py-3 hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColors[type]}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{message}</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{time}</p>
        </div>
      </div>
    </div>
  );
}
