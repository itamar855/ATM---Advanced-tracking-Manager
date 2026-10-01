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
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-12 select-none">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Assinatura e Plano
        </h1>
        <p className="text-[13px] text-white/40 mt-1">
          Gerencie seu plano de assinatura e faturamento no Mercado Pago
        </p>
      </div>

      {/* Current plan card */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#2997ff]/10 border border-[#2997ff]/20 flex items-center justify-center text-[#2997ff]">
            <CreditCard size={22} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">
              Plano Atual:{" "}
              <span className="text-[#2997ff] capitalize font-bold">{currentPlan}</span>
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Seu plano é renovado mensalmente de forma automática.
            </p>
          </div>
        </div>

        {currentPlan === "free" && (
          <div className="flex items-center gap-2 text-xs text-[#ffd60a] px-3.5 py-1.5 rounded-full bg-[#ffd60a]/10 border border-[#ffd60a]/20 font-medium">
            <ShieldAlert size={14} />
            <span>Métricas avançadas e CAPI bloqueadas neste plano</span>
          </div>
        )}
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {plans.map((plan) => {
          const isCurrent = currentPlan.toLowerCase() === plan.name.toLowerCase();

          return (
            <div
              key={plan.name}
              className={`bg-[#18181a] border rounded-3xl p-7 flex flex-col justify-between relative shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all ${
                plan.popular ? "border-[#2997ff]/40 bg-[#1a1a1d] shadow-[0_16px_40px_rgba(41,151,255,0.12)]" : "border-white/[0.06]"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2997ff] text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <Sparkles size={10} />
                  Recomendado
                </span>
              )}

              <div>
                <h3 className="text-base font-bold text-white tracking-tight">{plan.name}</h3>
                <p className="text-xs text-white/40 mt-1">{plan.limit}</p>

                <div className="mt-5 flex items-baseline">
                  <span className="text-3xl font-extrabold text-white tracking-tight">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-xs text-white/40 ml-1.5">/mês</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-xs text-white/60">
                      <CheckCircle2 size={14} className="text-[#30d158] shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => handleSubscribe(plan.name, plan.price)}
                  disabled={loading || isCurrent}
                  className={`w-full py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    plan.popular
                      ? "bg-[#2997ff] hover:brightness-110 text-white shadow-[0_4px_16px_rgba(41,151,255,0.25)]"
                      : "bg-white/[0.06] hover:bg-white/[0.1] text-white/90 border border-white/[0.08]"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
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
