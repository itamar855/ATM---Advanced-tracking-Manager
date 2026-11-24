"use client";

import { useState, useEffect } from "react";
import { Store, Globe, Loader2, X, CheckCircle2, Plus, AlertTriangle, ShoppingBag, GraduationCap, AppWindow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_INFO,
  isMissingProjectTypeColumn,
  normalizeDomain,
  projectTypeOf,
  type ProjectType,
} from "@/lib/projects/types";

const TYPE_ICONS: Record<ProjectType, React.ElementType> = {
  ecommerce: ShoppingBag,
  infoproduct: GraduationCap,
  app: AppWindow,
};

function errorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Esse domínio já está cadastrado em outro projeto.";
  return e?.message || "erro desconhecido";
}

export default function StoreSettingsPage() {
  const searchParams = useSearchParams();
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
  const [projectType, setProjectType] = useState<ProjectType>("ecommerce");
  const [platform, setPlatform] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState("");
  const info = PROJECT_TYPE_INFO[projectType];
  const { activeStore, reload, setActiveStore } = useStore();

  useEffect(() => {
    async function loadStore() {
      setLoading(true);
      
      const isNew = searchParams.get("new") === "true";
      
      if (isNew) {
        setStoreId(null);
        setStoreName("");
        setDomain("");
        setCheckoutDomain("");
        setCustomDomains([]);
        setPlatform(null);
        const typeParam = searchParams.get("type");
        setProjectType(PROJECT_TYPES.includes(typeParam as ProjectType) ? (typeParam as ProjectType) : "ecommerce");
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
          setProjectType(projectTypeOf(store));
          setPlatform(store.platform || null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStore();
  }, [activeStore, searchParams]);

  const handleAddDomain = () => {
    if (!newDomain.trim()) return;
    const trimmed = normalizeDomain(newDomain);
    if (!trimmed) {
      setErrorMsg("Domínio inválido. Use só o endereço, por exemplo tracking.seusite.com.");
      return;
    }
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
    const cleanDomain = normalizeDomain(domain);
    if (!domain.trim()) {
      setErrorMsg(`Informe o ${info.domainLabel.toLowerCase()}.`);
      return;
    }
    if (!cleanDomain) {
      setErrorMsg(`Domínio inválido. Use só o endereço, por exemplo ${info.domainPlaceholder}.`);
      return;
    }
    const cleanCheckout = checkoutDomain.trim() ? normalizeDomain(checkoutDomain) : "";
    if (checkoutDomain.trim() && !cleanCheckout) {
      setErrorMsg("Domínio de checkout inválido. Use só o endereço, por exemplo checkout.seusite.com.");
      return;
    }
    setDomain(cleanDomain);
    setCheckoutDomain(cleanCheckout);

    // Plataforma: projeto sem loja vira 'custom'; voltar para loja tira o 'custom'.
    const nextPlatform =
      projectType === "ecommerce" ? (platform && platform !== "custom" ? platform : "shopify") : "custom";

    setSaving(true);
    setErrorMsg("");
    setWarningMsg("");
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

      const base = {
        name: storeName.trim() || cleanDomain,
        shop_domain: cleanDomain,
        checkout_domain: cleanCheckout || null,
        custom_domains: customDomains,
      };
      const typed = { ...base, project_type: projectType, platform: nextPlatform };
      // Sem a migration 030, o banco não conhece project_type nem a plataforma 'custom': salva o resto.
      let typeSaved = true;

      if (storeId) {
        // Atualiza o projeto existente
        let { error } = await supabase.from("stores").update(typed).eq("id", storeId);
        if (error && isMissingProjectTypeColumn(error)) {
          typeSaved = false;
          ({ error } = await supabase.from("stores").update(base).eq("id", storeId));
        }

        if (error) throw error;
        if (typeSaved) setPlatform(nextPlatform);
      } else {
        // Cria um projeto novo para este tenant
        const id = crypto.randomUUID();
        let { data: newStore, error } = await supabase
          .from("stores")
          .insert({ id, tenant_id: user.id, ...typed })
          .select()
          .single();
        if (error && isMissingProjectTypeColumn(error)) {
          typeSaved = false;
          ({ data: newStore, error } = await supabase
            .from("stores")
            .insert({ id, tenant_id: user.id, ...base })
            .select()
            .single());
        }

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

      reload(); // Atualiza o cache global de projetos para destravar a sidebar e layout
      setSuccessMsg("Configurações salvas com sucesso!");
      setTimeout(() => setSuccessMsg(""), 4000);
      if (!typeSaved) {
        setWarningMsg(
          "O tipo do projeto não foi salvo: o banco ainda não tem a migration 030. Rode supabase/migrations/030_add_project_type.sql no Supabase e salve de novo."
        );
      }
    } catch (err: unknown) {
      setErrorMsg("Erro ao salvar: " + errorMessage(err));
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
    <div className="space-y-6 fade-in max-w-3xl mx-auto pb-12 select-none">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          {storeId ? "Configurações do Projeto" : "Novo Projeto"}
        </h1>
        <p className="text-[13px] text-white/40 mt-1">
          Tipo do projeto, domínios e CNAME para cookies de 1ª parte
        </p>
      </div>

      {/* Feedback Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-[#30d158]/10 border border-[#30d158]/20 text-xs text-[#30d158] font-medium">
          <CheckCircle2 size={14} />
          {successMsg}
        </div>
      )}
      {warningMsg && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 text-xs text-[#ff9f0a] font-medium">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          {warningMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-[#ff453a]/10 border border-[#ff453a]/20 text-xs text-[#ff453a] font-medium">
          <AlertTriangle size={14} />
          {errorMsg}
        </div>
      )}

      {/* Seção 0: Tipo do projeto */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div>
          <h3 className="text-sm font-semibold text-white/90">O que você vai rastrear?</h3>
          <p className="text-[12px] text-white/40 mt-1">O tipo muda o menu e as telas do painel. Dá para trocar depois.</p>
        </div>
        <div role="radiogroup" aria-label="Tipo do projeto" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROJECT_TYPES.map((t) => {
            const Icon = TYPE_ICONS[t];
            const selected = projectType === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setProjectType(t)}
                className={cn(
                  "text-left p-4 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2997ff]/60",
                  selected
                    ? "bg-[#2997ff]/10 border-[#2997ff]/40"
                    : "bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.05] hover:border-white/[0.12]"
                )}
              >
                <Icon size={18} className={selected ? "text-[#2997ff]" : "text-white/40"} />
                <span className={cn("block mt-2.5 text-[13px] font-semibold", selected ? "text-white" : "text-white/80")}>
                  {PROJECT_TYPE_INFO[t].label}
                </span>
                <span className="block mt-1 text-[11.5px] leading-snug text-white/40">{PROJECT_TYPE_INFO[t].description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seção 1: Dados do projeto */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-5 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2997ff]/10 border border-[#2997ff]/20 flex items-center justify-center text-[#2997ff]">
            <Store size={18} />
          </div>
          <h3 className="text-sm font-semibold text-white/90">Dados do projeto</h3>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
            Nome do projeto
          </label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder={projectType === "ecommerce" ? "Ex: Minha Loja Principal" : projectType === "app" ? "Ex: Meu App" : "Ex: Curso de Inglês"}
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              {info.domainLabel} <span className="text-[#ff453a]">*</span>
            </label>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onBlur={() => normalizeDomain(domain) && setDomain(normalizeDomain(domain))}
              placeholder={`Ex: ${info.domainPlaceholder}`}
              aria-describedby="domain-hint"
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
            />
            <p id="domain-hint" className="mt-1.5 text-[11px] text-white/30 leading-snug">{info.domainHint}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Domínio do checkout (opcional)
            </label>
            <input
              type="text"
              value={checkoutDomain}
              onChange={(e) => setCheckoutDomain(e.target.value)}
              placeholder="Ex: checkout.sualoja.com"
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Seção 2: CNAME / Custom Domains */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-5 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2997ff]/10 border border-[#2997ff]/20 flex items-center justify-center text-[#2997ff]">
            <Globe size={18} />
          </div>
          <h3 className="text-sm font-semibold text-white/90">
            Mapeamento de CNAME (1st Party Cookies)
          </h3>
        </div>

        <p className="text-[12.5px] text-white/45 leading-relaxed">
          Para prolongar a vida útil de cookies no iOS (contornando o bloqueio ITP do Safari), crie um registro{" "}
          <b className="text-white/80">CNAME</b> na sua hospedagem de domínio apontando para{" "}
          <code className="text-[#2997ff] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded-md text-[11px]">
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
            className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
          />
          <button
            onClick={handleAddDomain}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold flex items-center gap-1.5 border border-white/[0.08] transition-all active:scale-[0.98]"
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
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                  <span className="text-xs font-semibold text-white/90 font-mono">{d}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#30d158]/10 text-[#30d158] border border-[#30d158]/20">Cadastrado</span>
                  <button
                    onClick={() => handleRemoveDomain(d)}
                    className="p-1 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-[#ff453a] transition-colors"
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
        className="w-full py-2.5 bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-[13.5px] font-semibold rounded-xl transition-all shadow-[0_4px_16px_rgba(41,151,255,0.25)] disabled:opacity-50 flex items-center justify-center gap-2"
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
