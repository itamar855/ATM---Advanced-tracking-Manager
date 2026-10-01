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
  Bell,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  color?: string;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    section: "Principal",
    items: [
      { label: "Resumo", href: "/dashboard", icon: LayoutDashboard },
      { label: "Campanhas", href: "/dashboard/campaigns", icon: BarChart3 },
      { label: "Eventos CAPI", href: "/dashboard/events", icon: Activity },
      { label: "Pedidos & Vendas", href: "/dashboard/orders", icon: ShoppingCart },
    ],
  },
  {
    section: "Saúde",
    items: [
      { label: "Health Score", href: "/dashboard/health", icon: HeartPulse },
      { label: "Diagnósticos", href: "/dashboard/diagnostics", icon: AlertTriangle },
    ],
  },
  {
    section: "Configurações",
    items: [
      { label: "Loja", href: "/dashboard/settings/store", icon: Store },
      { label: "Integrações", href: "/dashboard/settings/integrations", icon: Plug },
      { label: "Notificações", href: "/dashboard/settings/notifications", icon: Bell },
      { label: "Custos & Taxas", href: "/dashboard/settings/costs", icon: DollarSign },
      { label: "Assinatura", href: "/dashboard/settings/billing", icon: CreditCard },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { stores, activeStore, setActiveStore } = useStore();
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);

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
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen flex flex-col z-50 transition-all duration-300 select-none",
          "border-r border-white/[0.06] bg-[#0e0e10]/95 backdrop-blur-2xl",
          collapsed ? "md:w-[68px]" : "md:w-[232px]",
          mobileOpen
            ? "translate-x-0 w-[232px] shadow-[0_0_60px_rgba(0,0,0,0.8)]"
            : "-translate-x-full md:translate-x-0 w-[232px]"
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* ── Logo ── */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.05]">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2997ff] to-[#0071e3] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap size={14} className="text-white" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex flex-col gap-0">
                <span className="text-[13px] font-semibold tracking-tight text-white leading-none">
                  ATM
                </span>
                <span className="text-[9px] text-white/30 uppercase tracking-widest leading-none mt-0.5">
                  Tracking
                </span>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.06] md:hidden transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors hidden md:flex"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

        {/* ── Store Switcher ── */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1 relative">
            <button
              onClick={() => setStoreMenuOpen(!storeMenuOpen)}
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-white/[0.07] hover:border-white/[0.11] transition-all"
            >
              <div className="flex items-center gap-2 truncate">
                <FolderTree size={13} className="text-[#2997ff] shrink-0" />
                <span className="font-medium truncate text-[11.5px] text-white/80">
                  {activeStore
                    ? activeStore.name || activeStore.shop_domain || "Minha Loja"
                    : "Lojas"}
                </span>
              </div>
              <ChevronDown
                size={11}
                className={cn(
                  "text-white/25 shrink-0 transition-transform",
                  storeMenuOpen && "rotate-180"
                )}
              />
            </button>

            {storeMenuOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-[#161618] border border-white/[0.09] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50 py-1.5 overflow-hidden">
                <div className="px-3 pb-1.5 pt-1 border-b border-white/[0.06]">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-white/25">
                    Dashboards
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto pt-1">
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => {
                        setActiveStore(store);
                        setStoreMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.04] mx-1 rounded-lg",
                        activeStore?.id === store.id
                          ? "bg-[#2997ff]/10"
                          : ""
                      )}
                      style={{ width: "calc(100% - 8px)" }}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold shrink-0 text-white",
                          activeStore?.id === store.id
                            ? "bg-[#2997ff]"
                            : "bg-white/[0.08]"
                        )}
                      >
                        {store.name?.substring(0, 2).toUpperCase() || "ST"}
                      </div>
                      <span
                        className={cn(
                          "text-[11.5px] truncate font-medium",
                          activeStore?.id === store.id
                            ? "text-[#2997ff]"
                            : "text-white/60"
                        )}
                      >
                        {store.name || store.shop_domain}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/[0.06] mt-1 p-1">
                  <Link
                    href="/dashboard/settings/store?new=true"
                    onClick={() => setStoreMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-white/40 hover:text-[#2997ff] hover:bg-[#2997ff]/[0.08] rounded-lg transition-colors"
                  >
                    <Plus size={12} className="shrink-0" />
                    <span className="font-medium">Adicionar loja</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-none">
          {navigation.map((group) => (
            <div key={group.section}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/20">
                  {group.section}
                </p>
              )}
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-[7px] rounded-[10px] text-[12.5px] font-medium transition-all",
                        isActive
                          ? "bg-[#2997ff]/[0.15] text-[#2997ff]"
                          : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                      )}
                    >
                      <Icon
                        size={15}
                        className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-[#2997ff]" : "text-white/30"
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* ── User / Logout ── */}
        <div className="p-3 border-t border-white/[0.05]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2997ff] to-[#30d158] flex items-center justify-center font-bold text-white text-[9px] shrink-0">
                IT
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[11.5px] font-semibold text-white/80 truncate">
                    Itamar Almeida
                  </span>
                  <span className="text-[9px] text-[#30d158] flex items-center gap-1 leading-none mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" />
                    PRO Ativo
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-white/20 hover:text-[#ff453a] hover:bg-[#ff453a]/[0.08] transition-colors shrink-0"
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
