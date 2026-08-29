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
  untrackedSalesCount = 23,
  datePreset,
  setDatePreset,
  onRefresh,
  isRefreshing = false,
  apiError = null,
}: UtmifyCampaignManagerProps) {
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

  // Duplicação Modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateItemId, setDuplicateItemId] = useState<string | null>(null);
  const [duplicateItemLevel, setDuplicateItemLevel] = useState<"campaign" | "adset" | "ad" | null>(null);
  const [duplicateCopies, setDuplicateCopies] = useState<string>("1");
  const [duplicateNewBudget, setDuplicateNewBudget] = useState<string>("");

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

  // ── Ação de Alterar Orçamento ───────────────────────────────────────────

  const handleOpenDuplicate = (id: string, level: "campaign" | "adset" | "ad", currentBudget?: number) => {
    setDuplicateItemId(id);
    setDuplicateItemLevel(level);
    setDuplicateCopies("1");
    setDuplicateNewBudget(currentBudget && currentBudget > 0 ? String(currentBudget) : "");
    setDuplicateModalOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!duplicateItemId || !duplicateItemLevel) return;
    const copies = Number(duplicateCopies);
    if (isNaN(copies) || copies < 1) {
      alert("A quantidade de cópias deve ser no mínimo 1.");
      return;
    }

    setActionLoadingId(duplicateItemId);
    setDuplicateModalOpen(false);

    try {
      const res = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: duplicateItemId,
          level: duplicateItemLevel,
          action: "duplicate",
          copies: copies,
          newBudget: duplicateNewBudget ? Number(duplicateNewBudget) : null
        }),
      });

      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert("Erro na Meta: " + (d.error || "Não foi possível duplicar."));
      }
    } catch (e: any) {
      alert("Erro ao conectar: " + e.message);
    } finally {
      setActionLoadingId(null);
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

  // ── Filtragem dos Dados da Aba Atual ─────────────────────────────────────

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();

    if (activeTab === "accounts") {
      return accounts.filter((acc) => {
        const accName = String(acc.name || "").toLowerCase();
        const accId = String(acc.id || "").toLowerCase();
        const matchName = accName.includes(term) || accId.includes(term);
        const matchStatus = statusFilter === "all" || (statusFilter === "active" ? acc.status === "Ativo" : acc.status !== "Ativo");
        return matchName && matchStatus;
      });
    }

    if (activeTab === "campaigns") {
      return campaigns.filter((camp) => {
        const campName = String(camp.name || "").toLowerCase();
        const campId = String(camp.id || "").toLowerCase();
        const matchAcc = !selectedAccountId || camp.account_id === selectedAccountId;
        const matchAccSelect = filterAccountSelect === "all" || camp.account_id === filterAccountSelect;
        const matchName = campName.includes(term) || campId.includes(term);
        const matchStatus = statusFilter === "all" || camp.status === statusFilter;
        return matchAcc && matchAccSelect && matchName && matchStatus;
      });
    }

    if (activeTab === "adsets") {
      return adsets.filter((as) => {
        const asName = String(as.name || "").toLowerCase();
        const asId = String(as.id || "").toLowerCase();
        const matchCamp = !selectedCampaignId || as.campaign_id === selectedCampaignId;
        const matchAcc = !selectedAccountId || as.account_id === selectedAccountId;
        const matchAccSelect = filterAccountSelect === "all" || as.account_id === filterAccountSelect;
        const matchName = asName.includes(term) || asId.includes(term);
        const matchStatus = statusFilter === "all" || as.status === statusFilter;
        return matchCamp && matchAcc && matchAccSelect && matchName && matchStatus;
      });
    }

    if (activeTab === "ads") {
      return ads.filter((ad) => {
        const adName = String(ad.name || "").toLowerCase();
        const adId = String(ad.id || "").toLowerCase();
        const matchAdset = !selectedAdsetId || ad.adset_id === selectedAdsetId;
        const matchCamp = !selectedCampaignId || ad.campaign_id === selectedCampaignId;
        const matchAcc = !selectedAccountId || ad.account_id === selectedAccountId;
        const matchAccSelect = filterAccountSelect === "all" || ad.account_id === filterAccountSelect;
        const matchName = adName.includes(term) || adId.includes(term);
        const matchStatus = statusFilter === "all" || ad.status === statusFilter;
        return matchAdset && matchCamp && matchAcc && matchAccSelect && matchName && matchStatus;
      });
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
      {/* ── 1. Top Tabs Bar (Estilo UTMify PRO) ────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
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
          <span>ADs {selectedCampaignId || selectedAdsetId ? `de 1 campanha` : ""}</span>
          {selectedAdsetId && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAdsetId(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de conjunto"
            >
              {selectedAdsetObj?.name.slice(0, 15) || "1 conj."}... <X size={10} />
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
              <p className="font-bold text-amber-200">Aviso sobre Conexão Meta Ads:</p>
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
            <button className="p-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-white transition-colors" title="Colunas">
              <SlidersHorizontal size={14} />
            </button>

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

      {/* ── 3. Tabela Master de Alta Densidade ────────── */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
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

                      {/* Nome do Item com Drill-Down ao clicar */}
                      <td className="py-2.5 px-3">
                        <div
                          onClick={() => {
                            if (activeTab === "accounts") handleSelectAccount(row.id);
                            else if (activeTab === "campaigns") handleSelectCampaign(row.id);
                            else if (activeTab === "adsets") handleSelectAdset(row.id);
                          }}
                          className="flex items-center gap-1.5 font-bold text-white hover:text-blue-400 cursor-pointer transition-colors group/name"
                        >
                          <span className="truncate max-w-[240px] font-medium" title={row.name}>
                            {row.name}
                          </span>
                          {activeTab !== "ads" && activeTab !== "accounts" && (
                            <ChevronRight size={12} className="text-zinc-600 group-hover/name:text-blue-400 transition-colors shrink-0" />
                          )}
                          {activeTab !== "accounts" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDuplicate(row.id, activeTab === "campaigns" ? "campaign" : activeTab === "adsets" ? "adset" : "ad", (row as any).budget);
                              }}
                              className="opacity-0 group-hover/name:opacity-100 p-0.5 text-zinc-500 hover:text-blue-400 transition-opacity ml-1"
                              title="Duplicar"
                            >
                              <Layers size={12} />
                            </button>
                          )}
                        </div>
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
                          {/* Orçamento Editável Inline */}
                          <td className="py-2.5 px-2 text-right font-mono">
                            {isEditingBudget ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  value={editBudgetValue}
                                  onChange={(e) => setEditBudgetValue(e.target.value)}
                                  className="w-16 bg-zinc-800/40 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none"
                                  autoFocus
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
                              <div className="flex items-center justify-end gap-1 group/b">
                                <span className="text-[9px] text-zinc-500">{row.budget_type}</span>
                                <span className="font-bold text-white">
                                  {row.budget > 0 ? fmtBrl(row.budget) : "N/A"}
                                </span>
                                {row.budget > 0 && (
                                  <button
                                    onClick={() => {
                                      setEditingBudgetId(row.id);
                                      setEditBudgetValue(String(row.budget));
                                    }}
                                    className="opacity-0 group-hover/b:opacity-100 p-0.5 text-zinc-500 hover:text-blue-400 transition-opacity"
                                    title="Editar Orçamento"
                                  >
                                    <Edit2 size={9} />
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
                    Nenhum registro encontrado para os filtros selecionados.
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
    </div>
  );
}
