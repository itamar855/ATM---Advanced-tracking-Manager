"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Folder,
  Layers,
  LayoutGrid,
  Image as ImageIcon,
  RotateCw,
  Search,
  Filter,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Edit2,
  Check,
  X,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Sparkles,
  SlidersHorizontal,
  DollarSign
} from "lucide-react";
import { useStore } from "@/contexts/StoreContext";

export type TabType = "accounts" | "campaigns" | "adsets" | "ads";

export interface AccountItem {
  id: string;
  name: string;
  currency: string;
  status: string;
  card: string;
  cycle: number;
  historic_spent: number;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  sales: number;
  cpa: number;
  ic: number;
  cpi: number;
  margin: number;
  roi: number;
  last_update: string;
}

export interface CampaignItem {
  id: string;
  name: string;
  account_id: string;
  account_name: string;
  status: "active" | "paused";
  budget: number;
  budget_type: string;
  is_cbo?: boolean;
  adset_count?: number;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  sales: number;
  cpa: number;
  ic: number;
  cpi: number;
  margin: number;
  roi: number;
  last_update: string;
}

export interface AdsetItem {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string;
  status: "active" | "paused";
  budget: number;
  budget_type: string;
  is_cbo?: boolean;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  sales: number;
  cpa: number;
  ic: number;
  cpi: number;
  margin: number;
  roi: number;
  last_update: string;
}

export interface AdItem {
  id: string;
  name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string;
  status: "active" | "paused";
  budget: number;
  budget_type: string;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  sales: number;
  cpa: number;
  ic: number;
  cpi: number;
  margin: number;
  roi: number;
  last_update: string;
}

interface UtmifyCampaignManagerProps {
  accounts: AccountItem[];
  campaigns: CampaignItem[];
  adsets: AdsetItem[];
  ads: AdItem[];
  untrackedSalesCount?: number;
  datePreset: string;
  setDatePreset: (preset: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  apiError?: string | null;
}

export function UtmifyCampaignManager({
  accounts = [],
  campaigns = [],
  adsets = [],
  ads = [],
  untrackedSalesCount = 0,
  datePreset,
  setDatePreset,
  onRefresh,
  isRefreshing = false,
  apiError = null,
}: UtmifyCampaignManagerProps) {
  const { activeStore } = useStore();

  // Estado da Aba Ativa
  const [activeTab, setActiveTab] = useState<TabType>("accounts");

  // Filtros de Drill-Down
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(null);

  // Filtros de Barra Superior
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterAccountSelect, setFilterAccountSelect] = useState("all");

  // Seleção múltipla
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState<string>("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Edição de Nome
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>("");

  const handleSaveName = async (id: string, level: "campaign" | "adset" | "ad") => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      alert("O nome não pode ficar vazio.");
      return;
    }

    setActionLoadingId(id);
    try {
      const res = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          level,
          action: "name",
          value: trimmed,
          store_id: activeStore?.id,
        }),
      });

      if (res.ok) {
        setEditingNameId(null);
        onRefresh();
      } else {
        const d = await res.json();
        alert("Erro na Meta: " + (d.error || "Não foi possível alterar o nome."));
      }
    } catch (e: any) {
      alert("Erro ao renomear: " + e.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Duplicação Modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateItemIds, setDuplicateItemIds] = useState<string[]>([]);
  const [duplicateItemLevel, setDuplicateItemLevel] = useState<"campaign" | "adset" | "ad" | null>(null);
  const [duplicateCopies, setDuplicateCopies] = useState<string>("1");
  const [duplicateNewBudget, setDuplicateNewBudget] = useState<string>("");
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [bulkBudgetModalOpen, setBulkBudgetModalOpen] = useState(false);
  const [bulkBudgetValue, setBulkBudgetValue] = useState("");
  const [mobileViewMode, setMobileViewMode] = useState<"cards" | "table">("cards");

  // ── Navegação & Drill-Down ───────────────────────────────────────────────

  const handleSelectAccount = (accId: string) => {
    setSelectedAccountId(accId);
    setSelectedCampaignId(null);
    setSelectedAdsetId(null);
    setActiveTab("campaigns");
  };

  const handleSelectCampaign = (campId: string) => {
    setSelectedCampaignId(campId);
    setSelectedAdsetId(null);
    setActiveTab("adsets");
  };

  const handleSelectAdset = (adsetId: string) => {
    setSelectedAdsetId(adsetId);
    setActiveTab("ads");
  };

  // ── Ação de Toggle Switch (Play/Pause) ───────────────────────────────────

  const handleToggleStatus = async (id: string, currentStatus: "active" | "paused", level: "campaign" | "adset" | "ad") => {
    const newStatus = currentStatus === "active" ? "PAUSED" : "ACTIVE";
    setActionLoadingId(id);

    try {
      const res = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          level,
          action: "status",
          value: newStatus,
          store_id: activeStore?.id,
        }),
      });

      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert("Erro na Meta: " + (d.error || "Não foi possível alterar o status."));
      }
    } catch (e: any) {
      alert("Erro ao conectar: " + e.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Ação de Excluir ─────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (selectedRowIds.length === 0) return;
    
    if (activeTab === "accounts") {
      alert("Não é possível excluir contas de anúncios por aqui.");
      return;
    }
    
    const typeLabel = activeTab === "campaigns" ? "campanha(s)" : activeTab === "adsets" ? "conjunto(s)" : "anúncio(s)";
    
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedRowIds.length} ${typeLabel}? Esta ação não pode ser desfeita e excluirá o conteúdo na própria Meta.`)) {
      return;
    }
    
    const level = activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad";
    let successCount = 0;
    
    setIsBulkActionRunning(true);
    
    try {
      const promises = selectedRowIds.map(id => 
        fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level,
            action: "delete",
            store_id: activeStore?.id,
          }),
        })
      );
      
      const results = await Promise.all(promises);
      
      for (const res of results) {
        if (res.ok) successCount++;
      }
      
      if (successCount < selectedRowIds.length) {
        alert(`Atenção: Apenas ${successCount} de ${selectedRowIds.length} foram excluídos com sucesso. Alguns podem ter falhado na Meta.`);
      }
      
      setSelectedRowIds([]);
      onRefresh();
    } catch (e: any) {
      alert("Erro ao excluir: " + e.message);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleBulkStatus = async (newStatus: "active" | "paused") => {
    if (selectedRowIds.length === 0) return;
    const level = activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad";
    
    setIsBulkActionRunning(true);
    let successCount = 0;
    
    try {
      const promises = selectedRowIds.map(id => 
        fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level,
            action: "status",
            value: newStatus,
            store_id: activeStore?.id,
          }),
        })
      );
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.ok) successCount++;
      }
      
      if (successCount < selectedRowIds.length) {
        alert(`Atenção: ${successCount} de ${selectedRowIds.length} foram alterados com sucesso.`);
      }
      
      onRefresh();
    } catch (e: any) {
      alert("Erro ao alterar status em massa: " + e.message);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  // ── Ação de Duplicar e Alterar Orçamento ──────────────────────────────

  const handleOpenDuplicate = (id: string, level: "campaign" | "adset" | "ad", currentBudget?: number) => {
    setDuplicateItemIds([id]);
    setDuplicateItemLevel(level);
    setDuplicateCopies("1");
    setDuplicateNewBudget(currentBudget && currentBudget > 0 ? String(currentBudget) : "");
    setDuplicateModalOpen(true);
  };

  const handleOpenBulkDuplicate = () => {
    if (selectedRowIds.length === 0) return;
    setDuplicateItemIds(selectedRowIds);
    setDuplicateItemLevel(activeTab as "campaign" | "adset" | "ad");
    setDuplicateCopies("1");
    setDuplicateNewBudget("");
    setDuplicateModalOpen(true);
  };

  const handleOpenBulkBudget = () => {
    if (selectedRowIds.length === 0) return;
    setBulkBudgetValue("");
    setBulkBudgetModalOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (duplicateItemIds.length === 0 || !duplicateItemLevel) return;
    const copies = Number(duplicateCopies);
    if (isNaN(copies) || copies < 1) {
      alert("A quantidade de cópias deve ser no mínimo 1.");
      return;
    }

    setDuplicateModalOpen(false);
    setIsBulkActionRunning(true);
    let successCount = 0;

    try {
      const promises = duplicateItemIds.map(id => 
        fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level: duplicateItemLevel,
            action: "duplicate",
            copies,
            newBudget: duplicateNewBudget ? Number(duplicateNewBudget) : null,
            store_id: activeStore?.id,
          }),
        })
      );
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.ok) successCount++;
      }
      
      if (successCount < duplicateItemIds.length) {
        alert(`Atenção: Apenas ${successCount} de ${duplicateItemIds.length} foram duplicados.`);
      }
      
      onRefresh();
      setSelectedRowIds([]);
    } catch (e: any) {
      alert("Erro ao duplicar: " + e.message);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleConfirmBulkBudget = async () => {
    if (selectedRowIds.length === 0 || !bulkBudgetValue) return;
    
    setBulkBudgetModalOpen(false);
    setIsBulkActionRunning(true);
    let successCount = 0;

    const level = activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad";

    try {
      const promises = selectedRowIds.map(id =>
        fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level,
            action: "budget",
            value: bulkBudgetValue,
            store_id: activeStore?.id,
          }),
        })
      );
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.ok) successCount++;
      }
      
      if (successCount < selectedRowIds.length) {
        alert(`Atenção: Apenas ${successCount} de ${selectedRowIds.length} orçamentos foram alterados com sucesso.`);
      }
      
      onRefresh();
    } catch (e: any) {
      alert("Erro ao alterar orçamento em massa: " + e.message);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleSaveBudget = async (id: string, level: "campaign" | "adset") => {
    const num = Number(editBudgetValue);
    if (isNaN(num) || num <= 0) {
      alert("Digite um valor de orçamento válido.");
      return;
    }

    setActionLoadingId(id);
    try {
      const res = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          level,
          action: "budget",
          value: num,
          store_id: activeStore?.id,
        }),
      });

      if (res.ok) {
        setEditingBudgetId(null);
        onRefresh();
      } else {
        const d = await res.json();
        alert("Erro na Meta: " + (d.error || "Não foi possível salvar o orçamento."));
      }
    } catch (e: any) {
      alert("Erro ao alterar orçamento: " + e.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Filtragem e Ordenação dos Dados da Aba Atual ─────────────────────────

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();

    // Ordenação estrita solicitada: Ativas > Com Lucro (maior lucro) > Desativadas
    const sortByActiveProfit = (a: any, b: any) => {
      const aActive = a.status === "active" || a.status === "Ativo" ? 1 : 0;
      const bActive = b.status === "active" || b.status === "Ativo" ? 1 : 0;

      // 1. Prioridade absoluta: Ativas (1) antes de Desativadas (0)
      if (aActive !== bActive) {
        return bActive - aActive;
      }

      // 2. Entre o mesmo grupo de status: maior lucro líquido primeiro
      const aProfit = Number(a.profit || 0);
      const bProfit = Number(b.profit || 0);
      if (bProfit !== aProfit) {
        return bProfit - aProfit;
      }

      // 3. Desempate por maior gasto (spend)
      return Number(b.spend || 0) - Number(a.spend || 0);
    };

    if (activeTab === "accounts") {
      return accounts
        .filter((acc) => {
          const accName = String(acc.name || "").toLowerCase();
          const accId = String(acc.id || "").toLowerCase();
          const matchName = accName.includes(term) || accId.includes(term);
          const matchStatus = statusFilter === "all" || (statusFilter === "active" ? acc.status === "Ativo" : acc.status !== "Ativo");
          return matchName && matchStatus;
        })
        .sort(sortByActiveProfit);
    }

    if (activeTab === "campaigns") {
      return campaigns
        .filter((camp) => {
          const campName = String(camp.name || "").toLowerCase();
          const campId = String(camp.id || "").toLowerCase();
          const matchAcc = !selectedAccountId || camp.account_id === selectedAccountId;
          const matchAccSelect = filterAccountSelect === "all" || camp.account_id === filterAccountSelect;
          const matchName = campName.includes(term) || campId.includes(term);
          const matchStatus = statusFilter === "all" || camp.status === statusFilter;
          return matchAcc && matchAccSelect && matchName && matchStatus;
        })
        .sort(sortByActiveProfit);
    }

    if (activeTab === "adsets") {
      return adsets
        .filter((as) => {
          const asName = String(as.name || "").toLowerCase();
          const asId = String(as.id || "").toLowerCase();
          const matchCamp = !selectedCampaignId || as.campaign_id === selectedCampaignId;
          const matchAcc = !selectedAccountId || as.account_id === selectedAccountId;
          const matchAccSelect = filterAccountSelect === "all" || as.account_id === filterAccountSelect;
          const matchName = asName.includes(term) || asId.includes(term);
          const matchStatus = statusFilter === "all" || as.status === statusFilter;
          return matchCamp && matchAcc && matchAccSelect && matchName && matchStatus;
        })
        .sort(sortByActiveProfit);
    }

    if (activeTab === "ads") {
      return ads
        .filter((ad) => {
          const adName = String(ad.name || "").toLowerCase();
          const adId = String(ad.id || "").toLowerCase();
          const matchAdset = !selectedAdsetId || ad.adset_id === selectedAdsetId;
          const matchCamp = !selectedCampaignId || ad.campaign_id === selectedCampaignId;
          const matchAcc = !selectedAccountId || ad.account_id === selectedAccountId;
          const matchAccSelect = filterAccountSelect === "all" || ad.account_id === filterAccountSelect;
          const matchName = adName.includes(term) || adId.includes(term);
          const matchStatus = statusFilter === "all" || ad.status === statusFilter;
          return matchAdset && matchCamp && matchAcc && matchAccSelect && matchName && matchStatus;
        })
        .sort(sortByActiveProfit);
    }

    return [];
  }, [
    activeTab,
    accounts,
    campaigns,
    adsets,
    ads,
    searchTerm,
    statusFilter,
    filterAccountSelect,
    selectedAccountId,
    selectedCampaignId,
    selectedAdsetId,
  ]);

  // ── Cálculo dos Totais do Rodapé ─────────────────────────────────────────

  const totals = useMemo(() => {
    let count = filteredData.length;
    let cycle = 0;
    let historicSpent = 0;
    let spend = 0;
    let revenue = 0;
    let sales = 0;
    let ic = 0;

    filteredData.forEach((item: any) => {
      cycle += item.cycle || 0;
      historicSpent += item.historic_spent || 0;
      spend += item.spend || 0;
      revenue += item.revenue || 0;
      sales += item.sales || 0;
      ic += item.ic || 0;
    });

    const profit = revenue - spend;
    const roas = spend > 0 ? revenue / spend : (revenue > 0 ? 99.9 : 0);
    const cpa = sales > 0 ? spend / sales : 0;
    const cpi = ic > 0 ? spend / ic : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : (spend > 0 ? -100 : 0);
    const roi = spend > 0 ? profit / spend : 0;

    return { count, cycle, historicSpent, spend, revenue, profit, roas, sales, cpa, ic, cpi, margin, roi };
  }, [filteredData]);

  // ── Helpers de Formatação ────────────────────────────────────────────────

  const fmtBrl = (val?: number) => {
    const n = typeof val === "number" && !isNaN(val) ? val : 0;
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const selectedAccountObj = accounts.find((a) => a.id === selectedAccountId);
  const selectedCampaignObj = campaigns.find((c) => c.id === selectedCampaignId);
  const selectedAdsetObj = adsets.find((as) => as.id === selectedAdsetId);

  return (
    <div className="space-y-4 text-zinc-200 fade-in select-none">
      {/* ── Mobile KPI Summary Bar (Topo) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:hidden">
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-2.5 shadow-sm">
          <span className="text-[10px] text-zinc-400 font-medium block">Gasto Total</span>
          <span className="text-xs font-bold text-white font-mono mt-0.5 block">{fmtBrl(totals.spend)}</span>
        </div>
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-2.5 shadow-sm">
          <span className="text-[10px] text-zinc-400 font-medium block">Faturamento</span>
          <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">{fmtBrl(totals.revenue)}</span>
        </div>
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-2.5 shadow-sm">
          <span className="text-[10px] text-zinc-400 font-medium block">Lucro Líquido</span>
          <span className={cn(
            "text-xs font-bold font-mono mt-0.5 block",
            totals.profit >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {fmtBrl(totals.profit)}
          </span>
        </div>
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-2.5 shadow-sm">
          <span className="text-[10px] text-zinc-400 font-medium block">ROAS / Vendas</span>
          <span className="text-xs font-bold text-blue-400 font-mono mt-0.5 block">
            {totals.roas.toFixed(2)}x <span className="text-zinc-500 font-normal">({totals.sales}v)</span>
          </span>
        </div>
      </div>

      {/* ── 1. Top Tabs Bar (Estilo UTMify PRO) ────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 overflow-x-auto scrollbar-none flex-nowrap">
        {/* Tab 1: Contas */}
        <button
          onClick={() => {
            setActiveTab("accounts");
            setSelectedAccountId(null);
            setSelectedCampaignId(null);
            setSelectedAdsetId(null);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2",
            activeTab === "accounts"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <Folder size={14} className={activeTab === "accounts" ? "text-blue-400" : "text-zinc-500"} />
          <span>Contas</span>
        </button>

        {/* Tab 2: Campanhas */}
        <button
          onClick={() => setActiveTab("campaigns")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2",
            activeTab === "campaigns"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <Layers size={14} className={activeTab === "campaigns" ? "text-blue-400" : "text-zinc-500"} />
          <span>Campanhas</span>
          {selectedAccountId && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAccountId(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de conta"
            >
              {selectedAccountObj?.name || "1 conta"} <X size={10} />
            </span>
          )}
        </button>

        {/* Tab 3: CJs (Conjuntos de Anúncios) */}
        <button
          onClick={() => setActiveTab("adsets")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2",
            activeTab === "adsets"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <LayoutGrid size={14} className={activeTab === "adsets" ? "text-blue-400" : "text-zinc-500"} />
          <span>CJs {selectedCampaignId ? `de 1 campanha` : ""}</span>
          {selectedCampaignId && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCampaignId(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de campanha"
            >
              {selectedCampaignObj?.name.slice(0, 15) || "1 camp."}... <X size={10} />
            </span>
          )}
        </button>

        {/* Tab 4: ADs (Criativos) */}
        <button
          onClick={() => setActiveTab("ads")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2",
            activeTab === "ads"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <ImageIcon size={14} className={activeTab === "ads" ? "text-blue-400" : "text-zinc-500"} />
          <span>ADs {selectedAdsetId ? `do conjunto` : selectedCampaignId ? `da campanha` : ""}</span>
          {(selectedAdsetId || selectedCampaignId) && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAdsetId(null);
                setSelectedCampaignId(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtros e ver todos os anúncios"
            >
              {selectedAdsetObj?.name.slice(0, 12) || selectedCampaignObj?.name.slice(0, 12) || "Filtrado"} <X size={10} />
            </span>
          )}
        </button>
      </div>

      {/* ── Banner de Alerta de Token / Erro da Meta ── */}
      {apiError && (
        <div className="bg-[var(--color-bg-surface)] border-t border-[var(--color-border-subtle)] p-3 px-5 flex items-center justify-between text-xs shadow-lg">
        <div className="flex items-center gap-4 text-zinc-400">
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-200">Aviso sobre Conexão das Campanhas:</p>
              <p className="text-zinc-300 mt-0.5">{apiError}</p>
            </div>
          </div>
          <a
            href="/dashboard/settings/integrations"
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            <span>Configurar em Integrações</span>
          </a>
        </div>
      )}

      {/* ── 2. Toolbar Superior de Filtros e Status ───────────────────────── */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Ações Rápidas da Esquerda */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Alternador Mobile Cards vs Tabela */}
            <div className="flex sm:hidden items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setMobileViewMode("cards")}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                  mobileViewMode === "cards" ? "bg-blue-600 text-white shadow" : "text-zinc-400"
                )}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode("table")}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                  mobileViewMode === "table" ? "bg-blue-600 text-white shadow" : "text-zinc-400"
                )}
              >
                Tabela
              </button>
            </div>

            <button className="p-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-white transition-colors" title="Colunas">
              <SlidersHorizontal size={14} />
            </button>

            {selectedRowIds.length > 0 && activeTab !== "accounts" && (
              <>
                <button
                  onClick={() => handleBulkStatus("active")}
                  disabled={isBulkActionRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold text-xs border border-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <Check size={13} />
                  Ativar
                </button>
                <button
                  onClick={() => handleBulkStatus("paused")}
                  disabled={isBulkActionRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-400 font-semibold text-xs border border-zinc-500/20 transition-all disabled:opacity-50"
                >
                  <X size={13} />
                  Pausar
                </button>
                {(activeTab === "campaigns" || activeTab === "adsets") && (
                  <button
                    onClick={handleOpenBulkBudget}
                    disabled={isBulkActionRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold text-xs border border-blue-500/20 transition-all disabled:opacity-50"
                  >
                    <DollarSign size={13} />
                    Orçamentos
                  </button>
                )}
                <button
                  onClick={handleOpenBulkDuplicate}
                  disabled={isBulkActionRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-semibold text-xs border border-purple-500/20 transition-all disabled:opacity-50"
                >
                  <Layers size={13} />
                  Duplicar
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkActionRunning}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs border border-rose-500/20 transition-all",
                    isBulkActionRunning && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <X size={13} className={isBulkActionRunning ? "animate-spin" : ""} />
                  {isBulkActionRunning ? "Aguarde..." : `Excluir ${selectedRowIds.length}`}
                </button>
              </>
            )}

            {untrackedSalesCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                <AlertTriangle size={12} />
                <span>{untrackedSalesCount} vendas não trackeadas</span>
              </div>
            )}
          </div>

          {/* Lado Direito: Status de Atualização + Botão Atualizar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">Atualizado há 1 minuto</span>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all active:scale-95 disabled:opacity-50"
            >
              <RotateCw size={13} className={isRefreshing ? "animate-spin" : ""} />
              <span>{isRefreshing ? "Atualizando..." : "Atualizar"}</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros em Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-[var(--color-border-subtle)] text-xs">
          {/* 1. Nome */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">
              Nome {activeTab === "accounts" ? "da Conta" : activeTab === "campaigns" ? "da Campanha" : activeTab === "adsets" ? "do Conjunto" : "do Anúncio"}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar por nome"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-2 text-zinc-500 hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* 2. Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">Qualquer</option>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </select>
          </div>

          {/* 3. Período de Visualização */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Período de Visualização</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
              <option value="this_month">Este Mês</option>
            </select>
          </div>

          {/* 4. Conta de Anúncio */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Conta de Anúncio</label>
            <select
              value={filterAccountSelect}
              onChange={(e) => setFilterAccountSelect(e.target.value)}
              className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">Qualquer</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Produto */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400">Produto</label>
            <select className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors">
              <option value="all">Qualquer</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 2.5 Visão de Cards Mobile para iPhone/Android ── */}
      <div className={cn("space-y-3", mobileViewMode === "table" ? "hidden" : "block sm:hidden")}>
        {filteredData.length > 0 ? (
          filteredData.map((row: any) => {
            const isChecked = selectedRowIds.includes(row.id);
            const isPositiveProfit = Number(row.profit || 0) >= 0;
            const isPositiveRoas = Number(row.roas || 0) >= 1.0;
            const isEditingBudget = editingBudgetId === row.id;

            return (
              <div
                key={row.id}
                className={cn(
                  "bg-[#11141E] border border-zinc-800/80 rounded-2xl p-4 shadow-lg transition-all",
                  isChecked && "border-blue-500/50 bg-blue-500/[0.03]"
                )}
              >
                {/* Linha Superior: Checkbox + Switch iOS + Nome + ROAS */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedRowIds((prev) =>
                          prev.includes(row.id) ? prev.filter((i) => i !== row.id) : [...prev, row.id]
                        );
                      }}
                      className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0 cursor-pointer shrink-0"
                    />

                    {activeTab === "accounts" ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0",
                          row.status === "Ativo"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-500/10 text-zinc-400"
                        )}
                      >
                        {row.status}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleStatus(
                            row.id,
                            row.status,
                            activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad"
                          )
                        }
                        disabled={actionLoadingId === row.id}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none cursor-pointer shrink-0",
                          row.status === "active" ? "bg-emerald-500" : "bg-zinc-700",
                          actionLoadingId === row.id && "opacity-50 animate-pulse"
                        )}
                        title={row.status === "active" ? "Pausar" : "Ativar"}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                            row.status === "active" ? "translate-x-4.5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <div
                        onClick={() => {
                          if (activeTab === "accounts") handleSelectAccount(row.id);
                          else if (activeTab === "campaigns") handleSelectCampaign(row.id);
                          else if (activeTab === "adsets") handleSelectAdset(row.id);
                        }}
                        className="font-bold text-xs text-white hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                      {row.account_name && activeTab !== "accounts" && (
                        <span className="text-[10px] text-zinc-500 block truncate">
                          {row.account_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de ROAS */}
                  <div className="shrink-0">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border block",
                        isPositiveRoas
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      )}
                    >
                      {Number(row.roas || 0).toFixed(2)}x ROAS
                    </span>
                  </div>
                </div>

                {/* Grid 2x2 com 4 Métricas Chave */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/60 text-xs">
                  <div className="bg-[#141824] rounded-xl p-2.5 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Gasto:</span>
                    <span className="font-bold font-mono text-zinc-200 mt-0.5 block">{fmtBrl(row.spend)}</span>
                  </div>
                  <div className="bg-[#141824] rounded-xl p-2.5 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Faturamento:</span>
                    <span className="font-bold font-mono text-emerald-400 mt-0.5 block">{fmtBrl(row.revenue)}</span>
                  </div>
                  <div className="bg-[#141824] rounded-xl p-2.5 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Lucro Líquido:</span>
                    <span
                      className={cn(
                        "font-bold font-mono mt-0.5 block",
                        isPositiveProfit ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {fmtBrl(row.profit)}
                    </span>
                  </div>
                  <div className="bg-[#141824] rounded-xl p-2.5 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Vendas / CPA:</span>
                    <span className="font-bold font-mono text-white mt-0.5 block">
                      {row.sales || 0} <span className="text-[10px] text-zinc-400 font-normal">({fmtBrl(row.cpa)})</span>
                    </span>
                  </div>
                </div>

                {/* Rodapé do Card: Orçamento + Ações Rápidas */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-800/60 text-xs text-zinc-400">
                  {activeTab !== "accounts" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-500">Orçamento:</span>
                      {isEditingBudget ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={editBudgetValue}
                            onChange={(e) => setEditBudgetValue(e.target.value)}
                            className="w-16 px-1.5 py-0.5 bg-zinc-800 text-white text-[11px] font-mono rounded border border-blue-500 focus:outline-none"
                          />
                          <button
                            onClick={() =>
                              handleSaveBudget(
                                row.id,
                                activeTab === "campaigns" ? "campaign" : "adset"
                              )
                            }
                            className="p-1 rounded bg-emerald-500 text-black hover:bg-emerald-400"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => setEditingBudgetId(null)}
                            className="p-1 rounded bg-zinc-700 text-white hover:bg-zinc-600"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingBudgetId(row.id);
                            setEditBudgetValue(String(row.budget || ""));
                          }}
                          className="font-mono text-zinc-300 font-bold hover:text-blue-400 flex items-center gap-1 text-[11px] cursor-pointer"
                        >
                          <span>{row.budget ? fmtBrl(row.budget) : "N/D"}</span>
                          <Edit2 size={10} className="text-zinc-500" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Ação de Navegação para o próximo nível */}
                  {activeTab !== "ads" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === "accounts") handleSelectAccount(row.id);
                        else if (activeTab === "campaigns") handleSelectCampaign(row.id);
                        else if (activeTab === "adsets") handleSelectAdset(row.id);
                      }}
                      className="ml-auto text-[11px] text-blue-400 font-bold flex items-center gap-1 hover:text-blue-300 cursor-pointer"
                    >
                      <span>
                        {activeTab === "accounts"
                          ? "Ver Campanhas"
                          : activeTab === "campaigns"
                          ? "Ver Conjuntos"
                          : "Ver Anúncios"}
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-[#11141E] border border-zinc-800/80 rounded-2xl text-zinc-400 text-xs">
            Nenhum item encontrado com os filtros atuais.
          </div>
        )}
      </div>

      {/* ── 3. Tabela Master de Alta Densidade ────────── */}
      <div className={cn("bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden", mobileViewMode === "cards" ? "hidden sm:block" : "block")}>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-[11.5px]">
            <thead className="bg-zinc-800/20 text-zinc-400 font-semibold sticky top-0 z-20 border-b border-[var(--color-border-subtle)] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="w-8 py-3 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedRowIds.length > 0 && selectedRowIds.length === filteredData.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRowIds(filteredData.map((d: any) => d.id));
                      else setSelectedRowIds([]);
                    }}
                    className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-2 text-center w-14">STATUS</th>
                <th className="py-3 px-3 min-w-[220px]">
                  {activeTab === "accounts" ? "CONTA" : activeTab === "campaigns" ? "CAMPANHA" : activeTab === "adsets" ? "CONJUNTO" : "ANÚNCIO"}
                </th>

                {activeTab === "accounts" && (
                  <>
                    <th className="py-3 px-2 text-right">CICLO</th>
                    <th className="py-3 px-2">CARTÃO</th>
                    <th className="py-3 px-2 text-center">STATUS DA CONTA</th>
                    <th className="py-3 px-2 text-right">TOTAL GASTO</th>
                  </>
                )}

                {activeTab !== "accounts" && (
                  <>
                    <th className="py-3 px-2 text-right">ORÇAMENTO</th>
                    <th className="py-3 px-2 text-center">ÚLT. ATUALIZAÇÃO</th>
                  </>
                )}

                <th className="py-3 px-2 text-center">VENDAS</th>
                <th className="py-3 px-2 text-right">CPA</th>
                <th className="py-3 px-2 text-right">GASTOS</th>
                <th className="py-3 px-2 text-right">FATURAMENTO</th>
                <th className="py-3 px-2 text-right">LUCRO</th>
                <th className="py-3 px-2 text-center">ROAS</th>
                <th className="py-3 px-2 text-center">MARGEM</th>
                <th className="py-3 px-2 text-center">ROI</th>
                <th className="py-3 px-2 text-center">IC</th>
                <th className="py-3 px-2 text-right pr-4">CPI</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/30">
              {filteredData.length > 0 ? (
                filteredData.map((row: any) => {
                  const isChecked = selectedRowIds.includes(row.id);
                  const isPositiveProfit = row.profit >= 0;
                  const isPositiveRoas = row.roas >= 1.0;
                  const isEditingBudget = editingBudgetId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "hover:bg-zinc-800/20 transition-colors group",
                        isChecked && "bg-blue-500/5"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedRowIds((prev) =>
                              prev.includes(row.id) ? prev.filter((i) => i !== row.id) : [...prev, row.id]
                            );
                          }}
                          className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Status Toggle Switch iOS */}
                      <td className="py-2.5 px-2 text-center">
                        {activeTab === "accounts" ? (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                              row.status === "Ativo"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-zinc-500/10 text-zinc-400"
                            )}
                          >
                            {row.status}
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              handleToggleStatus(
                                row.id,
                                row.status,
                                activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad"
                              )
                            }
                            disabled={actionLoadingId === row.id}
                            className={cn(
                              "relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none cursor-pointer",
                              row.status === "active" ? "bg-emerald-500" : "bg-zinc-600",
                              actionLoadingId === row.id && "opacity-50 animate-pulse"
                            )}
                            title={row.status === "active" ? "Desativar" : "Ativar"}
                          >
                            <span
                              className={cn(
                                "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                                row.status === "active" ? "translate-x-4.5" : "translate-x-0.5"
                              )}
                            />
                          </button>
                        )}
                      </td>

                      {/* Nome do Item com Edição e Drill-Down */}
                      <td className="py-2.5 px-3">
                        {editingNameId === row.id ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="bg-[#141824] border border-blue-500 rounded-lg px-2 py-1 text-xs text-white font-medium focus:outline-none w-full max-w-[220px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveName(row.id, activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad");
                                if (e.key === "Escape") setEditingNameId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveName(row.id, activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad")}
                              disabled={actionLoadingId === row.id}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Salvar Nome"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditingNameId(null)}
                              className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                              title="Cancelar"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 font-bold text-white group/name">
                            <div
                              onClick={() => {
                                if (activeTab === "accounts") handleSelectAccount(row.id);
                                else if (activeTab === "campaigns") handleSelectCampaign(row.id);
                                else if (activeTab === "adsets") handleSelectAdset(row.id);
                              }}
                              className="flex items-center gap-1.5 hover:text-blue-400 cursor-pointer transition-colors max-w-[230px]"
                            >
                              <span className="truncate font-medium" title={row.name}>
                                {row.name}
                              </span>
                              {activeTab !== "ads" && activeTab !== "accounts" && (
                                <ChevronRight size={12} className="text-zinc-600 group-hover/name:text-blue-400 transition-colors shrink-0" />
                              )}
                            </div>

                            {activeTab !== "accounts" && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/name:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingNameId(row.id);
                                    setEditNameValue(row.name);
                                  }}
                                  className="p-1 text-zinc-400 hover:text-blue-400 hover:bg-zinc-800 rounded transition-colors"
                                  title="Editar Nome"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDuplicate(row.id, activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad", (row as any).budget);
                                  }}
                                  className="p-1 text-zinc-400 hover:text-purple-400 hover:bg-zinc-800 rounded transition-colors"
                                  title="Duplicar"
                                >
                                  <Layers size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {row.account_name && activeTab !== "accounts" && (
                          <span className="text-[9px] text-zinc-500 block truncate max-w-[200px]">
                            {row.account_name}
                          </span>
                        )}
                      </td>

                      {/* Colunas Exclusivas da Aba Contas */}
                      {activeTab === "accounts" && (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-zinc-300">
                            {fmtBrl(row.cycle)}
                          </td>
                          <td className="py-2.5 px-2 font-mono text-zinc-400">
                            <span className="flex items-center gap-1">
                              <CreditCard size={11} className="text-zinc-500" />
                              {row.card}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                row.status === "Ativo" ? "text-emerald-400" : "text-zinc-500"
                              )}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-zinc-400">
                            {fmtBrl(row.historic_spent)}
                          </td>
                        </>
                      )}

                      {/* Colunas Exclusivas de Campanhas / Conjuntos / Anúncios */}
                      {activeTab !== "accounts" && (
                        <>
                          {/* Orçamento com Distinção Clara CBO vs ABO */}
                          <td className="py-2.5 px-2 text-right font-mono">
                            {isEditingBudget ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  value={editBudgetValue}
                                  onChange={(e) => setEditBudgetValue(e.target.value)}
                                  className="w-20 bg-zinc-800/80 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveBudget(row.id, activeTab === "campaigns" ? "campaign" : "adset");
                                    if (e.key === "Escape") setEditingBudgetId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveBudget(row.id, activeTab === "campaigns" ? "campaign" : "adset")}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                  <Check size={10} />
                                </button>
                                <button
                                  onClick={() => setEditingBudgetId(null)}
                                  className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5 group/b">
                                {/* Badge CBO ou ABO */}
                                <span
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                    row.budget_type?.includes("CBO") || row.is_cbo
                                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                      : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                  )}
                                  title={row.budget_type?.includes("CBO") || row.is_cbo ? "Orçamento a nível de Campanha (CBO/Advantage)" : "Orçamento a nível de Conjunto (ABO)"}
                                >
                                  {row.budget_type?.includes("CBO") || row.is_cbo ? "CBO" : "ABO"}
                                </span>

                                <span className="font-bold text-white text-xs">
                                  {row.budget > 0 ? fmtBrl(row.budget) : (activeTab === "campaigns" && !row.is_cbo ? "Sob CJs" : "N/A")}
                                </span>

                                {/* Botão de Edição de Orçamento para CBO */}
                                {activeTab === "campaigns" && (row.is_cbo || row.budget_type?.includes("CBO")) && (
                                  <button
                                    onClick={() => {
                                      setEditingBudgetId(row.id);
                                      setEditBudgetValue(String(row.budget || ""));
                                    }}
                                    className="opacity-0 group-hover/b:opacity-100 p-0.5 text-zinc-400 hover:text-blue-400 transition-opacity"
                                    title="Editar Orçamento da Campanha"
                                  >
                                    <Edit2 size={10} />
                                  </button>
                                )}

                                {/* Se for campanha ABO, botão para abrir os CJs daquela campanha */}
                                {activeTab === "campaigns" && !row.is_cbo && (
                                  <button
                                    onClick={() => handleSelectCampaign(row.id)}
                                    className="opacity-0 group-hover/b:opacity-100 p-0.5 text-zinc-400 hover:text-purple-400 transition-opacity"
                                    title="Ver / Ajustar Orçamentos dos CJs desta campanha"
                                  >
                                    <LayoutGrid size={10} />
                                  </button>
                                )}

                                {/* Se for Adset (CJ), botão para editar seu orçamento individual */}
                                {activeTab === "adsets" && !row.is_cbo && (
                                  <button
                                    onClick={() => {
                                      setEditingBudgetId(row.id);
                                      setEditBudgetValue(String(row.budget || ""));
                                    }}
                                    className="opacity-0 group-hover/b:opacity-100 p-0.5 text-zinc-400 hover:text-blue-400 transition-opacity"
                                    title="Editar Orçamento deste Conjunto"
                                  >
                                    <Edit2 size={10} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Última Atualização */}
                          <td className="py-2.5 px-2 text-center text-zinc-400 font-mono text-[10px]">
                            {row.last_update}
                          </td>
                        </>
                      )}

                      {/* VENDAS */}
                      <td className="py-2.5 px-2 text-center font-medium text-zinc-200 font-mono">
                        {row.sales}
                      </td>

                      {/* CPA */}
                      <td className="py-2.5 px-2 text-right font-mono text-zinc-400">
                        {row.sales > 0 ? fmtBrl(row.cpa) : "N/A"}
                      </td>

                      {/* GASTOS */}
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-zinc-300">
                        {fmtBrl(row.spend)}
                      </td>

                      {/* FATURAMENTO */}
                      <td className="py-2.5 px-2 text-right font-mono font-medium text-zinc-200">
                        {fmtBrl(row.revenue)}
                      </td>

                      {/* LUCRO LÍQUIDO (Destaque em Verde / Vermelho) */}
                      <td className="py-2.5 px-2 text-right font-mono font-black">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded",
                            isPositiveProfit
                              ? "text-emerald-400 font-semibold"
                              : "text-rose-400 font-semibold"
                          )}
                        >
                          {row.profit >= 0 ? `+${fmtBrl(row.profit)}` : fmtBrl(row.profit)}
                        </span>
                      </td>

                      {/* ROAS */}
                      <td className="py-2.5 px-2 text-center font-mono font-bold">
                        <span
                          className={cn(
                            isPositiveRoas
                              ? "text-blue-400"
                              : row.roas > 0
                              ? "text-amber-400"
                              : "text-zinc-500"
                          )}
                        >
                          {row.roas.toFixed(2)}
                        </span>
                      </td>

                      {/* MARGEM */}
                      <td className="py-2.5 px-2 text-center font-mono text-zinc-400">
                        <span className={row.margin >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {row.margin.toFixed(2)}%
                        </span>
                      </td>

                      {/* ROI */}
                      <td className="py-2.5 px-2 text-center font-mono text-zinc-400">
                        {row.roi.toFixed(2)}
                      </td>

                      {/* IC (InitiateCheckout) */}
                      <td className="py-2.5 px-2 text-center font-mono text-amber-400 font-bold">
                        {row.ic}
                      </td>

                      {/* CPI (Custo por IC) */}
                      <td className="py-2.5 px-2 text-right pr-4 font-mono text-zinc-400">
                        {row.ic > 0 ? fmtBrl(row.cpi) : "N/A"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-xs">Nenhum registro encontrado para os filtros selecionados.</p>
                      {(selectedCampaignId || selectedAdsetId) && (
                        <button
                          onClick={() => {
                            setSelectedCampaignId(null);
                            setSelectedAdsetId(null);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-semibold border border-blue-500/30 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <X size={12} />
                          <span>Limpar filtros e ver tudo em {activeTab === "campaigns" ? "Campanhas" : activeTab === "adsets" ? "Conjuntos" : "Anúncios"}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {/* ── 4. Linha de Rodapé Fixada (Totais Gerais) ──────────────── */}
            <tfoot className="bg-[#141824] text-zinc-200 font-bold border-t-2 border-zinc-700 font-mono text-[10px]">
              <tr>
                <td className="py-3 px-3 text-center">N/A</td>
                <td className="py-3 px-2 text-center">N/A</td>
                <td className="py-3 px-3 uppercase text-blue-400">
                  {totals.count} {activeTab === "accounts" ? "CONTAS" : activeTab === "campaigns" ? "CAMPANHAS" : activeTab === "adsets" ? "CONJUNTOS" : "ANÚNCIOS"}
                </td>

                {activeTab === "accounts" && (
                  <>
                    <td className="py-3 px-2 text-right text-zinc-300">{fmtBrl(totals.cycle)}</td>
                    <td className="py-3 px-2">N/A</td>
                    <td className="py-3 px-2 text-center">N/A</td>
                    <td className="py-3 px-2 text-right text-zinc-300">{fmtBrl(totals.historicSpent)}</td>
                  </>
                )}

                {activeTab !== "accounts" && (
                  <>
                    <td className="py-3 px-2 text-right text-zinc-300">R$ 0,00</td>
                    <td className="py-3 px-2 text-center">N/A</td>
                  </>
                )}

                <td className="py-3 px-2 text-center text-white">{totals.sales}</td>
                <td className="py-3 px-2 text-right text-zinc-300">{fmtBrl(totals.cpa)}</td>
                <td className="py-3 px-2 text-right text-white">{fmtBrl(totals.spend)}</td>
                <td className="py-3 px-2 text-right text-purple-400">{fmtBrl(totals.revenue)}</td>
                <td className="py-3 px-2 text-right font-black">
                  <span className={totals.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {totals.profit >= 0 ? `+${fmtBrl(totals.profit)}` : fmtBrl(totals.profit)}
                  </span>
                </td>
                <td className="py-3 px-2 text-center text-blue-400">{totals.roas.toFixed(2)}</td>
                <td className="py-3 px-2 text-center">{totals.margin.toFixed(2)}%</td>
                <td className="py-3 px-2 text-center">{totals.roi.toFixed(2)}</td>
                <td className="py-3 px-2 text-center text-amber-400">{totals.ic}</td>
                <td className="py-3 px-2 text-right pr-4 text-zinc-300">{fmtBrl(totals.cpi)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {/* Modal de Duplicação */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B0E14] border border-blue-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setDuplicateModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Layers size={18} className="text-blue-500" />
              Duplicação Inteligente
            </h3>
            <p className="text-xs text-zinc-400 mb-5">
              Duplique {duplicateItemLevel === "campaign" ? "sua campanha" : duplicateItemLevel === "adset" ? "seu conjunto" : "seu anúncio"} em massa e aplique um novo orçamento automaticamente.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Quantidade de Cópias
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={duplicateCopies}
                  onChange={(e) => setDuplicateCopies(e.target.value)}
                  className="w-full bg-[#121622] border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {(duplicateItemLevel === "campaign" || duplicateItemLevel === "adset") && (
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Novo Orçamento Diário (Opcional)
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Manter original"
                      value={duplicateNewBudget}
                      onChange={(e) => setDuplicateNewBudget(e.target.value)}
                      className="w-full bg-[#121622] border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Deixe em branco para manter o orçamento original.</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDuplicateModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-zinc-800 text-zinc-300 font-bold text-sm hover:bg-zinc-800/50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDuplicate}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                Duplicar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Orçamento em Massa */}
      {bulkBudgetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B0E14] border border-blue-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setBulkBudgetModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <DollarSign size={18} className="text-blue-500" />
              Orçamento em Massa
            </h3>
            <p className="text-xs text-zinc-400 mb-5">
              Altere o orçamento diário de {selectedRowIds.length} {activeTab === "campaigns" ? "campanhas" : "conjuntos"} ao mesmo tempo.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Novo Orçamento Diário
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 50.00"
                    value={bulkBudgetValue}
                    onChange={(e) => setBulkBudgetValue(e.target.value)}
                    className="w-full bg-[#121622] border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setBulkBudgetModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-zinc-800 text-zinc-300 font-bold text-sm hover:bg-zinc-800/50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBulkBudget}
                disabled={isBulkActionRunning}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isBulkActionRunning ? "Aplicando..." : "Aplicar Orçamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
