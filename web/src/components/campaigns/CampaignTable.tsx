"use client";

import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Trash2,
  Copy,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Radio,
  FileText
} from "lucide-react";
import { useState, useEffect } from "react";

export interface Ad {
  id: string;
  name: string;
  status: "active" | "paused" | "error";
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  cpa: number;
}

export interface AdSet {
  id: string;
  name: string;
  status: "active" | "paused" | "error";
  budgetType: "ABO" | "CBO";
  budget: number;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  cpa: number;
  ads: Ad[];
}

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  status: "active" | "paused" | "error";
  budgetType: "CBO" | "ABO";
  budget?: number;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  cpa: number;
  healthScore?: number;
  adsets?: AdSet[];
}

interface CampaignTableProps {
  campaigns: Campaign[];
  accountCurrency?: string;
  onRefresh?: () => void;
}

export function CampaignTable({ campaigns: initialCampaigns, accountCurrency = "USD", onRefresh }: CampaignTableProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdsets, setExpandedAdsets] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Sincroniza sempre que a prop mudar
  useEffect(() => {
    setCampaigns(initialCampaigns);
  }, [initialCampaigns]);

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdset = (id: string) => {
    setExpandedAdsets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds: string[] = [];
      campaigns.forEach((c) => {
        allIds.push(c.campaign_id);
        (c.adsets || []).forEach((as) => {
          allIds.push(as.id);
          (as.ads || []).forEach((ad) => allIds.push(ad.id));
        });
      });
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleManage = async (
    id: string,
    level: "campaign" | "adset" | "ad",
    action: "status" | "budget" | "duplicate" | "delete",
    value?: any
  ) => {
    if (action === "delete" && !confirm("Tem certeza que deseja excluir este item no Meta Ads?")) {
      return;
    }

    setLoadingAction(`${action}-${id}`);

    try {
      const response = await fetch("/api/v1/meta/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          level,
          action,
          value,
          accountCurrency,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        if (onRefresh) onRefresh();
      } else {
        alert("Erro na Meta: " + (data.error || "Ação não processada"));
      }
    } catch (err: any) {
      alert("Erro ao executar ação: " + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBulkAction = async (action: "status" | "budget", value?: any) => {
    if (selectedIds.length === 0) return;
    setLoadingAction(`bulk-${action}`);

    try {
      for (const id of selectedIds) {
        await fetch("/api/v1/meta/campaigns/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            level: "campaign",
            action,
            value,
            accountCurrency,
          }),
        });
      }
      setSelectedIds([]);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert("Erro em lote: " + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="glass-card p-12 text-center flex flex-col items-center justify-center space-y-3">
        <Layers size={36} className="text-[var(--color-text-muted)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Nenhuma campanha encontrada nesta conta de anúncios
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
          Selecione outra conta de anúncios no seletor acima ou crie novas campanhas no Gerenciador do Meta Ads.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Painel de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="px-5 py-3.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between flex-wrap gap-2 fade-in">
          <div className="flex items-center gap-2 text-xs text-blue-300 font-semibold">
            <Sparkles size={14} className="animate-pulse" />
            <span>{selectedIds.length} item(ns) selecionado(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction("status", "active")}
              disabled={!!loadingAction}
              className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-500/30"
            >
              <Play size={11} /> Ativar em Lote
            </button>
            <button
              onClick={() => handleBulkAction("status", "paused")}
              disabled={!!loadingAction}
              className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 hover:bg-amber-500/30"
            >
              <Pause size={11} /> Pausar em Lote
            </button>
            <button
              onClick={() => {
                const b = prompt("Novo orçamento diário em R$ para os selecionados:");
                if (b) handleBulkAction("budget", Number(b));
              }}
              disabled={!!loadingAction}
              className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] font-bold flex items-center gap-1 hover:bg-blue-500/30"
            >
              <DollarSign size={11} /> Ajustar Orçamento
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8 text-center">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={selectedIds.length > 0 && selectedIds.length === campaigns.length}
                  className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="w-8"></th>
              <th>ESTRUTURA (CAMPANHA / CONJUNTO / ANÚNCIO)</th>
              <th>STATUS</th>
              <th>ORÇAMENTO</th>
              <th className="text-right">GASTO</th>
              <th className="text-right">RECEITA ATM</th>
              <th className="text-right">LUCRO</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">CONV. / CPA</th>
              <th className="text-center">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {campaigns.map((campaign) => {
              const isExpanded = expandedCampaigns[campaign.campaign_id];
              const isChecked = selectedIds.includes(campaign.campaign_id);
              const adsets = campaign.adsets || [];

              return (
                <div key={campaign.campaign_id} style={{ display: "contents" }}>
                  {/* Linha 1: CAMPANHA */}
                  <tr
                    className={cn(
                      "hover:bg-[var(--color-bg-card-hover)] transition-colors group",
                      isChecked && "bg-blue-500/5",
                      isExpanded && "bg-[var(--color-bg-surface)]/20"
                    )}
                  >
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleSelectId(campaign.campaign_id)}
                        className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td>
                      {adsets.length > 0 && (
                        <button
                          onClick={() => toggleCampaign(campaign.campaign_id)}
                          className="p-1 text-[var(--color-text-muted)] hover:text-white transition-colors"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                    <td className="font-bold text-[var(--color-text-primary)] text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">🎯</span>
                        <span className="truncate max-w-[280px]" title={campaign.campaign_name}>
                          {campaign.campaign_name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-[9px] font-bold rounded-full border uppercase",
                          campaign.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        )}
                      >
                        {campaign.status === "active" ? "Ativa" : "Pausada"}
                      </span>
                    </td>
                    <td className="text-xs font-mono">
                      <div className="flex items-center gap-1">
                        <span>{campaign.budget ? `R$ ${campaign.budget.toFixed(2)}` : "Sob Adset (ABO)"}</span>
                        {campaign.budget !== undefined && campaign.budget > 0 && (
                          <button
                            onClick={() => {
                              const b = prompt("Alterar orçamento diário da campanha (R$):", String(campaign.budget));
                              if (b) handleManage(campaign.campaign_id, "campaign", "budget", Number(b));
                            }}
                            className="text-zinc-500 hover:text-blue-400 p-0.5 text-[10px]"
                            title="Editar Orçamento"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-right text-xs font-semibold text-[var(--color-text-primary)]">
                      R$ {campaign.spend.toFixed(2)}
                    </td>
                    <td className="text-right text-xs font-bold text-purple-400">
                      R$ {campaign.revenue.toFixed(2)}
                    </td>
                    <td className="text-right text-xs font-bold">
                      <span className={campaign.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        R$ {campaign.profit.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right text-xs font-extrabold text-blue-400">
                      {campaign.roas.toFixed(2)}x
                    </td>
                    <td className="text-right text-xs text-[var(--color-text-muted)]">
                      <span className="font-bold text-[var(--color-text-primary)]">{campaign.conversions}</span> | R$ {campaign.cpa.toFixed(2)}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleManage(campaign.campaign_id, "campaign", "status", campaign.status === "active" ? "paused" : "active")}
                          className="p-1 rounded bg-[var(--color-bg-surface)] hover:bg-blue-500/20 text-[var(--color-text-secondary)] hover:text-blue-400"
                          title={campaign.status === "active" ? "Pausar Campanha" : "Ativar Campanha"}
                        >
                          {campaign.status === "active" ? <Pause size={12} className="text-amber-400" /> : <Play size={12} className="text-emerald-400" />}
                        </button>
                        <button
                          onClick={() => handleManage(campaign.campaign_id, "campaign", "duplicate")}
                          className="p-1 rounded bg-[var(--color-bg-surface)] hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400"
                          title="Duplicar Campanha"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleManage(campaign.campaign_id, "campaign", "delete")}
                          className="p-1 rounded bg-[var(--color-bg-surface)] hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                          title="Excluir Campanha"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Linha 2: CONJUNTOS DE ANÚNCIO (ADSETS) */}
                  {isExpanded &&
                    adsets.map((adset) => {
                      const isAdsetExpanded = expandedAdsets[adset.id];
                      const isAdsetChecked = selectedIds.includes(adset.id);
                      const ads = adset.ads || [];

                      return (
                        <div key={adset.id} style={{ display: "contents" }}>
                          <tr className={cn("bg-[var(--color-bg-surface)]/40 hover:bg-blue-500/5 transition-colors text-xs border-l-2 border-l-purple-500/40", isAdsetChecked && "bg-blue-500/10")}>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={isAdsetChecked}
                                onChange={() => handleSelectId(adset.id)}
                                className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer ml-2"
                              />
                            </td>
                            <td>
                              {ads.length > 0 && (
                                <button onClick={() => toggleAdset(adset.id)} className="p-1 text-[var(--color-text-muted)] hover:text-white ml-2">
                                  {isAdsetExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>
                              )}
                            </td>
                            <td className="pl-6 text-[var(--color-text-secondary)]">
                              <div className="flex items-center gap-2">
                                <span className="text-purple-400 text-xs">📂</span>
                                <span className="truncate max-w-[240px]" title={adset.name}>{adset.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className={cn("px-1.5 py-0.2 text-[8px] font-bold rounded border uppercase", adset.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
                                {adset.status === "active" ? "Ativo" : "Pausado"}
                              </span>
                            </td>
                            <td>
                              <div className="flex items-center gap-1">
                                <span>R$ {adset.budget > 0 ? adset.budget.toFixed(2) : "CBO"}</span>
                                <button
                                  onClick={() => {
                                    const b = prompt("Alterar orçamento diário do conjunto (R$):", String(adset.budget || "50"));
                                    if (b) handleManage(adset.id, "adset", "budget", Number(b));
                                  }}
                                  className="text-zinc-500 hover:text-purple-400 p-0.5 text-[10px]"
                                  title="Editar Orçamento do Conjunto"
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>
                            <td className="text-right text-xs font-medium text-[var(--color-text-primary)]">
                              R$ {adset.spend.toFixed(2)}
                            </td>
                            <td className="text-right text-xs font-semibold text-purple-400">
                              R$ {adset.revenue.toFixed(2)}
                            </td>
                            <td className="text-right text-xs font-semibold">
                              <span className={adset.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                R$ {adset.profit.toFixed(2)}
                              </span>
                            </td>
                            <td className="text-right text-xs font-bold text-blue-400">
                              {adset.roas.toFixed(2)}x
                            </td>
                            <td className="text-right text-xs text-[var(--color-text-muted)]">
                              {adset.conversions} | R$ {adset.cpa.toFixed(2)}
                            </td>
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleManage(adset.id, "adset", "status", adset.status === "active" ? "paused" : "active")}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                                  title={adset.status === "active" ? "Pausar Conjunto" : "Ativar Conjunto"}
                                >
                                  {adset.status === "active" ? <Pause size={11} className="text-amber-400" /> : <Play size={11} className="text-emerald-400" />}
                                </button>
                                <button
                                  onClick={() => handleManage(adset.id, "adset", "duplicate")}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-purple-400"
                                  title="Duplicar Conjunto"
                                >
                                  <Copy size={11} />
                                </button>
                                <button
                                  onClick={() => handleManage(adset.id, "adset", "delete")}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400"
                                  title="Excluir Conjunto"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Linha 3: ANÚNCIOS / ADS */}
                          {isAdsetExpanded &&
                            ads.map((ad) => {
                              const isAdChecked = selectedIds.includes(ad.id);
                              return (
                                <tr key={ad.id} className={cn("bg-[var(--color-bg-surface)]/70 hover:bg-blue-500/10 transition-colors text-[11px] border-l-2 border-l-cyan-500/40", isAdChecked && "bg-blue-500/15")}>
                                  <td className="text-center">
                                    <input
                                      type="checkbox"
                                      checked={isAdChecked}
                                      onChange={() => handleSelectId(ad.id)}
                                      className="rounded border-[var(--color-border-subtle)] text-blue-500 focus:ring-0 cursor-pointer ml-4"
                                    />
                                  </td>
                                  <td></td>
                                  <td className="pl-12 text-[var(--color-text-secondary)]">
                                    <div className="flex items-center gap-2">
                                      <span className="text-cyan-400">🎨</span>
                                      <span className="truncate max-w-[200px]" title={ad.name}>{ad.name}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className={cn("px-1.5 py-0.2 text-[8px] font-bold rounded border uppercase", ad.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
                                      {ad.status === "active" ? "Ativo" : "Pausado"}
                                    </span>
                                  </td>
                                  <td className="text-[10px] text-zinc-500 font-mono">Sob Conjunto</td>
                                  <td className="text-right font-normal text-[var(--color-text-primary)]">
                                    R$ {ad.spend.toFixed(2)}
                                  </td>
                                  <td className="text-right font-medium text-purple-400">
                                    R$ {ad.revenue.toFixed(2)}
                                  </td>
                                  <td className="text-right font-medium">
                                    <span className={ad.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                      R$ {ad.profit.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="text-right font-bold text-blue-400">
                                    {ad.roas.toFixed(2)}x
                                  </td>
                                  <td className="text-right text-[var(--color-text-muted)]">
                                    {ad.conversions} | R$ {ad.cpa.toFixed(2)}
                                  </td>
                                  <td className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleManage(ad.id, "ad", "status", ad.status === "active" ? "paused" : "active")}
                                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                                        title={ad.status === "active" ? "Pausar Anúncio" : "Ativar Anúncio"}
                                      >
                                        {ad.status === "active" ? <Pause size={10} className="text-amber-400" /> : <Play size={10} className="text-emerald-400" />}
                                      </button>
                                      <button
                                        onClick={() => handleManage(ad.id, "ad", "delete")}
                                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400"
                                        title="Excluir Anúncio"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
