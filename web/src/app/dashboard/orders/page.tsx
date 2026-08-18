"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ShoppingBag, DollarSign, Calendar, Loader2 } from "lucide-react";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    async function loadOrders() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          const { data: dbOrders } = await supabase
            .from("orders")
            .select("*")
            .eq("store_id", store.id)
            .order("order_paid_at", { ascending: false })
            .limit(20);

          if (dbOrders) {
            setOrders(dbOrders);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadOrders();
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
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Pedidos Rastreados
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Histórico e atribuição em tempo real de vendas vinculadas a campanhas
        </p>
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
                  <td className="font-semibold text-[var(--color-text-primary)]">
                    {order.order_id}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {order.customer_name || "Comprador Anonimizado"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {order.customer_email || "PII Hasheado"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-success text-[10px]">
                      {order.status === "paid" ? "Pago" : order.status}
                    </span>
                  </td>
                  <td className="text-right font-medium text-[var(--color-text-primary)]">
                    {formatCurrency(Number(order.value || 0))}
                  </td>
                  <td className="capitalize text-xs">
                    {order.payment_method || "pix"}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[var(--color-brand-300)]">
                        {order.utm_source || "Direto / Orgânico"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {order.utm_campaign || "-"}
                      </span>
                    </div>
                  </td>
                  <td className="text-xs">
                    {formatRelativeTime(order.order_paid_at || order.created_at)}
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
      id: "o1",
      order_id: "Z-095DQ08FPS2634690",
      customer_name: "Guilherme Silva",
      customer_email: "g***@gmail.com",
      status: "paid",
      value: 297.0,
      payment_method: "pix",
      utm_source: "facebook",
      utm_campaign: "[BROAD] CBD",
      order_paid_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: "o2",
      order_id: "Z-088XG085VO2634690",
      customer_name: "Ana Costa",
      customer_email: "a***@hotmail.com",
      status: "paid",
      value: 149.0,
      payment_method: "cartao_credito",
      utm_source: "instagram",
      utm_campaign: "[RETARGETING] Carrinho",
      order_paid_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
  ];
}
