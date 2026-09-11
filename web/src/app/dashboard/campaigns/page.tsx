"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, useRef } from "react";
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
  const loadingRef = useRef(false);
  const inFlightCampaignsRef = useRef<Set<string>>(new Set());
  const inFlightAdsetsRef = useRef<Set<string>>(new Set());
  const [entityErrors, setEntityErrors] = useState<Record<string, string>>({});

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [adsets, setAdsets] = useState<AdsetItem[]>([]);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [untrackedSalesCount, setUntrackedSalesCount] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

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
          if (Array.isArray(cached.adsets) && cached.adsets.length > 0) {
            setAdsets(cached.adsets);
          }
          if (Array.isArray(cached.ads) && cached.ads.length > 0) {
            setAds(cached.ads);
          }
          if (cached.untracked_sales_count !== undefined) {
            setUntrackedSalesCount(cached.untracked_sales_count);
          }
          if (cached.timestamp) {
            setLastUpdatedAt(new Date(cached.timestamp));
          }
          setLoading(false);
          setIsRefreshing(true);
        }
      }
    } catch {}
  }, [datePreset, activeStore?.id]);

  const loadData = async (silent = false, isManualRefresh = false) => {
    if (!activeStore?.id) return;
    if (loadingRef.current && !isManualRefresh) return;
    loadingRef.current = true;

    // Se já temos contas na tela (via cache ou estado), atualiza em background silenciosamente
    const hasData = accounts.length > 0;
    if (!silent && !hasData) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setApiError(null);

    try {
      const refreshParam = silent || isManualRefresh ? "&refresh=true" : "";
      const busterParam = isManualRefresh ? `&_t=${Date.now()}` : "";
      const url = `/api/v1/meta/campaigns/list?date_preset=${datePreset}&store_id=${activeStore.id}${refreshParam}${busterParam}`;
      const res = await fetch(url, {
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

        // Regra 6: Em lazy loading, nunca substituir dados existentes por []
        if (adsetsList.length > 0) {
          setAdsets(adsetsList);
        }
        if (adsList.length > 0) {
          setAds(adsList);
        }

        setUntrackedSalesCount(untracked);
        setLastUpdatedAt(new Date());

        if (data.warning || data.notice) {
          setApiError(data.warning || data.notice);
        }

        // Persiste no cache do navegador se válido
        if (accs.length > 0 && !data.warning && (!data.account_errors || data.account_errors.length === 0)) {
          try {
            const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                accounts: accs,
                campaigns: camps,
                adsets: adsetsList.length > 0 ? adsetsList : adsets,
                ads: adsList.length > 0 ? adsList : ads,
                untracked_sales_count: untracked,
                timestamp: Date.now(),
              })
            );
          } catch {}
        }
      } else {
        setApiError(data.error || "Não foi possível carregar os dados das Campanhas.");
      }
    } catch (err: any) {
      console.error("[Campaigns Page] Erro ao carregar dados:", err);
      setApiError("Erro de conexão ao carregar campanhas.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Carregamento sob demanda: Ao selecionar Campanha, busca seus AdSets (Fase 2 e Fase 3)
  const loadAdsetsForCampaign = async (campaignId: string, forceRefresh = false) => {
    if (!activeStore?.id) return;
    if (inFlightCampaignsRef.current.has(campaignId) && !forceRefresh) {
      return; // Bloqueia duplo clique / requisição em voo
    }
    inFlightCampaignsRef.current.add(campaignId);

    try {
      const refreshParam = forceRefresh ? `&refresh=true&_t=${Date.now()}` : "";
      const url = `/api/v1/meta/campaigns/list?campaign_id=${campaignId}&store_id=${activeStore.id}&date_preset=${datePreset}${refreshParam}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        // Sucesso: remove erro anterior desta campanha
        setEntityErrors((prev) => {
          const next = { ...prev };
          delete next[campaignId];
          return next;
        });

        if (Array.isArray(data.adsets)) {
          setAdsets((prev) => {
            const filtered = prev.filter((as) => as.campaign_id !== campaignId);
            const next = [...filtered, ...data.adsets];
            try {
              const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
              const cachedRaw = sessionStorage.getItem(cacheKey);
              if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                cached.adsets = next;
                sessionStorage.setItem(cacheKey, JSON.stringify(cached));
              }
            } catch {}
            return next;
          });
        }
      } else {
        // Falha semântica da Meta
        setEntityErrors((prev) => ({
          ...prev,
          [campaignId]: data.error_message || "Falha temporária ao consultar Meta Ads para esta campanha.",
        }));
      }
    } catch (err) {
      console.error(`[Campaigns Page] Erro de rede ao carregar adsets da campanha ${campaignId}:`, err);
      setEntityErrors((prev) => ({
        ...prev,
        [campaignId]: "Erro de conexão com a Meta Ads para esta campanha.",
      }));
    } finally {
      inFlightCampaignsRef.current.delete(campaignId);
    }
  };

  // Carregamento sob demanda: Ao selecionar AdSet, busca seus Ads (Fase 2 e Fase 3)
  const loadAdsForAdset = async (adsetId: string, forceRefresh = false) => {
    if (!activeStore?.id) return;
    if (inFlightAdsetsRef.current.has(adsetId) && !forceRefresh) {
      return; // Bloqueia duplo clique / requisição em voo
    }
    inFlightAdsetsRef.current.add(adsetId);

    try {
      const refreshParam = forceRefresh ? `&refresh=true&_t=${Date.now()}` : "";
      const url = `/api/v1/meta/campaigns/list?adset_id=${adsetId}&store_id=${activeStore.id}&date_preset=${datePreset}${refreshParam}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setEntityErrors((prev) => {
          const next = { ...prev };
          delete next[adsetId];
          return next;
        });

        if (Array.isArray(data.ads)) {
          setAds((prev) => {
            const filtered = prev.filter((ad) => ad.adset_id !== adsetId);
            const next = [...filtered, ...data.ads];
            try {
              const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
              const cachedRaw = sessionStorage.getItem(cacheKey);
              if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                cached.ads = next;
                sessionStorage.setItem(cacheKey, JSON.stringify(cached));
              }
            } catch {}
            return next;
          });
        }
      } else {
        setEntityErrors((prev) => ({
          ...prev,
          [adsetId]: data.error_message || "Falha temporária ao consultar Meta Ads para este conjunto.",
        }));
      }
    } catch (err) {
      console.error(`[Campaigns Page] Erro de rede ao carregar ads do adset ${adsetId}:`, err);
      setEntityErrors((prev) => ({
        ...prev,
        [adsetId]: "Erro de conexão com a Meta Ads para este conjunto.",
      }));
    } finally {
      inFlightAdsetsRef.current.delete(adsetId);
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
        onRefresh={async (selectedCampId, selectedAsId) => {
          try {
            if (activeStore?.id) {
              const cacheKey = `atm_camp_cache_${activeStore.id}_${datePreset}`;
              sessionStorage.removeItem(cacheKey);
            }
          } catch {}

          if (!selectedCampId) {
            setAdsets([]);
          }
          if (!selectedAsId) {
            setAds([]);
          }

          const refreshPromises: Promise<any>[] = [loadData(true, true)];
          if (selectedCampId) {
            refreshPromises.push(loadAdsetsForCampaign(selectedCampId, true));
          }
          if (selectedAsId) {
            refreshPromises.push(loadAdsForAdset(selectedAsId, true));
          }

          await Promise.allSettled(refreshPromises);
        }}
        onLoadAdsets={loadAdsetsForCampaign}
        onLoadAds={loadAdsForAdset}
        entityErrors={entityErrors}
        isRefreshing={isRefreshing}
        apiError={apiError}
        lastUpdatedAt={lastUpdatedAt}
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
