"use client";

import { useState, useEffect } from "react";
import { Activity, ShieldCheck, Database, Loader2 } from "lucide-react";
import { EventTimeline } from "@/components/dashboard/EventTimeline";
import { createClient } from "@/lib/supabase/client";

export default function EventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    let active = true;

    async function loadEvents(silent = false) {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/v1/events/list");
        const data = await res.json();

        if (data.ok && Array.isArray(data.events) && active) {
          setEvents(data.events);
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
    }, 4000);

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
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Event Explorer
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Rastreabilidade completa de eventos despachados para a Meta Conversions API (CAPI)
        </p>
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

function getMockEvents() {
  return [
    {
      id: "e1",
      orderId: "Z-12ABC09XYZ",
      eventName: "Purchase",
      source: "server" as const,
      status: "accepted" as const,
      healthScore: 95,
      value: 297,
      createdAt: new Date().toISOString(),
      signals: {
        fbp: true,
        fbc: true,
        ip: true,
        ua: true,
        email: true,
        phone: true,
        externalId: true,
        address: true,
      },
    },
  ];
}
