"use client";

import { useState, useEffect } from "react";
import { DollarSign, Percent, Shield, Plus, Trash2, HelpCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface TaxOrDuty {
  id?: string;
  name: string;
  type: "tax" | "duty";
  calculation_rule: "revenue_value" | "commission_value";
  payment_method: "all" | "credit_card" | "pix" | "boleto" | "other";
  value_type: "percentage" | "fixed";
  value: number;
}

export default function CostsPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [taxesAndDuties, setTaxesAndDuties] = useState<TaxOrDuty[]>([]);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"tax" | "duty">("tax");
  
  // Form State
  const [formName, setFormName] = useState("");
  const [formRule, setFormRule] = useState<"revenue_value" | "commission_value">("revenue_value");
  const [formMethod, setFormMethod] = useState<"all" | "credit_card" | "pix" | "boleto" | "other">("all");
  const [formValType, setFormValType] = useState<"percentage" | "fixed">("percentage");
  const [formValue, setFormValue] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

        if (store) {
          // 1. Busca os custos de produtos
          const { data: costs } = await supabase
            .from("product_costs")
            .select("*")
            .eq("store_id", store.id);
          if (costs) setProducts(costs);

          // 2. Busca as taxas e impostos do banco
          const { data: taxes } = await supabase
            .from("taxes_and_duties")
            .select("*")
            .eq("store_id", store.id);
          if (taxes) setTaxesAndDuties(taxes);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleOpenModal = (type: "tax" | "duty") => {
    setModalType(type);
    setFormName(type === "tax" ? "Imposto sobre faturamento" : "Taxa Checkout");
    setFormRule("revenue_value");
    setFormMethod("all");
    setFormValType("percentage");
    setFormValue(0);
    setShowModal(true);
  };

  const handleSaveTaxOrDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const newRecord: TaxOrDuty = {
      name: formName,
      type: modalType,
      calculation_rule: formRule,
      payment_method: formMethod,
      value_type: formValType,
      value: formValue,
    };

    try {
      const supabase = createClient();
      const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();

      if (store) {
        const { error } = await supabase
          .from("taxes_and_duties")
          .insert({
            store_id: store.id,
            ...newRecord
          });

        if (error) throw error;
        
        // Recarrega localmente
        setTaxesAndDuties([...taxesAndDuties, newRecord]);
        setShowModal(false);
      }
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTax = async (id?: string, index?: number) => {
    if (!confirm("Deseja remover este imposto/taxa?")) return;

    try {
      if (id) {
        const supabase = createClient();
        await supabase.from("taxes_and_duties").delete().eq("id", id);
      }
      setTaxesAndDuties(taxesAndDuties.filter((_, i) => i !== index));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--color-brand-300)]" />
      </div>
    );
  }

  const list = products.length > 0 ? products : getMockProductCosts();
  const taxList = taxesAndDuties.length > 0 ? taxesAndDuties : getMockTaxes();

  return (
    <div className="space-y-8 fade-in max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Custos, Impostos e Taxas
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gerencie o custo de mercadorias (COGS), taxas de gateway e impostos operacionais
        </p>
      </div>

      {/* Impostos & Taxas Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Impostos */}
        <div className="glass-card p-6 flex flex-col justify-between min-h-[300px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <Shield className="text-[var(--color-brand-300)]" size={18} />
                Impostos
              </h3>
              <button onClick={() => handleOpenModal("tax")} className="btn-secondary py-1 px-2.5 text-[10px] font-bold gap-1">
                <Plus size={10} /> Adicionar Imposto
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Configure alíquotas de imposto cobradas sobre faturamento ou comissão.
            </p>

            <div className="space-y-2 pt-2">
              {taxList.filter(t => t.type === "tax").map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] text-xs">
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">{item.name}</p>
                    <p className="text-[9px] text-[var(--color-text-muted)] capitalize mt-0.5">
                      Regra: {item.calculation_rule === "revenue_value" ? "Valor de Faturamento" : "Valor de Comissão"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[var(--color-brand-300)]">
                      {item.value}%
                    </span>
                    <button onClick={() => handleDeleteTax(item.id, idx)} className="text-[var(--color-text-muted)] hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Taxas */}
        <div className="glass-card p-6 flex flex-col justify-between min-h-[300px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <DollarSign className="text-[var(--color-brand-300)]" size={18} />
                Taxas Adicionais
              </h3>
              <button onClick={() => handleOpenModal("duty")} className="btn-secondary py-1 px-2.5 text-[10px] font-bold gap-1">
                <Plus size={10} /> Adicionar Taxa
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Mapeie custos de gateways, taxas por boleto ou pix por forma de pagamento.
            </p>

            <div className="space-y-2 pt-2">
              {taxList.filter(t => t.type === "duty").map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-primary)]/80 border border-[var(--color-border-subtle)] text-xs">
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">{item.name}</p>
                    <p className="text-[9px] text-[var(--color-text-muted)] capitalize mt-0.5">
                      F. Pagamento: {item.payment_method}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[var(--color-brand-300)]">
                      {item.value_type === "percentage" ? `${item.value}%` : `R$ ${item.value}`}
                    </span>
                    <button onClick={() => handleDeleteTax(item.id, idx)} className="text-[var(--color-text-muted)] hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custo de Mercadorias (COGS) */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-default)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Preço de Custo por Produto (COGS)</h3>
        </div>
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

      {/* Modal - Adicionar Taxa ou Imposto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center fade-in">
          <form onSubmit={handleSaveTaxOrDuty} className="w-full max-w-sm bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              {modalType === "tax" ? "Adicionar Imposto" : "Adicionar Taxa"}
            </h3>

            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">Nome</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input py-1.5 text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">Regra de Cálculo</label>
              <select
                value={formRule}
                onChange={(e: any) => setFormRule(e.target.value)}
                className="input py-1.5 text-xs bg-[var(--color-bg-surface)]"
              >
                <option value="revenue_value">Valor de Faturamento</option>
                <option value="commission_value">Valor de Comissão</option>
              </select>
            </div>

            {modalType === "duty" && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">Forma de Pagamento</label>
                  <select
                    value={formMethod}
                    onChange={(e: any) => setFormMethod(e.target.value)}
                    className="input py-1.5 text-xs bg-[var(--color-bg-surface)]"
                  >
                    <option value="all">Todas</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="pix">Pix</option>
                    <option value="boleto">Boleto</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">Tipo de Taxa</label>
                  <select
                    value={formValType}
                    onChange={(e: any) => setFormValType(e.target.value)}
                    className="input py-1.5 text-xs bg-[var(--color-bg-surface)]"
                  >
                    <option value="percentage">Porcentagem (%)</option>
                    <option value="fixed">Valor Fixo (R$)</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">
                Alíquota / Valor
              </label>
              <div className="relative">
                {formValType === "fixed" && (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">R$</span>
                )}
                <input
                  type="number"
                  step="0.01"
                  value={formValue}
                  onChange={(e) => setFormValue(parseFloat(e.target.value || "0"))}
                  className={`input py-1.5 text-xs ${formValType === "fixed" ? "pl-8" : ""}`}
                  required
                />
                {formValType === "percentage" && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">%</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary w-full py-2 text-xs">
                Cancelar
              </button>
              <button type="submit" className="btn-primary w-full py-2 text-xs">
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}
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

function getMockTaxes(): TaxOrDuty[] {
  return [
    {
      name: "Imposto Faturamento Simples Nacional",
      type: "tax",
      calculation_rule: "revenue_value",
      payment_method: "all",
      value_type: "percentage",
      value: 6.0,
    },
    {
      name: "Taxa Gateway Cartão",
      type: "duty",
      calculation_rule: "revenue_value",
      payment_method: "credit_card",
      value_type: "percentage",
      value: 4.99,
    },
    {
      name: "Taxa Pix - Transação",
      type: "duty",
      calculation_rule: "revenue_value",
      payment_method: "pix",
      value_type: "fixed",
      value: 1.5,
    },
  ];
}
