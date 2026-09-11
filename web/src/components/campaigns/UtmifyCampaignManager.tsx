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
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ShieldAlert
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

export interface BudgetHistorySnapshot {
  previous_budget: number | null;
  new_budget: number | null;
  sales: number | null;
  revenue: number | null;
  spend: number | null;
  profit: number | null;
  roas: number | null;
  cpa: number | null;
  user_email: string | null;
  source: string;
  metadata?: any;
  updated_at: string;
}

export interface CampaignItem {
  id: string;
  name: string;
  account_id: string;
  account_name: string;
  status: "active" | "paused";
  effective_status?: string;
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
  budget_history?: BudgetHistorySnapshot | null;
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
  budget_history?: BudgetHistorySnapshot | null;
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
  onRefresh: (selectedCampId?: string | null, selectedAsId?: string | null) => Promise<void> | void;
  onLoadAdsets?: (campaignId: string) => Promise<void>;
  onLoadAds?: (adsetId: string) => Promise<void>;
  isRefreshing?: boolean;
  apiError?: string | null;
  entityErrors?: Record<string, string>;
  lastUpdatedAt?: Date | string | null;
}

const POST_DUPLICATION_SYNC_STEPS = [
  { step: 1, label: "Duplicação confirmada" },
  { step: 2, label: "Buscando nova campanha" },
  { step: 3, label: "Sincronizando dados" },
  { step: 4, label: "Finalizando atualização" },
] as const;

const DUPLICATION_STEPS = [
  { step: 1, label: "Validando conexão Meta" },
  { step: 2, label: "Buscando campanha original" },
  { step: 3, label: "Criando campanha" },
  { step: 4, label: "Criando conjuntos de anúncios" },
  { step: 5, label: "Criando anúncios" },
  { step: 6, label: "Validando duplicação" },
  { step: 7, label: "Finalizando auditoria" },
] as const;

export function UtmifyCampaignManager({
  accounts = [],
  campaigns = [],
  adsets = [],
  ads = [],
  untrackedSalesCount = 0,
  datePreset,
  setDatePreset,
  onRefresh,
  onLoadAdsets,
  onLoadAds,
  isRefreshing = false,
  apiError = null,
  entityErrors = {},
  lastUpdatedAt = null,
}: UtmifyCampaignManagerProps) {
  const { activeStore } = useStore();

  // Estado do Loading Discreto para Lazy Loading (Regra 7)
  const [loadingHierarchyText, setLoadingHierarchyText] = useState<string | null>(null);

  // Estado da Aba Ativa
  const [activeTab, setActiveTab] = useState<TabType>("accounts");

  // ── Árvore Hierárquica (Fonte de Verdade para Filtro de Navegação) ──
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<string[]>([]);
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([]);

  // ── Foco Visual / Breadcrumb (Preservados conforme Regra 1) ──
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(null);

  // Erro semântico da Meta Ads para a entidade atualmente selecionada (Fase 3)
  const currentEntityError = useMemo(() => {
    if (activeTab === "adsets") {
      const campId = selectedCampaignId || (selectedCampaignIds.length === 1 ? selectedCampaignIds[0] : null);
      if (campId && entityErrors?.[campId]) {
        return { entityId: campId, type: "campaign" as const, message: entityErrors[campId] };
      }
    } else if (activeTab === "ads") {
      const asId = selectedAdsetId || (selectedAdsetIds.length === 1 ? selectedAdsetIds[0] : null);
      if (asId && entityErrors?.[asId]) {
        return { entityId: asId, type: "adset" as const, message: entityErrors[asId] };
      }
    }
    return null;
  }, [activeTab, selectedCampaignId, selectedCampaignIds, selectedAdsetId, selectedAdsetIds, entityErrors]);

  // Filtros de Barra Superior
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterAccountSelect, setFilterAccountSelect] = useState("all");

  // Seleção múltipla
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState<string>("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "active" | "paused">>({});

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
  const [duplicateFullClone, setDuplicateFullClone] = useState<boolean>(true);
  const [duplicateActivateAfter, setDuplicateActivateAfter] = useState<boolean>(true);
  const [duplicationPhase, setDuplicationPhase] = useState<"configure" | "loading" | "success" | "error">("configure");
  const [duplicationStepIndex, setDuplicationStepIndex] = useState<number>(0);
  const [duplicationErrorInline, setDuplicationErrorInline] = useState<string | null>(null);
  const [duplicationResult, setDuplicationResult] = useState<{
    new_campaign_id?: string | null;
    status?: string | null;
    activated_at?: string | null;
    adsets_count?: number;
    ads_count?: number;
    duration_ms?: number;
    failed_step?: string;
    error_message?: string;
    error_code?: string | number;
    rollback_occurred?: boolean;
  } | null>(null);
  const [syncingAfterDuplication, setSyncingAfterDuplication] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncedCampaignId, setSyncedCampaignId] = useState<string | null>(null);
  const [syncStepIndex, setSyncStepIndex] = useState<number>(0);

  // Identificação exclusiva por new_campaign_id retornado pela duplicação (Regra 2)
  const createdSyncedCampaign = useMemo(() => {
    if (!duplicationResult?.new_campaign_id) return null;
    return campaigns.find((c) => c.id === duplicationResult.new_campaign_id) || null;
  }, [campaigns, duplicationResult?.new_campaign_id]);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [bulkBudgetModalOpen, setBulkBudgetModalOpen] = useState(false);
  const [bulkBudgetValue, setBulkBudgetValue] = useState("");
  const [mobileViewMode, setMobileViewMode] = useState<"cards" | "table">("cards");

  // ── Navegação & Drill-Down (Atualiza Árvore Hierárquica + Foco Visual) ──

  const handleSelectAccount = (accId: string) => {
    setSelectedAccountIds([accId]);
    setSelectedAccountId(accId);
    setSelectedCampaignIds([]);
    setSelectedCampaignId(null);
    setSelectedAdsetIds([]);
    setSelectedAdsetId(null);
    setSelectedAdIds([]);
    setSelectedRowIds([]);
    setSearchTerm("");
    setActiveTab("campaigns");
  };

  const handleSelectCampaign = async (campId: string) => {
    setSelectedCampaignIds([campId]);
    setSelectedCampaignId(campId);
    setSelectedAdsetIds([]);
    setSelectedAdsetId(null);
    setSelectedAdIds([]);
    setSelectedRowIds([]);
    setSearchTerm("");
    setActiveTab("adsets");

    // Lazy Loading sob demanda: se os adsets desta campanha ainda não foram carregados
    if (onLoadAdsets && !adsets.some((as) => as.campaign_id === campId)) {
      setLoadingHierarchyText("Carregando conjuntos...");
      try {
        await onLoadAdsets(campId);
      } finally {
        setLoadingHierarchyText(null);
      }
    }
  };

  const handleSelectAdset = async (adsetId: string) => {
    setSelectedAdsetIds([adsetId]);
    setSelectedAdsetId(adsetId);
    setSelectedAdIds([]);
    setSelectedRowIds([]);
    setSearchTerm("");
    setActiveTab("ads");

    // Lazy Loading sob demanda: se os ads deste adset ainda não foram carregados
    if (onLoadAds && !ads.some((ad) => ad.adset_id === adsetId)) {
      setLoadingHierarchyText("Carregando anúncios...");
      try {
        await onLoadAds(adsetId);
      } finally {
        setLoadingHierarchyText(null);
      }
    }
  };

  // ── Remoção em Cascata de Filtros Hierárquicos ───────────────────────────

  const removeAccountFromFilter = (accId: string) => {
    setSelectedAccountIds(prev => prev.filter(id => id !== accId));
    if (selectedAccountId === accId) setSelectedAccountId(null);
    
    // Remove campanhas dessa conta
    const campsOfAcc = campaigns.filter(c => c.account_id === accId).map(c => c.id);
    setSelectedCampaignIds(prev => prev.filter(id => !campsOfAcc.includes(id)));
    if (selectedCampaignId && campsOfAcc.includes(selectedCampaignId)) setSelectedCampaignId(null);

    // Remove adsets dessa conta
    const adsetsOfAcc = adsets.filter(as => as.account_id === accId || campsOfAcc.includes(as.campaign_id)).map(as => as.id);
    setSelectedAdsetIds(prev => prev.filter(id => !adsetsOfAcc.includes(id)));
    if (selectedAdsetId && adsetsOfAcc.includes(selectedAdsetId)) setSelectedAdsetId(null);

    // Remove ads dessa conta
    const adsOfAcc = ads.filter(ad => ad.account_id === accId || campsOfAcc.includes(ad.campaign_id) || adsetsOfAcc.includes(ad.adset_id)).map(ad => ad.id);
    setSelectedAdIds(prev => prev.filter(id => !adsOfAcc.includes(id)));
  };

  const removeCampaignFromFilter = (campId: string) => {
    setSelectedCampaignIds(prev => prev.filter(id => id !== campId));
    if (selectedCampaignId === campId) setSelectedCampaignId(null);

    // Remove adsets dessa campanha
    const adsetsOfCamp = adsets.filter(as => as.campaign_id === campId).map(as => as.id);
    setSelectedAdsetIds(prev => prev.filter(id => !adsetsOfCamp.includes(id)));
    if (selectedAdsetId && adsetsOfCamp.includes(selectedAdsetId)) setSelectedAdsetId(null);

    // Remove ads dessa campanha
    const adsOfCamp = ads.filter(ad => ad.campaign_id === campId || adsetsOfCamp.includes(ad.adset_id)).map(ad => ad.id);
    setSelectedAdIds(prev => prev.filter(id => !adsOfCamp.includes(id)));
  };

  const removeAdsetFromFilter = (adsetId: string) => {
    setSelectedAdsetIds(prev => prev.filter(id => id !== adsetId));
    if (selectedAdsetId === adsetId) setSelectedAdsetId(null);

    // Remove ads desse adset
    const adsOfAdset = ads.filter(ad => ad.adset_id === adsetId).map(ad => ad.id);
    setSelectedAdIds(prev => prev.filter(id => !adsOfAdset.includes(id)));
  };

  const clearAllHierarchicalFilters = () => {
    setSelectedAccountIds([]);
    setSelectedAccountId(null);
    setSelectedCampaignIds([]);
    setSelectedCampaignId(null);
    setSelectedAdsetIds([]);
    setSelectedAdsetId(null);
    setSelectedAdIds([]);
  };

  // ── Ação de Toggle Switch (Play/Pause) ───────────────────────────────────

  const handleToggleStatus = async (id: string, currentStatus: "active" | "paused" | string, level: "campaign" | "adset" | "ad") => {
    const currentResolved = statusOverrides[id] ?? (String(currentStatus).toLowerCase() === "active" ? "active" : "paused");
    const nextStatus = currentResolved === "active" ? "paused" : "active";
    const metaValue = nextStatus === "active" ? "ACTIVE" : "PAUSED";

    // Otimista: atualiza imediatamente na UI
    setStatusOverrides(prev => ({ ...prev, [id]: nextStatus }));
    setActionLoadingId(id);

    try {
      const res = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          level,
          action: "status",
          value: metaValue,
          store_id: activeStore?.id,
        }),
      });

      const d = await res.json();

      if (res.ok && d.ok) {
        onRefresh();
      } else {
        // Rollback do estado otimista se a Meta rejeitar
        setStatusOverrides(prev => ({ ...prev, [id]: currentResolved }));
        alert("Erro na Meta: " + (d.error || "Não foi possível alterar o status."));
      }
    } catch (e: any) {
      // Rollback do estado otimista em falha de conexão
      setStatusOverrides(prev => ({ ...prev, [id]: currentResolved }));
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
    
    // Otimista: reflete status imediatamente
    setStatusOverrides(prev => {
      const updated = { ...prev };
      selectedRowIds.forEach(id => {
        updated[id] = newStatus;
      });
      return updated;
    });

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
            value: newStatus === "active" ? "ACTIVE" : "PAUSED",
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
    setDuplicateFullClone(true);
    setDuplicationPhase("configure");
    setDuplicationStepIndex(0);
    setDuplicationErrorInline(null);
    setDuplicationResult(null);
    setDuplicateModalOpen(true);
  };

  const handleOpenBulkDuplicate = () => {
    if (selectedRowIds.length === 0) return;
    setDuplicateItemIds(selectedRowIds);
    setDuplicateItemLevel(activeTab as "campaign" | "adset" | "ad");
    setDuplicateCopies("1");
    setDuplicateNewBudget("");
    setDuplicateFullClone(true);
    setDuplicationPhase("configure");
    setDuplicationStepIndex(0);
    setDuplicationErrorInline(null);
    setDuplicationResult(null);
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
      setDuplicationErrorInline("A quantidade de cópias deve ser no mínimo 1.");
      return;
    }

    if (duplicateNewBudget && (isNaN(Number(duplicateNewBudget)) || Number(duplicateNewBudget) <= 0)) {
      setDuplicationErrorInline("O orçamento deve ser um número positivo.");
      return;
    }

    // Não fecha o modal: assume estado de progresso visual
    setDuplicationPhase("loading");
    setDuplicationStepIndex(0);
    setDuplicationErrorInline(null);
    setDuplicationResult(null);
    setIsBulkActionRunning(true);

    // Avanço progressivo real das etapas (1/7 até 7/7) durante a requisição
    let currentStep = 0;
    const stepTimer = setInterval(() => {
      currentStep++;
      if (currentStep < 7) {
        setDuplicationStepIndex(currentStep);
      }
    }, 900);

    let allOk = true;
    let lastData: any = null;
    let caughtError: any = null;

    try {
      const promises = duplicateItemIds.map(id => 
        fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level: duplicateItemLevel,
            action: "duplicate",
            duplication_mode: duplicateFullClone ? "FULL_CLONE" : "SIMPLE",
            source_action: "MANUAL_DUPLICATE",
            copies,
            newBudget: duplicateNewBudget ? Number(duplicateNewBudget) : null,
            store_id: activeStore?.id,
            activate_after_duplication: duplicateActivateAfter,
          }),
        })
      );
      
      const responses = await Promise.all(promises);
      clearInterval(stepTimer);
      
      for (const res of responses) {
        const data = await res.json();
        if (res.ok && data.ok) {
          lastData = data;
        } else {
          allOk = false;
          caughtError = data;
          break;
        }
      }

      if (allOk && lastData) {
        setDuplicationStepIndex(6); // 7/7
        const resInfo = lastData.results?.[0];
        const newCampId = (resInfo?.new_campaign_id || lastData.id || null) as string | null;

        // Inicia etapa pós-duplicação na UX da ATM (Regra 1: Estados internos reais)
        setSyncingAfterDuplication(true);
        setSyncedCampaignId(newCampId);
        setSyncStepIndex(0); // 1. Duplicação confirmada
        setSyncProgress(25);

        // 2. Buscando nova campanha
        await new Promise((r) => setTimeout(r, 450));
        setSyncStepIndex(1);
        setSyncProgress(50);

        // 3. Sincronizando dados (executa refresh para buscar dados frescos da Meta)
        setSyncStepIndex(2);
        setSyncProgress(75);
        try {
          await onRefresh();
        } catch (syncErr) {
          console.warn("[ATM Duplication] Falha no refresh pós-duplicação:", syncErr);
        }

        // 4. Finalizando atualização
        setSyncStepIndex(3);
        setSyncProgress(100);
        await new Promise((r) => setTimeout(r, 400));

        setSyncingAfterDuplication(false);
        setDuplicationPhase("success");

        setDuplicationResult({
          new_campaign_id: newCampId || "Criada",
          status: resInfo?.final_status || (duplicateActivateAfter ? "ACTIVE" : "PAUSED"),
          activated_at: resInfo?.activated_at || (duplicateActivateAfter ? new Date().toISOString() : null),
          adsets_count: resInfo?.adsets_count ?? (duplicateFullClone ? 1 : 0),
          ads_count: resInfo?.ads_count ?? (duplicateFullClone ? 1 : 0),
          duration_ms: resInfo?.duration_ms || resInfo?.job?.duration_ms,
        });

        setSelectedRowIds([]);
      } else {
        setSyncingAfterDuplication(false);
        setDuplicationPhase("error");
        const failedStepLabel = DUPLICATION_STEPS[currentStep < 7 ? currentStep : 6]?.label || "Processamento Meta";
        setDuplicationResult({
          failed_step: failedStepLabel,
          error_message: caughtError?.error || "A Meta recusou a duplicação de parte da hierarquia.",
          error_code: caughtError?.code || "META_API_ERROR",
          rollback_occurred: caughtError?.job?.status === "ROLLED_BACK" || true,
        });
      }
    } catch (e: any) {
      clearInterval(stepTimer);
      setSyncingAfterDuplication(false);
      setDuplicationPhase("error");
      const failedStepLabel = DUPLICATION_STEPS[currentStep < 7 ? currentStep : 6]?.label || "Processamento Meta";
      setDuplicationResult({
        failed_step: failedStepLabel,
        error_message: e.message || "Falha de comunicação ou tempo limite com o servidor.",
        error_code: "NETWORK_ERROR",
        rollback_occurred: true,
      });
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
          
          // Hierarquia: se selectedAccountIds possuir itens, filtra por elas. Se vazio, mostra todas.
          const matchAcc = selectedAccountIds.length === 0 || selectedAccountIds.includes(camp.account_id);
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
          
          // Hierarquia:
          // 1. Se selectedCampaignIds possuir itens: mostrar somente adsets dessas campanhas
          // 2. Se vazio, mas selectedAccountIds possuir itens: mostrar somente adsets das contas selecionadas
          // 3. Se vazio: mostrar todos
          let matchHierarchy = true;
          if (selectedCampaignIds.length > 0) {
            matchHierarchy = selectedCampaignIds.includes(as.campaign_id);
          } else if (selectedAccountIds.length > 0) {
            matchHierarchy = selectedAccountIds.includes(as.account_id);
          }

          const matchAccSelect = filterAccountSelect === "all" || as.account_id === filterAccountSelect;
          const matchName = asName.includes(term) || asId.includes(term);
          const matchStatus = statusFilter === "all" || as.status === statusFilter;
          return matchHierarchy && matchAccSelect && matchName && matchStatus;
        })
        .sort(sortByActiveProfit);
    }

    if (activeTab === "ads") {
      return ads
        .filter((ad) => {
          const adName = String(ad.name || "").toLowerCase();
          const adId = String(ad.id || "").toLowerCase();

          // Hierarquia:
          // 1. Se selectedAdsetIds possuir itens: mostrar somente ads desses conjuntos
          // 2. Senão, se selectedCampaignIds possuir itens: mostrar somente ads dessas campanhas
          // 3. Senão, se selectedAccountIds possuir itens: mostrar somente ads dessas contas
          // 4. Senão: mostrar todos
          let matchHierarchy = true;
          if (selectedAdsetIds.length > 0) {
            matchHierarchy = selectedAdsetIds.includes(ad.adset_id);
          } else if (selectedCampaignIds.length > 0) {
            matchHierarchy = selectedCampaignIds.includes(ad.campaign_id);
          } else if (selectedAccountIds.length > 0) {
            matchHierarchy = selectedAccountIds.includes(ad.account_id);
          }

          const matchAccSelect = filterAccountSelect === "all" || ad.account_id === filterAccountSelect;
          const matchName = adName.includes(term) || adId.includes(term);
          const matchStatus = statusFilter === "all" || ad.status === statusFilter;
          return matchHierarchy && matchAccSelect && matchName && matchStatus;
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
    selectedAccountIds,
    selectedCampaignIds,
    selectedAdsetIds,
    selectedAdIds,
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

  const selectedAccountObj = accounts.find((a) => (selectedAccountIds.length > 0 ? selectedAccountIds.includes(a.id) : a.id === selectedAccountId));
  const selectedCampaignObj = campaigns.find((c) => (selectedCampaignIds.length > 0 ? selectedCampaignIds.includes(c.id) : c.id === selectedCampaignId));
  const selectedAdsetObj = adsets.find((as) => (selectedAdsetIds.length > 0 ? selectedAdsetIds.includes(as.id) : as.id === selectedAdsetId));

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
            setSelectedRowIds([]);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "accounts"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <Folder size={14} className={activeTab === "accounts" ? "text-blue-400" : "text-zinc-500"} />
          <span>Contas</span>
          {selectedAccountIds.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearAllHierarchicalFilters();
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar seleção de contas"
            >
              {selectedAccountIds.length} selec. <X size={10} />
            </span>
          )}
        </button>

        {/* Tab 2: Campanhas */}
        <button
          onClick={() => {
            if (activeTab === "accounts" && selectedRowIds.length > 0) {
              setSelectedAccountIds([...selectedRowIds]);
              setSelectedAccountId(selectedRowIds[0]);
              setSelectedRowIds([]);
              setSearchTerm("");
            }
            setActiveTab("campaigns");
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "campaigns"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <Layers size={14} className={activeTab === "campaigns" ? "text-blue-400" : "text-zinc-500"} />
          <span>Campanhas</span>
          {selectedAccountIds.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearAllHierarchicalFilters();
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de conta"
            >
              {selectedAccountIds.length === 1 ? (selectedAccountObj?.name || "1 conta") : `${selectedAccountIds.length} contas`} <X size={10} />
            </span>
          )}
        </button>

        {/* Tab 3: CJs (Conjuntos de Anúncios) */}
        <button
          onClick={() => {
            if (activeTab === "campaigns" && selectedRowIds.length > 0) {
              const campIds = [...selectedRowIds];
              setSelectedCampaignIds(campIds);
              setSelectedCampaignId(campIds[0]);
              setSelectedRowIds([]);
              setSearchTerm("");
              if (onLoadAdsets) {
                campIds.forEach((cId) => {
                  if (!adsets.some((as) => as.campaign_id === cId)) {
                    setLoadingHierarchyText("Carregando conjuntos...");
                    onLoadAdsets(cId).finally(() => setLoadingHierarchyText(null));
                  }
                });
              }
            } else if (selectedCampaignId && onLoadAdsets && !adsets.some((as) => as.campaign_id === selectedCampaignId)) {
              setLoadingHierarchyText("Carregando conjuntos...");
              onLoadAdsets(selectedCampaignId).finally(() => setLoadingHierarchyText(null));
            }
            setActiveTab("adsets");
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "adsets"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <LayoutGrid size={14} className={activeTab === "adsets" ? "text-blue-400" : "text-zinc-500"} />
          <span>CJs</span>
          {selectedCampaignIds.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCampaignIds([]);
                setSelectedCampaignId(null);
                setSelectedAdsetIds([]);
                setSelectedAdsetId(null);
                setSelectedAdIds([]);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de campanhas"
            >
              {selectedCampaignIds.length === 1 ? (selectedCampaignObj?.name.slice(0, 15) || "1 camp.") : `${selectedCampaignIds.length} camps`} <X size={10} />
            </span>
          ) : selectedAccountIds.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearAllHierarchicalFilters();
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de contas"
            >
              {selectedAccountIds.length === 1 ? (selectedAccountObj?.name || "1 conta") : `${selectedAccountIds.length} contas`} <X size={10} />
            </span>
          ) : null}
        </button>

        {/* Tab 4: ADs (Criativos) */}
        <button
          onClick={() => {
            if (activeTab === "adsets" && selectedRowIds.length > 0) {
              const asIds = [...selectedRowIds];
              setSelectedAdsetIds(asIds);
              setSelectedAdsetId(asIds[0]);
              setSelectedRowIds([]);
              setSearchTerm("");
              if (onLoadAds) {
                asIds.forEach((asId) => {
                  if (!ads.some((ad) => ad.adset_id === asId)) {
                    setLoadingHierarchyText("Carregando anúncios...");
                    onLoadAds(asId).finally(() => setLoadingHierarchyText(null));
                  }
                });
              }
            } else if (selectedAdsetId && onLoadAds && !ads.some((ad) => ad.adset_id === selectedAdsetId)) {
              setLoadingHierarchyText("Carregando anúncios...");
              onLoadAds(selectedAdsetId).finally(() => setLoadingHierarchyText(null));
            }
            setActiveTab("ads");
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "ads"
              ? "bg-blue-500/10 text-blue-400 border-blue-500"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent"
          )}
        >
          <ImageIcon size={14} className={activeTab === "ads" ? "text-blue-400" : "text-zinc-500"} />
          <span>ADs</span>
          {selectedAdsetIds.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAdsetIds([]);
                setSelectedAdsetId(null);
                setSelectedAdIds([]);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de conjuntos"
            >
              {selectedAdsetIds.length === 1 ? (selectedAdsetObj?.name.slice(0, 15) || "1 CJ") : `${selectedAdsetIds.length} CJs`} <X size={10} />
            </span>
          ) : selectedCampaignIds.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCampaignIds([]);
                setSelectedCampaignId(null);
                setSelectedAdsetIds([]);
                setSelectedAdsetId(null);
                setSelectedAdIds([]);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de campanhas"
            >
              {selectedCampaignIds.length === 1 ? (selectedCampaignObj?.name.slice(0, 15) || "1 camp.") : `${selectedCampaignIds.length} camps`} <X size={10} />
            </span>
          ) : selectedAccountIds.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearAllHierarchicalFilters();
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1 hover:bg-blue-500/40"
              title="Limpar filtro de contas"
            >
              {selectedAccountIds.length === 1 ? (selectedAccountObj?.name || "1 conta") : `${selectedAccountIds.length} contas`} <X size={10} />
            </span>
          ) : null}
        </button>
      </div>

      {/* ── Loading Discreto de Hierarquia (Regra 7) ── */}
      {loadingHierarchyText && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium w-fit animate-pulse">
          <RotateCw size={13} className="animate-spin text-blue-400" />
          <span>{loadingHierarchyText}</span>
        </div>
      )}

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

            {selectedRowIds.length > 0 && activeTab === "accounts" && (
              <button
                onClick={() => {
                  setSelectedAccountIds([...selectedRowIds]);
                  setSelectedAccountId(selectedRowIds[0]);
                  setSelectedRowIds([]);
                  setSearchTerm("");
                  setActiveTab("campaigns");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-semibold text-xs border border-indigo-500/30 transition-all cursor-pointer"
                title="Filtrar campanhas das contas selecionadas"
              >
                <Layers size={13} />
                <span>Ver Campanhas ({selectedRowIds.length === 1 ? "1 conta" : `${selectedRowIds.length} contas`})</span>
              </button>
            )}

            {selectedRowIds.length > 0 && activeTab !== "accounts" && (
              <>
                {activeTab === "campaigns" && (
                  <button
                    onClick={() => {
                      setSelectedCampaignIds([...selectedRowIds]);
                      setSelectedCampaignId(selectedRowIds[0]);
                      setSelectedRowIds([]);
                      setSearchTerm("");
                      setActiveTab("adsets");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-semibold text-xs border border-indigo-500/30 transition-all cursor-pointer"
                    title="Filtrar conjuntos das campanhas selecionadas"
                  >
                    <LayoutGrid size={13} />
                    <span>Ver CJs ({selectedRowIds.length === 1 ? "1 camp." : `${selectedRowIds.length} camps.`})</span>
                  </button>
                )}

                {activeTab === "adsets" && (
                  <button
                    onClick={() => {
                      setSelectedAdsetIds([...selectedRowIds]);
                      setSelectedAdsetId(selectedRowIds[0]);
                      setSelectedRowIds([]);
                      setSearchTerm("");
                      setActiveTab("ads");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-semibold text-xs border border-indigo-500/30 transition-all cursor-pointer"
                    title="Filtrar anúncios dos conjuntos selecionados"
                  >
                    <ImageIcon size={13} />
                    <span>Ver ADs ({selectedRowIds.length === 1 ? "1 conj." : `${selectedRowIds.length} conjs.`})</span>
                  </button>
                )}

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
            <span className="text-xs text-zinc-400">
              {lastUpdatedAt
                ? `Atualizado às ${new Date(lastUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Atualizado agora"}
            </span>
            <button
              onClick={() => onRefresh(
                selectedCampaignId || (selectedCampaignIds.length === 1 ? selectedCampaignIds[0] : null),
                selectedAdsetId || (selectedAdsetIds.length === 1 ? selectedAdsetIds[0] : null)
              )}
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
                      (() => {
                        const isRowActive = (statusOverrides[row.id] ?? (String(row.status).toLowerCase() === "active" ? "active" : "paused")) === "active";
                        return (
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
                              isRowActive ? "bg-emerald-500" : "bg-zinc-700",
                              actionLoadingId === row.id && "opacity-50 animate-pulse"
                            )}
                            title={isRowActive ? "Pausar" : "Ativar"}
                          >
                            <span
                              className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                isRowActive ? "translate-x-4.5" : "translate-x-0.5"
                              )}
                            />
                          </button>
                        );
                      })()
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
          <div className="p-8 text-center bg-[#11141E] border border-zinc-800/80 rounded-2xl text-zinc-400 text-xs space-y-3">
            {currentEntityError ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                  <AlertTriangle size={15} />
                  <span>Falha ao consultar a Meta Ads</span>
                </div>
                <p className="text-zinc-400 text-xs">{currentEntityError.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (currentEntityError.type === "campaign" && onLoadAdsets) {
                      onLoadAdsets(currentEntityError.entityId);
                    } else if (currentEntityError.type === "adset" && onLoadAds) {
                      onLoadAds(currentEntityError.entityId);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCw size={12} />
                  <span>Tentar novamente</span>
                </button>
              </div>
            ) : (
              <>
                <p>
                  {activeTab === "adsets" && (selectedCampaignId || selectedCampaignIds.length === 1)
                    ? "Esta campanha não possui conjuntos de anúncios."
                    : activeTab === "ads" && (selectedAdsetId || selectedAdsetIds.length === 1)
                    ? "Este conjunto não possui anúncios."
                    : "Nenhum item encontrado com os filtros atuais."}
                </p>
                {(selectedCampaignIds.length > 0 || selectedAdsetIds.length > 0 || selectedAccountIds.length > 0 || selectedCampaignId || selectedAdsetId || selectedAccountId) && (
                  <button
                    type="button"
                    onClick={clearAllHierarchicalFilters}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/30 text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X size={12} />
                    <span>Limpar filtros hierárquicos</span>
                  </button>
                )}
              </>
            )}
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
                    <th className="py-3 px-2 text-center min-w-[130px]">ÚLT. ATUALIZAÇÃO</th>
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
                          (() => {
                            const isRowActive = (statusOverrides[row.id] ?? (String(row.status).toLowerCase() === "active" ? "active" : "paused")) === "active";
                            return (
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
                                  isRowActive ? "bg-emerald-500" : "bg-zinc-600",
                                  actionLoadingId === row.id && "opacity-50 animate-pulse"
                                )}
                                title={isRowActive ? "Desativar" : "Ativar"}
                              >
                                <span
                                  className={cn(
                                    "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                                    isRowActive ? "translate-x-4.5" : "translate-x-0.5"
                                  )}
                                />
                              </button>
                            );
                          })()
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
                          <td className="py-2.5 px-2 text-center min-w-[130px]">
                            {(row as any).budget_history ? (
                              <div
                                className="inline-flex flex-col items-center justify-center text-center cursor-help group/hist"
                                title={`Alterado em: ${new Date((row as any).budget_history.updated_at).toLocaleString("pt-BR")}\nResponsável: ${(row as any).budget_history.user_email || "ATM (Usuário)"}\nOrçamento: R$ ${(row as any).budget_history.previous_budget !== null ? (row as any).budget_history.previous_budget.toFixed(2) : "N/A"} ➔ R$ ${(row as any).budget_history.new_budget?.toFixed(2)}\n${(row as any).budget_history.sales !== null ? `Métricas no momento da alteração:\n• ROAS: ${Number((row as any).budget_history.roas || 0).toFixed(2)}x\n• Vendas: ${(row as any).budget_history.sales}\n• CPA: ${fmtBrl((row as any).budget_history.cpa || 0)}\n• Faturamento: ${fmtBrl((row as any).budget_history.revenue || 0)}\n• Lucro Líquido: ${fmtBrl((row as any).budget_history.profit || 0)}` : "Métricas detalhadas não disponíveis no snapshot"}`}
                              >
                                {/* Data / Hora */}
                                <span className="text-[10px] text-zinc-400 font-mono leading-tight">
                                  {new Date((row as any).budget_history.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
                                  {new Date((row as any).budget_history.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>

                                {/* Orçamento: R$ X → R$ Y */}
                                <div className="flex items-center gap-1 font-mono text-[10.5px] font-bold mt-0.5">
                                  <span className="text-zinc-400">
                                    {(row as any).budget_history.previous_budget !== null ? `R$${Math.round((row as any).budget_history.previous_budget)}` : "—"}
                                  </span>
                                  <span className={Number((row as any).budget_history.new_budget) >= Number((row as any).budget_history.previous_budget) ? "text-emerald-400" : "text-amber-400"}>
                                    →
                                  </span>
                                  <span className={Number((row as any).budget_history.new_budget) >= Number((row as any).budget_history.previous_budget) ? "text-emerald-400 font-black" : "text-amber-400 font-black"}>
                                    R${Math.round((row as any).budget_history.new_budget)}
                                  </span>
                                </div>

                                {/* Performance: ROAS, Vendas, CPA */}
                                {(row as any).budget_history.sales !== null ? (
                                  <span className="text-[9.5px] font-mono text-zinc-400 mt-0.5">
                                    <strong className="text-blue-400">{Number((row as any).budget_history.roas || 0).toFixed(1)}x</strong> • {(row as any).budget_history.sales}v • {fmtBrl((row as any).budget_history.cpa || 0)}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                    {(row as any).budget_history.source}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400 font-mono text-[10px] block" title="Data reportada pela Meta Ads">
                                {row.last_update}
                              </span>
                            )}
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
                      {currentEntityError ? (
                        <div className="space-y-2 flex flex-col items-center">
                          <div className="inline-flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                            <AlertTriangle size={15} />
                            <span>Falha temporária ao consultar a Meta Ads</span>
                          </div>
                          <p className="text-xs text-zinc-400 max-w-md">{currentEntityError.message}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (currentEntityError.type === "campaign" && onLoadAdsets) {
                                onLoadAdsets(currentEntityError.entityId);
                              } else if (currentEntityError.type === "adset" && onLoadAds) {
                                onLoadAds(currentEntityError.entityId);
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCw size={12} />
                            <span>Tentar novamente</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs">
                            {activeTab === "adsets" && (selectedCampaignId || selectedCampaignIds.length === 1)
                              ? "Esta campanha não possui conjuntos de anúncios."
                              : activeTab === "ads" && (selectedAdsetId || selectedAdsetIds.length === 1)
                              ? "Este conjunto não possui anúncios."
                              : "Nenhum registro encontrado para os filtros selecionados."}
                          </p>
                          {(selectedCampaignIds.length > 0 || selectedAdsetIds.length > 0 || selectedAccountIds.length > 0 || selectedCampaignId || selectedAdsetId || selectedAccountId) && (
                            <button
                              onClick={clearAllHierarchicalFilters}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-semibold border border-blue-500/30 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <X size={12} />
                              <span>Limpar filtros e ver tudo em {activeTab === "campaigns" ? "Campanhas" : activeTab === "adsets" ? "Conjuntos" : activeTab === "ads" ? "Anúncios" : "Contas"}</span>
                            </button>
                          )}
                        </>
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
      {/* Modal de Duplicação Inteligente */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0B0E14] border border-blue-500/20 rounded-2xl p-6 sm:p-7 w-full max-w-lg shadow-2xl shadow-blue-500/10 relative transition-all">
            
            {/* Botão Fechar (apenas fora do loading e do sync para evitar interrupções) */}
            {duplicationPhase !== "loading" && !syncingAfterDuplication && (
              <button
                onClick={() => {
                  setDuplicateModalOpen(false);
                  setDuplicationPhase("configure");
                  setDuplicationResult(null);
                  setSyncingAfterDuplication(false);
                  setSyncedCampaignId(null);
                }}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            )}

            {/* FASE 1: CONFIGURAÇÃO */}
            {duplicationPhase === "configure" && (
              <>
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Layers size={18} className="text-blue-500" />
                  Duplicação de Campanha Meta Ads
                </h3>
                <p className="text-xs text-zinc-400 mb-5">
                  Configure a duplicação hierárquica. Novas entidades serão geradas como <span className="text-amber-400 font-semibold">PAUSADAS</span>.
                </p>

                {duplicationErrorInline && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={15} className="shrink-0 text-rose-400" />
                    <span>{duplicationErrorInline}</span>
                  </div>
                )}

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

                  {duplicateItemLevel === "campaign" && (
                    <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={duplicateFullClone}
                          onChange={(e) => setDuplicateFullClone(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                            Ativar cópias de campanhas, conjuntos de anúncios e anúncios
                          </span>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                            {duplicateFullClone
                              ? "FULL_CLONE: Clona 100% da árvore (Campanha → Conjuntos → Anúncios → Criativos, Pixel e UTMs)."
                              : "SIMPLE: Clona somente o container da campanha."}
                          </p>
                        </div>
                      </label>

                      {/* Checkbox: Ativar campanha após duplicação (Default: true) */}
                      <label className="flex items-start gap-3 cursor-pointer select-none group pt-2 border-t border-zinc-800/50">
                        <input
                          type="checkbox"
                          checked={duplicateActivateAfter}
                          onChange={(e) => setDuplicateActivateAfter(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                            Ativar campanha após duplicação
                            <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                              Recomendado ATM
                            </span>
                          </span>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                            Cria a árvore com segurança em PAUSED e ativa a veiculação automaticamente após a validação completa.
                          </p>
                        </div>
                      </label>
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
              </>
            )}

            {/* FASE 2: LOADING & PROGRESSO REAL DAS 7 ETAPAS */}
            {duplicationPhase === "loading" && (
              <div className="py-2 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400 shadow-lg shadow-blue-500/10">
                    <Loader2 size={28} className="animate-spin" />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Duplicando campanha...
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Este processo pode levar alguns segundos.
                  </p>
                </div>

                {/* Barra de Progresso Real: 1/7 a 7/7 */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-medium">
                      Etapa {duplicationStepIndex + 1} de 7
                    </span>
                    <span className="text-blue-400 font-bold">
                      {Math.round(((duplicationStepIndex + 1) / 7) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${((duplicationStepIndex + 1) / 7) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Checklist Visual das 7 Etapas */}
                <div className="bg-[#121622] border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
                  {DUPLICATION_STEPS.map((stepItem, idx) => {
                    const isPassed = idx < duplicationStepIndex;
                    const isCurrent = idx === duplicationStepIndex;
                    return (
                      <div
                        key={stepItem.step}
                        className={cn(
                          "flex items-center gap-2.5 text-xs transition-all",
                          isCurrent
                            ? "text-white font-semibold pl-1"
                            : isPassed
                            ? "text-zinc-400"
                            : "text-zinc-600"
                        )}
                      >
                        {isPassed ? (
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 size={15} className="animate-spin text-blue-400 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0 ml-0.5" />
                        )}
                        <span>{stepItem.label}</span>
                        {isCurrent && (
                          <span className="text-[10px] text-blue-400/80 ml-auto animate-pulse">
                            Processando...
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  disabled
                  className="w-full py-2.5 rounded-lg bg-blue-600/60 text-blue-200 font-bold text-sm cursor-not-allowed flex items-center justify-center gap-2 select-none"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Duplicando...
                </button>
              </div>
            )}

            {/* ETAPA PÓS-DUPLICAÇÃO: SINCRONIZANDO COM META ADS (Regra 1) */}
            {syncingAfterDuplication && (
              <div className="py-4 space-y-6 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400 shadow-lg shadow-blue-500/10">
                    <RotateCw size={28} className="animate-spin text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Sincronizando com Meta Ads...
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Garantindo que a nova campanha esteja pronta e atualizada na ATM.
                  </p>
                </div>

                {/* Barra de Progresso das Etapas Internas ATM */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-medium">Sincronização interna</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {syncStepIndex + 1}/{POST_DUPLICATION_SYNC_STEPS.length} ({syncProgress}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-800/80 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>
                </div>

                {/* Lista de Estados Internos da ATM */}
                <div className="space-y-2 bg-[#121622] p-4 rounded-xl border border-zinc-800">
                  {POST_DUPLICATION_SYNC_STEPS.map((stepItem, idx) => {
                    const isDone = syncStepIndex > idx;
                    const isCurrent = syncStepIndex === idx;
                    return (
                      <div
                        key={stepItem.step}
                        className={cn(
                          "flex items-center gap-3 text-xs py-1 transition-colors",
                          isDone
                            ? "text-emerald-400 font-medium"
                            : isCurrent
                            ? "text-blue-400 font-bold"
                            : "text-zinc-600"
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                        ) : isCurrent ? (
                          <Loader2 size={15} className="shrink-0 animate-spin text-blue-400" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0 ml-0.5" />
                        )}
                        <span>{stepItem.label}</span>
                        {isCurrent && (
                          <span className="text-[10px] text-blue-400/80 ml-auto animate-pulse">
                            Processando...
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* FASE 3: NOVA CAMPANHA DISPONÍVEL (Regra 2: Identificação exclusivamente por new_campaign_id) */}
            {duplicationPhase === "success" && !syncingAfterDuplication && (
              <div className="py-2 space-y-5 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Nova campanha disponível
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Hierarquia sincronizada com a Meta Ads e disponível na tabela da ATM.
                  </p>
                </div>

                {/* Card de Identificação Exclusiva da Campanha Criada */}
                <div className="bg-[#121622] border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="text-[11px] text-zinc-400 font-medium block">Nome da Campanha</span>
                      <p className="text-sm font-bold text-white truncate" title={createdSyncedCampaign?.name || "Campanha Clonada"}>
                        {createdSyncedCampaign?.name || "Campanha Clonada"}
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                      (createdSyncedCampaign?.effective_status || createdSyncedCampaign?.status || duplicationResult?.status) === "ACTIVE"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    )}>
                      {createdSyncedCampaign?.effective_status || createdSyncedCampaign?.status || duplicationResult?.status || "PAUSED"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">ID da Campanha</span>
                      <span className="font-mono text-zinc-300 font-medium text-[11px] select-all">
                        {duplicationResult?.new_campaign_id || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Origem</span>
                      <span className="text-blue-400 font-medium text-[11px]">
                        Duplicação ATM
                      </span>
                    </div>
                  </div>

                  {duplicationResult?.activated_at && (
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                      <span className="text-zinc-400 flex items-center gap-1.5 text-[11px]">
                        <Clock size={12} className="text-emerald-400" />
                        Hora de ativação
                      </span>
                      <span className="font-mono text-emerald-400 font-bold text-[11px]">
                        {new Date(duplicationResult.activated_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Grid Executivo de Resumo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#121622] border border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <span className="text-[11px] text-zinc-400 font-medium">Conjuntos Criados</span>
                    <p className="text-base font-bold text-white">
                      {duplicationResult?.adsets_count ?? 0}
                    </p>
                    <span className="text-[10px] text-zinc-500">Ad Sets vinculados</span>
                  </div>

                  <div className="bg-[#121622] border border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <span className="text-[11px] text-zinc-400 font-medium">Anúncios Criados</span>
                    <p className="text-base font-bold text-white">
                      {duplicationResult?.ads_count ?? 0}
                    </p>
                    <span className="text-[10px] text-zinc-500">Criativos replicados</span>
                  </div>
                </div>

                {duplicationResult?.duration_ms ? (
                  <div className="bg-[#121622] border border-zinc-800 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Clock size={13} className="text-zinc-500" />
                      Tempo de duplicação
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {(duplicationResult.duration_ms / 1000).toFixed(1)}s ({duplicationResult.duration_ms}ms)
                    </span>
                  </div>
                ) : null}

                <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
                  <Check size={16} className="text-emerald-400 shrink-0" />
                  <span>Pixel, eventos de conversão, UTMs e tracking specs preservados.</span>
                </div>

                <button
                  onClick={() => {
                    setDuplicateModalOpen(false);
                    setDuplicationPhase("configure");
                    setDuplicationResult(null);
                    setSyncingAfterDuplication(false);
                    setSyncedCampaignId(null);
                  }}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  <span>Concluir e Ver na Tabela</span>
                </button>
              </div>
            )}

            {/* FASE 4: ERRO & ROLLBACK SEGURO */}
            {duplicationPhase === "error" && (
              <div className="py-2 space-y-5 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 shadow-lg shadow-rose-500/10">
                    <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Falha na Duplicação da Campanha
                  </h3>
                  <p className="text-xs text-zinc-400">
                    A operação foi interrompida com segurança.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="bg-[#121622] border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Etapa da falha:</span>
                      <span className="font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-500/30">
                        {duplicationResult?.failed_step || "Processamento"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-1">Motivo:</span>
                      <p className="text-xs text-zinc-300 bg-zinc-900/80 p-2.5 rounded border border-zinc-800 leading-relaxed break-words">
                        {duplicationResult?.error_message || "Erro inesperado na Meta Graph API."}
                      </p>
                    </div>
                    {duplicationResult?.error_code && (
                      <div className="text-[10px] text-zinc-500">
                        Código do erro: <span className="font-mono text-zinc-400">{duplicationResult.error_code}</span>
                      </div>
                    )}
                  </div>

                  {duplicationResult?.rollback_occurred && (
                    <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                      <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-amber-200">Rollback Reversivo Executado:</span>
                        <p className="text-[11px] text-amber-400/90 leading-relaxed mt-0.5">
                          Todas as entidades criadas parcialmente foram removidas da Meta Graph API. Zero campanhas, conjuntos ou anúncios órfãos.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setDuplicateModalOpen(false)}
                    className="flex-1 py-2.5 rounded-lg border border-zinc-800 text-zinc-300 font-bold text-sm hover:bg-zinc-800/50 transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => {
                      setDuplicationPhase("configure");
                      setDuplicationResult(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    Tentar Novamente
                  </button>
                </div>
              </div>
            )}

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
