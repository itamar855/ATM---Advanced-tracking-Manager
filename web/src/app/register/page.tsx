"use client";

import Link from "next/link";
import { Zap, Mail, Lock, User, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (error) {
        alert("Erro ao criar conta: " + error.message);
      } else {
        alert("Conta criada com sucesso! Faça login para prosseguir.");
        window.location.href = "/login";
      }
    } catch (err: any) {
      alert("Erro na conexão: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-[var(--color-brand-400)]/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] bg-[var(--color-accent-400)]/5 blur-[120px] rounded-full pointer-events-none" />

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
            Crie sua conta
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Comece a rastrear suas conversões em minutos
          </p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Nome
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="input pl-10"
                required
              />
            </div>
          </div>

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
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="input pl-10"
                minLength={8}
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
                Criando conta...
              </span>
            ) : (
              <>
                Criar Conta
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Benefits */}
        <div className="mt-6 space-y-2">
          {[
            "Tracking server-side CAPI validado",
            "Dashboard de lucro por campanha",
            "Health Score para cada evento",
            "Setup em 5 minutos, sem código",
          ].map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
            >
              <CheckCircle2
                size={14}
                className="text-[var(--color-success-400)] shrink-0"
              />
              {benefit}
            </div>
          ))}
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-[var(--color-brand-300)] hover:text-[var(--color-brand-200)] font-medium transition-colors"
          >
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
