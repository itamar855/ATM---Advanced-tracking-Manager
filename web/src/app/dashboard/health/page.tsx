"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MessageSquareHeart,
  Database,
  Sparkles,
  RefreshCw,
  Loader2,
  Info,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import { useStore } from "@/contexts/StoreContext";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const { activeStore } = useStore();

  // Lista de contas disponíveis (carregadas da integração salva)
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Carrega lista de contas disponíveis na integração salva
  async function loadAvailableAccounts() {
    if (!activeStore) return;
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/v1/meta/accounts?store_id=${activeStore.id}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.selectedAccountIds) && data.selectedAccountIds.length > 0) {
        setAvailableAccounts(data.selectedAccountIds);
        // Seleciona a primeira conta automaticamente
        if (!selectedAccountId) {
          setSelectedAccountId(data.selectedAccountIds[0]);
        }
      } else if (data.ok && Array.isArray(data.accounts) && data.accounts.length > 0) {
        // Fallback: usa as contas retornadas pelo /me/adaccounts
        const ids = data.accounts.map((a: any) => a.id);
        setAvailableAccounts(ids);
        if (!selectedAccountId) setSelectedAccountId(ids[0]);
      } else if (data.error) {
        setApiError(data.error);
      }
    } catch (err: any) {
      setApiError(err.message || "Erro ao buscar contas de anúncio");
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadHealth(accountId?: string) {
    const accToUse = accountId || selectedAccountId;
    if (!accToUse) return;

    setApiError(null);
    try {
      const params = new URLSearchParams({ ad_account_id: accToUse, store_id: activeStore?.id || "" });
      const response = await fetch(`/api/v1/meta/account-health?${params.toString()}`);
      const result = await response.json();

      if (result.ok && result.data) {
        setHealthData(result.data);
      } else {
        setApiError(result.error || "Erro desconhecido ao carregar diagnóstico");
        setHealthData(null);
      }
    } catch (error: any) {
      setApiError(error.message || "Erro desconhecido ao carregar diagnóstico");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Na primeira carga, busca a lista de contas e inicia análise
  useEffect(() => {
    loadAvailableAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore]);

  // Quando a conta selecionada muda, recarrega o health score
  useEffect(() => {
    if (selectedAccountId) {
      setLoading(true);
      loadHealth(selectedAccountId);
    }
  }, [selectedAccountId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadHealth(selectedAccountId);
  };

  if (loading && !healthData && !apiError) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-12 select-none">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-[#2997ff]" />
            Meta Account Trust & Health Score
          </h1>
          <p className="text-[13px] text-white/40 mt-1">
            Diagnóstico de reputação interna da conta, risco de restrição e qualidade de leilão
          </p>
        </div>
        {healthData && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/90 transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin text-[#2997ff]" : "text-white/40"} />
            Reanalisar Conta
          </button>
        )}
      </div>

      {/* Erro de API */}
      {apiError && (
        <div className="p-4 rounded-2xl bg-[#ff453a]/10 border border-[#ff453a]/20 text-xs text-[#ff453a] flex items-start gap-2.5">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Erro retornado pela API da Meta:</p>
            <p className="leading-relaxed opacity-90">{apiError}</p>
            <p className="text-[11px] opacity-75 mt-1">
              Dica: Certifique-se de que o seu Access Token possui permissões de leitura da conta de anúncios (ads_management) e que ele foi atribuído à conta de anúncios no seu Gerenciador de Negócios da Meta.
            </p>
          </div>
        </div>
      )}

      {/* Seletor de Conta de Anúncio — multi-conta */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2997ff]/10 border border-[#2997ff]/20 flex items-center justify-center text-[#2997ff]">
            <Database size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">
              Conta de Anúncio Analisada
            </h3>
            <p className="text-[12px] text-white/40">
              Selecione qual conta analisar — cada conta tem seu próprio Tier e Trust Score
            </p>
          </div>
        </div>

        {loadingAccounts ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 size={13} className="animate-spin text-[#2997ff]" />
            Carregando contas conectadas...
          </div>
        ) : availableAccounts.length > 0 ? (
          <div className="max-w-md space-y-2">
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Escolher Conta de Anúncio ({availableAccounts.length} disponível{availableAccounts.length !== 1 ? "is" : ""})
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                disabled={refreshing}
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2 text-xs text-white/90 focus:outline-none focus:border-[#2997ff]/40 transition-colors cursor-pointer appearance-none pr-8"
              >
                <option value="" className="bg-[#18181a]">Selecione uma conta...</option>
                {availableAccounts.map((accId) => (
                  <option key={accId} value={accId} className="bg-[#18181a]">
                    {accId}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>
            {healthData && (
              <p className="text-[11.5px] text-white/40">
                Analisando:{" "}
                <span className="font-semibold text-[#2997ff]">
                  {healthData.ad_account_name} ({healthData.ad_account_id})
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <p className="text-xs text-white/50 leading-relaxed">
              Nenhuma conta de anúncios conectada encontrada. Acesse a página de{" "}
              <a href="/dashboard/settings/integrations" className="font-semibold text-[#2997ff] hover:underline">
                Integrações
              </a>{" "}
              para conectar seu Access Token do Facebook Ads Manager primeiro.
            </p>
          </div>
        )}
      </div>

      {/* Conteúdo Principal do Health Score */}
      {healthData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left: Overall Trust Gauge */}
            <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center justify-center col-span-1 text-center shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">
                Trust Score Global
              </span>
              <HealthGauge score={healthData.trust_score} size="lg" />
              <div className="mt-4 space-y-3">
                <span
                  className={`inline-block text-[11px] font-semibold px-3 py-1 rounded-full border ${
                    healthData.trust_score >= 85
                      ? "bg-[#30d158]/10 text-[#30d158] border-[#30d158]/20"
                      : healthData.trust_score >= 60
                      ? "bg-[#ffd60a]/10 text-[#ffd60a] border-[#ffd60a]/20"
                      : "bg-[#ff453a]/10 text-[#ff453a] border-[#ff453a]/20"
                  }`}
                >
                  {healthData.trust_score >= 85
                    ? "Excelente Reputação"
                    : healthData.trust_score >= 60
                    ? "Atenção Moderada"
                    : "Alto Risco de Penalidade"}
                </span>

                {/* Trust Tier Badge */}
                {healthData.inferred_tier && (
                  <div>
                    <TierBadge tier={healthData.inferred_tier} />
                  </div>
                )}

                <p className="text-[11px] text-white/30 font-mono">
                  Conta: {healthData.ad_account_id}
                </p>
              </div>
            </div>

            {/* Right: 4 Core Pillars */}
            <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 col-span-2 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Sparkles size={16} className="text-[#2997ff]" />
                Os 4 Pilares de Reputação da Meta
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <PillarCard
                  icon={<CheckCircle2 size={16} className="text-[#30d158]" />}
                  title="Políticas & Compliance"
                  score={`${healthData.compliance_score}/100`}
                  description="Histórico de aprovação de anúncios e criativos"
                  status={healthData.compliance_score >= 80 ? "good" : "warning"}
                />
                <PillarCard
                  icon={<CreditCard size={16} className="text-[#2997ff]" />}
                  title="Saúde de Cobrança"
                  score={`${healthData.billing_score}/100`}
                  description="Consistência nos pagamentos sem falhas de cartão"
                  status={healthData.billing_score >= 80 ? "good" : "warning"}
                />
                <PillarCard
                  icon={<MessageSquareHeart size={16} className="text-[#ff375f]" />}
                  title="Customer Feedback Score"
                  score={`${healthData.feedback_score} / 5.0`}
                  description="Avaliações de compradores nas pesquisas da Meta"
                  status={healthData.feedback_score >= 4.0 ? "good" : "warning"}
                />
                <PillarCard
                  icon={<Database size={16} className="text-[#bf5af2]" />}
                  title="Event Match Quality (EMQ)"
                  score={`${healthData.emq_score}%`}
                  description="Qualidade dos sinais e cookies do pixel via CAPI"
                  status={healthData.emq_score >= 80 ? "good" : "warning"}
                />
              </div>
            </div>
          </div>

          {/* Trust Tier Sinais */}
          {healthData.tier_signals && healthData.tier_signals.length > 0 && (
            <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#2997ff]" />
                Sinais Usados para Inferir o Trust Tier
                <span className="text-[11px] font-normal text-white/40 ml-1">
                  (Meta não expõe o Tier — inferido por 5 sinais reais)
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {healthData.tier_signals.map((s: any) => (
                  <div
                    key={s.label}
                    className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2"
                  >
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide leading-tight">
                      {s.label}
                    </p>
                    <p className="text-xs font-bold text-white/90">{s.value}</p>
                    <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-[#2997ff] transition-all"
                        style={{ width: `${Math.round((s.points / s.max) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-white/30 text-right">
                      {s.points}/{s.max} pts
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks & Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#30d158]" />
                Recomendações para Blindagem da Conta
              </h3>
              <div className="space-y-2.5">
                {healthData.recommendations.map((rec: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-xs text-white/70"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2997ff] mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{rec}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <AlertTriangle size={16} className="text-[#ffd60a]" />
                Alertas e Riscos de Penalidade
              </h3>
              {healthData.risks_detected && healthData.risks_detected.length > 0 ? (
                <div className="space-y-2.5">
                  {healthData.risks_detected.map((risk: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-[#ffd60a]/10 border border-[#ffd60a]/20 text-xs text-[#ffd60a]"
                    >
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{risk}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center space-y-2">
                  <CheckCircle2 size={24} className="text-[#30d158] mx-auto" />
                  <p className="text-xs font-semibold text-white/90">
                    Nenhum risco crítico detectado
                  </p>
                  <p className="text-[11.5px] text-white/40">
                    Sua conta de anúncio opera dentro dos limites ideais de conformidade da Meta.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : !apiError ? (
        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-8 text-center space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <Info size={30} className="text-[#2997ff] mx-auto" />
          <h3 className="text-sm font-semibold text-white/90">Nenhum diagnóstico gerado ainda</h3>
          <p className="text-xs text-white/40 max-w-sm mx-auto">
            {availableAccounts.length > 0
              ? "Selecione uma conta de anúncios acima para rodar a primeira análise de pontuação e saúde da conta."
              : "Conecte sua conta do Facebook em Integrações para iniciar o diagnóstico."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const config = {
    1: { label: "Tier 1 — Iniciante", color: "text-[#ffd60a] bg-[#ffd60a]/10 border-[#ffd60a]/20", icon: "🥉" },
    2: { label: "Tier 2 — Estabelecida", color: "text-[#2997ff] bg-[#2997ff]/10 border-[#2997ff]/20", icon: "🥈" },
    3: { label: "Tier 3 — Consolidada", color: "text-[#30d158] bg-[#30d158]/10 border-[#30d158]/20", icon: "🥇" },
  }[tier];

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}

function PillarCard({
  icon,
  title,
  score,
  description,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  score: string;
  description: string;
  status: "good" | "warning" | "danger";
}) {
  return (
    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] flex flex-col justify-between space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-white/90">{title}</span>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
            status === "good"
              ? "text-[#30d158] bg-[#30d158]/10"
              : "text-[#ffd60a] bg-[#ffd60a]/10"
          }`}
        >
          {score}
        </span>
      </div>
      <p className="text-[10.5px] text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}
