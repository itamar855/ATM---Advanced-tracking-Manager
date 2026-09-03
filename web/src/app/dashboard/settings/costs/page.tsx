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
        <Loader2 size={36} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const taxesList = taxesAndDuties.filter((t) => t.type === "tax");
  const dutiesList = taxesAndDuties.filter((t) => t.type === "duty");

  return (
    <div className="space-y-8 fade-in max-w-5xl mx-auto pb-16">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
          <Shield className="text-blue-500" size={24} />
          Custos, Impostos e Taxas
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Configure suas alíquotas de imposto, taxas reais do gateway e custo de mercadorias (COGS) para conciliação automática com a Dashboard e Campanhas.
        </p>
      </div>

      {/* Grid: Impostos e Taxas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── CARD 1: IMPOSTOS OPERACIONAIS ── */}
        <div className="p-6 rounded-2xl bg-[#0f172a]/70 border border-zinc-800 flex flex-col justify-between shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Shield className="text-blue-400" size={18} />
                Impostos Operacionais
              </h3>
              <button
                onClick={() => handleOpenTaxModal("tax")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm"
              >
                <Plus size={14} /> Adicionar Imposto
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Configure alíquotas cobradas sobre o faturamento (ex: Simples Nacional 6%).
            </p>

            <div className="space-y-2.5 pt-2">
              {taxesList.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 text-center">
                  <Shield size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-xs font-semibold text-zinc-400">Nenhum imposto cadastrado</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Clique em &quot;Adicionar Imposto&quot; para cadastrar a alíquota da sua empresa.
                  </p>
                </div>
              ) : (
                taxesList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs hover:border-zinc-700 transition"
                  >
                    <div>
                      <p className="font-bold text-zinc-200">{item.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Regra: {item.calculation_rule === "revenue_value" ? "Valor de Faturamento" : "Valor de Comissão"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-blue-400 text-sm">{item.value}%</span>
                      <button
                        onClick={() => handleDeleteTax(item.id, idx)}
                        className="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                        title="Remover imposto"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CARD 2: TAXAS ADICIONAIS DE GATEWAY ── */}
        <div className="p-6 rounded-2xl bg-[#0f172a]/70 border border-zinc-800 flex flex-col justify-between shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <DollarSign className="text-emerald-400" size={18} />
                Taxas de Gateway
              </h3>
              <button
                onClick={() => handleOpenTaxModal("duty")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
              >
                <Plus size={14} /> Adicionar Taxa
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Cadastre as taxas reais do seu gateway por forma de pagamento (Pix, Cartão, etc.).
            </p>

            <div className="space-y-2.5 pt-2">
              {dutiesList.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 text-center">
                  <DollarSign size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-xs font-semibold text-zinc-400">Nenhuma taxa de gateway cadastrada</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Clique em &quot;Adicionar Taxa&quot; para definir as taxas cobradas pelo seu checkout.
                  </p>
                </div>
              ) : (
                dutiesList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs hover:border-zinc-700 transition"
                  >
                    <div>
                      <p className="font-bold text-zinc-200">{item.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Forma de Pagamento:{" "}
                        <span className="text-zinc-300 uppercase font-semibold">
                          {item.payment_method === "all" ? "Todas" : item.payment_method}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {item.value_type === "percentage" ? `${item.value}%` : `R$ ${item.value}`}
                      </span>
                      <button
                        onClick={() => handleDeleteTax(item.id, idx)}
                        className="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                        title="Remover taxa"
                      >
                        <Trash2 size={14} />
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
      <div className="p-6 rounded-2xl bg-[#0f172a]/70 border border-zinc-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Package className="text-purple-400" size={20} />
              Preço de Custo por Produto (COGS)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cadastre o custo unitário das suas mercadorias para apurar o lucro líquido real dos produtos vendidos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleImportFromOrders}
              disabled={importingProducts}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition border border-zinc-700"
              title="Varre os pedidos aprovados e importa os nomes dos produtos para preenchimento de custo"
            >
              {importingProducts ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-yellow-400" />}
              Importar das Vendas
            </button>
            <button
              onClick={() => setShowProductModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-sm"
            >
              <Plus size={14} /> Adicionar Produto
            </button>
          </div>
        </div>

        {/* Tabela de Produtos */}
        {products.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 text-center space-y-2">
            <Package size={28} className="mx-auto text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-300">Nenhum produto cadastrado no COGS</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Clique em <strong>&quot;Importar das Vendas&quot;</strong> para trazer os produtos das suas compras recentes ou clique em <strong>&quot;Adicionar Produto&quot;</strong> para cadastrar manualmente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3">Produto</th>
                  <th className="py-3 px-3">Variante</th>
                  <th className="py-3 px-3 text-right">Preço de Custo (R$)</th>
                  <th className="py-3 px-3 text-center w-28">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in">
          <form
            onSubmit={handleSaveTaxOrDuty}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4 text-zinc-200"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                {modalType === "tax" ? <Shield className="text-blue-400" size={18} /> : <DollarSign className="text-emerald-400" size={18} />}
                {modalType === "tax" ? "Cadastrar Imposto" : "Cadastrar Taxa de Gateway"}
              </h3>
              <button
                type="button"
                onClick={() => setShowTaxModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nome / Descrição</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={modalType === "tax" ? "Ex: Simples Nacional" : "Ex: Taxa Gateway Pix"}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            {modalType === "tax" ? (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Base de Cálculo</label>
                <select
                  value={formRule}
                  onChange={(e: any) => setFormRule(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="revenue_value">Sobre o Faturamento Bruto (Padrão)</option>
                  <option value="commission_value">Sobre o Valor de Comissão</option>
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Forma de Pagamento</label>
                  <select
                    value={formMethod}
                    onChange={(e: any) => setFormMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="pix">Pix</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="boleto">Boleto Bancário</option>
                    <option value="all">Todas as Formas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Tipo de Taxa</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormValType("percentage")}
                      className={`py-2 text-xs font-bold rounded-lg border transition ${
                        formValType === "percentage"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      Percentual (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormValType("fixed")}
                      className={`py-2 text-xs font-bold rounded-lg border transition ${
                        formValType === "fixed"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      Valor Fixo (R$)
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Valor {formValType === "percentage" ? "(%)" : "(R$)"}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder={formValType === "percentage" ? "Ex: 6.00" : "Ex: 1.50"}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-blue-500 focus:outline-none font-mono"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowTaxModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md"
              >
                Salvar Regra
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: ADICIONAR PRODUTO COGS ── */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in">
          <form
            onSubmit={handleSaveNewProduct}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4 text-zinc-200"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Package className="text-purple-400" size={18} />
                Adicionar Produto ao COGS
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nome do Produto</label>
              <input
                type="text"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Ex: Gaiola Criadeira Nº 5"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-purple-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Variante (Opcional)</label>
              <input
                type="text"
                value={prodVariant}
                onChange={(e) => setProdVariant(e.target.value)}
                placeholder="Ex: Padrão, Grande, 110V..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Preço de Custo Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={prodCost}
                onChange={(e) => setProdCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-purple-500 focus:outline-none font-mono"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md"
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
    <tr className="hover:bg-zinc-800/30 transition group">
      <td className="py-3 px-3 font-semibold text-zinc-200">{item.product_name}</td>
      <td className="py-3 px-3 text-zinc-400">{item.variant_name || "Padrão"}</td>
      <td className="py-3 px-3 text-right">
        <div className="relative inline-flex items-center">
          <span className="absolute left-2.5 text-xs text-zinc-500 font-mono">R$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            className="w-28 pl-8 pr-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-right font-mono text-xs text-zinc-100 focus:border-purple-500 focus:outline-none transition"
          />
        </div>
      </td>
      <td className="py-3 px-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => onSave(Number(costInput) || 0)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
              isSaved
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/40"
                : "bg-blue-600 hover:bg-blue-500 text-white"
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
            className="p-1.5 text-zinc-600 hover:text-red-400 rounded transition"
            title="Excluir produto"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
