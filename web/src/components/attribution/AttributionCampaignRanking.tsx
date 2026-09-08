"use client";

import { useState, useMemo } from "react";
import { Search, ArrowUpDown, Sparkles, GitFork, ShoppingBag, Eye, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CampaignMetricItem {
  campaignId: string | null;
  campaignName: string;
  source: string;
  attributedRevenue: number;
  ordersCount: number;
  touchesCount: number;
  assistedCount: number;
  recoveredRevenue: number;
}

interface AttributionCampaignRankingProps {
  campaigns: CampaignMetricItem[];
  totalRevenue: number;
  loading: boolean;
}

export function AttributionCampaignRanking({
  campaigns,
  totalRevenue,
  loading,
}: AttributionCampaignRankingProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<keyof CampaignMetricItem>("attributedRevenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filteredCampaigns = useMemo(() => {
    let list = campaigns.filter((c) => {
      const q = searchTerm.toLowerCase();
      return (
        c.campaignName.toLowerCase().includes(q) ||
        (c.campaignId && c.campaignId.toLowerCase().includes(q)) ||
        c.source.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "desc" ? valB - valA : valA - valB;
      }
      return sortOrder === "desc"
        ? String(valB).localeCompare(String(valA))
        : String(valA).localeCompare(String(valB));
    });

    return list;
  }, [campaigns, searchTerm, sortBy, sortOrder]);

  const handleSort = (field: keyof CampaignMetricItem) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const getSourceBadge = (src: string) => {
    const s = src.toLowerCase();
    if (s.includes("face") || s.includes("meta") || s === "fb") {
      return {
        label: "Facebook Ads",
        bg: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
    }
    if (s.includes("goog")) {
      return {
        label: "Google Ads",
        bg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    }
    if (s.includes("tik")) {
      return {
        label: "TikTok Ads",
        bg: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      };
    }
    return {
      label: src.toUpperCase() || "DIRETO",
      bg: "bg-zinc-800 text-zinc-400 border-zinc-700",
    };
  };

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl">
      {/* Header com Filtro de Busca */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Ranking Contábil de Campanhas</span>
          <span className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full border border-zinc-700/50">
            {filteredCampaigns.length} identificadas
          </span>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, id ou canal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#161B26] border border-zinc-800 text-xs text-white placeholder-zinc-500 pl-9 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60 transition-colors"
          />
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#141822] text-zinc-400 font-semibold uppercase text-[10px] tracking-wider border-b border-zinc-800/80 select-none">
            <tr>
              <th
                onClick={() => handleSort("campaignName")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Campanha</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th className="py-3 px-4">Canal</th>
              <th
                onClick={() => handleSort("attributedRevenue")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Receita Atribuída</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th
                onClick={() => handleSort("ordersCount")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Pedidos</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th
                onClick={() => handleSort("touchesCount")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Toques</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th
                onClick={() => handleSort("assistedCount")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Assistidos</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th
                onClick={() => handleSort("recoveredRevenue")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Recuperado ATM</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-4 px-4">
                    <div className="h-3 w-40 bg-zinc-800 rounded mb-1" />
                    <div className="h-2.5 w-24 bg-zinc-800/60 rounded" />
                  </td>
                  <td className="py-4 px-4">
                    <div className="h-5 w-20 bg-zinc-800 rounded" />
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="h-4 w-24 bg-zinc-800 rounded ml-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="h-4 w-10 bg-zinc-800 rounded mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="h-4 w-10 bg-zinc-800 rounded mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="h-4 w-10 bg-zinc-800 rounded mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="h-4 w-20 bg-zinc-800 rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : filteredCampaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-600">
                      <Search size={20} />
                    </div>
                    <span className="text-sm font-semibold text-zinc-400">
                      Nenhuma campanha encontrada no período
                    </span>
                    <span className="text-xs text-zinc-600 max-w-sm">
                      Tente alterar a janela de datas ou certifique-se de que existem vendas atribuídas no Revenue Ledger.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCampaigns.map((camp, idx) => {
                const badge = getSourceBadge(camp.source);
                const sharePercent =
                  totalRevenue > 0
                    ? Math.round((camp.attributedRevenue / totalRevenue) * 100)
                    : 0;

                return (
                  <tr
                    key={`${camp.campaignId || "none"}-${camp.campaignName}-${idx}`}
                    className="hover:bg-zinc-800/30 transition-colors group"
                  >
                    {/* Campanha */}
                    <td className="py-3 px-4 font-medium text-white max-w-xs">
                      <div className="truncate font-bold" title={camp.campaignName}>
                        {camp.campaignName}
                      </div>
                      {camp.campaignId && (
                        <div className="text-[10px] font-mono text-zinc-500 truncate">
                          ID: {camp.campaignId}
                        </div>
                      )}
                    </td>

                    {/* Canal / Source */}
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap",
                          badge.bg
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Receita Atribuída + Barra */}
                    <td className="py-3 px-4 text-right">
                      <div className="font-bold text-white">
                        {fmt(camp.attributedRevenue)}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(sharePercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {sharePercent}%
                        </span>
                      </div>
                    </td>

                    {/* Pedidos */}
                    <td className="py-3 px-4 text-center font-bold text-white">
                      {camp.ordersCount.toLocaleString("pt-BR")}
                    </td>

                    {/* Toques Totais */}
                    <td className="py-3 px-4 text-center text-zinc-400">
                      {camp.touchesCount.toLocaleString("pt-BR")}
                    </td>

                    {/* Toques Assistidos */}
                    <td className="py-3 px-4 text-center">
                      {camp.assistedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-violet-400 font-bold bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full text-[11px]">
                          <GitFork size={11} />
                          {camp.assistedCount}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Receita Recuperada */}
                    <td className="py-3 px-4 text-right">
                      {camp.recoveredRevenue > 0 ? (
                        <span className="inline-flex items-center gap-1 text-purple-400 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[11px]">
                          <Sparkles size={11} />
                          {fmt(camp.recoveredRevenue)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
