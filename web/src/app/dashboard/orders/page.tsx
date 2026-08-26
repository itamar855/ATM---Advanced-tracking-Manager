"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  DollarSign,
  PackageCheck,
  Search,
  RotateCw,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Layers,
  Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch("/api/v1/orders/list", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders(false);
  }, []);

  // Polling em tempo real a cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders(true);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const filteredOrders = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      o.orderId.toLowerCase().includes(term) ||
      o.customerName.toLowerCase().includes(term) ||
      o.customerEmail.toLowerCase().includes(term) ||
      o.utmCampaign.toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || o.status.toLowerCase() === statusFilter.toLowerCase();
    return matchTerm && matchStatus;
  });

  const totalRevenue = orders.reduce((acc, o) => acc + (Number(o.value) || 0), 0);

  return (
    <div className="space-y-4 fade-in max-w-[1400px] mx-auto pb-16 pt-2 select-none text-zinc-200">
      {/* ── 1. Top Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Pedidos Rastreados & Atribuição CAPI
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Histórico e atribuição em tempo real de vendas vinculadas à Meta Conversions API
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
            <PackageCheck size={14} />
            <span>{orders.length} Pedido(s) Sincronizado(s)</span>
          </div>

          <button
            onClick={() => loadOrders(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-[0_0_12px_rgba(37,99,235,0.4)] transition-all active:scale-95 disabled:opacity-50"
          >
            <RotateCw size={12} className={isRefreshing ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── 2. Cards de Resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 block mb-1">Total de Pedidos Pagos</span>
            <span className="text-2xl font-black text-white font-mono">{orders.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <ShoppingCart size={20} />
          </div>
        </div>

        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 block mb-1">Faturamento Rastreado</span>
            <span className="text-2xl font-black text-purple-400 font-mono">
              R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <DollarSign size={20} />
          </div>
        </div>

        <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 block mb-1">Taxa de Atribuição CAPI</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">100%</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck size={20} />
          </div>
        </div>
      </div>

      {/* ── 3. Barra de Busca e Filtros ────────────────────────────────────── */}
      <div className="bg-[#11141E] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por ID do pedido, cliente ou UTM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#161B26] border border-zinc-700/60 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os Status</option>
            <option value="pago">Pago</option>
            <option value="processando">Processando</option>
          </select>
        </div>
      </div>

      {/* ── 4. Tabela de Pedidos ───────────────────────────────────────────── */}
      <div className="bg-[#0F121A] border border-zinc-800/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#141824] text-zinc-400 font-bold border-b border-zinc-800/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">ID PEDIDO</th>
                <th className="py-3 px-3">CLIENTE</th>
                <th className="py-3 px-2 text-center">STATUS</th>
                <th className="py-3 px-3 text-right">VALOR</th>
                <th className="py-3 px-3">PAGAMENTO</th>
                <th className="py-3 px-3">ORIGEM / UTM</th>
                <th className="py-3 px-4 text-right">DATA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#151924] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white text-[11px]">
                      {order.orderId}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200">{order.customerName}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">{order.customerEmail}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                      R$ {Number(order.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-zinc-300 font-medium">
                      <span className="flex items-center gap-1.5">
                        <CreditCard size={12} className="text-zinc-500" />
                        {order.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-blue-400">{order.utmSource}</span>
                        <span className="text-[10px] text-zinc-400 truncate max-w-[260px]" title={order.utmCampaign}>
                          {order.utmCampaign}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400 font-mono text-[11px]">
                      {new Date(order.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
