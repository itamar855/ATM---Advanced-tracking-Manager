"use client";

import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Trash2,
  Copy,
  Edit2,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info
} from "lucide-react";
import { useState } from "react";

interface Ad {
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

interface AdSet {
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

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  status: "active" | "paused" | "error";
  budgetType: "CBO" | "ABO";
  budget?: number; // CBO orçamento fica na campanha
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
}

export function CampaignTable({ campaigns: initialCampaigns }: CampaignTableProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdsets, setExpandedAdsets] = useState<Record<string, boolean>>({});
  
  // Controle de Seleção Multi-Nível
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdset = (id: string) => {
    setExpandedAdsets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Seleção individual
  const handleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Seleção de todos os itens visíveis
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds: string[] = [];
      campaigns.forEach((c) => {
        allIds.push(c.campaign_id);
        const adsets = c.adsets || getMockAdsets(c.campaign_id);
        adsets.forEach((as) => {
          allIds.push(as.id);
          as.ads.forEach((ad) => allIds.push(ad.id));
        });
      });
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  // Ações em massa e individuais
  const handleAction = async (action: string, ids: string[], value?: string) => {
    if (ids.length === 0) return;
    
    const confirmDelete = action === "delete" && !confirm(`Deseja realmente excluir os ${ids.length} itens selecionados?`);
    if (confirmDelete) return;

    setLoadingAction(`${action}-${ids.join(",")}`);
    try {
      // Mapeamento e disparo dinâmico
      const response = await fetch("/api/v1/meta/campaigns/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: "store-dummy",
          action,
          campaign_id: ids[0], // Envia o lote
          value,
          extra_ids: ids
        }),
      });

      const data = await response.json();
      if (data.ok) {
        alert(`${action.toUpperCase()} processado com sucesso para ${ids.length} itens.`);
        setSelectedIds([]);
      } else {
        alert("Erro ao realizar operação: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* Bulk actions header panel */}
      {selectedIds.length > 0 && (
        <div className="px-5 py-3.5 bg-[var(--color-brand-500)]/10 border-b border-[var(--color-brand-400)]/30 flex items-center justify-between fade-in">
          <div className="flex items-center gap-2 text-xs text-[var(--color-brand-300)] font-semibold">
            <Sparkles size={14} className="animate-pulse" />
            <span>{selectedIds.length} itens selecionados para edição em lote</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAction("activate", selectedIds)}
              className="btn-secondary py-1 px-2.5 text-[10px] gap-1 font-bold hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              <Play size={10} /> Ativar Lote
            </button>
            <button
              onClick={() => handleAction("pause", selectedIds)}
              className="btn-secondary py-1 px-2.5 text-[10px] gap-1 font-bold hover:bg-amber-500/10 hover:text-amber-400"
            >
              <Pause size={10} /> Pausar Lote
            </button>
            <button
              onClick={() => {
                const budget = prompt("Alterar orçamento diário em massa para (R$):");
                if (budget) handleAction("update_budget", selectedIds, budget);
              }}
              className="btn-secondary py-1 px-2.5 text-[10px] gap-1 font-bold hover:bg-cyan-500/10 hover:text-cyan-400"
            >
              <DollarSign size={10} /> Orçamento Lote
            </button>
            <button
              onClick={() => handleAction("delete", selectedIds)}
              className="btn-secondary py-1 px-2.5 text-[10px] gap-1 font-bold hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={10} /> Excluir Lote
            </button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Métricas e Orçamentos ABO / CBO
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Visualização de orçamentos consolidados e edição individual e em massa.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8 text-center">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-brand-400)] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                />
              </th>
              <th className="w-8"></th>
              <th>Nome</th>
              <th>Status</th>
              <th>Tipo Orçamento</th>
              <th className="text-right">Orçamento</th>
              <th className="text-right">Gasto</th>
              <th className="text-right">Receita</th>
              <th className="text-right">Lucro</th>
              <th className="text-right">ROAS</th>
              <th className="text-center w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const isExpanded = expandedCampaigns[campaign.campaign_id];
              const adsets = campaign.adsets || getMockAdsets(campaign.campaign_id);
              const isChecked = selectedIds.includes(campaign.campaign_id);

              return (
                <>
                  {/* Campaign Row */}
                  <tr key={campaign.campaign_id} className={cn("hover:bg-[var(--color-bg-card-hover)] transition-colors", isChecked && "bg-[var(--color-brand-500)]/5")}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleSelectId(campaign.campaign_id)}
                        className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-brand-400)] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                      />
                    </td>
                    <td>
                      <button onClick={() => toggleCampaign(campaign.campaign_id)} className="p-1">
                        {isExpanded ? <ChevronDown size={14} className="text-[var(--color-text-muted)]" /> : <ChevronRight size={14} className="text-[var(--color-text-muted)]" />}
                      </button>
                    </td>
                    <td className="font-semibold text-[var(--color-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[200px]">{campaign.campaign_name}</span>
                        <button
                          onClick={() => {
                            const newName = prompt("Mudar nome da campanha:", campaign.campaign_name);
                            if (newName) handleAction("rename", [campaign.campaign_id], newName);
                          }}
                          className="p-1 hover:text-[var(--color-brand-300)] text-[var(--color-text-muted)]"
                        >
                          <Edit2 size={10} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className={cn("badge text-[10px]", campaign.status === "active" ? "badge-success" : "badge-warning")}>
                        {campaign.status === "active" ? "Ativa" : "Pausada"}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] font-bold text-[var(--color-text-secondary)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">
                        {campaign.budgetType}
                      </span>
                    </td>
                    <td className="text-right font-medium text-[var(--color-text-primary)]">
                      {campaign.budgetType === "CBO" && campaign.budget ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span>R$ {campaign.budget.toLocaleString("pt-BR")}</span>
                          <button
                            onClick={() => {
                              const budget = prompt("Alterar orçamento CBO para:", String(campaign.budget));
                              if (budget) handleAction("update_budget", [campaign.campaign_id], budget);
                            }}
                            className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-brand-300)]"
                            title="Editar Orçamento"
                          >
                            <Edit2 size={10} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-muted)] italic">Sob ABO (Adset)</span>
                      )}
                    </td>
                    <td className="text-right font-medium">R$ {campaign.spend.toLocaleString("pt-BR")}</td>
                    <td className="text-right font-medium text-[var(--color-text-primary)]">R$ {campaign.revenue.toLocaleString("pt-BR")}</td>
                    <td className="text-right font-semibold">
                      <span className={campaign.profit >= 0 ? "text-[var(--color-success-400)]" : "text-[var(--color-danger-400)]"}>
                        R$ {campaign.profit.toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td className="text-right font-bold">{campaign.roas.toFixed(2)}x</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleAction(campaign.status === "active" ? "pause" : "activate", [campaign.campaign_id])}
                          className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                        >
                          {campaign.status === "active" ? <Pause size={10} /> : <Play size={10} />}
                        </button>
                        <button
                          onClick={() => handleAction("duplicate", [campaign.campaign_id])}
                          className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                        >
                          <Copy size={10} />
                        </button>
                        <button
                          onClick={() => handleAction("delete", [campaign.campaign_id])}
                          className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-red-500/20 text-[var(--color-text-secondary)] hover:text-red-400"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Adsets */}
                  {isExpanded &&
                    adsets.map((adset) => {
                      const isAdsetExpanded = expandedAdsets[adset.id];
                      const isAdsetChecked = selectedIds.includes(adset.id);
                      return (
                        <>
                          <tr key={adset.id} className={cn("bg-[var(--color-bg-secondary)]/50", isAdsetChecked && "bg-[var(--color-brand-500)]/5")}>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={isAdsetChecked}
                                onChange={() => handleSelectId(adset.id)}
                                className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-brand-400)] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                              />
                            </td>
                            <td></td>
                            <td className="pl-6 text-xs text-[var(--color-text-secondary)]">
                              <div className="flex items-center gap-2">
                                <button onClick={() => toggleAdset(adset.id)} className="p-1">
                                  {isAdsetExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                </button>
                                <span>📦 {adset.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="text-[10px] text-[var(--color-text-muted)] capitalize">{adset.status}</span>
                            </td>
                            <td>
                              <span className="text-[10px] text-[var(--color-text-muted)]">{campaign.budgetType}</span>
                            </td>
                            <td className="text-right text-xs font-medium text-[var(--color-text-primary)]">
                              {campaign.budgetType === "ABO" ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span>R$ {adset.budget.toLocaleString("pt-BR")}</span>
                                  <button
                                    onClick={() => {
                                      const budget = prompt("Alterar orçamento ABO para:", String(adset.budget));
                                      if (budget) handleAction("update_budget", [adset.id], budget);
                                    }}
                                    className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-brand-300)]"
                                  >
                                    <Edit2 size={8} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-[var(--color-text-muted)] italic">Sob CBO</span>
                              )}
                            </td>
                            <td className="text-right text-xs">R$ {adset.spend.toLocaleString("pt-BR")}</td>
                            <td className="text-right text-xs">R$ {adset.revenue.toLocaleString("pt-BR")}</td>
                            <td className="text-right text-xs font-semibold">
                              <span className={adset.profit >= 0 ? "text-[var(--color-success-400)]" : "text-[var(--color-danger-400)]"}>
                                R$ {adset.profit.toLocaleString("pt-BR")}
                              </span>
                            </td>
                            <td className="text-right text-xs">{adset.roas.toFixed(2)}x</td>
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleAction(adset.status === "active" ? "pause" : "activate", [adset.id])}
                                  className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                                >
                                  {adset.status === "active" ? <Pause size={10} /> : <Play size={10} />}
                                </button>
                                <button
                                  onClick={() => handleAction("delete", [adset.id])}
                                  className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-red-500/20 text-[var(--color-text-secondary)]"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Ads */}
                          {isAdsetExpanded &&
                            adset.ads.map((ad) => {
                              const isAdChecked = selectedIds.includes(ad.id);
                              return (
                                <tr key={ad.id} className={cn("bg-[var(--color-bg-primary)]/80 text-[var(--color-text-muted)]", isAdChecked && "bg-[var(--color-brand-500)]/5")}>
                                  <td className="text-center">
                                    <input
                                      type="checkbox"
                                      checked={isAdChecked}
                                      onChange={() => handleSelectId(ad.id)}
                                      className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-brand-400)] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                                    />
                                  </td>
                                  <td></td>
                                  <td className="pl-14 text-[11px]">
                                    <span>🖼️ {ad.name}</span>
                                  </td>
                                  <td>
                                    <span className="text-[9px] uppercase">{ad.status}</span>
                                  </td>
                                  <td>-</td>
                                  <td className="text-right text-[11px] italic">-</td>
                                  <td className="text-right text-[11px]">R$ {ad.spend.toLocaleString("pt-BR")}</td>
                                  <td className="text-right text-[11px]">R$ {ad.revenue.toLocaleString("pt-BR")}</td>
                                  <td className="text-right text-[11px] font-semibold text-emerald-500/80">R$ {ad.profit.toLocaleString("pt-BR")}</td>
                                  <td className="text-right text-[11px]">{ad.roas.toFixed(2)}x</td>
                                  <td className="text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => handleAction(ad.status === "active" ? "pause" : "activate", [ad.id])}
                                        className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                                      >
                                        {ad.status === "active" ? <Pause size={10} /> : <Play size={10} />}
                                      </button>
                                      <button
                                        onClick={() => handleAction("delete", [ad.id])}
                                        className="p-1 rounded bg-[var(--color-bg-elevated)] hover:bg-red-500/20 text-[var(--color-text-secondary)]"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </>
                      );
                    })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getMockAdsets(campaignId: string) {
  return [
    {
      id: `as1-${campaignId}`,
      name: "Conjunto 01 - Lookalike Compradores",
      status: "active" as const,
      budgetType: "CBO" as const,
      budget: 150,
      spend: 800,
      revenue: 4200,
      profit: 2600,
      roas: 5.25,
      conversions: 18,
      cpa: 44,
      ads: [
        {
          id: `ad1-${campaignId}`,
          name: "Criativo 01 - Imagem CBD Pote",
          status: "active" as const,
          spend: 500,
          revenue: 3000,
          profit: 1800,
          roas: 6.0,
          conversions: 12,
          cpa: 41,
        },
        {
          id: `ad2-${campaignId}`,
          name: "Criativo 02 - Video Explicativo Anvisa",
          status: "active" as const,
          spend: 300,
          revenue: 1200,
          profit: 800,
          roas: 4.0,
          conversions: 6,
          cpa: 50,
        },
      ],
    },
  ];
}
