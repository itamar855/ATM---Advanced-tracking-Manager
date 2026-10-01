"use client";

import { ShieldCheck, CheckCircle2 } from "lucide-react";

interface AttributionConfidenceCardProps {
  totalOrders: number;
  totalTouchpoints: number;
  campaignsCount: number;
  modelLabel: string;
}

export function AttributionConfidenceCard({
  totalOrders,
  totalTouchpoints,
  campaignsCount,
  modelLabel,
}: AttributionConfidenceCardProps) {
  return (
    <div className="bg-[#11141E] border border-emerald-500/20 rounded-xl p-4 space-y-3 shadow-lg">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <ShieldCheck size={16} />
        </div>
        <div>
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            Por que confiar nesses dados?
            <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full font-medium border border-emerald-500/30">
              Auditado em Tempo Real
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">
            Transparência contábil completa da jornada do seu cliente
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        {/* Item 1 */}
        <div className="bg-[#161B26] border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <span className="text-white font-bold block text-xs">Eventos capturados</span>
            <span className="text-[11px] text-zinc-400">
              {totalTouchpoints > 0 ? `${totalTouchpoints.toLocaleString("pt-BR")} toques registrados` : "Pixel ativo e monitorando"}
            </span>
          </div>
        </div>

        {/* Item 2 */}
        <div className="bg-[#161B26] border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <span className="text-white font-bold block text-xs">Pedidos identificados</span>
            <span className="text-[11px] text-zinc-400">
              {totalOrders.toLocaleString("pt-BR")} vendas auditadas no Ledger
            </span>
          </div>
        </div>

        {/* Item 3 */}
        <div className="bg-[#161B26] border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <span className="text-white font-bold block text-xs">Campanhas conectadas</span>
            <span className="text-[11px] text-zinc-400">
              {campaignsCount} fontes de tráfego rastreadas
            </span>
          </div>
        </div>

        {/* Item 4 */}
        <div className="bg-[#161B26] border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-white font-bold block text-xs truncate">Modelo ativo</span>
            <span className="text-[11px] text-zinc-400 truncate block" title={modelLabel}>
              {modelLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
