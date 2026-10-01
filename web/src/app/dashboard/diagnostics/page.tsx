"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function DiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);

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
    <div className="space-y-6 fade-in max-w-4xl mx-auto pb-12 select-none">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Alertas & Diagnósticos
        </h1>
        <p className="text-[13px] text-white/40 mt-1">
          Monitoramento ativo do sinal de dados e detecção de duplicidades server-side
        </p>
      </div>

      {/* Seção de Recuperação de Conversões (Contingência) */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#2997ff]" />
            Recuperação de Conversões (Contingência)
          </h2>
          <p className="text-[12.5px] text-white/40 mt-1 leading-relaxed">
            Se a Meta perdeu eventos por conta de um pixel quebrado, você pode forçar o reenvio (somente eventos com menos de 7 dias serão deduplicados com segurança).
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block">Data Base do Resgate</label>
              <input 
                type="date" 
                id="recoveryDate"
                defaultValue={new Date(Date.now() - 86400000).toISOString().split('T')[0]} 
                className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-[#2997ff]/40 transition-colors" 
                disabled={isRecovering}
              />
            </div>
            <button
              disabled={isRecovering}
              onClick={async () => {
                const d = (document.getElementById('recoveryDate') as HTMLInputElement).value;
                if (!d) return alert('Selecione uma data');
                if (!confirm('Deseja reenviar as conversões (Purchases) desta data para a Meta?')) return;
                
                setIsRecovering(true);
                setRecoveryMsg(null);
                const start = new Date(d);
                start.setHours(0, 0, 0, 0);
                const end = new Date(d);
                end.setHours(23, 59, 59, 999);
                
                try {
                  const res = await fetch('/api/v1/sync/recovery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startDate: start.toISOString(), endDate: end.toISOString() })
                  });
                  const json = await res.json();
                  
                  if (res.ok) {
                    setRecoveryMsg({ type: 'success', text: json.message });
                  } else {
                    setRecoveryMsg({ type: 'error', text: json.error || 'Erro desconhecido' });
                  }
                } catch (e: any) {
                  setRecoveryMsg({ type: 'error', text: 'Erro de conexão: ' + e.message });
                } finally {
                  setIsRecovering(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-[#2997ff] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all mb-[1px] flex items-center gap-2 shadow-[0_4px_14px_rgba(41,151,255,0.25)]"
            >
              {isRecovering ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Buscando e Processando...
                </>
              ) : (
                "Iniciar Resgate"
              )}
            </button>
          </div>
          
          {recoveryMsg && (
            <div className={`text-xs px-3.5 py-2.5 rounded-xl border ${recoveryMsg.type === 'success' ? 'bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]' : 'bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]'}`}>
              {recoveryMsg.text}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3.5">
        {list.map((d) => (
          <div
            key={d.id}
            className={`bg-[#18181a] border border-white/[0.06] rounded-2xl p-5 flex items-start gap-4 border-l-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${
              d.severity === "critical"
                ? "border-l-[#ff453a]"
                : d.severity === "warning"
                ? "border-l-[#ffd60a]"
                : "border-l-[#2997ff]"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {d.severity === "critical" ? (
                <ShieldAlert size={20} className="text-[#ff453a]" />
              ) : d.severity === "warning" ? (
                <AlertTriangle size={20} className="text-[#ffd60a]" />
              ) : (
                <AlertCircle size={20} className="text-[#2997ff]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white/90">
                  {d.title}
                </h4>
                <span className="text-[11px] text-white/30">
                  {formatRelativeTime(d.created_at)}
                </span>
              </div>
              <p className="text-[12.5px] text-white/50 mt-1 leading-relaxed">
                {d.description}
              </p>
              {d.evidence && Object.keys(d.evidence).length > 0 && (
                <pre className="mt-3 text-[11px] bg-white/[0.03] p-3 rounded-xl border border-white/[0.06] text-white/60 overflow-x-auto font-mono">
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
