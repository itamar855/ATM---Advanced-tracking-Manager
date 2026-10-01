"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  Percent,
  Shield,
  Plus,
  Trash2,
  HelpCircle,
  Loader2,
  Check,
  Package,
  Sparkles,
  AlertCircle,
  Save,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/contexts/StoreContext";

interface TaxOrDuty {
  id?: string;
  name: string;
  type: "tax" | "duty";
  calculation_rule: "revenue_value" | "commission_value";
  payment_method: "all" | "credit_card" | "pix" | "boleto" | "other";
  value_type: "percentage" | "fixed";
  value: number;
}

interface ProductCost {
  id?: string;
  shopify_product_id?: string;
  shopify_variant_id?: string;
  product_name: string;
  variant_name?: string;
  cost_price: number;
  currency?: string;
}

export default function CostsPage() {
  const { activeStore } = useStore();
  const currentStoreId = activeStore?.id || "dckb5g-7d";

  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string>(currentStoreId);
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [taxesAndDuties, setTaxesAndDuties] = useState<TaxOrDuty[]>([]);
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [importingProducts, setImportingProducts] = useState(false);

  // Modal Imposto / Taxa
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [modalType, setModalType] = useState<"tax" | "duty">("tax");
  const [formName, setFormName] = useState("");
  const [formRule, setFormRule] = useState<"revenue_value" | "commission_value">("revenue_value");
  const [formMethod, setFormMethod] = useState<"all" | "credit_card" | "pix" | "boleto" | "other">("all");
  const [formValType, setFormValType] = useState<"percentage" | "fixed">("percentage");
  const [formValue, setFormValue] = useState<number | string>(0);

  // Modal Novo Produto COGS
  const [showProductModal, setShowProductModal] = useState(false);
  const [prodName, setProdName] = useState("");
  const [prodVariant, setProdVariant] = useState("");
  const [prodCost, setProdCost] = useState<number | string>("");

  useEffect(() => {
    const targetId = activeStore?.id || currentStoreId;
    setStoreId(targetId);
    loadData(targetId);
  }, [activeStore?.id]);

  async function loadData(targetId: string) {
    setLoading(true);
    try {
      const supabase = createClient();
      setStoreId(targetId);

      // 1. Busca custos de produtos da loja selecionada
      const { data: costs } = await supabase
        .from("product_costs")
        .select("*")
        .eq("store_id", targetId)
        .order("created_at", { ascending: false });
      if (costs) setProducts(costs);

      // 2. Busca taxas e impostos da loja selecionada
      const { data: taxes } = await supabase
        .from("taxes_and_duties")
        .select("*")
        .eq("store_id", targetId)
        .order("created_at", { ascending: true });
      if (taxes) setTaxesAndDuties(taxes);
    } catch (err) {
      console.error("[CostsPage Error]:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Handlers de Impostos / Taxas ──────────────────────────────────────────

  const handleOpenTaxModal = (type: "tax" | "duty") => {
    setModalType(type);
    setFormName(type === "tax" ? "Simples Nacional" : "Taxa Gateway");
    setFormRule("revenue_value");
    setFormMethod(type === "tax" ? "all" : "pix");
    setFormValType("percentage");
    setFormValue("");
    setShowTaxModal(true);
  };

  const handleSaveTaxOrDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    const numVal = Number(formValue) || 0;
    const newRecord: TaxOrDuty = {
      name: formName.trim(),
      type: modalType,
      calculation_rule: formRule,
      payment_method: formMethod,
      value_type: formValType,
      value: numVal,
    };

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("taxes_and_duties")
        .insert({
          store_id: storeId,
          ...newRecord,
        })
        .select()
        .single();

      if (error) throw error;

      setTaxesAndDuties([...taxesAndDuties, data || newRecord]);
      setShowTaxModal(false);
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
  };

  const handleDeleteTax = async (id?: string, index?: number) => {
    if (!confirm("Tem certeza que deseja remover esta regra?")) return;

    try {
      if (id) {
        const supabase = createClient();
        await supabase.from("taxes_and_duties").delete().eq("id", id);
      }
      setTaxesAndDuties(taxesAndDuties.filter((_, i) => i !== index));
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    }
  };

  // ── Handlers de COGS / Produtos ───────────────────────────────────────────

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !prodName.trim()) return;

    const costNum = Number(prodCost) || 0;
    const newProd: Partial<ProductCost> & { store_id: string } = {
      store_id: storeId,
      product_name: prodName.trim(),
      variant_name: prodVariant.trim() || "Padrão",
      shopify_product_id: `prod_${Date.now()}`,
      cost_price: costNum,
      currency: "BRL",
    };

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_costs")
        .insert(newProd)
        .select()
        .single();

      if (error) throw error;

      setProducts([data || (newProd as ProductCost), ...products]);
      setShowProductModal(false);
      setProdName("");
      setProdVariant("");
      setProdCost("");
    } catch (err: any) {
      alert("Erro ao adicionar produto: " + err.message);
    }
  };

  const handleUpdateProductCost = async (prod: ProductCost, index: number, newCost: number) => {
    if (!storeId) return;

    try {
      const supabase = createClient();
      if (prod.id) {
        const { error } = await supabase
          .from("product_costs")
          .update({ cost_price: newCost, updated_at: new Date().toISOString() })
          .eq("id", prod.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("product_costs")
          .insert({
            store_id: storeId,
            product_name: prod.product_name,
            variant_name: prod.variant_name || "Padrão",
            shopify_product_id: prod.shopify_product_id || `prod_${Date.now()}`,
            cost_price: newCost,
            currency: "BRL",
          })
          .select()
          .single();

        if (error) throw error;
        if (data) prod.id = data.id;
      }

      const updated = [...products];
      updated[index] = { ...prod, cost_price: newCost };
      setProducts(updated);

      setSavedRowId(prod.id || String(index));
      setTimeout(() => setSavedRowId(null), 2500);
    } catch (err: any) {
      alert("Erro ao atualizar custo: " + err.message);
    }
  };

  const handleDeleteProduct = async (id?: string, index?: number) => {
    if (!confirm("Deseja remover este produto do COGS?")) return;

    try {
      if (id) {
        const supabase = createClient();
        await supabase.from("product_costs").delete().eq("id", id);
      }
      setProducts(products.filter((_, i) => i !== index));
    } catch (err: any) {
      alert("Erro ao excluir produto: " + err.message);
    }
  };

  // ── Importar produtos vendidos nas compras recentes ───────────────────────
  const handleImportFromOrders = async () => {
    if (!storeId) return;
    setImportingProducts(true);

    try {
      const supabase = createClient();
      const { data: events } = await supabase
        .from("events")
        .select("meta_response")
        .eq("store_id", storeId)
        .eq("event_name", "Purchase")
        .order("created_at", { ascending: false })
        .limit(100);

      const foundNames = new Set<string>();
      (events || []).forEach((ev) => {
        const metaResp = ev.meta_response || {};
        const items = metaResp.order_details?.products || metaResp.custom_data?.products || [];
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const name = String(item.name || item.product_name || "").trim();
            if (name) foundNames.add(name);
          });
        }
      });

      const existingNames = new Set(products.map((p) => p.product_name.toLowerCase()));
      const toAdd: string[] = [];
      foundNames.forEach((name) => {
        if (!existingNames.has(name.toLowerCase())) {
          toAdd.push(name);
        }
      });

      if (toAdd.length === 0) {
        alert("Todos os produtos das vendas recentes já estão na sua lista!");
        return;
      }

      const newRows: ProductCost[] = [];
      for (const name of toAdd) {
        const { data, error } = await supabase
          .from("product_costs")
          .insert({
            store_id: storeId,
            product_name: name,
            variant_name: "Padrão",
            shopify_product_id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            cost_price: 0,
            currency: "BRL",
          })
          .select()
          .single();

        if (!error && data) {
          newRows.push(data);
        }
      }

      setProducts([...newRows, ...products]);
      alert(`${newRows.length} produto(s) importado(s) das compras recentes com sucesso! Agora basta informar o preço de custo.`);
    } catch (err: any) {
      alert("Erro ao importar produtos: " + err.message);
    } finally {
      setImportingProducts(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[#2997ff]" />
      </div>
    );
  }

  const taxesList = taxesAndDuties.filter((t) => t.type === "tax");
  const dutiesList = taxesAndDuties.filter((t) => t.type === "duty");

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto pb-16 select-none">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Shield className="text-[#2997ff]" size={22} />
          Custos, Impostos e Taxas
        </h1>
        <p className="text-[13px] text-white/40 mt-1">
          Configure suas alíquotas de imposto, taxas reais do gateway e custo de mercadorias (COGS) para conciliação automática com o Dashboard e Campanhas.
        </p>
      </div>

      {/* Grid: Impostos e Taxas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── CARD 1: IMPOSTOS OPERACIONAIS ── */}
        <div className="p-6 rounded-2xl bg-[#18181a] border border-white/[0.06] flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Shield className="text-[#2997ff]" size={16} />
                Impostos Operacionais
              </h3>
              <button
                onClick={() => handleOpenTaxModal("tax")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-xs font-semibold transition shadow-[0_4px_14px_rgba(41,151,255,0.25)]"
              >
                <Plus size={13} /> Adicionar Imposto
              </button>
            </div>
            <p className="text-[12px] text-white/40">
              Configure alíquotas cobradas sobre o faturamento (ex: Simples Nacional 6%).
            </p>

            <div className="space-y-2.5 pt-1">
              {taxesList.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] text-center">
                  <Shield size={22} className="mx-auto text-white/20 mb-2" />
                  <p className="text-xs font-semibold text-white/60">Nenhum imposto cadastrado</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Clique em &quot;Adicionar Imposto&quot; para cadastrar a alíquota da sua empresa.
                  </p>
                </div>
              ) : (
                taxesList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-xs hover:border-white/[0.1] transition"
                  >
                    <div>
                      <p className="font-semibold text-white/90">{item.name}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        Regra: {item.calculation_rule === "revenue_value" ? "Valor de Faturamento" : "Valor de Comissão"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#2997ff] text-sm">{item.value}%</span>
                      <button
                        onClick={() => handleDeleteTax(item.id, idx)}
                        className="text-white/30 hover:text-[#ff453a] p-1 rounded transition"
                        title="Remover imposto"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CARD 2: TAXAS ADICIONAIS DE GATEWAY ── */}
        <div className="p-6 rounded-2xl bg-[#18181a] border border-white/[0.06] flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <DollarSign className="text-[#30d158]" size={16} />
                Taxas de Gateway
              </h3>
              <button
                onClick={() => handleOpenTaxModal("duty")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#30d158]/15 hover:bg-[#30d158]/25 text-[#30d158] border border-[#30d158]/25 text-xs font-semibold transition active:scale-[0.98]"
              >
                <Plus size={13} /> Adicionar Taxa
              </button>
            </div>
            <p className="text-[12px] text-white/40">
              Cadastre as taxas reais do seu gateway por forma de pagamento (Pix, Cartão, etc.).
            </p>

            <div className="space-y-2.5 pt-1">
              {dutiesList.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] text-center">
                  <DollarSign size={22} className="mx-auto text-white/20 mb-2" />
                  <p className="text-xs font-semibold text-white/60">Nenhuma taxa de gateway cadastrada</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Clique em &quot;Adicionar Taxa&quot; para definir as taxas cobradas pelo seu checkout.
                  </p>
                </div>
              ) : (
                dutiesList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-xs hover:border-white/[0.1] transition"
                  >
                    <div>
                      <p className="font-semibold text-white/90">{item.name}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        Forma de Pagamento:{" "}
                        <span className="text-white/70 uppercase font-semibold">
                          {item.payment_method === "all" ? "Todas" : item.payment_method}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#30d158] text-sm">
                        {item.value_type === "percentage" ? `${item.value}%` : `R$ ${item.value}`}
                      </span>
                      <button
                        onClick={() => handleDeleteTax(item.id, idx)}
                        className="text-white/30 hover:text-[#ff453a] p-1 rounded transition"
                        title="Remover taxa"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 3: PREÇO DE CUSTO POR PRODUTO (COGS) ── */}
      <div className="p-6 rounded-2xl bg-[#18181a] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.3)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Package className="text-[#bf5af2]" size={18} />
              Preço de Custo por Produto (COGS)
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Cadastre o custo unitário das suas mercadorias para apurar o lucro líquido real dos produtos vendidos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleImportFromOrders}
              disabled={importingProducts}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/80 text-xs font-semibold transition border border-white/[0.08]"
              title="Varre os pedidos aprovados e importa os nomes dos produtos para preenchimento de custo"
            >
              {importingProducts ? <Loader2 size={13} className="animate-spin text-[#2997ff]" /> : <Sparkles size={13} className="text-[#ffd60a]" />}
              Importar das Vendas
            </button>
            <button
              onClick={() => setShowProductModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-xs font-semibold transition shadow-[0_4px_14px_rgba(41,151,255,0.25)]"
            >
              <Plus size={13} /> Adicionar Produto
            </button>
          </div>
        </div>

        {/* Tabela de Produtos */}
        {products.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] text-center space-y-2">
            <Package size={28} className="mx-auto text-white/20" />
            <p className="text-sm font-semibold text-white/70">Nenhum produto cadastrado no COGS</p>
            <p className="text-xs text-white/40 max-w-md mx-auto">
              Clique em <strong>&quot;Importar das Vendas&quot;</strong> para trazer os produtos das suas compras recentes ou clique em <strong>&quot;Adicionar Produto&quot;</strong> para cadastrar manualmente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-white/80">
              <thead>
                <tr className="border-b border-white/[0.05] text-white/35 text-[10.5px] uppercase tracking-wider">
                  <th className="py-3 px-3">Produto</th>
                  <th className="py-3 px-3">Variante</th>
                  <th className="py-3 px-3 text-right">Preço de Custo (R$)</th>
                  <th className="py-3 px-3 text-center w-28">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {products.map((item, idx) => (
                  <ProductRow
                    key={item.id || idx}
                    item={item}
                    index={idx}
                    isSaved={savedRowId === (item.id || String(idx))}
                    onSave={(newCost) => handleUpdateProductCost(item, idx, newCost)}
                    onDelete={() => handleDeleteProduct(item.id, idx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL: ADICIONAR IMPOSTO OU TAXA ── */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 fade-in">
          <form
            onSubmit={handleSaveTaxOrDuty}
            className="w-full max-w-md bg-[#18181a] border border-white/[0.08] rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-6 space-y-4 text-white/90"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                {modalType === "tax" ? <Shield className="text-[#2997ff]" size={16} /> : <DollarSign className="text-[#30d158]" size={16} />}
                {modalType === "tax" ? "Cadastrar Imposto" : "Cadastrar Taxa de Gateway"}
              </h3>
              <button
                type="button"
                onClick={() => setShowTaxModal(false)}
                className="text-white/40 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Nome / Descrição</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={modalType === "tax" ? "Ex: Simples Nacional" : "Ex: Taxa Gateway Pix"}
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none"
                required
              />
            </div>

            {modalType === "tax" ? (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Base de Cálculo</label>
                <select
                  value={formRule}
                  onChange={(e: any) => setFormRule(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none cursor-pointer"
                >
                  <option value="revenue_value" className="bg-[#18181a]">Sobre o Faturamento Bruto (Padrão)</option>
                  <option value="commission_value" className="bg-[#18181a]">Sobre o Valor de Comissão</option>
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Forma de Pagamento</label>
                  <select
                    value={formMethod}
                    onChange={(e: any) => setFormMethod(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none cursor-pointer"
                  >
                    <option value="pix" className="bg-[#18181a]">Pix</option>
                    <option value="credit_card" className="bg-[#18181a]">Cartão de Crédito</option>
                    <option value="boleto" className="bg-[#18181a]">Boleto Bancário</option>
                    <option value="all" className="bg-[#18181a]">Todas as Formas</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Tipo de Taxa</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormValType("percentage")}
                      className={`py-2 text-xs font-semibold rounded-xl border transition ${
                        formValType === "percentage"
                          ? "bg-[#30d158]/15 border-[#30d158]/30 text-[#30d158]"
                          : "bg-white/[0.04] border-white/[0.07] text-white/40"
                      }`}
                    >
                      Percentual (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormValType("fixed")}
                      className={`py-2 text-xs font-semibold rounded-xl border transition ${
                        formValType === "fixed"
                          ? "bg-[#30d158]/15 border-[#30d158]/30 text-[#30d158]"
                          : "bg-white/[0.04] border-white/[0.07] text-white/40"
                      }`}
                    >
                      Valor Fixo (R$)
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Valor {formValType === "percentage" ? "(%)" : "(R$)"}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder={formValType === "percentage" ? "Ex: 6.00" : "Ex: 1.50"}
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none font-mono"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowTaxModal(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/70 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-xs font-semibold transition shadow-[0_4px_14px_rgba(41,151,255,0.25)]"
              >
                Salvar Regra
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: ADICIONAR PRODUTO COGS ── */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 fade-in">
          <form
            onSubmit={handleSaveNewProduct}
            className="w-full max-w-md bg-[#18181a] border border-white/[0.08] rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-6 space-y-4 text-white/90"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package className="text-[#bf5af2]" size={16} />
                Adicionar Produto ao COGS
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="text-white/40 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Nome do Produto</label>
              <input
                type="text"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Ex: Produto Modelo X"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Variante (Opcional)</label>
              <input
                type="text"
                value={prodVariant}
                onChange={(e) => setProdVariant(e.target.value)}
                placeholder="Ex: Padrão, Grande, 110V..."
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider">Preço de Custo Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={prodCost}
                onChange={(e) => setProdCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/90 text-xs focus:border-[#2997ff]/40 focus:outline-none font-mono"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/70 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#2997ff] hover:brightness-110 active:scale-[0.98] text-white text-xs font-semibold transition shadow-[0_4px_14px_rgba(41,151,255,0.25)]"
              >
                Adicionar Produto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Linha Individual de Produto com Edição e Salvar ──────────────────────────
function ProductRow({
  item,
  index,
  isSaved,
  onSave,
  onDelete,
}: {
  item: ProductCost;
  index: number;
  isSaved: boolean;
  onSave: (cost: number) => void;
  onDelete: () => void;
}) {
  const [costInput, setCostInput] = useState<number | string>(item.cost_price || 0);

  return (
    <tr className="hover:bg-white/[0.02] transition group">
      <td className="py-3 px-3 font-semibold text-white/90">{item.product_name}</td>
      <td className="py-3 px-3 text-white/40">{item.variant_name || "Padrão"}</td>
      <td className="py-3 px-3 text-right">
        <div className="relative inline-flex items-center">
          <span className="absolute left-2.5 text-xs text-white/30 font-mono">R$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            className="w-28 pl-8 pr-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-right font-mono text-xs text-white/90 focus:border-[#2997ff]/40 focus:outline-none transition"
          />
        </div>
      </td>
      <td className="py-3 px-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => onSave(Number(costInput) || 0)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1 active:scale-[0.98] ${
              isSaved
                ? "bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30"
                : "bg-white/[0.08] hover:bg-white/[0.12] text-white/90 border border-white/[0.08]"
            }`}
          >
            {isSaved ? (
              <>
                <Check size={13} /> Salvo
              </>
            ) : (
              "Salvar"
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-white/30 hover:text-[#ff453a] rounded-lg transition"
            title="Excluir produto"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
