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
    <div className="min-h-screen bg-[#0a0a0b]">
      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0a0b]/70 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2997ff] to-[#0071e3] flex items-center justify-center shadow-lg">
              <Zap size={14} className="text-white" />
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">ATM</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-[13px] font-medium text-white/50 hover:text-white/90 transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 bg-[#2997ff] hover:brightness-110 text-white rounded-xl transition-all shadow-[0_4px_16px_rgba(41,151,255,0.25)]"
            >
              Começar Grátis
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-6 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[#2997ff]/[0.06] blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-32 left-1/2 -translate-x-[60%] w-[300px] h-[300px] bg-[#30d158]/[0.04] blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          {/* Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2997ff]/[0.08] border border-[#2997ff]/[0.15] mb-8">
            <Activity size={12} className="text-[#2997ff]" />
            <span className="text-[11.5px] font-medium text-[#2997ff]">
              Tracking Server-Side para Shopify
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-6 text-white">
            Rastreie cada venda.{" "}
            <br />
            <span className="text-gradient">Maximize seu ROAS.</span>
          </h1>

          <p className="text-[17px] text-white/45 max-w-2xl mx-auto mb-10 leading-relaxed">
            Conecte sua Shopify, rastreie cada conversão server-side e veja
            o lucro real de cada campanha Meta Ads — em tempo real.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
            <Link
              href="/register"
              className="flex items-center gap-2 text-[14px] font-semibold px-6 py-3 bg-[#2997ff] hover:brightness-110 text-white rounded-2xl transition-all shadow-[0_8px_32px_rgba(41,151,255,0.3)]"
            >
              <Zap size={16} />
              Comece Agora — É Grátis
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-[14px] font-semibold px-6 py-3 bg-white/[0.06] hover:bg-white/[0.09] text-white/80 border border-white/[0.09] rounded-2xl transition-all"
            >
              Ver Demo
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-[12px] text-white/30">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-[#30d158]" />
              Tracking CAPI Validado
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-[#30d158]" />
              Deduplicação Inteligente
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-[#30d158]" />
              Setup em 5 Minutos
            </span>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
              Por que o ATM é diferente?
            </h2>
            <p className="text-[15px] text-white/35 max-w-xl mx-auto leading-relaxed">
              Não somos apenas um tracker. Somos sua infraestrutura de sinais completa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Target}
              title="Tracking Server-Side"
              description="Envie conversões diretamente à Meta via CAPI com IP e User-Agent reais do navegador. Imune a bloqueadores."
              accent="#2997ff"
            />
            <FeatureCard
              icon={BarChart3}
              title="Dashboard de Lucro"
              description="Veja receita, gasto, lucro e ROAS real por campanha, adset e criativo. Com custos de produto integrados."
              accent="#30d158"
            />
            <FeatureCard
              icon={Shield}
              title="Health Score"
              description="Score 0-100 para cada evento, mostrando cobertura de fbp, fbc, IP, UA, email, phone e endereço."
              accent="#ff9f0a"
            />
            <FeatureCard
              icon={Activity}
              title="Event Lineage"
              description="Rastreie o caminho completo: Click → Sessão → Checkout → Pedido → CAPI → Meta aceita."
              accent="#2997ff"
            />
            <FeatureCard
              icon={Zap}
              title="Dedup Inteligente"
              description="Browser e Server usam o mesmo event_id. A Meta deduplica automaticamente, sem inflar conversões."
              accent="#30d158"
            />
            <FeatureCard
              icon={Shield}
              title="Detector de Duplicatas"
              description="Detecta automaticamente quando outra integração está enviando eventos server-side para o mesmo Pixel."
              accent="#ff453a"
            />
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-4">
            Pronto para rastrear cada conversão?
          </h2>
          <p className="text-[15px] text-white/35 mb-8 leading-relaxed">
            Configure em 5 minutos. Sem código. Sem complicação.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3.5 bg-[#2997ff] hover:brightness-110 text-white rounded-2xl transition-all shadow-[0_8px_32px_rgba(41,151,255,0.3)]"
          >
            <Zap size={16} />
            Começar Agora — Grátis
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#2997ff] to-[#0071e3] flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="text-[13px] font-semibold text-white/70">ATM</span>
          </div>
          <p className="text-[11.5px] text-white/20">
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
  accent,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.10] hover:bg-[#1c1c1e] transition-all group relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-105"
        style={{ background: `${accent}18`, border: `1px solid ${accent}20` }}
      >
        <Icon size={17} style={{ color: accent }} />
      </div>
      <h3 className="text-[14px] font-semibold text-white/80 mb-2 tracking-tight">{title}</h3>
      <p className="text-[12.5px] text-white/35 leading-relaxed">{description}</p>
    </div>
  );
}
