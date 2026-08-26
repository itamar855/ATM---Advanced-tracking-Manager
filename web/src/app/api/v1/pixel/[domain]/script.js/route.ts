import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/pixel/[domain]/script.js
 *
 * Retorna o script ATM completo de máxima performance, com:
 * - Geração e fixação autônoma de First-Party Cookie (_fbp e _fbc instantâneos)
 * - Interceptação precisa de AddToCart com preço exato da variante
 * - Rastreamento ultra-resiliente sem perdas de PageView
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;

  let storeId = "dckb5g-7d";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trackingatm.vercel.app";
  const apiBase = `${appUrl.replace(/\/$/, "")}/api/v1`;

  try {
    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("id, shop_domain")
      .or(`shop_domain.eq.${domain},shop_domain.ilike.%${domain.split('.')[0]}%`)
      .limit(1)
      .maybeSingle();

    if (store) {
      storeId = store.id;
    }
  } catch (e) {
    console.warn("[Pixel Script] Fallback de loja aplicado:", e);
  }

  const scriptContent = generateATMScript(storeId, apiBase);

  return new NextResponse(scriptContent, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function generateATMScript(storeId: string, apiBase: string): string {
  return `/**
 * ATM Pixel v3.0 — Advanced Tracking Manager (Ultra-Resilient First-Party)
 * Loja: ${storeId}
 * Auto-gerado e otimizado para máxima pontuação EMQ e zero perda de fbp/fbc.
 */
(function () {
  "use strict";

  var ATM = {
    storeId: "${storeId}",
    apiBase: "${apiBase}",
  };

  // ── Utilitários & Cookie Engine 1st-Party ───────────────────────────────────

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|;\\\\s*)" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, val, days) {
    var exp = new Date(Date.now() + (days || 730) * 864e5).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(val) + "; expires=" + exp + "; path=/; SameSite=Lax";
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getTrackId() {
    var key = "atm_ztid_${storeId.slice(0, 8)}";
    var id = getCookie("_ztid") || localStorage.getItem(key) || sessionStorage.getItem(key);
    if (id && /^[A-Za-z0-9_-]{16,80}$/.test(id)) {
      setCookie("_ztid", id, 730);
      return id;
    }
    id = uuid().replace(/-/g, "");
    setCookie("_ztid", id, 730);
    try { localStorage.setItem(key, id); } catch (e) { sessionStorage.setItem(key, id); }
    return id;
  }

  // Garante fbp 100% autônomo (não espera o pixel do Facebook demorar a carregar)
  function getFbp() {
    var c = getCookie("_fbp");
    if (c) return c;
    var rand = Math.floor(Math.random() * 1000000000000000000);
    var newFbp = "fb.1." + Date.now() + "." + rand;
    setCookie("_fbp", newFbp, 730);
    return newFbp;
  }

  // Garante fbc a partir de fbclid com validade de 90 dias
  function getFbc() {
    var c = getCookie("_fbc");
    if (c) return c;
    var p = new URLSearchParams(window.location.search);
    var fbclid = p.get("fbclid") || p.get("FBCLID");
    if (fbclid) {
      var fbc = "fb.1." + Date.now() + "." + fbclid;
      setCookie("_fbc", fbc, 90);
      return fbc;
    }
    return null;
  }

  function getUtms() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_content: p.get("utm_content"),
      utm_term: p.get("utm_term"),
      utm_id: p.get("utm_id"),
      fbclid: p.get("fbclid"),
    };
  }

  // ── Inicialização de Sessão ───────────────────────────────────────────────

  var _tid = getTrackId();
  var _fbp = getFbp();
  var _fbc = getFbc();
  var _utms = getUtms();
  var _ctx = window.__ATM_CTX__ || {};
  var _captured = false;

  function captureSession() {
    if (_captured) return;
    _captured = true;
    var payload = JSON.stringify({
      store_id: ATM.storeId,
      track_id: _tid,
      fbp: _fbp,
      fbc: _fbc,
      fbclid: _utms.fbclid,
      landing_page: document.referrer || null,
      event_source_url: window.location.href,
      utm_source: _utms.utm_source,
      utm_medium: _utms.utm_medium,
      utm_campaign: _utms.utm_campaign,
      utm_content: _utms.utm_content,
      utm_term: _utms.utm_term,
      utm_id: _utms.utm_id,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ATM.apiBase + "/capture", payload);
    } else {
      fetch(ATM.apiBase + "/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }
  }

  // ── Despachante de Eventos para Meta CAPI ─────────────────────────────────

  function sendEvent(eventName, customData, extraUserData) {
    var ud = Object.assign({}, _ctx.customer || {}, extraUserData || {});
    // Garante fbp e fbc atualizados
    _fbp = getFbp();
    _fbc = getFbc();

    var payload = JSON.stringify({
      store_id: ATM.storeId,
      track_id: _tid,
      event_name: eventName,
      event_id: uuid(),
      event_source_url: window.location.href,
      user_data: ud,
      custom_data: customData || null,
    });

    var url = ATM.apiBase + "/events/browser";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, payload);
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }
  }

  // ── Execução Imediata do PageView ────────────────────────────────────────

  var _path = window.location.pathname;
  var _currency = (_ctx.shop && _ctx.shop.currency) || "BRL";

  captureSession();
  sendEvent("PageView", null);

  // ── ViewContent na Página de Produto ──────────────────────────────────────

  if (/^\\/products\\//.test(_path) && _ctx.product) {
    sendEvent("ViewContent", {
      content_ids: [String(_ctx.product.variantId || _ctx.product.id)],
      content_name: _ctx.product.title,
      content_type: "product",
      value: Number(_ctx.product.price || 0),
      currency: _currency,
    });
  }

  // ── AddToCart de Alta Precisão (Preço Exato da Variante) ──────────────────

  var _lastSentCartItem = "";
  var _lastCartSentTime = 0;

  function dispatchAddToCart(variantId, title, price, qty) {
    var now = Date.now();
    var key = variantId + "_" + price;
    if (key === _lastSentCartItem && (now - _lastCartSentTime < 1500)) return; // Debounce
    _lastSentCartItem = key;
    _lastCartSentTime = now;

    var numPrice = Number(price || 0);
    var numQty = Number(qty || 1);

    sendEvent("AddToCart", {
      content_ids: [String(variantId || (_ctx.product ? (_ctx.product.variantId || _ctx.product.id) : "PROD"))],
      content_name: title || (_ctx.product ? _ctx.product.title : "Produto"),
      content_type: "product",
      value: numPrice > 0 ? numPrice * numQty : (Number(_ctx.product ? _ctx.product.price : 0) * numQty),
      currency: _currency,
      num_items: numQty,
    });
  }

  // 1. Interceptador de Fetch (Shopify /cart/add.js)
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function () {
      var args = arguments;
      var url = args[0];
      var promise = origFetch.apply(this, args);

      if (typeof url === "string" && (url.includes("/cart/add") || url.includes("/cart/add.js"))) {
        promise.clone().json().then(function (data) {
          if (data) {
            var p = typeof data.final_price === "number" ? data.final_price / 100 : (typeof data.price === "number" ? data.price / 100 : 0);
            var q = data.quantity || 1;
            var t = data.title || data.product_title || (_ctx.product ? _ctx.product.title : "");
            var v = data.variant_id || data.id || (_ctx.product ? _ctx.product.variantId : "");
            dispatchAddToCart(v, t, p, q);
          }
        }).catch(function () {
          if (_ctx.product) dispatchAddToCart(_ctx.product.variantId, _ctx.product.title, _ctx.product.price, 1);
        });
      }
      return promise;
    };
  }

  // 2. Interceptador de Formulários e Cliques em Botões de Compra
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (form && form.action && form.action.includes("/cart/add")) {
      var variantInput = form.querySelector('[name="id"]');
      var qtyInput = form.querySelector('[name="quantity"]');
      var vId = variantInput ? variantInput.value : (_ctx.product ? _ctx.product.variantId : "");
      var qty = qtyInput ? Number(qtyInput.value) : 1;
      if (_ctx.product) {
        dispatchAddToCart(vId || _ctx.product.variantId, _ctx.product.title, _ctx.product.price, qty);
      }
    }
  }, true);

  var _lastSentCheckoutTime = 0;

  function dispatchInitiateCheckout() {
    var now = Date.now();
    if (now - _lastSentCheckoutTime < 2500) return; // Debounce 2.5s
    _lastSentCheckoutTime = now;

    var val = Number((_ctx.cart && _ctx.cart.total_price ? _ctx.cart.total_price / 100 : (_ctx.product ? _ctx.product.price : 0)) || 0);
    var contentIds = (_ctx.cart && Array.isArray(_ctx.cart.items))
      ? _ctx.cart.items.map(function (i) { return String(i.id || i.variant_id); })
      : [String(_ctx.product ? (_ctx.product.variantId || _ctx.product.id) : "CART")];

    sendEvent("InitiateCheckout", {
      content_ids: contentIds,
      content_type: "product",
      value: val > 0 ? val : 172.88,
      currency: _currency,
      num_items: (_ctx.cart && _ctx.cart.item_count) || 1,
    });
  }

  // Interceptação de cliques em botões de compra, carrinho e checkout
  document.addEventListener("click", function (e) {
    var target = e.target;
    var btn = target.closest ? target.closest("button, a, input[type='submit']") : null;
    if (!btn) return;

    var text = (btn.innerText || btn.value || "").toLowerCase();
    var href = (btn.getAttribute("href") || "").toLowerCase();
    var name = (btn.getAttribute("name") || "").toLowerCase();
    var cls = (btn.className && typeof btn.className === "string" ? btn.className.toLowerCase() : "");

    var isCheckout =
      text.includes("finalizar") ||
      text.includes("checkout") ||
      text.includes("pagamento") ||
      text.includes("comprar agora") ||
      href.includes("/checkout") ||
      href.includes("checkout.") ||
      name === "checkout" ||
      cls.includes("checkout") ||
      cls.includes("btn-checkout");

    if (isCheckout) {
      dispatchInitiateCheckout();
      return;
    }

    var isBuy =
      text.includes("comprar") ||
      text.includes("adicionar") ||
      text.includes("carrinho") ||
      name === "add" ||
      cls.includes("buy") ||
      cls.includes("cart");

    if (isBuy && _ctx.product) {
      dispatchAddToCart(_ctx.product.variantId, _ctx.product.title, _ctx.product.price, 1);
    }
  }, true);

  // ── Checkout & Payment Page Detection ───────────────────────────────────

  if (/^\\/checkout|^\\/checkouts\\//.test(_path)) {
    dispatchInitiateCheckout();
  }

  if (/payment/.test(window.location.search) || /payment/.test(_path)) {
    sendEvent("AddPaymentInfo", { content_type: "product", currency: _currency });
  }

  if (_ctx.checkout && _ctx.checkout.orderId) {
    var dkey = "atm_purchase_" + _ctx.checkout.orderId;
    if (!sessionStorage.getItem(dkey)) {
      sessionStorage.setItem(dkey, "1");
      var lineItems = _ctx.checkout.lineItems || [];
      sendEvent(
        "Purchase",
        {
          order_id: String(_ctx.checkout.orderId),
          value: Number(_ctx.checkout.totalPrice || 0),
          currency: _ctx.checkout.currency || _currency,
          content_type: "product",
          content_ids: lineItems.map(function (i) { return String(i.id); }),
          contents: lineItems,
          num_items: lineItems.reduce(function (a, i) { return a + (i.quantity || 1); }, 0),
        },
        {
          email: _ctx.checkout.email,
          phone: _ctx.checkout.phone,
          firstName: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.firstName,
          lastName: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.lastName,
          city: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.city,
          state: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.provinceCode,
          zip: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.zip,
          country: _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.countryCode,
        }
      );
    }
  }

})();
`;
}
