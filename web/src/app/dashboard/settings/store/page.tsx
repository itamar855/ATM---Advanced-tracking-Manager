"use client";

import { useState, useEffect } from "react";
import { Store, Globe, Key, ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function StoreSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [checkoutDomain, setCheckoutDomain] = useState("");
  const [customDomains, setCustomDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    async function loadStore() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("*").limit(1).maybeSingle();
        if (store) {
          setDomain(store.shop_domain || "");
          setCheckoutDomain(store.checkout_domain || "");
          setCustomDomains(store.custom_domains || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStore();
  }, []);

  const handleAddDomain = () => {
    if (!newDomain) return;
    setCustomDomains([...customDomains, newDomain]);
    setNewDomain("");
  };

  const handleSave = async () => {
    alert("Configurações salvas!");
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Configurações da Loja
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gerencie domínios customizados (CNAME) e conectores de checkout
        </p>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Store size={20} className="text-[var(--color-brand-300)]" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Domínio Shopify</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Domínio da Loja (.myshopify.com)
            </label>
            <input
              type="text"
              value={domain}
              className="input opacity-80"
              disabled
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Domínio Customizado de Checkout
            </label>
            <input
              type="text"
              value={checkoutDomain}
              onChange={(e) => setCheckoutDomain(e.target.value)}
              placeholder="Ex: checkout.sualoja.com"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* CNAME configuration for Cookie Bridge (Stape equivalent) */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-[var(--color-brand-300)]" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Mapeamento de CNAME (1st Party Cookies)</h3>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Para prolongar a vida útil de cookies no iOS (contornando o bloqueio ITP do Safari), crie um registro <b>CNAME</b> na sua hospedagem de domínio apontando para a nossa API e insira o domínio abaixo.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="Ex: tracking.sualoja.com"
            className="input"
          />
          <button onClick={handleAddDomain} className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold">
            Adicionar Domínio
          </button>
        </div>

        {customDomains.length > 0 && (
          <div className="space-y-2 pt-2">
            {customDomains.map((d) => (
              <div key={d} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] text-xs">
                <span className="font-semibold text-[var(--color-text-primary)]">{d}</span>
                <span className="badge badge-success text-[10px]">Ativo</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleSave} className="btn-primary w-full py-2.5 text-xs font-semibold">
        Salvar Alterações
      </button>
    </div>
  );
}
