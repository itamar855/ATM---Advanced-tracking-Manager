"use client";

import { Bell, Search, Menu } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header
      className="min-h-14 border-b border-white/[0.05] bg-[#0a0a0b]/80 backdrop-blur-2xl flex items-center justify-between px-4 md:px-5 sticky top-0 z-30 transition-all"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 0px)",
        minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
      }}
    >
      {/* Left: mobile menu + search */}
      <div className="flex items-center gap-2 flex-1 max-w-sm">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("atm:toggle-sidebar"))}
          aria-label="Abrir menu"
          className="p-1.5 -ml-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] md:hidden transition-colors"
        >
          <Menu size={18} />
        </button>

        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
          />
          <input
            type="text"
            placeholder="Buscar pedidos, campanhas..."
            className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.07] rounded-xl text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 focus:bg-white/[0.06] transition-all"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#30d158]/[0.08] border border-[#30d158]/[0.15]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] pulse-live" />
          <span className="text-[11px] font-medium text-[#30d158]">
            Tracking Ativo
          </span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl hover:bg-white/[0.06] text-white/30 hover:text-white/70 transition-colors"
          >
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#ff453a]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#161618]/95 backdrop-blur-2xl border border-white/[0.09] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] z-50 fade-in overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/80">Notificações</h3>
                <span className="text-[10px] font-medium text-[#2997ff] cursor-pointer">
                  Marcar como lidas
                </span>
              </div>
              <div className="py-1 max-h-72 overflow-y-auto scrollbar-none">
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
  const colors = {
    success: "bg-[#30d158]",
    warning: "bg-[#ff9f0a]",
    danger:  "bg-[#ff453a]",
  };

  return (
    <div className="px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${colors[type]}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-white/80">{title}</p>
          <p className="text-[11px] text-white/30 mt-0.5 truncate">{message}</p>
          <p className="text-[10px] text-white/20 mt-1">{time}</p>
        </div>
      </div>
    </div>
  );
}
