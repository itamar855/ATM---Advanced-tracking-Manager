"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpDown, Sparkles, GitFork, CheckCircle2, Zap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignHealthScore } from "./CampaignHealthScore";

export interface CampaignMetricItem {
  campaignId: string | null;
  campaignName: string;
  source: string;
  attributedRevenue: number;
  ordersCount: number;
  touchesCount: number;
  assistedCount: number;
  recoveredRevenue: number;
  spend?: number;
}

interface AttributionCampaignRankingProps {
  campaigns: CampaignMetricItem[];
  totalRevenue: number;
  loading: boolean;
  spendAmount?: number | null;
  showTechnicalDetails?: boolean;
}

export function AttributionCampaignRanking({
  campaigns,
  totalRevenue,
  loading,
  spendAmount = null,
  showTechnicalDetails = false,
}: AttributionCampaignRankingProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("attributedRevenue");
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
      // Modos especiais de ordenação consultiva
      if (sortBy === "scaleOpportunity") {
        const scoreA = (a.spend && a.spend > 0 ? a.attributedRevenue / a.spend : 0) * a.ordersCount;
        const scoreB = (b.spend && b.spend > 0 ? b.attributedRevenue / b.spend : 0) * b.ordersCount;
        return sortOrder === "desc" ? scoreB - scoreA : scoreA - scoreB;
      }
      if (sortBy === "efficiency") {
        const roasA = a.spend && a.spend > 0 ? a.attributedRevenue / a.spend : a.attributedRevenue;
        const roasB = b.spend && b.spend > 0 ? b.attributedRevenue / b.spend : b.attributedRevenue;
        return sortOrder === "desc" ? roasB - roasA : roasA - roasB;
      }
      if (sortBy === "waste") {
        const wasteA = (a.spend || 0) - a.attributedRevenue;
        const wasteB = (b.spend || 0) - b.attributedRevenue;
        return sortOrder === "desc" ? wasteB - wasteA : wasteA - wasteB;
      }

      // Ordenação comum de propriedades do CampaignMetricItem
      const key = sortBy as keyof CampaignMetricItem;
      const valA = a[key] ?? 0;
      const valB = b[key] ?? 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "desc" ? valB - valA : valA - valB;
      }
      return sortOrder === "desc"
        ? String(valB).localeCompare(String(valA))
        : String(valA).localeCompare(String(valB));
    });

    return list;
  }, [campaigns, searchTerm, sortBy, sortOrder]);

  const handleSort = (field: string) => {
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

  const maxRevenueCampId = useMemo(() => {
    if (campaigns.length === 0) return null;
    const top = [...campaigns].sort((a, b) => b.attributedRevenue - a.attributedRevenue)[0];
    return top && top.attributedRevenue > 0 ? `${top.campaignId}_${top.campaignName}` : null;
  }, [campaigns]);

  const maxAssistedCampId = useMemo(() => {
    if (campaigns.length === 0) return null;
    const top = [...campaigns].sort((a, b) => b.assistedCount - a.assistedCount)[0];
    return top && top.assistedCount > 0 ? `${top.campaignId}_${top.campaignName}` : null;
  }, [campaigns]);

  const maxOrdersCampId = useMemo(() => {
    if (campaigns.length === 0) return null;
    const top = [...campaigns].sort((a, b) => b.ordersCount - a.ordersCount)[0];
    return top && top.ordersCount > 0 ? `${top.campaignId}_${top.campaignName}` : null;
  }, [campaigns]);

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl space-y-0 mb-6">
      {/* Header com Filtro de Busca e Atalhos Visuais */}
      <div className="p-4 border-b border-zinc-800/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Ranking de campanhas com ação direta</span>
            <span className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full border border-zinc-700/50">
              {filteredCampaigns.length} identificadas
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome ou canal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#161B26] border border-zinc-800 text-xs text-white placeholder-zinc-500 pl-9 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-purple-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Botões de Filtros Visuais e Ordenação Consultiva */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
          <span className="text-[11px] font-semibold text-zinc-400 mr-1">Ordenar por:</span>
          {[
            { id: "attributedRevenue", label: "💰 Maior faturamento" },
            { id: "scaleOpportunity", label: "🚀 Oportunidade de escala" },
            { id: "efficiency", label: "🎯 Maior eficiência" },
            { id: "waste", label: "⚠️ Maior desperdício" },
            { id: "assistedCount", label: "🤝 Ajudaram a vender" },
          ].map((f) => {
            const isSel = sortBy === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setSortBy(f.id);
                  setSortOrder("desc");
                }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer",
                  isSel
                    ? "bg-purple-600/90 border-purple-500 text-white font-bold shadow-sm"
                    : "bg-[#161B26] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                )}
              >
                {f.label}
              </button>
            );
          })}
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
              <th className="py-3 px-4 text-center">Saúde</th>
              <th className="py-3 px-4">Canal</th>
              <th
                onClick={() => handleSort("attributedRevenue")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Receita</span>
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
              <th className="py-3 px-4 text-center">
                <span>Participação</span>
              </th>
              <th
                onClick={() => handleSort("assistedCount")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Ajudaram</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th
                onClick={() => handleSort("recoveredRevenue")}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Recuperado</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">Ações</th>
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
                  <td className="py-4 px-4 text-center">
                    <div className="h-4 w-12 bg-zinc-800 rounded mx-auto" />
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
                    <div className="h-4 w-16 bg-zinc-800 rounded mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="h-4 w-10 bg-zinc-800 rounded mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="h-4 w-20 bg-zinc-800 rounded ml-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="h-5 w-16 bg-zinc-800 rounded mx-auto" />
                  </td>
                </tr>
              ))
            ) : filteredCampaigns.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 px-4 text-center text-zinc-400">
                  <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                    <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400">
                      <Zap size={22} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-base font-bold text-white block">
                        Estamos esperando seus primeiros dados de venda
                      </span>
                      <p className="text-xs text-zinc-400">
                        Assim que novas compras forem concluídas no seu e-commerce, o rastreamento exibirá os resultados em tempo real.
                      </p>
                    </div>

                    <div className="w-full bg-[#161B26] border border-zinc-800/80 rounded-xl p-3.5 text-left space-y-2.5 mt-2">
                      <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                        Status de Prontidão:
                      </span>
                      <ul className="text-xs space-y-2 text-zinc-300">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          <span>Loja conectada</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          <span>Pixel ativo</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          <span>Eventos chegando</span>
                        </li>
                        <li className="flex items-center gap-2 text-amber-300 font-semibold pt-1 border-t border-zinc-800/80">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                          <span>⏳ Aguardando compras atribuídas...</span>
                        </li>
                      </ul>
                    </div>
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

                const campKey = `${camp.campaignId}_${camp.campaignName}`;
                const isMaxRevenue = campKey === maxRevenueCampId;
                const isMaxAssisted = campKey === maxAssistedCampId && !isMaxRevenue;
                const isMaxOrders = campKey === maxOrdersCampId && !isMaxRevenue && !isMaxAssisted;

                return (
                  <tr
                    key={`${camp.campaignId || "none"}-${camp.campaignName}-${idx}`}
                    className="hover:bg-zinc-800/30 transition-colors group"
                  >
                    {/* Campanha com Badges de Destaque */}
                    <td className="py-3 px-4 font-medium text-white max-w-xs">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="truncate font-bold text-white" title={camp.campaignName}>
                          {camp.campaignName}
                        </span>

                        {isMaxRevenue && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 whitespace-nowrap">
                            🏆 Campeã
                          </span>
                        )}

                        {isMaxAssisted && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-0.5 whitespace-nowrap">
                            🤝 Mais influência
                          </span>
                        )}

                        {isMaxOrders && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5 whitespace-nowrap">
                            ⚡ Mais pedidos
                          </span>
                        )}
                      </div>

                      {showTechnicalDetails && camp.campaignId && (
                        <div className="text-[10px] font-mono text-zinc-500 truncate">
                          ID: {camp.campaignId}
                        </div>
                      )}
                    </td>

                    {/* Indicador de Saúde da Campanha */}
                    <td className="py-3 px-4 text-center">
                      <CampaignHealthScore
                        spend={camp.spend || 0}
                        revenue={camp.attributedRevenue}
                        conversions={camp.ordersCount}
                        roas={camp.spend && camp.spend > 0 ? camp.attributedRevenue / camp.spend : 0}
                      />
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

                    {/* Receita Atribuída */}
                    <td className="py-3 px-4 text-right font-bold text-white">
                      {fmt(camp.attributedRevenue)}
                    </td>

                    {/* Pedidos */}
                    <td className="py-3 px-4 text-center font-bold text-white">
                      {camp.ordersCount.toLocaleString("pt-BR")}
                    </td>

                    {/* Participação na venda */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(sharePercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-zinc-300 font-medium">
                          {sharePercent}%
                        </span>
                      </div>
                    </td>

                    {/* Ajudaram na compra */}
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

                    {/* Coluna de Ações */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/campaigns?search=${encodeURIComponent(camp.campaignName)}`)}
                          className="px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 text-purple-200 hover:text-white text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                          title="Ver campanha no painel"
                        >
                          <span>Ver</span>
                          <ExternalLink size={10} />
                        </button>
                      </div>
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
