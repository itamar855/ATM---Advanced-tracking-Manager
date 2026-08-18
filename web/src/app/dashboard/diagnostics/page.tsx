"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function DiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);

  useEffect(() => {
    async function loadDiagnostics() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          const { data: dbDiagnostics } = await supabase
            .from("diagnostics")
            .select("*")
            .eq("store_id", store.id)
            .order("created_at", { ascending: false });

          if (dbDiagnostics) {
            setDiagnostics(dbDiagnostics);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadDiagnostics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  const list = diagnostics.length > 0 ? diagnostics : getMockDiagnostics();

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Alertas & Diagnósticos
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Monitoramento ativo do sinal de dados e detecção de duplicidades server-side
        </p>
      </div>

      <div className="space-y-4">
        {list.map((d) => (
          <div
            key={d.id}
            className={`glass-card p-5 flex items-start gap-4 border-l-4 ${
              d.severity === "critical"
                ? "border-l-[var(--color-danger-500)]"
                : d.severity === "warning"
                ? "border-l-[var(--color-warning-500)]"
                : "border-l-[var(--color-brand-500)]"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {d.severity === "critical" ? (
                <ShieldAlert size={20} className="text-[var(--color-danger-400)]" />
              ) : d.severity === "warning" ? (
                <AlertTriangle size={20} className="text-[var(--color-warning-400)]" />
              ) : (
                <AlertCircle size={20} className="text-[var(--color-brand-300)]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {d.title}
                </h4>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatRelativeTime(d.created_at)}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                {d.description}
              </p>
              {d.evidence && Object.keys(d.evidence).length > 0 && (
                <pre className="mt-3 text-[10px] bg-[var(--color-bg-surface)] p-2.5 rounded border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] overflow-x-auto">
                  {JSON.stringify(d.evidence, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getMockDiagnostics() {
  return [
    {
      id: "d1",
      severity: "warning",
      title: "User-Agent ausente em eventos de servidor",
      description: "A Meta reportou a ausência de User-Agent nos parâmetros em alguns eventos CAPI. Verifique se o pixel foi desinstalado da Shopify.",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: "d2",
      severity: "critical",
      title: "Possível emissor duplicado detectado",
      description: "A razão de eventos Server/Browser ultrapassou 3.9x nas últimas 24h. Isso geralmente indica que outro app de Pixel ou API na Shopify/Zedy está duplicando disparos para o mesmo Dataset.",
      evidence: {
        ratio: "3.99x",
        browser_count: 290,
        server_count: 1158,
        reference_order: "Z-11ERP08JMO2634690",
      },
      created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
  ];
}
