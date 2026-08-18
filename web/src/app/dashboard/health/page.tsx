"use client";

import { useState, useEffect } from "react";
import { HeartPulse, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import { createClient } from "@/lib/supabase/client";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(87);

  useEffect(() => {
    async function loadHealth() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          const { data: healthData } = await supabase
            .from("events")
            .select("health_score")
            .eq("store_id", store.id)
            .eq("source", "server")
            .not("health_score", "is", null);

          if (healthData && healthData.length > 0) {
            const avg = Math.round(
              healthData.reduce((acc, h) => acc + (h.health_score || 0), 0) / healthData.length
            );
            setScore(avg);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadHealth();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Tracking Health Score
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Qualidade e cobertura de correspondência de dados de eventos (Event Match Quality)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Gauge */}
        <div className="glass-card p-6 flex flex-col items-center justify-center col-span-1">
          <HealthGauge score={score} size="lg" />
          <p className="text-xs text-[var(--color-text-muted)] text-center mt-4">
            Média de qualidade com base nos sinais recebidos
          </p>
        </div>

        {/* Right: Signal Details */}
        <div className="glass-card p-6 col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Status dos Sinais de Correspondência
          </h3>

          <div className="space-y-3">
            <SignalStatusRow label="Browser ID (fbp)" value={94} description="Cookies primários ativos" />
            <SignalStatusRow label="Click ID (fbc)" value={82} description="Cliques de campanhas Meta" />
            <SignalStatusRow label="IP & User-Agent" value={98} description="Atribuição capturada no navegador" />
            <SignalStatusRow label="Contatos (Email/Phone)" value={89} description="PII hasheado SHA-256" />
            <SignalStatusRow label="Identificador Externo" value={78} description="External ID correspondente" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalStatusRow({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[var(--color-bg-primary)]/50 border border-[var(--color-border-subtle)]">
      <div>
        <p className="font-semibold text-[var(--color-text-primary)]">{label}</p>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-24 h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              value >= 85
                ? "bg-[var(--color-success-400)]"
                : value >= 60
                ? "bg-[var(--color-warning-400)]"
                : "bg-[var(--color-danger-400)]"
            }`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="font-bold text-[var(--color-text-primary)] w-8 text-right">
          {value}%
        </span>
      </div>
    </div>
  );
}
