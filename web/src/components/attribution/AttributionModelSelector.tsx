"use client";

import { cn } from "@/lib/utils";
import { SlidersHorizontal, HelpCircle } from "lucide-react";

export type AttributionModel = "last_click" | "first_click" | "linear" | "u_shaped";

interface AttributionModelSelectorProps {
  selectedModel: AttributionModel;
  onChange: (model: AttributionModel) => void;
  disabled?: boolean;
  showTechnicalDetails?: boolean;
  onOpenExplanation?: () => void;
}

const MODELS: Array<{
  id: AttributionModel;
  label: string;
  badge: string;
  practicalExample: string;
  description: string;
  distribution: string;
  technicalName: string;
}> = [
  {
    id: "last_click",
    label: "Último anúncio antes da compra",
    badge: "Padrão",
    practicalExample: "Quem fechou a venda?",
    description: "Entrega o crédito para o último anúncio que trouxe o cliente antes da venda.",
    distribution: "0% ➔ 0% ➔ 100%",
    technicalName: "Modelo: Last Click",
  },
  {
    id: "first_click",
    label: "Primeiro contato",
    badge: "Descoberta",
    practicalExample: "Quem trouxe o cliente pela primeira vez?",
    description: "Mostra qual anúncio iniciou o relacionamento com o cliente.",
    distribution: "100% ➔ 0% ➔ 0%",
    technicalName: "Modelo: First Click",
  },
  {
    id: "linear",
    label: "Divisão equilibrada",
    badge: "Equilibrado",
    practicalExample: "Todos os anúncios envolvidos recebem parte do crédito.",
    description: "Divide o crédito entre todos os anúncios envolvidos.",
    distribution: "33% ➔ 33% ➔ 33%",
    technicalName: "Modelo: Linear",
  },
  {
    id: "u_shaped",
    label: "Modelo inteligente ATM",
    badge: "Inteligente",
    practicalExample: "Analisa início, decisão e fechamento da jornada.",
    description: "Valoriza o primeiro contato, o anúncio de conversão e os anúncios que ajudaram na decisão.",
    distribution: "40% ➔ 20% ➔ 40%",
    technicalName: "Modelo: U-Shaped",
  },
];

export function AttributionModelSelector({
  selectedModel,
  onChange,
  disabled = false,
  showTechnicalDetails = false,
  onOpenExplanation,
}: AttributionModelSelectorProps) {
  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <SlidersHorizontal size={14} className="text-purple-400" />
          <span>Como a ATM distribui o crédito das vendas</span>

          {onOpenExplanation && (
            <button
              type="button"
              onClick={onOpenExplanation}
              className="ml-1 px-2 py-0.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <HelpCircle size={11} />
              <span>Como funciona?</span>
            </button>
          )}
        </div>
        <span className="text-[11px] text-zinc-400">
          Escolha como você quer enxergar a influência dos seus anúncios.
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
                "relative text-left p-3 rounded-lg border transition-all duration-150 flex flex-col justify-between cursor-pointer group",
                isSelected
                  ? "bg-purple-950/20 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
                  : "bg-[#161B26] border-zinc-800/80 hover:border-zinc-700 hover:bg-[#1A202C]",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div>
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
                    {showTechnicalDetails ? m.technicalName : m.badge}
                  </span>
                </div>

                <div className="mb-2 p-1.5 rounded bg-zinc-900/60 border border-zinc-800/50">
                  <p className="text-[11px] font-semibold text-purple-300 flex items-center gap-1">
                    <HelpCircle size={11} className="shrink-0 text-purple-400" />
                    <span>"{m.practicalExample}"</span>
                  </p>
                </div>

                <p className="text-[11px] text-zinc-400 leading-tight mb-2">
                  {m.description}
                </p>
              </div>

              {showTechnicalDetails && (
                <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/50 flex items-center justify-between mt-1">
                  <span>Pesos contábeis:</span>
                  <span
                    className={cn(
                      "font-semibold",
                      isSelected ? "text-purple-300" : "text-zinc-400"
                    )}
                  >
                    {m.distribution}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


