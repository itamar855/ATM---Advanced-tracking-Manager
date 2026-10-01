"use client";

import { X, Sparkles, MousePointer, ShoppingBag, ArrowRight, Layers, CheckCircle2 } from "lucide-react";

interface AttributionExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AttributionExplanationModal({
  isOpen,
  onClose,
}: AttributionExplanationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm fade-in">
      <div className="bg-[#11141E] border border-purple-500/30 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-zinc-100">
        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Como a ATM entende suas vendas
            </h3>
            <p className="text-xs text-zinc-400">
              Visualização da jornada completa do cliente
            </p>
          </div>
        </div>

        {/* Descrição em texto amigável */}
        <p className="text-xs text-zinc-300 leading-relaxed bg-[#161B26] p-3.5 rounded-xl border border-zinc-800">
          Um cliente pode ver vários anúncios em dias ou canais diferentes antes de comprar.
          A ATM acompanha essa jornada inteira e mostra exatamente como cada anúncio contribuiu para a decisão final.
        </p>

        {/* Diagrama Visual de Passos */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
            Exemplo de Jornada Multi-Touch:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs">
            {/* Passo 1 */}
            <div className="bg-[#161B26] border border-purple-500/30 rounded-xl p-3 flex flex-col items-center justify-between space-y-1">
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                1º Toque
              </span>
              <div className="font-bold text-white text-xs pt-1">Anúncio 1</div>
              <span className="text-[10px] text-zinc-500">Descoberta</span>
            </div>

            {/* Passo 2 */}
            <div className="bg-[#161B26] border border-blue-500/30 rounded-xl p-3 flex flex-col items-center justify-between space-y-1">
              <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                2º Toque
              </span>
              <div className="font-bold text-white text-xs pt-1">Anúncio 2</div>
              <span className="text-[10px] text-zinc-500">Apoio / Meio</span>
            </div>

            {/* Passo 3 */}
            <div className="bg-[#161B26] border border-amber-500/30 rounded-xl p-3 flex flex-col items-center justify-between space-y-1">
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                3º Toque
              </span>
              <div className="font-bold text-white text-xs pt-1">Anúncio 3</div>
              <span className="text-[10px] text-zinc-500">Fechamento</span>
            </div>

            {/* Passo 4 - Compra */}
            <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 flex flex-col items-center justify-between space-y-1">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Resultado
              </span>
              <div className="font-bold text-emerald-300 text-xs pt-1 flex items-center gap-1">
                <ShoppingBag size={12} /> Compra
              </div>
              <span className="text-[10px] text-emerald-400/80">Venda Atribuída</span>
            </div>
          </div>
        </div>

        {/* Rodapé / Botão Entendi */}
        <div className="pt-2 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all cursor-pointer"
          >
            Entendi perfeitamente
          </button>
        </div>
      </div>
    </div>
  );
}
