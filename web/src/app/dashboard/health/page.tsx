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
  Plug,
  Info,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import { createClient } from "@/lib/supabase/client";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  
  // Facebook OAuth e seleção de conta
  const [storeId, setStoreId] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [integrating, setIntegrating] = useState(false);

  async function loadHealth() {
    try {
      const supabase = createClient();
      const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

      if (store) {
        setStoreId(store.id);
        const response = await fetch(`/api/v1/meta/account-health?store_id=${store.id}`);
        const result = await response.json();
        
        if (result.ok && result.data) {
          setHealthData(result.data);
        } else {
          // Caso a conta não esteja associada a uma conta de anúncios ativa ainda, busca a lista
          fetchAdAccounts(store.id);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchAdAccounts(id: string) {
    try {
      const res = await fetch(`/api/v1/meta/accounts?store_id=${id}`);
      const data = await res.json();
      if (data.ok && data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleSelectAccount = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const actId = e.target.value;
    setSelectedAccountId(actId);
    if (!actId) return;

    setIntegrating(true);
    try {
      const res = await fetch("/api/v1/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, ad_account_id: actId }),
      });
      const data = await res.json();
      if (data.ok) {
        alert("Conta de anúncios vinculada!");
        loadHealth();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIntegrating(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadHealth();
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight flex items-center gap-2.5">
            <ShieldCheck size={26} className="text-[var(--color-brand-300)]" />
            Meta Account Trust & Health Score
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Diagnóstico de reputação interna da conta, risco de restrição e qualidade de leilão
          </p>
        </div>
        {healthData && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Reanalisar Conta
          </button>
        )}
      </div>

      {/* Seção para selecionar Conta de Anúncios Real */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            <Plug size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Conectar ao Facebook Ads</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Selecione a conta de anúncios ativa no seu perfil para monitoramento
            </p>
          </div>
        </div>

        <div className="max-w-md pt-2">
          {accounts.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-[var(--color-text-secondary)]">Escolher Conta de Anúncio</label>
              <select
                value={selectedAccountId}
                onChange={handleSelectAccount}
                disabled={integrating}
                className="input py-2 text-xs bg-[var(--color-bg-surface)] cursor-pointer"
              >
                <option value="">Selecione uma conta...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.id})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] space-y-3">
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Nenhum token ou integração de conta de anúncios encontrada. Acesse a página de <b>Integrações</b> para conectar seu Access Token do Facebook Ads Manager primeiro.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo Principal do Health Score (Apenas se já houver dados analisados) */}
      {healthData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Overall Trust Gauge */}
            <div className="glass-card p-6 flex flex-col items-center justify-center col-span-1 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                Trust Score Global
              </span>
              <HealthGauge score={healthData.trust_score} size="lg" />
              <div className="mt-4 space-y-3">
                <span
                  className={`badge text-xs font-bold px-2.5 py-1 ${
                    healthData.trust_score >= 85
                      ? "badge-success"
                      : healthData.trust_score >= 60
                      ? "badge-warning"
                      : "badge-danger"
                  }`}
                >
                  {healthData.trust_score >= 85
                    ? "Excelente Reputção"
                    : healthData.trust_score >= 60
                    ? "Atenção Moderada"
                    : "Alto Risco de Penalidade"}
                </span>

                {/* Trust Tier Badge */}
                {healthData.inferred_tier && (
                  <TierBadge tier={healthData.inferred_tier} />
                )}

                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Conta: <span className="font-semibold text-[var(--color-text-primary)]">{healthData.ad_account_id}</span>
                </p>
              </div>
            </div>

            {/* Right: 4 Core Pillars Overview */}
            <div className="glass-card p-6 col-span-2 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--color-brand-300)]" />
                Os 4 Pilares de Reputação da Meta
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <PillarCard
                  icon={<CheckCircle2 size={16} className="text-emerald-400" />}
                  title="Políticas & Compliance"
                  score={`${healthData.compliance_score}/100`}
                  description="Histórico de aprovação de anúncios e criativos"
                  status={healthData.compliance_score >= 80 ? "good" : "warning"}
                />

                <PillarCard
                  icon={<CreditCard size={16} className="text-cyan-400" />}
                  title="Saúde de Cobrança"
                  score={`${healthData.billing_score}/100`}
                  description="Consistência nos pagamentos sem falhas de cartão"
                  status={healthData.billing_score >= 80 ? "good" : "warning"}
                />

                <PillarCard
                  icon={<MessageSquareHeart size={16} className="text-pink-400" />}
                  title="Customer Feedback Score"
                  score={`${healthData.feedback_score} / 5.0`}
                  description="Avaliações de compradores nas pesquisas da Meta"
                  status={healthData.feedback_score >= 4.0 ? "good" : "warning"}
                />

                <PillarCard
                  icon={<Database size={16} className="text-violet-400" />}
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
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <TrendingUp size={16} className="text-[var(--color-brand-300)]" />
                Sinais Usados para Inferir o Trust Tier
                <span className="text-[10px] font-normal text-[var(--color-text-muted)] ml-1">
                  (Meta não expõe o Tier — inferido por 5 sinais reais)
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {healthData.tier_signals.map((s: any) => (
                  <div key={s.label} className="p-3 rounded-lg bg-[var(--color-bg-primary)]/70 border border-[var(--color-border-subtle)] space-y-2">
                    <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide leading-tight">{s.label}</p>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{s.value}</p>
                    <div className="w-full bg-[var(--color-bg-elevated)] rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-500)] transition-all"
                        style={{ width: `${Math.round((s.points / s.max) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)] text-right">{s.points}/{s.max} pts</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks & Actionable Insights Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[var(--color-success-400)]" />
                Recomendações para Blindagem da Conta
              </h3>
              <div className="space-y-2.5">
                {healthData.recommendations.map((rec: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-300)] mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{rec}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--color-warning-400)]" />
                Alertas e Riscos de Penalidade
              </h3>
              {healthData.risks_detected && healthData.risks_detected.length > 0 ? (
                <div className="space-y-2.5">
                  {healthData.risks_detected.map((risk: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300"
                    >
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{risk}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] text-center space-y-2">
                  <CheckCircle2 size={24} className="text-[var(--color-success-400)] mx-auto" />
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">Nenhum risco crítico detectado</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Sua conta de anúncio opera dentro dos limites ideais de conformidade da Meta.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card p-8 text-center space-y-3">
          <Info size={32} className="text-[var(--color-brand-300)] mx-auto" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum diagnóstico gerado ainda</h3>
          <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mx-auto">
            Por favor, selecione uma conta de anúncios ativa acima para rodar a primeira análise de pontuação e saúde da conta.
          </p>
        </div>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const config = {
    1: { label: "Tier 1 — Iniciante", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: "🥉" },
    2: { label: "Tier 2 — Estabelecida", color: "text-sky-400 bg-sky-500/10 border-sky-500/20", icon: "🥈" },
    3: { label: "Tier 3 — Consolidada", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: "🥇" },
  }[tier];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${config.color}`}>
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
    <div className="p-3.5 rounded-lg bg-[var(--color-bg-primary)]/70 border border-[var(--color-border-subtle)] flex flex-col justify-between space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</span>
        </div>
        <span
          className={`text-xs font-black px-1.5 py-0.5 rounded ${
            status === "good"
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-amber-400 bg-amber-500/10"
          }`}
        >
          {score}
        </span>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">{description}</p>
    </div>
  );
}
