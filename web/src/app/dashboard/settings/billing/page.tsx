"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, ShieldAlert, Loader2, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const plans = [
  {
    name: "Starter",
    price: 97,
    limit: "Até 10k visitas/mês",
    features: [
      "Rastreamento CAPI Híbrido",
      "Deduplicação Browser + Server",
      "Ponte de Cookies Primários (1st party)",
      "Health Score em tempo real",
      "Até 1 pixel integrado",
    ],
  },
  {
    name: "Pro",
    price: 197,
    limit: "Até 100k visitas/mês",
    features: [
      "Tudo do plano Starter",
      "Dashboard de Lucro P&L completo",
      "Sincronização de custos Meta Ads",
      "Event Lineage tracker",
      "Até 3 pixels integrados",
      "Prioridade suporte email",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: 397,
    limit: "Visitas Ilimitadas",
    features: [
      "Tudo do plano Pro",
      "Detector de Emissor Duplicado",
      "Sanitizador PII Browser",
      "Pixels Ilimitados",
      "Suporte VIP via WhatsApp/Teams",
      "Múltiplos domínios customizados",
    ],
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    async function loadBilling() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (tenantData) {
          setTenant(tenantData);
          setCurrentPlan(tenantData.plan || "free");
        }
      }
    }
    loadBilling();
  }, []);

  const handleSubscribe = async (planName: string, price: number) => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: tenant?.email || "usuario@teste.com",
          name: tenant?.name || "Lojista ATM",
          planName,
          price,
          tenantId: tenant?.id || "mock-tenant-id",
        }),
      });

      const data = await response.json();
      if (data.ok && data.init_point) {
        // Redireciona o lojista para o Checkout Seguro do Mercado Pago
        window.location.href = data.init_point;
      } else {
        alert("Erro ao iniciar checkout: " + data.error);
      }
    } catch (error) {
      console.error("Billing Checkout Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Assinatura e Plano
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gerencie seu plano de assinatura e faturamento no Mercado Pago
        </p>
      </div>

      {/* Current plan card */}
      <div className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-400)]/10 flex items-center justify-center text-[var(--color-brand-300)]">
            <CreditCard size={24} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Plano Atual:{" "}
              <span className="text-gradient capitalize font-bold">{currentPlan}</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Seu plano é renovado mensalmente de forma automática.
            </p>
          </div>
        </div>

        {currentPlan === "free" && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-warning-400)] px-3 py-1.5 rounded-lg bg-[var(--color-warning-500)]/10 border border-[var(--color-warning-500)]/20">
            <ShieldAlert size={14} />
            <span>Métricas avançadas e CAPI bloqueadas neste plano</span>
          </div>
        )}
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan.toLowerCase() === plan.name.toLowerCase();

          return (
            <div
              key={plan.name}
              className={`glass-card p-6 flex flex-col justify-between relative ${
                plan.popular ? "border-[var(--color-brand-400)] bg-[var(--color-bg-card-hover)] shadow-glow" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-500)] text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <Sparkles size={10} />
                  Recomendado
                </span>
              )}

              <div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{plan.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{plan.limit}</p>

                <div className="mt-5 flex items-baseline">
                  <span className="text-3xl font-extrabold text-[var(--color-text-primary)]">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] ml-1">/mês</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-xs text-[var(--color-text-secondary)]">
                      <CheckCircle2 size={14} className="text-[var(--color-brand-300)] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => handleSubscribe(plan.name, plan.price)}
                  disabled={loading || isCurrent}
                  className={`w-full ${
                    plan.popular ? "btn-primary" : "btn-secondary"
                  } py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2`}
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isCurrent ? (
                    "Plano Ativo"
                  ) : (
                    `Assinar ${plan.name}`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
