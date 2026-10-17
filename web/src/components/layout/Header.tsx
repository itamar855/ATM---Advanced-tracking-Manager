"use client";

import { Bell, Search, Menu } from "lucide-react";
import { useState } from "react";
import { useNotifications } from "@/contexts/NotificationContext";

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotifications();

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
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ff453a]" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#161618]/95 backdrop-blur-2xl border border-white/[0.09] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] z-50 fade-in overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white/80">Notificações</h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#2997ff]/20 text-[#2997ff]">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => void markAllAsRead()}
                    className="text-[10px] font-medium text-[#2997ff] hover:text-[#2997ff]/80 cursor-pointer transition-colors"
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>
              <div className="py-1 max-h-72 overflow-y-auto scrollbar-none">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-white/30">
                    Nenhuma notificação registrada ainda.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => void markAsRead(n.id)}
                      className={`px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer border-b border-white/[0.02] last:border-0 ${
                        !n.read ? "bg-white/[0.02]" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                            n.type === "approved" ? "bg-[#30d158]" : "bg-[#2997ff]"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12.5px] font-semibold text-white/80 truncate">
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2997ff] shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-white/40 mt-0.5 truncate">{n.body}</p>
                          <p className="text-[10px] text-white/20 mt-1">
                            {formatRelativeTime(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function formatRelativeTime(iso: string) {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "Agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
  } catch {
    return "";
  }
}
