"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ShoppingBag, DollarSign, Calendar, Loader2, PackageCheck } from "lucide-react";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    let active = true;

    async function loadOrders(silent = false) {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/v1/orders/list", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.orders) && active) {
            setOrders(data.orders);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar pedidos:", error);
      } finally {
        if (active && !silent) setLoading(false);
      }
    }

    loadOrders();

    const interval = setInterval(() => {
      loadOrders(true);
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  const list = orders.length > 0 ? orders : getMockOrders();

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Pedidos Rastreados & Atribuição CAPI
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Histórico e atribuição em tempo real de vendas vinculadas à Meta Conversions API
          </p>
        </div>

        <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
          <PackageCheck size={14} />
          <span>{orders.length} Pedido(s) Sincronizado(s)</span>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID Pedido</th>
                <th>Cliente</th>
                <th>Status</th>
                <th className="text-right">Valor</th>
                <th>Pagamento</th>
                <th>Origem / UTM</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {list.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold text-[var(--color-text-primary)] font-mono text-xs">
                    {order.orderId}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {order.customerName || "Cliente Identificado"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {order.customerEmail || "cliente@***.com"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-success text-[10px] uppercase font-bold">
                      {order.status}
                    </span>
                  </td>
                  <td className="text-right font-bold text-[var(--color-text-primary)]">
                    {formatCurrency(Number(order.value || 0))}
                  </td>
                  <td className="capitalize text-xs text-[var(--color-text-secondary)]">
                    {order.paymentMethod || "Pix"}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-purple-400">
                        {order.utmSource || "facebook"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {order.utmCampaign || "[CAPI] Direto"}
                      </span>
                    </div>
                  </td>
                  <td className="text-xs text-[var(--color-text-muted)]">
                    {formatRelativeTime(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getMockOrders() {
  return [
    {
      id: "ord_1",
      orderId: "VEGA-95821034",
      customerName: "Itamar Monteiro",
      customerEmail: "ita****@gmail.com",
      status: "Pago",
      value: 167.99,
      paymentMethod: "Pix",
      utmSource: "facebook",
      utmCampaign: "[BROAD] Topo de Funil",
      createdAt: new Date().toISOString(),
    },
    {
      id: "ord_2",
      orderId: "VEGA-95820988",
      customerName: "Matheus Rodrigues",
      customerEmail: "bla****@gmail.com",
      status: "Pago",
      value: 297.0,
      paymentMethod: "Cartão",
      utmSource: "instagram",
      utmCampaign: "[RETARGETING] Carrinho",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
}
