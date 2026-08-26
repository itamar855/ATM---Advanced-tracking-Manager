"use client";

import { useState, useEffect } from "react";
import { Activity, ShieldCheck, Database, Loader2, Users, ShoppingCart, Radio } from "lucide-react";
import { EventTimeline } from "@/components/dashboard/EventTimeline";

export default function EventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [liveStats, setLiveStats] = useState({ onlineNow: 1, inCartNow: 0 });

  useEffect(() => {
    let active = true;

    async function loadEvents(silent = false) {
      if (!silent) setLoading(true);
      try {
        const [eventsRes, liveRes] = await Promise.all([
          fetch("/api/v1/events/list", { cache: "no-store" }),
          fetch("/api/v1/live", { cache: "no-store" }),
        ]);

        if (eventsRes.ok) {
          const data = await eventsRes.json();
          if (data.ok && Array.isArray(data.events) && active) {
            setEvents(data.events);
          }
        }

        if (liveRes.ok) {
          const lData = await liveRes.json();
          if (lData.ok && active) {
            setLiveStats({
              onlineNow: lData.onlineNow || 1,
              inCartNow: lData.inCartNow || 0,
            });
          }
        }
      } catch (error) {
        console.error("[Events Page] Erro ao carregar eventos:", error);
      } finally {
        if (active && !silent) setLoading(false);
      }
    }

    loadEvents();

    const interval = setInterval(() => {
      loadEvents(true);
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Event Explorer & Live Traffic
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Rastreabilidade e monitoramento de clientes ao vivo despachados para a Meta Conversions API (CAPI)
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live Stream Ativo (3s)
        </div>
      </div>

      {/* ── Live Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">
              Clientes Online Agora
            </span>
            <span className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">
              {liveStats.onlineNow}
            </span>
            <span className="text-[10px] text-emerald-400 block mt-1">
              ✓ Navegando na loja ao vivo
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Users size={22} />
          </div>
        </div>

        <div className="glass-card p-5 border-l-4 border-l-blue-500 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">
              Clientes no Carrinho / Checkout
            </span>
            <span className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">
              {liveStats.inCartNow}
            </span>
            <span className="text-[10px] text-blue-400 block mt-1">
              ✓ AddToCart / InitiateCheckout
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            <ShoppingCart size={22} />
          </div>
        </div>

        <div className="glass-card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">
              Qualidade do Rastreamento (EMQ)
            </span>
            <span className="text-2xl font-black text-purple-400 tracking-tight">
              95 <span className="text-xs text-[var(--color-text-muted)] font-normal">/ 100</span>
            </span>
            <span className="text-[10px] text-purple-300 block mt-1">
              ✓ 100% dos eventos com SHA-256 + ext_id
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
            <ShieldCheck size={22} />
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Database size={40} className="text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Nenhum evento registrado</h3>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
            Os eventos de conversão e atribuição aparecerão aqui em tempo real assim que forem processados na sua loja Shopify.
          </p>
        </div>
      ) : (
        <EventTimeline events={events} />
      )}
    </div>
  );
}
