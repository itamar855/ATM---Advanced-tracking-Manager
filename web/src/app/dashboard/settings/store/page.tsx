"use client";

import { useState, useEffect } from "react";
import { Store, Globe, Loader2, X, CheckCircle2, Plus, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export default function StoreSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [domain, setDomain] = useState("");
  const [checkoutDomain, setCheckoutDomain] = useState("");
  const [customDomains, setCustomDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { activeStore, reload, setActiveStore } = useStore();

  useEffect(() => {
    async function loadStore() {
      setLoading(true);
      
      const isNew = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get("new") === "true" : false;
      
      if (isNew) {
        setStoreId(null);
        setStoreName("");
        setDomain("");
        setCheckoutDomain("");
        setCustomDomains([]);
        setLoading(false);
        return;
      }
      
      if (!activeStore) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: store } = await supabase
          .from("stores")
          .select("*")
          .eq("id", activeStore.id)
          .single();

        if (store) {
          setStoreId(store.id);
          setStoreName(store.name || "");
          setDomain(store.shopify_domain || store.shop_domain || "");
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
  }, [activeStore]);

  const handleAddDomain = () => {
    const trimmed = newDomain.trim();
    if (!trimmed) return;
    if (customDomains.includes(trimmed)) {
      setErrorMsg("Este domínio já está na lista.");
      return;
    }
    setCustomDomains([...customDomains, trimmed]);
    setNewDomain("");
    setErrorMsg("");
  };

  const handleRemoveDomain = (d: string) => {
    setCustomDomains(customDomains.filter((x) => x !== d));
  };

  const handleSave = async () => {
    if (!domain) {
      setErrorMsg("Informe o domínio da loja (.myshopify.com).");
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErrorMsg("Você precisa estar logado para salvar.");
        setSaving(false);
        return;
      }

      // Garante que o registro de tenant existe (para usuários criados antes do trigger)
      await supabase.from("tenants").upsert({
        id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuário",
        email: user.email!,
      }, { onConflict: "id", ignoreDuplicates: true });

      if (storeId) {
        // Atualiza a loja existente
        const { error } = await supabase
          .from("stores")
          .update({
            name: storeName || domain,
            shop_domain: domain,
            checkout_domain: checkoutDomain || null,
            custom_domains: customDomains,
          })
          .eq("id", storeId);

        if (error) throw error;
      } else {
        // Cria nova loja para este tenant
        const { data: newStore, error } = await supabase
          .from("stores")
          .insert({
            id: crypto.randomUUID(),
            tenant_id: user.id,
            name: storeName || domain,
            shop_domain: domain,
            checkout_domain: checkoutDomain || null,
            custom_domains: customDomains,
          })
          .select()
          .single();

        if (error) throw error;
        if (newStore) {
          setStoreId(newStore.id);
          setActiveStore(newStore);
          
          // Remove ?new=true from url without reloading the page
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('new');
            window.history.replaceState({}, '', url);
          }
        }
      }

      reload(); // Atualiza o cache global de lojas para destravar a sidebar e layout
      setSuccessMsg("Configurações salvas com sucesso!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
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
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Configurações da Loja
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Configure domínios, CNAME para 1st-party cookies e conectores de checkout
        </p>
      </div>

      {/* Feedback Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
          <CheckCircle2 size={14} />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle size={14} />
          {errorMsg}
        </div>
      )}

      {/* Seção 1: Info da Loja */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Store size={20} className="text-[var(--color-brand-300)]" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Dados da Loja</h3>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            Nome da Loja
          </label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Ex: Minha Loja Principal"
            className="input"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Domínio da Loja (.myshopify.com) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Ex: minhaloja.myshopify.com"
              className="input"
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

      {/* Seção 2: CNAME / Custom Domains */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-[var(--color-brand-300)]" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Mapeamento de CNAME (1st Party Cookies)
          </h3>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Para prolongar a vida útil de cookies no iOS (contornando o bloqueio ITP do Safari), crie um registro{" "}
          <b>CNAME</b> na sua hospedagem de domínio apontando para{" "}
          <code className="text-[var(--color-brand-300)] font-mono bg-[var(--color-bg-elevated)] px-1 rounded">
            api.atmtracking.app
          </code>{" "}
          e cadastre o subdomínio abaixo.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            placeholder="Ex: tracking.sualoja.com"
            className="input"
          />
          <button
            onClick={handleAddDomain}
            className="btn-primary shrink-0 py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus size={13} />
            Adicionar
          </button>
        </div>

        {/* Lista de domínios cadastrados */}
        {customDomains.length > 0 && (
          <div className="space-y-2 pt-1">
            {customDomains.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success-400)]" />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">{d}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-success text-[10px]">Cadastrado</span>
                  <button
                    onClick={() => handleRemoveDomain(d)}
                    className="p-1 rounded hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botão Salvar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar Alterações"
        )}
      </button>
    </div>
  );
}
