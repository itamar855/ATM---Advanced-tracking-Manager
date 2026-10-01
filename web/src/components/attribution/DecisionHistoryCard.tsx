"use client";

import { useState, useEffect } from "react";
import { History, Clock, Trash2 } from "lucide-react";

interface DecisionHistoryItem {
  id: string;
  date: string;
  text: string;
}

interface DecisionHistoryCardProps {
  currentRecommendation?: string | null;
}

export function DecisionHistoryCard({ currentRecommendation }: DecisionHistoryCardProps) {
  const [history, setHistory] = useState<DecisionHistoryItem[]>([]);

  useEffect(() => {
    // Carrega histórico do localStorage
    try {
      const stored = localStorage.getItem("atm_decision_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      } else if (currentRecommendation) {
        const todayStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const initialItem: DecisionHistoryItem = {
          id: String(Date.now()),
          date: todayStr,
          text: currentRecommendation,
        };
        setHistory([initialItem]);
        localStorage.setItem("atm_decision_history", JSON.stringify([initialItem]));
      }
    } catch (e) {
      console.error("[DecisionHistory] Erro ao carregar histórico local:", e);
    }
  }, [currentRecommendation]);

  const clearHistory = () => {
    try {
      localStorage.removeItem("atm_decision_history");
      setHistory([]);
    } catch (e) {}
  };

  if (history.length === 0) return null;

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <History size={15} className="text-purple-400" />
          <span>Últimas análises registradas</span>
        </div>
        <button
          onClick={clearHistory}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trash2 size={11} />
          <span>Limpar</span>
        </button>
      </div>

      <div className="space-y-2">
        {history.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="bg-[#161B26] border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-3 text-xs"
          >
            <div className="flex items-center gap-1 text-[11px] font-mono text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 shrink-0">
              <Clock size={11} />
              <span>{item.date}</span>
            </div>
            <p className="text-zinc-300 font-medium truncate">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
