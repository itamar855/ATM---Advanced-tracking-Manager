"use client";

import { useState } from "react";
import {
  History,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignAction } from "@/lib/intelligence/campaign-action-engine";

interface IntelligenceActionHistoryProps {
  storeId: string;
  actions: CampaignAction[];
  loading: boolean;
  onRollbackCompleted: () => void;
}

export function IntelligenceActionHistory({
  storeId,
  actions,
  loading,
  onRollbackCompleted,
}: IntelligenceActionHistoryProps) {
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filtra apenas o histórico (não exibe 'recommended')
  const historyActions = actions.filter((a) => a.status !== "recommended");

  const handleRollback = async (action: CampaignAction) => {
    if (!action.id) return;
    const confirmRollback = window.confirm(
      `Deseja realmente reverter as alterações da campanha "${action.campaignName}" para o estado anterior registrado no snapshot?`
    );
    if (!confirmRollback) return;

    setRollingBackId(action.id);
    setFeedbackMsg(null);

    try {
      const res = await fetch("/api/v1/intelligence/actions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          action_id: action.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha ao executar rollback.");
      }

      setFeedbackMsg({
        type: "success",
        text: `Rollback concluído com sucesso para "${action.campaignName}". Snapshot anterior restaurado na Meta.`,
      });

      onRollbackCompleted();
    } catch (err: any) {
      console.error("[Rollback Error]:", err);
      setFeedbackMsg({
        type: "error",
        text: err.message || "Falha ao comunicar com o endpoint de rollback.",
      });
    } finally {
      setRollingBackId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "executed":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
            <CheckCircle2 size={11} /> EXECUTADO NA META
          </span>
        );
      case "rolled_back":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
            <RotateCcw size={11} /> REVERTIDO (ROLLBACK)
          </span>
        );
      case "rejected":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1 w-fit">
            <XCircle size={11} /> DESCARTADO PELO GESTOR
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 w-fit">
            <AlertTriangle size={11} /> FALHA NA META ADS
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 shadow-lg space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <History size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Histórico & Auditoria de Ações Executadas
              <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {historyActions.length} REGISTRO{historyActions.length !== 1 ? "S" : ""}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Rastreabilidade total das alterações enviadas à Meta Ads com suporte a Rollback fidedigno.
            </p>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={cn(
            "p-2.5 rounded-lg text-xs flex items-center gap-2 border",
            feedbackMsg.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-red-950/40 border-red-500/30 text-red-300"
          )}
        >
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle size={14} className="shrink-0 text-red-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
          <Loader2 size={20} className="animate-spin text-blue-400" />
          <span>Carregando histórico de auditoria...</span>
        </div>
      ) : historyActions.length === 0 ? (
        <div className="py-6 text-center text-zinc-500 text-xs">
          Nenhuma ação foi executada ainda nesta loja.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <th className="pb-2">Data / Hora</th>
                <th className="pb-2">Campanha</th>
                <th className="pb-2">Ação</th>
                <th className="pb-2 text-right">Orçamento Aplicado</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Rollback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {historyActions.map((action) => {
                const isRolling = rollingBackId === action.id;
                const canRollback = action.status === "executed";
                const dateStr = action.executedAt || action.createdAt;

                return (
                  <tr key={action.id} className="hover:bg-[#161B26]/50 transition-colors">
                    <td className="py-3 text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                      {new Date(dateStr).toLocaleString([], {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 font-semibold text-white max-w-[200px] truncate">
                      {action.campaignName}
                    </td>
                    <td className="py-3 text-zinc-300 font-mono text-[11px]">
                      {action.actionType}
                    </td>
                    <td className="py-3 text-right font-bold text-zinc-200">
                      {action.appliedValue !== null && action.appliedValue !== undefined
                        ? `R$ ${action.appliedValue.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-3">{getStatusBadge(action.status)}</td>
                    <td className="py-3 text-right">
                      {canRollback && (
                        <button
                          type="button"
                          disabled={isRolling}
                          onClick={() => handleRollback(action)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {isRolling ? (
                            <>
                              <Loader2 size={11} className="animate-spin text-amber-400" />
                              Revertendo...
                            </>
                          ) : (
                            <>
                              <RotateCcw size={11} />
                              Desfazer Alteração
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
