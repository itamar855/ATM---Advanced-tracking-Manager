"use client";

import { useStore } from "@/contexts/StoreContext";
import { usePathname } from "next/navigation";
import { Store, Loader2 } from "lucide-react";
import Link from "next/link";

export default function StoreGuard({ children }: { children: React.ReactNode }) {
  const { stores, loading } = useStore();
  const pathname = usePathname();

  // Se estiver carregando as lojas iniciais, mostra loading no nível do painel
  if (loading && stores.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-500">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm font-medium">Carregando painel...</p>
        </div>
      </div>
    );
  }

  // Se não houver lojas e não estiver na página de criação, bloqueia a UI
  if (stores.length === 0 && pathname !== "/dashboard/settings/store") {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#141824] border border-zinc-800/80 rounded-2xl p-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
            <Store size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Crie sua Primeira Loja</h2>
          <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
            Para começar a rastrear suas campanhas e visualizar o dashboard, você precisa conectar sua loja na plataforma.
          </p>
          <Link
            href="/dashboard/settings/store"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors text-sm"
          >
            Conectar Loja Agora
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
