"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
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
  const [dateFilter, setDateFilter] = useState("today");
  const { activeStore } = useStore();

  const loadOrders = async (silent = false) => {
    if (!activeStore) return;
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch(`/api/v1/orders/list?store_id=${activeStore.id}`, { cache: "no-store" });
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
  }, [activeStore]);

  // Polling em tempo real a cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [activeStore]);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingZedy, setSyncingZedy] = useState(false);
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [syncFeedback, setSyncFeedback] = useState("");

  const handleSyncZedy = async (mode: "auto" | "json" | "reset_auto") => {
    setSyncingZedy(true);
    setSyncFeedback("");
    try {
      const isJsonMode = mode === "json" || mode === "reset_auto";
      const body: any = isJsonMode && jsonInput.trim() ? { raw_json: jsonInput.trim() } : {};
      if (mode === "reset_auto") {
        body.reset_today = true;
      }
      const res = await fetch("/api/v1/sync/zedy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncFeedback(`✓ ${data.message || `${data.synced_count} pedidos sincronizados!`}`);
        loadOrders(true);
        if (mode === "json") setJsonInput("");
        setTimeout(() => {
          setSyncFeedback("");
          setSyncModalOpen(false);
        }, 2500);
      } else {
        setSyncFeedback(`✗ ${data.error || "Erro ao sincronizar"}`);
      }
    } catch (e: any) {
      setSyncFeedback(`✗ ${e.message || "Erro de conexão"}`);
    } finally {
      setSyncingZedy(false);
    }
  };

  const handleSyncShopify = async (resetToday = false) => {
    setSyncingShopify(true);
    setSyncFeedback("");
    try {
      const res = await fetch("/api/v1/sync/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_today: resetToday }),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncFeedback(`✓ ${data.message}`);
        loadOrders(true);
        setTimeout(() => {
          setSyncFeedback("");
          setSyncModalOpen(false);
        }, 3500);
      } else {
        setSyncFeedback(`✗ ${data.error || "Erro ao sincronizar"}`);
      }
    } catch (e: any) {
      setSyncFeedback(`✗ ${e.message || "Erro de conexão"}`);
    } finally {
      setSyncingShopify(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      o.orderId.toLowerCase().includes(term) ||
      (o.customerName || "").toLowerCase().includes(term) ||
      (o.customerEmail || "").toLowerCase().includes(term) ||
      (o.utmCampaign || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || o.status.toLowerCase() === statusFilter.toLowerCase();
    
    let matchDate = true;
    if (dateFilter !== "all" && o.createdAt) {
      const orderDate = new Date(o.createdAt);
      const now = new Date();
      if (dateFilter === "today") {
        matchDate = orderDate.toDateString() === now.toDateString();
      } else if (dateFilter === "yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        matchDate = orderDate.toDateString() === yesterday.toDateString();
      } else if (dateFilter === "7d") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        matchDate = orderDate >= sevenDaysAgo;
      } else if (dateFilter === "30d") {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        matchDate = orderDate >= thirtyDaysAgo;
      }
    }
    
    return matchTerm && matchStatus && matchDate;
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

        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
            <PackageCheck size={14} />
            <span>{orders.length} Pedido(s) Sincronizado(s)</span>
          </div>

          <button
            onClick={() => setSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all active:scale-95"
          >
            <RotateCw size={12} className={syncingZedy ? "animate-spin" : ""} />
            <span>Sincronizar Pedidos Zedy</span>
          </button>

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

      {/* ── Modal de Sincronização Zedy ── */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#11141E] border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                ⚡ Sincronizar Pedidos
              </h3>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xs font-bold px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Reconcilie os pedidos de hoje para alimentar as métricas do painel e atribuir o faturamento às campanhas <b>USD 1, USD 2, USD 3</b>.
            </p>

            {syncFeedback && (
              <div className={cn("p-3 rounded-lg text-xs font-medium", syncFeedback.startsWith("✓") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20")}>
                {syncFeedback}
              </div>
            )}

            {/* Opção 1: Sync Automático via Token */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 opacity-60 hidden">
              <span className="text-xs font-semibold text-zinc-200 block">Opção 1: Sincronização Direta via API (Desativada)</span>
              <p className="text-[11px] text-zinc-500">
                A Zedy bloqueia conexões diretas por requerer autenticação de usuário (Clerk). Por favor, utilize a Opção 2 exportando os pedidos do seu painel.
              </p>
            </div>

            {/* Opção 3 (Agora Opção 1 Principal): Sincronizar via Shopify */}
            <div className="p-3.5 rounded-xl bg-blue-900/10 border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400 block">Opção 1: Sincronização Automática (Shopify API)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold">Recomendado</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Como a Shopify é sua fonte da verdade, nós podemos buscar todos os pedidos pagos diretamente nela sem bloqueios!
                <br/><b>Requisito:</b> O Token Admin (shpat_...) deve estar configurado na aba Integrações.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleSyncShopify(false)}
                  disabled={syncingShopify}
                  className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <RotateCw size={13} className={syncingShopify ? "animate-spin" : ""} />
                  <span>{syncingShopify ? "Buscando..." : "Sincronizar Pedidos Recentes"}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Isso apagará todas as vendas registradas HOJE e fará uma importação limpa direto da Shopify. Tem certeza?")) {
                      handleSyncShopify(true);
                    }
                  }}
                  disabled={syncingShopify}
                  title="Apagar vendas de hoje e ressincronizar do zero"
                  className="py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  Resetar Hoje
                </button>
              </div>
            </div>

            {/* Opção 2: Colar JSON / Array de Pedidos */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <span className="text-xs font-semibold text-zinc-200 block">Opção 2: Importar JSON Exportado (Zedy)</span>
              <p className="text-[11px] text-zinc-500">Exporte os pedidos recentes, cole o conteúdo JSON abaixo e clique em importar:</p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='[{"id":"Z-27SD508I3H2635860","totalPriceInCents":17288,"status":"paid", ...}]'
                rows={3}
                className="w-full bg-[#0A0D14] border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleSyncZedy("json")}
                  disabled={syncingZedy || !jsonInput.trim()}
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                >
                  <PackageCheck size={13} />
                  <span>Importar Lote</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Isso apagará todas as vendas registradas HOJE e substituirá APENAS pelas vendas no JSON colado acima. Tem certeza?")) {
                      handleSyncZedy("reset_auto");
                    }
                  }}
                  disabled={syncingZedy || !jsonInput.trim()}
                  title="Apagar vendas de hoje e substituir por este JSON"
                  className="py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                >
                  Resetar Hoje e Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-[#161B26] border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Todo o período</option>
          </select>
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
