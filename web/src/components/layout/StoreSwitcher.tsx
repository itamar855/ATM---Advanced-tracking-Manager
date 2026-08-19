"use client";

import { useState } from "react";
import { Store, ChevronDown, Plus, Check, Loader2 } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { cn } from "@/lib/utils";

export function StoreSwitcher() {
  const { stores, activeStore, setActiveStore, loading } = useStore();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] text-xs text-[var(--color-text-muted)]">
        <Loader2 size={13} className="animate-spin" />
        <span>Carregando...</span>
      </div>
    );
  }

  if (!activeStore) return null;

  const initials = activeStore.name?.substring(0, 2).toUpperCase() || "ST";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-border-accent)] transition-all text-xs font-medium text-[var(--color-text-primary)] max-w-[200px]"
      >
        {/* Store Avatar */}
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-500)] flex items-center justify-center text-[8px] font-bold text-white shrink-0">
          {initials}
        </div>
        <span className="truncate">{activeStore.name || activeStore.shopify_domain || "Minha Loja"}</span>
        <ChevronDown size={12} className={cn("text-[var(--color-text-muted)] transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-xl shadow-xl z-50 py-1.5 fade-in">
          {/* Header */}
          <div className="px-3 pb-1.5 border-b border-[var(--color-border-subtle)]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Lojas Conectadas</p>
          </div>

          {/* Store List */}
          <div className="py-1 max-h-56 overflow-y-auto">
            {stores.map((store) => {
              const isActive = activeStore.id === store.id;
              const storeInitials = store.name?.substring(0, 2).toUpperCase() || "ST";

              return (
                <button
                  key={store.id}
                  onClick={() => { setActiveStore(store); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)] rounded-lg mx-0.5",
                    isActive && "bg-[var(--color-brand-400)]/10"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                    isActive
                      ? "bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-accent-500)]"
                      : "bg-[var(--color-bg-elevated)]"
                  )}>
                    {storeInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-medium truncate", isActive ? "text-[var(--color-brand-300)]" : "text-[var(--color-text-primary)]")}>
                      {store.name || "Sem nome"}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                      {store.shopify_domain || store.platform || "Loja"}
                    </p>
                  </div>
                  {isActive && <Check size={13} className="text-[var(--color-brand-300)] shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Add New Store */}
          <div className="border-t border-[var(--color-border-subtle)] pt-1 px-1.5">
            <a
              href="/dashboard/settings/store"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand-300)] hover:bg-[var(--color-brand-400)]/10 rounded-lg transition-colors"
            >
              <Plus size={13} />
              <span>Adicionar nova loja</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
