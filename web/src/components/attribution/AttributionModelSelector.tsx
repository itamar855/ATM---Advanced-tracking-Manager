"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles, SlidersHorizontal, Layers } from "lucide-react";

export type AttributionModel = "last_click" | "first_click" | "linear" | "u_shaped";

interface AttributionModelSelectorProps {
  selectedModel: AttributionModel;
  onChange: (model: AttributionModel) => void;
  disabled?: boolean;
}

const MODELS: Array<{
  id: AttributionModel;
  label: string;
  badge: string;
  description: string;
  distribution: string;
}> = [
  {
    id: "last_click",
    label: "Last Click",
    badge: "Padrão",
    description: "100% do crédito para o último anúncio antes da compra.",
    distribution: "0% ➔ 0% ➔ 100%",
  },
  {
    id: "first_click",
    label: "First Click",
    badge: "Descoberta",
    description: "100% do crédito para o anúncio que apresentou a loja.",
    distribution: "100% ➔ 0% ➔ 0%",
  },
  {
    id: "linear",
    label: "Linear",
    badge: "Equilibrado",
    description: "Crédito distribuído igualmente por todos os toques.",
    distribution: "33% ➔ 33% ➔ 33%",
  },
  {
    id: "u_shaped",
    label: "U-Shaped",
    badge: "Inteligente",
    description: "40% Primeiro Toque, 40% Conversor, 20% Meio de Funil.",
    distribution: "40% ➔ 20% ➔ 40%",
  },
];

export function AttributionModelSelector({
  selectedModel,
  onChange,
  disabled = false,
}: AttributionModelSelectorProps) {
  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <SlidersHorizontal size={14} className="text-purple-400" />
          <span>Modelo de Atribuição Financeira</span>
        </div>
        <span className="text-[11px] text-zinc-400 hidden sm:inline">
          Altera a ponderação contábil instantaneamente no Ledger
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {MODELS.map((m) => {
          const isSelected = selectedModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={cn(
                "relative text-left p-3 rounded-lg border transition-all duration-150 flex flex-col justify-between cursor-pointer",
                isSelected
                  ? "bg-purple-950/20 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
                  : "bg-[#161B26] border-zinc-800/80 hover:border-zinc-700 hover:bg-[#1A202C]",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-bold transition-colors",
                    isSelected ? "text-white" : "text-zinc-300"
                  )}
                >
                  {m.label}
                </span>
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-semibold border",
                    isSelected
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700/60"
                  )}
                >
                  {m.badge}
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-tight mb-2">
                {m.description}
              </p>

              <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/50 flex items-center justify-between">
                <span>Pesos:</span>
                <span
                  className={cn(
                    "font-semibold",
                    isSelected ? "text-purple-300" : "text-zinc-400"
                  )}
                >
                  {m.distribution}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
