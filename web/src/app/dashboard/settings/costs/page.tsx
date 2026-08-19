"use client";

import { useState, useEffect } from "react";
import { DollarSign, Percent, Sparkles, AlertCircle, ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

export default function CostsPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    async function loadProducts() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          const { data: costs } = await supabase
            .from("product_costs")
            .select("*")
            .eq("store_id", store.id);

          if (costs) {
            setProducts(costs);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  const list = products.length > 0 ? products : getMockProductCosts();

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Custo de Mercadorias (COGS)
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Insira o preço de custo de cada produto para calcular o lucro líquido real
        </p>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Variante</th>
                <th className="text-right w-44">Preço de Custo</th>
                <th className="text-center w-28">Salvar</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id}>
                  <td className="font-semibold text-[var(--color-text-primary)]">{item.product_name}</td>
                  <td className="text-xs text-[var(--color-text-muted)]">{item.variant_name || "Única"}</td>
                  <td className="text-right">
                    <div className="relative inline-block w-full max-w-[120px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">R$</span>
                      <input
                        type="number"
                        defaultValue={item.cost_price || 0}
                        className="input pl-8 text-right py-1.5 text-xs"
                      />
                    </div>
                  </td>
                  <td className="text-center">
                    <button className="btn-primary py-1.5 px-3 text-[10px] font-semibold">Salvar</button>
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

function getMockProductCosts() {
  return [
    {
      id: "p1",
      product_name: "Gummies CBD Relax 30 unid",
      variant_name: "Pote Tradicional",
      cost_price: 32.5,
    },
    {
      id: "p2",
      product_name: "Óleo CBD Premium 10ml",
      variant_name: "Concentrado 15%",
      cost_price: 68.0,
    },
  ];
}
