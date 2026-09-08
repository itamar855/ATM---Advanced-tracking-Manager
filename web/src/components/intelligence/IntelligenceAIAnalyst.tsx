"use client";

import { Sparkles, Bot, ArrowUpRight, TrendingUp, AlertTriangle } from "lucide-react";
import { CampaignAlert } from "@/lib/intelligence/campaign-alert-engine";

interface IntelligenceAIAnalystProps {
  alerts: CampaignAlert[];
  loading: boolean;
}

export function IntelligenceAIAnalyst({ alerts, loading }: IntelligenceAIAnalystProps) {
  if (loading) {
    return (
      <div className="bg-[#11141E] border border-purple-500/20 rounded-xl p-5 space-y-3 animate-pulse shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/20" />
          <div className="h-4 w-40 bg-zinc-800 rounded" />
        </div>
        <div className="h-16 bg-[#161B26] rounded-lg" />
      </div>
    );
  }

  const scaleAlerts = alerts.filter((a) => a.type === "READY_TO_SCALE");
  const underreportedAlerts = alerts.filter((a) => a.type === "UNDER_REPORTED_CAMPAIGN");
  const decayAlerts = alerts.filter((a) => a.type === "CAMPAIGN_DECAY");
  const fatigueAlerts = alerts.filter((a) => a.type === "CREATIVE_FATIGUE");

  const totalHiddenSales = underreportedAlerts.reduce((acc, a) => acc + (a.metrics.hiddenSales || 0), 0);

  return (
    <div className="bg-gradient-to-r from-purple-950/20 via-[#11141E] to-[#11141E] border border-purple-500/30 rounded-xl p-5 space-y-3 shadow-xl relative overflow-hidden">
      <div className="absolute right-0 top-0 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              ATM AI Analyst — Diagnóstico Contábil Executivo
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                PRO INTEL
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Síntese contextual gerada com base nos dados consolidados do Revenue Ledger.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#161B26]/80 border border-zinc-800/80 rounded-xl p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
        {alerts.length === 0 ? (
          <p className="text-zinc-400">
            ✅ <strong>Operação Equilibrada:</strong> Não foram detectadas anomalias graves de atribuição nem sangramentos financeiros nas janelas ativas. As campanhas estão performando de forma estável. Continue monitorando o volume de conversões para novas oportunidades de escala.
          </p>
        ) : (
          <>
            {scaleAlerts.length > 0 && (
              <p>
                🚀 <strong>Oportunidade de Escala Identificada:</strong> Detectamos{" "}
                <span className="text-emerald-400 font-bold">{scaleAlerts.length} {scaleAlerts.length === 1 ? "campanha" : "campanhas"}</span> com
                ROAS real acima da média da conta e CPA controlado no Ledger. O ATM recomenda aumentar o orçamento diário em 15% a 20% de forma gradual para alavancar receita sem inflacionar o CPM.
              </p>
            )}

            {underreportedAlerts.length > 0 && (
              <p>
                💰 <strong>Vendas Ocultadas na Meta:</strong> Há{" "}
                <span className="text-purple-400 font-bold">{underreportedAlerts.length} {underreportedAlerts.length === 1 ? "campanha" : "campanhas"}</span> sofrendo
                sub-atribuição severa no gerenciador da Meta ({totalHiddenSales} vendas auditadas exclusivamente pelo ATM).{" "}
                <span className="text-amber-300 font-semibold">Não pause essas campanhas</span> mesmo se o gerenciador reportar CPA alto — o dinheiro real está entrando no banco.
              </p>
            )}

            {decayAlerts.length > 0 && (
              <p>
                ⚠️ <strong>Atenção a Sangramentos:</strong> Foram identificadas{" "}
                <span className="text-red-400 font-bold">{decayAlerts.length} {decayAlerts.length === 1 ? "campanha" : "campanhas"}</span> com
                aumento de gasto desproporcional à receita contábil (ROAS em declínio acentuado). Recomenda-se corte cirúrgico de orçamento nos conjuntos com menor conversão.
              </p>
            )}

            {fatigueAlerts.length > 0 && (
              <p>
                🔄 <strong>Renovação de Criativos Necessária:</strong>{" "}
                <span className="text-amber-400 font-bold">{fatigueAlerts.length} {fatigueAlerts.length === 1 ? "campanha apresenta" : "campanhas apresentam"}</span> frequência
                elevada acompanhada de queda abrupta de CTR. Isso sinaliza saturação de público; injetar mais verba antes de novos criativos resultará em elevação de CPA.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
