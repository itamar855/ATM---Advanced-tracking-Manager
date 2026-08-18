"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "error";
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  cpa: number;
  healthScore: number;
}

interface CampaignTableProps {
  campaigns: Campaign[];
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Performance por Campanha
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Últimos 7 dias • Atribuição por tracking ATM
            </p>
          </div>
          <button className="btn-secondary py-1.5 px-3 text-xs">
            Ver todas
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="rounded-tl-lg">Campanha</th>
              <th>Status</th>
              <th className="text-right">Gasto</th>
              <th className="text-right">Receita</th>
              <th className="text-right">Lucro</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">Conv.</th>
              <th className="text-right">CPA</th>
              <th className="text-right rounded-tr-lg">Health</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="cursor-pointer">
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] max-w-[200px] truncate">
                      {campaign.name}
                    </span>
                  </div>
                </td>
                <td>
                  <span
                    className={cn(
                      "badge text-[10px]",
                      campaign.status === "active" && "badge-success",
                      campaign.status === "paused" && "badge-warning",
                      campaign.status === "error" && "badge-danger"
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        campaign.status === "active" && "bg-[var(--color-success-400)]",
                        campaign.status === "paused" && "bg-[var(--color-warning-400)]",
                        campaign.status === "error" && "bg-[var(--color-danger-400)]"
                      )}
                    />
                    {campaign.status === "active"
                      ? "Ativa"
                      : campaign.status === "paused"
                      ? "Pausada"
                      : "Erro"}
                  </span>
                </td>
                <td className="text-right font-medium">
                  R$ {campaign.spend.toLocaleString("pt-BR")}
                </td>
                <td className="text-right font-medium text-[var(--color-text-primary)]">
                  R$ {campaign.revenue.toLocaleString("pt-BR")}
                </td>
                <td className="text-right">
                  <span
                    className={cn(
                      "font-semibold",
                      campaign.profit >= 0
                        ? "text-[var(--color-success-400)]"
                        : "text-[var(--color-danger-400)]"
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {campaign.profit >= 0 ? (
                        <TrendingUp size={12} />
                      ) : (
                        <TrendingDown size={12} />
                      )}
                      R$ {Math.abs(campaign.profit).toLocaleString("pt-BR")}
                    </span>
                  </span>
                </td>
                <td className="text-right">
                  <span
                    className={cn(
                      "font-semibold",
                      campaign.roas >= 2
                        ? "text-[var(--color-success-400)]"
                        : campaign.roas >= 1
                        ? "text-[var(--color-warning-400)]"
                        : "text-[var(--color-danger-400)]"
                    )}
                  >
                    {campaign.roas.toFixed(2)}x
                  </span>
                </td>
                <td className="text-right font-medium">{campaign.conversions}</td>
                <td className="text-right font-medium">
                  R$ {campaign.cpa.toLocaleString("pt-BR")}
                </td>
                <td className="text-right">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold",
                      campaign.healthScore >= 85 &&
                        "bg-[var(--color-success-500)]/15 text-[var(--color-success-400)]",
                      campaign.healthScore >= 60 &&
                        campaign.healthScore < 85 &&
                        "bg-[var(--color-warning-500)]/15 text-[var(--color-warning-400)]",
                      campaign.healthScore < 60 &&
                        "bg-[var(--color-danger-500)]/15 text-[var(--color-danger-400)]"
                    )}
                  >
                    {campaign.healthScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
