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
  const [untrackedSalesCount, setUntrackedSalesCount] = useState(23);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!activeStore) return;
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setApiError(null);

    try {
      const res = await fetch(`/api/v1/meta/campaigns/list?date_preset=${datePreset}&store_id=${activeStore.id}`, {
        cache: "no-store",
      });

      const data = await res.json();
      if (data.ok) {
        setAccounts(data.accounts || []);
        setCampaigns(data.campaigns || []);
        setAdsets(data.adsets || []);
        setAds(data.ads || []);
        if (data.untracked_sales_count !== undefined) {
          setUntrackedSalesCount(data.untracked_sales_count);
        }
        if (data.warning || data.notice) {
          setApiError(data.warning || data.notice);
        }
      } else {
        setApiError(data.error || "Não foi possível carregar os dados das Campanhas.");
        setAccounts(data.accounts || []);
        setCampaigns(data.campaigns || []);
        setAdsets(data.adsets || []);
        setAds(data.ads || []);
      }
    } catch (err: any) {
      console.error("[Campaigns Page] Erro ao carregar dados:", err);
      setApiError("Erro de conexão ao carregar campanhas.");
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [datePreset, activeStore]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 60000); // 60s
    return () => clearInterval(interval);
  }, [datePreset, activeStore]);

  if (loading && accounts.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-blue-500" />
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
