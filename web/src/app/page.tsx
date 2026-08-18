import Link from "next/link";
import {
  Zap,
  Shield,
  BarChart3,
  Target,
  ArrowRight,
  CheckCircle2,
  Activity,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-[var(--color-bg-primary)]/80 backdrop-blur-md border-b border-[var(--color-border-default)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-accent-400)] flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-gradient">ATM</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Entrar
            </Link>
            <Link href="/register" className="btn-primary text-sm py-2 px-4">
              Começar Grátis
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[var(--color-brand-400)]/8 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-brand-400)]/10 border border-[var(--color-brand-400)]/20 mb-6">
            <Activity size={14} className="text-[var(--color-brand-300)]" />
            <span className="text-xs font-medium text-[var(--color-brand-300)]">
              Tracking Server-Side Avançado para Shopify
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            <span className="text-[var(--color-text-primary)]">
              Rastreie cada venda.
            </span>
            <br />
            <span className="text-gradient">
              Maximize seu ROAS.
            </span>
          </h1>

          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            O ATM é a plataforma de tracking e rastreamento de campanhas mais avançada
            do mercado. Conecte sua Shopify, rastreie cada conversão server-side e veja
            o lucro real de cada campanha Meta Ads.
          </p>

          <div className="flex items-center justify-center gap-4 mb-16">
            <Link href="/register" className="btn-primary py-3 px-8 text-base">
              <Zap size={18} />
              Comece Agora — É Grátis
            </Link>
            <Link href="/dashboard" className="btn-secondary py-3 px-8 text-base">
              Ver Demo
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-8 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-[var(--color-success-400)]" />
              Tracking CAPI Validado
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-[var(--color-success-400)]" />
              Deduplicação Inteligente
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-[var(--color-success-400)]" />
              Setup em 5 Minutos
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-[var(--color-border-default)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-3">
              Por que o ATM é diferente?
            </h2>
            <p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
              Não somos apenas um tracker. Somos sua infraestrutura de sinais completa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Target}
              title="Tracking Server-Side"
              description="Envie conversões diretamente à Meta via CAPI com IP e User-Agent reais do navegador. Imune a bloqueadores."
              gradient="from-violet-500/20 to-fuchsia-500/20"
            />
            <FeatureCard
              icon={BarChart3}
              title="Dashboard de Lucro"
              description="Veja receita, gasto, lucro e ROAS real por campanha, adset e criativo. Com custos de produto integrados."
              gradient="from-emerald-500/20 to-cyan-500/20"
            />
            <FeatureCard
              icon={Shield}
              title="Health Score"
              description="Score 0-100 para cada evento, mostrando cobertura de fbp, fbc, IP, UA, email, phone e endereço."
              gradient="from-amber-500/20 to-orange-500/20"
            />
            <FeatureCard
              icon={Activity}
              title="Event Lineage"
              description="Rastreie o caminho completo: Click → Sessão → Checkout → Pedido → CAPI → Meta aceita."
              gradient="from-cyan-500/20 to-blue-500/20"
            />
            <FeatureCard
              icon={Zap}
              title="Dedup Inteligente"
              description="Browser e Server usam o mesmo event_id. A Meta deduplica automaticamente, sem inflar conversões."
              gradient="from-rose-500/20 to-pink-500/20"
            />
            <FeatureCard
              icon={Shield}
              title="Detector de Duplicatas"
              description="Detecta automaticamente quando outra integração está enviando eventos server-side para o mesmo Pixel."
              gradient="from-indigo-500/20 to-violet-500/20"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[var(--color-border-default)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
            Pronto para rastrear cada conversão?
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-8">
            Configure em 5 minutos. Sem código. Sem complicação.
          </p>
          <Link href="/register" className="btn-primary py-3 px-10 text-base">
            <Zap size={18} />
            Começar Agora — Grátis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border-default)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-accent-400)] flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="text-sm font-bold text-gradient">ATM</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            © 2026 ATM — Advanced Tracking Manager. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  gradient,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="metric-card group cursor-default">
      <div
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
      >
        <Icon size={20} className="text-[var(--color-text-primary)]" />
      </div>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}
