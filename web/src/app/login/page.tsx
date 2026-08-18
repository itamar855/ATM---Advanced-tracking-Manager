"use client";

import Link from "next/link";
import { Zap, Mail, Lock, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Supabase Auth login
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--color-brand-400)]/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[var(--color-accent-400)]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-accent-400)] flex items-center justify-center shadow-lg">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">ATM</span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Bem-vindo de volta
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Entre para acessar seu dashboard de tracking
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              E-mail
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input pl-10"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                Senha
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--color-brand-300)] hover:text-[var(--color-brand-200)] transition-colors"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input pl-10"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Entrando...
              </span>
            ) : (
              <>
                Entrar
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Register link */}
        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          Não tem conta?{" "}
          <Link
            href="/register"
            className="text-[var(--color-brand-300)] hover:text-[var(--color-brand-200)] font-medium transition-colors"
          >
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
