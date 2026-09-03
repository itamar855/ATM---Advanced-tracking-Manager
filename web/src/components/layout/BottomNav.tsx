"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Activity,
  ShoppingCart,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const pathname = usePathname();

  const handleOpenMenu = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("atm:toggle-sidebar"));
    }
  };

  const navTabs = [
    {
      label: "Resumo",
      href: "/dashboard",
      icon: LayoutDashboard,
      isActive: pathname === "/dashboard",
    },
    {
      label: "Campanhas",
      href: "/dashboard/campaigns",
      icon: BarChart3,
      isActive: pathname?.startsWith("/dashboard/campaigns"),
    },
    {
      label: "Eventos",
      href: "/dashboard/events",
      icon: Activity,
      isActive: pathname?.startsWith("/dashboard/events"),
    },
    {
      label: "Vendas",
      href: "/dashboard/orders",
      icon: ShoppingCart,
      isActive: pathname?.startsWith("/dashboard/orders"),
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0E14]/90 backdrop-blur-2xl border-t border-zinc-800/80 shadow-[0_-4px_24px_rgba(0,0,0,0.6)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0.5rem)" }}
      aria-label="Navegação inferior mobile"
    >
      <div className="flex items-center justify-around h-14 px-2 max-w-lg mx-auto">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-200 active:scale-90 select-none",
                tab.isActive ? "text-blue-400" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  size={20}
                  className={cn(
                    "transition-transform",
                    tab.isActive && "scale-110 stroke-[2.5]"
                  )}
                />
                {tab.isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_#38bdf8]" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] tracking-tight mt-1 font-medium",
                  tab.isActive ? "text-blue-400 font-bold" : "text-zinc-400"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* Botão de Menu (Abre Drawer com Configurações, Integrações, Notificações, etc.) */}
        <button
          type="button"
          onClick={handleOpenMenu}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-zinc-400 hover:text-zinc-200 active:scale-90 transition-all select-none cursor-pointer"
        >
          <div className="relative flex items-center justify-center">
            <Menu size={20} />
          </div>
          <span className="text-[10px] tracking-tight mt-1 font-medium text-zinc-400">
            Mais
          </span>
        </button>
      </div>
    </nav>
  );
}
