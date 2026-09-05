"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, X, ArrowUpRight, Sparkles } from "lucide-react";

export interface ToastNotification {
  id: string;
  type: "approved" | "pending";
  title: string;
  body: string;
  value?: number;
  paymentMethod?: string;
  customerName?: string;
  createdAt?: string;
}

interface NotificationToastProps {
  toast: ToastNotification | null;
  onDismiss: (id: string) => void;
  duration?: number;
}

export function NotificationToast({
  toast,
  onDismiss,
  duration = 6000,
}: NotificationToastProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setProgress(100);

    const stepMs = 50;
    const totalSteps = duration / stepMs;
    const decrement = 100 / totalSteps;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 250);
          return 0;
        }
        return prev - decrement;
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, [toast, duration, onDismiss]);

  if (!toast || !visible) return null;

  const isApproved = toast.type === "approved";
  const formattedValue =
    typeof toast.value === "number"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
          toast.value
        )
      : null;

  const rawMethod = String(toast.paymentMethod || "").toUpperCase();
  const methodLabel = rawMethod.includes("PIX")
    ? "PIX"
    : rawMethod.includes("BOLETO")
    ? "BOLETO"
    : rawMethod.includes("CART") || rawMethod.includes("CARD")
    ? "CARTÃO"
    : rawMethod || "PEDIDO";

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label={toast.title}
      className={`fixed bottom-5 right-5 z-50 max-w-sm w-full transition-all duration-300 transform ${
        visible ? "translate-y-0 opacity-100 scale-100" : "translate-y-4 opacity-0 scale-95"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-2xl p-4 shadow-2xl backdrop-blur-xl border transition-all ${
          isApproved
            ? "bg-zinc-950/95 border-emerald-500/30 shadow-emerald-950/40"
            : "bg-zinc-950/95 border-amber-500/30 shadow-amber-950/40"
        }`}
      >
        {/* Glow de fundo */}
        <div
          className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none ${
            isApproved ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />

        <div className="relative flex items-start gap-3.5">
          {/* Ícone */}
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
              isApproved
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}
          >
            {isApproved ? <CheckCircle2 size={20} /> : <Clock size={20} />}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isApproved
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                }`}
              >
                {isApproved ? "Venda Aprovada" : "Pedido Pendente"}
              </span>

              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {methodLabel}
              </span>

              {formattedValue && (
                <span className="text-xs font-black text-white ml-auto">
                  {formattedValue}
                </span>
              )}
            </div>

            <p className="text-xs font-semibold text-zinc-100 line-clamp-1 mb-0.5">
              {toast.title}
            </p>

            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
              {toast.body}
            </p>

            {toast.customerName && (
              <div className="flex items-center gap-1 mt-2 text-[10px] text-zinc-500">
                <Sparkles size={11} className="text-zinc-400" />
                <span className="truncate">{toast.customerName}</span>
              </div>
            )}
          </div>

          {/* Botão Fechar */}
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(() => onDismiss(toast.id), 250);
            }}
            className="absolute top-0 right-0 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Fechar notificação"
          >
            <X size={15} />
          </button>
        </div>

        {/* Barra de progresso de auto-fechamento */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-900 overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ease-linear ${
              isApproved ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
