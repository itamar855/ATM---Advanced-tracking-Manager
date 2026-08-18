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
  Settings,
  Store,
  Plug,
  DollarSign,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Zap,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const mainNav: NavItem[] = [
  { label: "Visão Geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campanhas", href: "/dashboard/campaigns", icon: BarChart3 },
  { label: "Pedidos", href: "/dashboard/orders", icon: ShoppingCart },
  { label: "Eventos", href: "/dashboard/events", icon: Activity },
];

const trackingNav: NavItem[] = [
  { label: "Health Score", href: "/dashboard/health", icon: HeartPulse },
  { label: "Diagnósticos", href: "/dashboard/diagnostics", icon: AlertTriangle, badge: "3" },
];

const settingsNav: NavItem[] = [
  { label: "Loja", href: "/dashboard/settings/store", icon: Store },
  { label: "Integrações", href: "/dashboard/settings/integrations", icon: Plug },
  { label: "Custos", href: "/dashboard/settings/costs", icon: DollarSign },
  { label: "Plano", href: "/dashboard/settings/billing", icon: CreditCard },
];

function NavSection({
  title,
  items,
  collapsed,
  pathname,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div className="mb-6">
      {!collapsed && (
        <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {title}
        </p>
      )}
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "nav-item relative group",
                isActive && "nav-item-active"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={cn(
                  "shrink-0 transition-colors",
                  isActive
                    ? "text-[var(--color-brand-300)]"
                    : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
                )}
              />
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto badge badge-warning text-[10px] px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen flex flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] z-40 transition-all duration-300",
        collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--color-border-default)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-accent-400)] flex items-center justify-center shadow-lg">
            <Zap size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-gradient">
                ATM
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider leading-none">
                Tracking Manager
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <NavSection title="Principal" items={mainNav} collapsed={collapsed} pathname={pathname} />
        <NavSection title="Tracking" items={trackingNav} collapsed={collapsed} pathname={pathname} />
        <NavSection title="Configurações" items={settingsNav} collapsed={collapsed} pathname={pathname} />
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--color-border-default)] p-3">
        <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "")}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-500)] flex items-center justify-center text-xs font-bold text-white shrink-0">
            U
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                Usuário
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                Plano Free
              </p>
            </div>
          )}
          {!collapsed && (
            <button className="p-1.5 rounded-md hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-danger-400)] transition-colors">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
