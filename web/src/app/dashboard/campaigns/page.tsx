"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  UtmifyCampaignManager,
  AccountItem,
  CampaignItem,
  AdsetItem,
  AdItem,
} from "@/components/campaigns/UtmifyCampaignManager";

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [datePreset, setDatePreset] = useState("today");

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [adsets, setAdsets] = useState<AdsetItem[]>([]);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [untrackedSalesCount, setUntrackedSalesCount] = useState(23);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch(`/api/v1/meta/campaigns/list?date_preset=${datePreset}`, {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setAccounts(data.accounts || []);
          setCampaigns(data.campaigns || []);
          setAdsets(data.adsets || []);
          setAds(data.ads || []);
          if (data.untracked_sales_count !== undefined) {
            setUntrackedSalesCount(data.untracked_sales_count);
          }
        }
      }
    } catch (err) {
      console.error("[Campaigns Page] Erro ao carregar dados:", err);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [datePreset]);

  // Polling em tempo real a cada 15 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [datePreset]);

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
      />
    </div>
  );
}
