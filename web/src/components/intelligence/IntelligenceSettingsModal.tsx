"use client";

import { useState, useEffect } from "react";
import {
  ShieldAlert,
  Sliders,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
  PowerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignAutomationSettings } from "@/lib/intelligence/campaign-action-engine";

interface IntelligenceSettingsModalProps {
  storeId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function IntelligenceSettingsModal({
  storeId,
  isOpen,
  onClose,
  onSaved,
}: IntelligenceSettingsModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [killSwitch, setKillSwitch] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [maxDailyBudgetChange, setMaxDailyBudgetChange] = useState(500);
  const [maxBudgetIncreasePercent, setMaxBudgetIncreasePercent] = useState(20);
  const [maxBudgetDecreasePercent, setMaxBudgetDecreasePercent] = useState(30);
  const [cooldownHours, setCooldownHours] = useState(24);

  useEffect(() => {
    if (!isOpen || !storeId) return;

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    fetch(`/api/v1/intelligence/settings?store_id=${encodeURIComponent(storeId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.ok && data.settings) {
          const s: CampaignAutomationSettings = data.settings;
          setKillSwitch(s.killSwitch);
          setAutomationEnabled(s.automationEnabled);
          setMaxDailyBudgetChange(s.maxDailyBudgetChange);
          setMaxBudgetIncreasePercent(s.maxBudgetIncreasePercent);
          setMaxBudgetDecreasePercent(s.maxBudgetDecreasePercent);
          setCooldownHours(s.cooldownHours);
        }
      })
      .catch((err) => {
        if (isMounted) setErrorMsg("Erro ao carregar configurações de segurança.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, storeId]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/v1/intelligence/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          killSwitch,
          automationEnabled,
          maxDailyBudgetChange,
          maxBudgetIncreasePercent,
          maxBudgetDecreasePercent,
          cooldownHours,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao salvar guardrails.");
      }

      setSuccessMsg("Guardrails e configurações salvas com sucesso!");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na comunicação ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#11141E] border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header do Modal */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-[#161B26]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Guardrails & Configurações de Segurança
              </h3>
              <p className="text-[11px] text-zinc-400">
                Limites operacionais de orçamento e travas de emergência por loja.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={24} className="animate-spin text-amber-400" />
              <span>Carregando parâmetros de segurança...</span>
            </div>
          ) : (
            <>
              {/* KILL SWITCH MESTRE */}
              <div
                className={cn(
                  "p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3",
                  killSwitch
                    ? "bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : "bg-[#161B26] border-zinc-800"
                )}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <PowerOff size={14} className={killSwitch ? "text-red-400" : "text-zinc-400"} />
                      Kill Switch de Emergência
                    </span>
                    {killSwitch && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-red-500/20 text-red-400 border border-red-500/40">
                        BLOQUEIO ATIVO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    Interrompe imediatamente qualquer proposta de ação da IA para esta loja.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={killSwitch}
                    onChange={(e) => setKillSwitch(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              {/* Status do Autopilot (Travado em False) */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-zinc-400">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-amber-400" />
                  <div>
                    <span className="font-semibold text-zinc-200">Autopilot Autônomo</span>
                    <p className="text-[11px] text-zinc-500">
                      Na Fase 7, todas as ações exigem aprovação humana obrigatória.
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                  DESATIVADO
                </span>
              </div>

              {/* Parâmetros Numéricos */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Teto Variação Diária (R$)
                    </label>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={maxDailyBudgetChange}
                      onChange={(e) => setMaxDailyBudgetChange(Number(e.target.value))}
                      className="w-full bg-[#161B26] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-zinc-500">Limite máx. de delta em R$</span>
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Janela Cooldown (Horas)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={cooldownHours}
                      onChange={(e) => setCooldownHours(Number(e.target.value))}
                      className="w-full bg-[#161B26] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-zinc-500">Repouso entre alterações</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Máx. Aumento Orçamento (%)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={maxBudgetIncreasePercent}
                      onChange={(e) => setMaxBudgetIncreasePercent(Number(e.target.value))}
                      className="w-full bg-[#161B26] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-zinc-500">Ex: +20% por ciclo de escala</span>
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Máx. Redução Orçamento (%)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="80"
                      value={maxBudgetDecreasePercent}
                      onChange={(e) => setMaxBudgetDecreasePercent(Number(e.target.value))}
                      className="w-full bg-[#161B26] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-red-500"
                    />
                    <span className="text-[10px] text-zinc-500">Ex: -30% por corte preventivo</span>
                  </div>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700 transition-all cursor-pointer font-medium"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-500 transition-all cursor-pointer shadow-[0_0_12px_rgba(217,119,6,0.3)] disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-white" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Guardrails</span>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
