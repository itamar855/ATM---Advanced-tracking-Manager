"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Activity,
  HeartPulse,
  AlertTriangle,
  Store,
  Plug,
  DollarSign,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  LogOut,
  FolderTree,
  Tag,
  Sliders,
  FileText,
  Bell,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  color?: string;
}

const dashboardItems: NavItem[] = [
  { label: "Resumo", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campanhas", href: "/dashboard/campaigns", icon: BarChart3, color: "text-blue-400" },
  { label: "Eventos CAPI", href: "/dashboard/events", icon: Activity, color: "text-emerald-400" },
  { label: "Pedidos & Vendas", href: "/dashboard/orders", icon: ShoppingCart },
  { label: "Configurações da Loja", href: "/dashboard/settings/store", icon: Store },
  { label: "Integrações", href: "/dashboard/settings/integrations", icon: Plug },
  { label: "Custos & Taxas", href: "/dashboard/settings/costs", icon: DollarSign },
  { label: "Health Score", href: "/dashboard/health", icon: HeartPulse },
  { label: "Diagnósticos", href: "/dashboard/diagnostics", icon: AlertTriangle },
  { label: "Plano & Assinatura", href: "/dashboard/settings/billing", icon: CreditCard },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { stores, activeStore, setActiveStore } = useStore();
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);

  // Listener para evento customizado de toggle mobile vindo do Header
  useEffect(() => {
    const handleToggle = () => setMobileOpen((prev) => !prev);
    const handleClose = () => setMobileOpen(false);
    window.addEventListener("atm:toggle-sidebar", handleToggle);
    window.addEventListener("atm:close-sidebar", handleClose);
    return () => {
      window.removeEventListener("atm:toggle-sidebar", handleToggle);
      window.removeEventListener("atm:close-sidebar", handleClose);
    };
  }, []);

  // Fecha o drawer mobile automaticamente ao trocar de rota
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <>
      {/* Backdrop semi-transparente para mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen flex flex-col border-r border-[#1E2330] bg-[#0E1118] z-50 transition-all duration-300 select-none",
          // Desktop: recolhível (68px / 240px)
          collapsed ? "md:w-[68px]" : "md:w-[240px]",
          // Mobile: gaveta deslizante (260px)
          mobileOpen ? "translate-x-0 w-[260px] shadow-2xl" : "-translate-x-full md:translate-x-0 w-[240px]"
        )}
      >
        {/* Logo ATM Tracking */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-[#1E2330]">
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap size={16} className="text-white" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight text-white flex items-center gap-1">
                  ATM <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono">PRO</span>
                </span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider leading-none">
                  Tracking Manager
                </span>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1">
            {/* Botão de fechar (Aparece no Mobile) */}
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 md:hidden transition-colors"
              aria-label="Fechar menu"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Botão recolher (Aparece no Desktop) */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors hidden md:block"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

      {/* Seletor de Lojas / Dashboards */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 relative">
          <button 
            onClick={() => setStoreMenuOpen(!storeMenuOpen)}
            className="w-full bg-[#141824] border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs text-zinc-300 cursor-pointer hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center gap-2 truncate">
              <FolderTree size={14} className="text-blue-400 shrink-0" />
              <span className="font-bold truncate text-[11px] text-white">
                {activeStore ? (activeStore.name || activeStore.shop_domain || "Minha Loja") : "Lojas"}
              </span>
            </div>
            <ChevronDown size={12} className={cn("text-zinc-500 shrink-0 transition-transform", storeMenuOpen && "rotate-180")} />
          </button>

          {/* Store Dropdown */}
          {storeMenuOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-[#161B26] border border-zinc-800/80 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
              <div className="px-3 pb-1.5 pt-1 border-b border-zinc-800/80">
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Dashboards (Lojas)</p>
              </div>
              <div className="max-h-48 overflow-y-auto pt-1">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => { setActiveStore(store); setStoreMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-zinc-800/50 mx-1 w-[calc(100%-8px)] rounded-lg",
                      activeStore?.id === store.id && "bg-blue-500/10"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold shrink-0 text-white",
                      activeStore?.id === store.id ? "bg-blue-600" : "bg-zinc-800"
                    )}>
                      {store.name?.substring(0, 2).toUpperCase() || "ST"}
                    </div>
                    <span className={cn(
                      "text-xs truncate font-medium",
                      activeStore?.id === store.id ? "text-blue-400" : "text-zinc-300"
                    )}>
                      {store.name || store.shop_domain}
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-zinc-800/80 mt-1 p-1">
                <Link
                  href="/dashboard/settings/store?new=true"
                  onClick={() => setStoreMenuOpen(false)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="font-medium">Adicionar nova loja</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navegação Principal */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {!collapsed && (
          <p className="px-3 mb-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Menu de Navegação
          </p>
        )}
        <nav className="space-y-0.5">
          {dashboardItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group",
                  isActive
                    ? "bg-blue-600 text-white font-bold shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-[#161B26]"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-white"
                      : item.color || "text-zinc-400 group-hover:text-zinc-200"
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Perfil & Status do Usuário + Logout */}
      <div className="p-3 border-t border-[#1E2330]">
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#141824] border border-zinc-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center font-bold text-white text-[10px] shrink-0">
              IT
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] font-bold text-white truncate">Itamar Almeida</span>
                <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-medium leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Plano PRO Ativo
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            title="Sair da Conta (Logout)"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
