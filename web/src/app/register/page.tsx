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
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#2997ff]/[0.05] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-[#30d158]/[0.03] blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-[380px] relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2997ff] to-[#0071e3] flex items-center justify-center shadow-[0_8px_24px_rgba(41,151,255,0.25)]">
              <Zap size={20} className="text-white" />
            </div>
          </Link>
          <h1 className="text-[22px] font-bold text-white tracking-tight mb-1.5">
            Crie sua conta
          </h1>
          <p className="text-[13.5px] text-white/40">
            Comece a rastrear suas conversões em minutos
          </p>
        </div>

        {/* Register Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#18181a] border border-white/[0.07] rounded-3xl p-6 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
        >
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Nome Completo
            </label>
            <div className="relative">
              <User
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl text-[13.5px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 focus:bg-white/[0.06] transition-all"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/30">
              E-mail
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl text-[13.5px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 focus:bg-white/[0.06] transition-all"
                required
              />
            </div>
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Senha
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl text-[13.5px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 focus:bg-white/[0.06] transition-all"
                minLength={8}
                required
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-[14px] font-semibold rounded-xl transition-all shadow-[0_4px_16px_rgba(41,151,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Criando conta...
              </span>
            ) : (
              <>
                Criar Conta
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Benefits */}
        <div className="mt-6 space-y-2 px-2">
          {[
            "Tracking server-side CAPI validado",
            "Dashboard de lucro por campanha",
            "Health Score para cada evento",
            "Setup em 5 minutos, sem código",
          ].map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-2 text-[12px] text-white/40"
            >
              <CheckCircle2
                size={14}
                className="text-[#30d158] shrink-0"
              />
              {benefit}
            </div>
          ))}
        </div>

        {/* Login link */}
        <p className="text-center text-[13px] text-white/30 mt-6">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-[#2997ff] hover:text-[#52a8ff] font-semibold transition-colors"
          >
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
