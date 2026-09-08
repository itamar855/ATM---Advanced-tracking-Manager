"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  PauseCircle,
  ShieldCheck,
  RefreshCw,
  Zap,
  ArrowRight,
  Loader2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignAction, CampaignActionType } from "@/lib/intelligence/campaign-action-engine";

interface IntelligenceActionQueueProps {
  storeId: string;
  actions: CampaignAction[];
  loading: boolean;
  onActionProcessed: () => void;
}

export function IntelligenceActionQueue({
  storeId,
  actions,
  loading,
  onActionProcessed,
}: IntelligenceActionQueueProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const pendingActions = actions.filter((a) => a.status === "recommended");

  const handleDecision = async (action: CampaignAction, decision: "approve" | "reject") => {
    if (!action.id) return;
    setProcessingId(action.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Gera chave de idempotência exclusiva para esta tentativa
    const idempotencyKey = `exec_${action.id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await fetch("/api/v1/intelligence/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          action_id: action.id,
          idempotency_key: idempotencyKey,
          decision,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao processar ação.");
      }

      setSuccessMsg(
        decision === "approve"
          ? `Ação executada com sucesso para "${action.campaignName}".`
          : `Ação para "${action.campaignName}" foi descartada.`
      );

      onActionProcessed();
    } catch (err: any) {
      console.error("[Action Queue Error]:", err);
      setErrorMsg(err.message || "Falha na comunicação com o servidor.");
    } finally {
      setProcessingId(null);
    }
  };

  const getActionBadge = (type: CampaignActionType) => {
    switch (type) {
      case "SCALE_BUDGET_PERCENT":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <TrendingUp size={11} /> ESCALA ORÇAMENTÁRIA
          </span>
        );
      case "REDUCE_BUDGET_PERCENT":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle size={11} /> CORTE PREVENTIVO
          </span>
        );
      case "PAUSE_CAMPAIGN":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
            <PauseCircle size={11} /> PAUSA DE SANGRAMENTO
          </span>
        );
      case "PROTECT_CAMPAIGN":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
            <ShieldCheck size={11} /> TRAVA DE PROTEÇÃO
          </span>
        );
      case "REFRESH_CREATIVE_ALERT":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <RefreshCw size={11} /> RENOVAR CRIATIVO
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 shadow-lg space-y-4">
      {/* Cabeçalho da Fila */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Zap size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Fila de Ações Recomendadas
              <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {pendingActions.length} PENDENTE{pendingActions.length !== 1 ? "S" : ""}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Aprovação assistida com 1 clique. Nenhuma alteração é enviada para a Meta sem sua autorização expressa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-[#161B26] px-2.5 py-1 rounded-lg border border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Modo Assistido Ativo • Autopilot Travado</span>
        </div>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {successMsg && (
        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Listagem das Ações */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
          <Loader2 size={20} className="animate-spin text-amber-400" />
          <span>Carregando fila de ações recomendadas...</span>
        </div>
      ) : pendingActions.length === 0 ? (
        <div className="py-8 text-center text-zinc-400 text-xs bg-[#161B26]/40 border border-zinc-800/40 rounded-xl space-y-1">
          <CheckCircle2 size={22} className="mx-auto text-emerald-400/80 mb-1" />
          <p className="font-semibold text-zinc-300">Fila de ações 100% em dia!</p>
          <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
            Todas as campanhas estão operando dentro das margens seguras. Quando um alerta contábil qualificar uma oportunidade de escala ou corte, ele aparecerá aqui para sua aprovação.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingActions.map((action) => {
            const isProcessing = processingId === action.id;
            const prevVal = action.previousValue !== null && action.previousValue !== undefined ? action.previousValue : 0;
            const targetVal = action.targetValue !== null && action.targetValue !== undefined ? action.targetValue : 0;
            const diffPercent = prevVal > 0 ? Math.round(((targetVal - prevVal) / prevVal) * 100) : 0;

            return (
              <div
                key={action.id || action.campaignId}
                className="bg-[#161B26] border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl p-3.5 transition-all space-y-3"
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white tracking-wide">
                        {action.campaignName}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ID: {action.campaignId}
                      </span>
                      {getActionBadge(action.actionType)}
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {action.reason}
                    </p>
                  </div>

                  {/* Comparativo de Valores */}
                  <div className="bg-[#11141E] px-3 py-1.5 rounded-lg border border-zinc-800 text-right shrink-0">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                      Orçamento Diário
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold mt-0.5">
                      <span className="text-zinc-400 line-through">
                        R$ {prevVal.toFixed(2)}
                      </span>
                      <ArrowRight size={12} className="text-zinc-600" />
                      <span
                        className={cn(
                          diffPercent > 0
                            ? "text-emerald-400"
                            : diffPercent < 0
                            ? "text-red-400"
                            : "text-zinc-200"
                        )}
                      >
                        R$ {targetVal.toFixed(2)}
                      </span>
                      {diffPercent !== 0 && (
                        <span
                          className={cn(
                            "text-[10px] px-1 rounded font-extrabold",
                            diffPercent > 0
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {diffPercent > 0 ? `+${diffPercent}%` : `${diffPercent}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de Ações do Card */}
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Sugerido em: {new Date(action.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>• Guardrails Validados</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleDecision(action, "reject")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/60 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5">
                        <XCircle size={13} className="text-zinc-400" />
                        Descartar
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleDecision(action, "approve")}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-white" />
                          <span>Aplicando na Meta...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={13} className="text-white" />
                          <span>Aprovar & Aplicar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
