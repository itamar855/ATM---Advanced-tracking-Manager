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
      const brTodayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const brOrderDateStr = orderDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      if (dateFilter === "today") {
        matchDate = brOrderDateStr === brTodayStr;
      } else if (dateFilter === "yesterday") {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const brYesterdayStr = yesterday.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        matchDate = brOrderDateStr === brYesterdayStr;
      } else if (dateFilter === "7d") {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchDate = orderDate >= sevenDaysAgo;
      } else if (dateFilter === "30d") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        matchDate = orderDate >= thirtyDaysAgo;
      }
    }
    
    return matchTerm && matchStatus && matchDate;
  });

  const totalRevenue = orders.reduce((acc, o) => acc + (Number(o.value) || 0), 0);

  return (
    <div className="space-y-5 fade-in max-w-[1400px] mx-auto pb-16 pt-2 select-none">
      {/* ── 1. Top Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Pedidos Rastreados & Atribuição CAPI
          </h1>
          <p className="text-[13px] text-white/40 mt-0.5">
            Histórico e atribuição em tempo real de vendas vinculadas à Meta Conversions API
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158] text-[11px] font-semibold flex items-center gap-1.5">
            <PackageCheck size={13} />
            <span>{orders.length} Pedido(s) Sincronizado(s)</span>
          </div>

          <button
            onClick={() => setSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/90 font-semibold text-xs border border-white/[0.08] transition-all active:scale-[0.98]"
          >
            <RotateCw size={12} className={syncingZedy ? "animate-spin" : ""} />
            <span>Sincronizar Pedidos</span>
          </button>

          <button
            onClick={() => loadOrders(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#2997ff] hover:brightness-110 text-white font-semibold text-xs transition-all shadow-[0_4px_14px_rgba(41,151,255,0.25)] active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw size={12} className={isRefreshing ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── Modal de Sincronização ── */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[#18181a] border border-white/[0.08] rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>⚡</span> Sincronizar Pedidos
              </h3>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="text-white/40 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-[12.5px] text-white/50 leading-relaxed">
              Reconcilie os pedidos de hoje para alimentar as métricas do painel e atribuir o faturamento às campanhas <b>USD 1, USD 2, USD 3</b>.
            </p>

            {syncFeedback && (
              <div className={cn("p-3 rounded-xl text-xs font-medium", syncFeedback.startsWith("✓") ? "bg-[#30d158]/10 text-[#30d158] border border-[#30d158]/20" : "bg-[#ff453a]/10 text-[#ff453a] border border-[#ff453a]/20")}>
                {syncFeedback}
              </div>
            )}

            {/* Opção 1 Principal: Sincronizar via Shopify */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/90 block">Opção 1: Sincronização Automática (Shopify API)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2997ff]/15 text-[#2997ff] font-semibold border border-[#2997ff]/20">Recomendado</span>
              </div>
              <p className="text-[11.5px] text-white/40 leading-relaxed">
                Como a Shopify é sua fonte da verdade, podemos buscar todos os pedidos pagos diretamente nela sem bloqueios!
                <br/><span className="text-white/30">Requisito: Token Admin (shpat_...) configurado na aba Integrações.</span>
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleSyncShopify(false)}
                  disabled={syncingShopify}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#2997ff] hover:brightness-110 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
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
                  className="py-2 px-3 rounded-xl bg-[#ff453a]/10 hover:bg-[#ff453a]/20 text-[#ff453a] border border-[#ff453a]/20 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  Resetar Hoje
                </button>
              </div>
            </div>

            {/* Opção 2: Colar JSON / Array de Pedidos */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2.5">
              <span className="text-xs font-semibold text-white/90 block">Opção 2: Importar JSON Exportado (Zedy)</span>
              <p className="text-[11.5px] text-white/40">Exporte os pedidos recentes, cole o conteúdo JSON abaixo e clique em importar:</p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='[{"id":"Z-27SD508I3H2635860","totalPriceInCents":17288,"status":"paid", ...}]'
                rows={3}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-2.5 text-[11px] font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleSyncZedy("json")}
                  disabled={syncingZedy || !jsonInput.trim()}
                  className="flex-1 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white font-semibold text-xs flex items-center justify-center gap-2 border border-white/[0.08] transition-all disabled:opacity-40"
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
                  className="py-2 px-3 rounded-xl bg-[#ff453a]/10 hover:bg-[#ff453a]/20 text-[#ff453a] border border-[#ff453a]/20 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                >
                  Resetar Hoje e Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Cards de Resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 block mb-1.5">
              Total de Pedidos Pagos
            </span>
            <span className="text-2xl font-bold text-white tracking-tight">{orders.length}</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#2997ff]/10 border border-[#2997ff]/20 flex items-center justify-center text-[#2997ff]">
            <ShoppingCart size={19} />
          </div>
        </div>

        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 block mb-1.5">
              Faturamento Rastreado
            </span>
            <span className="text-2xl font-bold text-white tracking-tight">
              R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#30d158]/10 border border-[#30d158]/20 flex items-center justify-center text-[#30d158]">
            <DollarSign size={19} />
          </div>
        </div>

        <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 block mb-1.5">
              Taxa de Atribuição CAPI
            </span>
            <span className="text-2xl font-bold text-[#30d158] tracking-tight">100%</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#30d158]/10 border border-[#30d158]/20 flex items-center justify-center text-[#30d158]">
            <ShieldCheck size={19} />
          </div>
        </div>
      </div>

      {/* ── 3. Barra de Busca e Filtros ────────────────────────────────────── */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Buscar por ID, cliente ou UTM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-3 py-2 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#2997ff]/40 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-[#2997ff]/40 transition-colors cursor-pointer"
          >
            <option value="today" className="bg-[#18181a]">Hoje</option>
            <option value="yesterday" className="bg-[#18181a]">Ontem</option>
            <option value="7d" className="bg-[#18181a]">Últimos 7 dias</option>
            <option value="30d" className="bg-[#18181a]">Últimos 30 dias</option>
            <option value="all" className="bg-[#18181a]">Todo o período</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-[#2997ff]/40 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-[#18181a]">Todos os Status</option>
            <option value="pago" className="bg-[#18181a]">Pago</option>
            <option value="processando" className="bg-[#18181a]">Processando</option>
          </select>
        </div>
      </div>

      {/* ── 4. Tabela de Pedidos ───────────────────────────────────────────── */}
      <div className="bg-[#18181a] border border-white/[0.06] rounded-2xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-white/[0.02] text-white/35 font-semibold border-b border-white/[0.05] uppercase text-[10px] tracking-wider">
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
            <tbody className="divide-y divide-white/[0.04]">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-white/90 text-[11.5px]">
                      {order.orderId}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white/80">{order.customerName}</span>
                        <span className="text-[10px] text-white/30 font-mono">{order.customerEmail}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-[#30d158]/10 text-[#30d158] border border-[#30d158]/20 uppercase">
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-semibold text-white/90 text-[13px]">
                      R$ {Number(order.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-3 text-white/60 font-medium">
                      <span className="flex items-center gap-1.5">
                        <CreditCard size={12} className="text-white/30" />
                        {order.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-[#2997ff]">{order.utmSource}</span>
                        <span className="text-[10.5px] text-white/40 truncate max-w-[260px]" title={order.utmCampaign}>
                          {order.utmCampaign}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right text-white/40 font-mono text-[11px]">
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
                  <td colSpan={7} className="py-12 text-center text-white/30">
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
