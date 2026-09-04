"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense } from "react";
import { Loader2 } from "lucide-react";
import {
  UtmifyCampaignManager,
  AccountItem,
  CampaignItem,
  AdsetItem,
  AdItem,
} from "@/components/campaigns/UtmifyCampaignManager";
import { useStore } from "@/contexts/StoreContext";

function CampaignsContent() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [datePreset, setDatePreset] = useState("today");
  const { activeStore } = useStore();

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [adsets, setAdsets] = useState<AdsetItem[]>([]);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [untrackedSalesCount, setUntrackedSalesCount] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);

  // 1. Carrega imediatamente dados em cache local (0ms de espera ao navegar)
  useEffect(() => {
    if (!activeStore?.id) return;
    try {
      const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && Array.isArray(cached.accounts) && cached.accounts.length > 0) {
          setAccounts(cached.accounts);
          setCampaigns(cached.campaigns || []);
          setAdsets(cached.adsets || []);
          setAds(cached.ads || []);
          if (cached.untracked_sales_count !== undefined) {
            setUntrackedSalesCount(cached.untracked_sales_count);
          }
          setLoading(false);
          setIsRefreshing(true);
        }
      }
    } catch {}
  }, [datePreset, activeStore?.id]);

  const loadData = async (silent = false) => {
    if (!activeStore?.id) return;
    
    // Se já temos contas na tela (via cache ou estado), atualiza em background silenciosamente
    const hasData = accounts.length > 0;
    if (!silent && !hasData) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setApiError(null);

    try {
      const res = await fetch(`/api/v1/meta/campaigns/list?date_preset=${datePreset}&store_id=${activeStore.id}`, {
        cache: "no-store",
      });

      const data = await res.json();
      if (data.ok) {
        const accs = data.accounts || [];
        const camps = data.campaigns || [];
        const adsetsList = data.adsets || [];
        const adsList = data.ads || [];
        const untracked = data.untracked_sales_count ?? 0;

        setAccounts(accs);
        setCampaigns(camps);
        setAdsets(adsetsList);
        setAds(adsList);
        setUntrackedSalesCount(untracked);

        if (data.warning || data.notice) {
          setApiError(data.warning || data.notice);
        }

        // Persiste no cache do navegador para próximas navegações instantâneas
        try {
          const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              accounts: accs,
              campaigns: camps,
              adsets: adsetsList,
              ads: adsList,
              untracked_sales_count: untracked,
              timestamp: Date.now(),
            })
          );
        } catch {}
      } else {
        setApiError(data.error || "Não foi possível carregar os dados das Campanhas.");
      }
    } catch (err: any) {
      console.error("[Campaigns Page] Erro ao carregar dados:", err);
      setApiError("Erro de conexão ao carregar campanhas.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [datePreset, activeStore?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 60000); // 60s
    return () => clearInterval(interval);
  }, [datePreset, activeStore?.id]);

  if (loading && accounts.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 size={36} className="animate-spin text-blue-500" />
        <span className="text-xs text-zinc-400 font-medium tracking-wide">Carregando métricas da Meta...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-16 pt-2">
      <UtmifyCampaignManager
        accounts={accounts}
        campaigns={campaigns}
        adsets={adsets}
        ads={ads}
        untrackedSalesCount={untrackedSalesCount}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
        apiError={apiError}
      />
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 size={36} className="animate-spin text-blue-500" />
        </div>
      }
    >
      <CampaignsContent />
    </Suspense>
  );
}
