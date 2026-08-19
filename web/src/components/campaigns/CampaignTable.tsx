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
  Plus,
  Loader2,
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

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdsets, setExpandedAdsets] = useState<Record<string, boolean>>({});
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdset = (id: string) => {
    setExpandedAdsets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = async (action: string, id: string, extra?: string) => {
    const confirmDelete = action === "delete" && !confirm("Deseja realmente excluir este item?");
    if (confirmDelete) return;

    setLoadingAction(`${action}-${id}`);
    try {
      const payload: any = {
        store_id: "store-dummy", // Substituído na chamada
        action,
        campaign_id: id,
      };

      if (action === "update_budget" || action === "rename") {
        payload.value = extra;
      }

      const response = await fetch("/api/v1/meta/campaigns/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.ok) {
        alert("Operação realizada com sucesso!");
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
      <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Performance de Campanhas, Conjuntos e Anúncios
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Controle de status, orçamentos, duplicações e P&L em tempo real
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Nome</th>
              <th>Status</th>
              <th className="text-right">Gasto</th>
              <th className="text-right">Receita</th>
              <th className="text-right">Lucro</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">CPA</th>
              <th className="text-center w-40">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const isExpanded = expandedCampaigns[campaign.campaign_id];
              const adsets = campaign.adsets || getMockAdsets(campaign.campaign_id);

              return (
                <>
                  {/* Campaign Row */}
                  <tr key={campaign.campaign_id} className="hover:bg-[var(--color-bg-card-hover)] transition-colors">
                    <td>
                      <button onClick={() => toggleCampaign(campaign.campaign_id)} className="p-1">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="font-semibold text-[var(--color-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[240px]">{campaign.campaign_name}</span>
                        <button
                          onClick={() => {
                            const newName = prompt("Mudar nome da campanha:", campaign.campaign_name);
                            if (newName) handleAction("rename", campaign.campaign_id, newName);
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
                    <td className="text-right font-medium">R$ {campaign.spend.toLocaleString("pt-BR")}</td>
                    <td className="text-right font-medium text-[var(--color-text-primary)]">R$ {campaign.revenue.toLocaleString("pt-BR")}</td>
                    <td className="text-right font-semibold">
                      <span className={campaign.profit >= 0 ? "text-[var(--color-success-400)]" : "text-[var(--color-danger-400)]"}>
                        R$ {campaign.profit.toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td className="text-right font-bold">{campaign.roas.toFixed(2)}x</td>
                    <td className="text-right font-medium">R$ {campaign.cpa.toFixed(0)}</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleAction(campaign.status === "active" ? "pause" : "activate", campaign.campaign_id)}
                          disabled={!!loadingAction}
                          className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                          title={campaign.status === "active" ? "Pausar Campanha" : "Ativar Campanha"}
                        >
                          {campaign.status === "active" ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                        <button
                          onClick={() => {
                            const budget = prompt("Alterar orçamento diário para (R$):");
                            if (budget) handleAction("update_budget", campaign.campaign_id, budget);
                          }}
                          className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                          title="Mudar Orçamento"
                        >
                          <DollarSign size={12} />
                        </button>
                        <button
                          onClick={() => handleAction("duplicate", campaign.campaign_id)}
                          className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border-accent)] text-[var(--color-text-secondary)]"
                          title="Duplicar"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleAction("delete", campaign.campaign_id)}
                          className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-red-500/20 text-[var(--color-text-secondary)] hover:text-red-400"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Adsets */}
                  {isExpanded &&
                    adsets.map((adset) => {
                      const isAdsetExpanded = expandedAdsets[adset.id];
                      return (
                        <>
                          <tr key={adset.id} className="bg-[var(--color-bg-secondary)]/50">
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
                            <td className="text-right text-xs">R$ {adset.spend.toLocaleString("pt-BR")}</td>
                            <td className="text-right text-xs">R$ {adset.revenue.toLocaleString("pt-BR")}</td>
                            <td className="text-right text-xs font-medium">R$ {adset.profit.toLocaleString("pt-BR")}</td>
                            <td className="text-right text-xs">{adset.roas.toFixed(2)}x</td>
                            <td className="text-right text-xs">R$ {adset.cpa.toFixed(0)}</td>
                            <td></td>
                          </tr>

                          {/* Expanded Ads */}
                          {isAdsetExpanded &&
                            adset.ads.map((ad) => (
                              <tr key={ad.id} className="bg-[var(--color-bg-primary)]/80 text-[var(--color-text-muted)]">
                                <td></td>
                                <td className="pl-14 text-[11px]">
                                  <span>🖼️ {ad.name}</span>
                                </td>
                                <td>
                                  <span className="text-[9px] uppercase">{ad.status}</span>
                                </td>
                                <td className="text-right text-[11px]">R$ {ad.spend.toLocaleString("pt-BR")}</td>
                                <td className="text-right text-[11px]">R$ {ad.revenue.toLocaleString("pt-BR")}</td>
                                <td className="text-right text-[11px] font-semibold text-emerald-500/80">R$ {ad.profit.toLocaleString("pt-BR")}</td>
                                <td className="text-right text-[11px]">{ad.roas.toFixed(2)}x</td>
                                <td className="text-right text-[11px]">R$ {ad.cpa.toFixed(0)}</td>
                                <td></td>
                              </tr>
                            ))}
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
    {
      id: `as2-${campaignId}`,
      name: "Conjunto 02 - Interesses Saúde/Fit",
      status: "active" as const,
      spend: 440,
      revenue: 1620,
      profit: 380,
      roas: 3.68,
      conversions: 5,
      cpa: 88,
      ads: [
        {
          id: `ad3-${campaignId}`,
          name: "Criativo 03 - Foto Depoimento Whatsapp",
          status: "active" as const,
          spend: 440,
          revenue: 1620,
          profit: 380,
          roas: 3.68,
          conversions: 5,
          cpa: 88,
        },
      ],
    },
  ];
}
