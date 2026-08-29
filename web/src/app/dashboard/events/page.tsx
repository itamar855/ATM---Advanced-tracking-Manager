"use client";

import { useState, useEffect } from "react";
import { Activity, ShieldCheck, Database, Loader2, Users, ShoppingCart, RefreshCw, Zap } from "lucide-react";
import { EventTimeline, EventItem } from "@/components/dashboard/EventTimeline";
import { useStore } from "@/contexts/StoreContext";

export default function EventsPage() {
  const { activeStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [liveStats, setLiveStats] = useState({ onlineNow: 1, inCartNow: 0 });
  const [emqScore, setEmqScore] = useState(95);
  const [capiDeliveryRate, setCapiDeliveryRate] = useState(100);
  const [flushingQueue, setFlushingQueue] = useState(false);
  const [queueMsg, setQueueMsg] = useState("");

  useEffect(() => {
    let active = true;

    async function loadEvents(silent = false) {
      if (!activeStore) return;
      if (!silent && events.length === 0) setLoading(true);
      try {
        const ts = Date.now();
        const [eventsRes, liveRes] = await Promise.all([
          fetch(`/api/v1/events/list?t=${ts}&store_id=${activeStore.id}`, { cache: "no-store" }),
          fetch(`/api/v1/live?t=${ts}&store_id=${activeStore.id}`, { cache: "no-store" }),
        ]);

        if (eventsRes.ok) {
          const data = await eventsRes.json();
          if (data.ok && Array.isArray(data.events) && active) {
            setEvents(data.events);
            if (data.avgEmq) setEmqScore(data.avgEmq);
            if (data.deliveryRate !== undefined) setCapiDeliveryRate(data.deliveryRate);
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
        if (active) setLoading(false);
      }
    }

    loadEvents();

    const interval = setInterval(() => {
      loadEvents(true);
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore]);

  const handleFlushQueue = async () => {
    setFlushingQueue(true);
    setQueueMsg("");
    try {
      const res = await fetch("/api/v1/events/queue", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setQueueMsg(data.message || "Fila reprocessada com sucesso!");
        setTimeout(() => setQueueMsg(""), 5000);
        // Recarrega os eventos imediatamente
        try {
          const evRes = await fetch(`/api/v1/events/list?store_id=${activeStore?.id}`, { cache: "no-store" });
          const evData = await evRes.json();
          if (evData.ok && Array.isArray(evData.events)) {
            setEvents(evData.events);
          }
        } catch {}
      } else {
        setQueueMsg(data.error || "Erro ao processar fila");
      }
    } catch (e: any) {
      setQueueMsg(e.message || "Erro de conexão ao processar fila");
    } finally {
      setFlushingQueue(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12 font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Event Explorer & Live Traffic
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30 font-mono">
              META CAPI v23.0
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Rastreabilidade e monitoramento em tempo real de clientes e conversões despachadas para o ecossistema Meta
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleFlushQueue}
            disabled={flushingQueue}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#141824] hover:bg-[#1A2030] border border-zinc-800 text-zinc-300 transition-all flex items-center gap-2 disabled:opacity-50"
            title="Reprocessar eventos pendentes ou falhos na fila de envio da Meta"
          >
            <RefreshCw size={13} className={flushingQueue ? "animate-spin text-blue-400" : "text-zinc-400"} />
            <span>{flushingQueue ? "Processando Fila..." : "Reprocessar Fila"}</span>
          </button>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Stream Ativo (4s)
          </div>
        </div>
      </div>

      {queueMsg && (
        <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center gap-2 animate-fade-in font-medium">
          <Activity size={14} className="shrink-0" />
          <span>{queueMsg}</span>
        </div>
      )}

      {/* ── Live Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-zinc-800/80 bg-[#0C0F17] p-5 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Clientes Online Agora
            </span>
            <span className="text-2xl font-black text-white tracking-tight font-mono">
              {liveStats.onlineNow}
            </span>
            <span className="text-[11px] text-emerald-400 font-medium block">
              ✓ Navegando na loja ao vivo
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Users size={22} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-[#0C0F17] p-5 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Clientes no Checkout
            </span>
            <span className="text-2xl font-black text-white tracking-tight font-mono">
              {liveStats.inCartNow}
            </span>
            <span className="text-[11px] text-blue-400 font-medium block">
              ✓ AddToCart / Checkout
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <ShoppingCart size={22} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-[#0C0F17] p-5 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Saúde da Fila CAPI
            </span>
            <span className="text-2xl font-black text-indigo-400 tracking-tight font-mono">
              {capiDeliveryRate}%
            </span>
            <span className="text-[11px] text-indigo-300 font-medium block">
              ✓ Entrega em tempo real
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Database size={22} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-[#0C0F17] p-5 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Qualidade do Rastreamento
            </span>
            <span className="text-2xl font-black text-purple-400 tracking-tight font-mono">
              {emqScore} <span className="text-xs text-zinc-500 font-normal">/ 100</span>
            </span>
            <span className="text-[11px] text-purple-300 font-medium block">
              ✓ 100% com SHA-256 + PII
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <ShieldCheck size={22} />
          </div>
        </div>
      </div>

      {/* ── Feed de Eventos com Deep Inspector ── */}
      <EventTimeline events={events} />
    </div>
  );
}
