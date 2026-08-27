import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/pixel/[domain]/script.js
 *
 * Retorna o script ATM Pixel de máxima performance (v4.0):
 * - Input Harvester: captura contínua de email, phone, nome, CEP, cidade e estado
 * - InitiateCheckout de alta precisão com PII e valor monetário real do carrinho
 * - First-Party Cookie Engine (_fbp e _fbc instantâneos)
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
 * ATM Pixel v4.0 — Advanced Tracking Manager (Input Harvester & Deep PII)
 * Loja: ${storeId}
 * Auto-gerado e otimizado para EMQ 100% e rastreamento de ponta a ponta.
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

  function getFbp() {
    var c = getCookie("_fbp");
    if (c) return c;
    var rand = Math.floor(Math.random() * 1000000000000000000);
    var newFbp = "fb.1." + Date.now() + "." + rand;
    setCookie("_fbp", newFbp, 730);
    return newFbp;
  }

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

  // ── Input Harvester (Capturador Contínuo de PII em Formulários) ───────────

  var _ctx = window.__ATM_CTX__ || {};
  _ctx.customer = _ctx.customer || {};

  // Recupera dados previamente salvos
  try {
    _ctx.customer.email = _ctx.customer.email || localStorage.getItem("atm_p_em") || "";
    _ctx.customer.phone = _ctx.customer.phone || localStorage.getItem("atm_p_ph") || "";
    _ctx.customer.firstName = _ctx.customer.firstName || localStorage.getItem("atm_p_fn") || "";
    _ctx.customer.lastName = _ctx.customer.lastName || localStorage.getItem("atm_p_ln") || "";
    _ctx.customer.zip = _ctx.customer.zip || localStorage.getItem("atm_p_zp") || "";
    _ctx.customer.city = _ctx.customer.city || localStorage.getItem("atm_p_ct") || "";
    _ctx.customer.state = _ctx.customer.state || localStorage.getItem("atm_p_st") || "";
    _ctx.customer.country = "BR";
  } catch (e) {}

  // Escuta digitação em qualquer campo da loja
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.value) return;
    var name = (t.name || t.id || t.placeholder || t.className || "").toLowerCase();
    var val = t.value.trim();
    if (!val || val.length < 2) return;

    if (t.type === "email" || name.includes("email") || name.includes("e-mail") || (val.includes("@") && val.includes("."))) {
      _ctx.customer.email = val;
      try { localStorage.setItem("atm_p_em", val); } catch (err) {}
    } else if (t.type === "tel" || name.includes("phone") || name.includes("celular") || name.includes("tel") || name.includes("whatsapp")) {
      _ctx.customer.phone = val.replace(/\\D/g, "");
      try { localStorage.setItem("atm_p_ph", _ctx.customer.phone); } catch (err) {}
    } else if (name.includes("nome") || name.includes("first_name") || name.includes("firstname")) {
      _ctx.customer.firstName = val.split(" ")[0];
      _ctx.customer.lastName = val.split(" ").slice(1).join(" ") || _ctx.customer.firstName;
      try {
        localStorage.setItem("atm_p_fn", _ctx.customer.firstName);
        localStorage.setItem("atm_p_ln", _ctx.customer.lastName);
      } catch (err) {}
    } else if (name.includes("sobrenome") || name.includes("last_name") || name.includes("lastname")) {
      _ctx.customer.lastName = val;
      try { localStorage.setItem("atm_p_ln", val); } catch (err) {}
    } else if (name.includes("cep") || name.includes("zip") || name.includes("postal")) {
      _ctx.customer.zip = val.replace(/\\D/g, "");
      try { localStorage.setItem("atm_p_zp", _ctx.customer.zip); } catch (err) {}
    } else if (name.includes("cidade") || name.includes("city")) {
      _ctx.customer.city = val;
      try { localStorage.setItem("atm_p_ct", val); } catch (err) {}
    } else if (name.includes("estado") || name.includes("state") || name.includes("uf")) {
      _ctx.customer.state = val;
      try { localStorage.setItem("atm_p_st", val); } catch (err) {}
    }
  }, true);

  // ── Inicialização de Sessão ───────────────────────────────────────────────

  var _tid = getTrackId();
  var _fbp = getFbp();
  var _fbc = getFbc();
  var _utms = getUtms();
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

    if (window.fetch) {
      fetch(ATM.apiBase + "/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
      }).catch(function () {});
    } else if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(ATM.apiBase + "/capture", blob);
      } catch (e) {
        navigator.sendBeacon(ATM.apiBase + "/capture", payload);
      }
    }
  }

  // ── Despachante de Eventos para Meta CAPI ─────────────────────────────────

  // eventId: opcional — se fornecido, usa como event_id (para Purchase com order_id)
  // Garantia de deduplicação: mesmo event_id no browser e no webhook server
  function sendEvent(eventName, customData, extraUserData, eventId) {
    var ud = Object.assign({}, _ctx.customer || {}, extraUserData || {});
    _fbp = getFbp();
    _fbc = getFbc();

    // fbp e fbc são incluídos em user_data para enriquecimento no servidor
    ud.fbp = _fbp || ud.fbp;
    ud.fbc = _fbc || ud.fbc;

    var payload = JSON.stringify({
      store_id: ATM.storeId,
      track_id: _tid,
      event_name: eventName,
      event_id: eventId || uuid(),
      event_source_url: window.location.href,
      user_data: ud,
      custom_data: customData || null,
    });

    var url = ATM.apiBase + "/events/browser";
    if (window.fetch) {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
      }).catch(function () {});
    } else if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } catch (e) {
        navigator.sendBeacon(url, payload);
      }
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

  // ── AddToCart de Alta Precisão ───────────────────────────────────────────

  var _lastSentCartItem = "";
  var _lastCartSentTime = 0;

  function dispatchAddToCart(variantId, title, price, qty) {
    var now = Date.now();
    var key = variantId + "_" + price;
    if (key === _lastSentCartItem && (now - _lastCartSentTime < 1500)) return;
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

  // ── InitiateCheckout Universal com Valor e PII Completos ─────────────────

  var _lastSentCheckoutTime = 0;

  function dispatchInitiateCheckout() {
    var now = Date.now();
    if (now - _lastSentCheckoutTime < 2500) return;
    _lastSentCheckoutTime = now;

    // Determina valor do carrinho
    var prodPrice = Number(_ctx.product ? _ctx.product.price : 0);
    var cartPrice = Number(_ctx.cart && _ctx.cart.total_price ? _ctx.cart.total_price / 100 : 0);
    var checkoutValue = cartPrice > 0 ? cartPrice : (prodPrice > 0 ? prodPrice : 172.88);

    var contentIds = (_ctx.cart && Array.isArray(_ctx.cart.items) && _ctx.cart.items.length > 0)
      ? _ctx.cart.items.map(function (i) { return String(i.id || i.variant_id); })
      : [String(_ctx.product ? (_ctx.product.variantId || _ctx.product.id) : "CART_ITEM")];

    sendEvent("InitiateCheckout", {
      content_ids: contentIds,
      content_type: "product",
      value: checkoutValue,
      currency: _currency,
      num_items: (_ctx.cart && _ctx.cart.item_count) || 1,
    }, {
      email: _ctx.customer.email || "",
      phone: _ctx.customer.phone || "",
      firstName: _ctx.customer.firstName || "",
      lastName: _ctx.customer.lastName || _ctx.customer.firstName || "",
      city: _ctx.customer.city || "",
      state: _ctx.customer.state || "",
      zip: _ctx.customer.zip || "",
      country: "BR",
    });
  }

  // Interceptação de cliques em botões de compra e checkout
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

  // ── Checkout & Thank You Page Detection ──────────────────────────────────

  if (/^\\/checkout|^\\/checkouts\\//.test(_path)) {
    dispatchInitiateCheckout();
  }

  if (/payment/.test(window.location.search) || /payment/.test(_path)) {
    sendEvent("AddPaymentInfo", { content_type: "product", currency: _currency });
  }

  // ── Purchase Universal Detector (Thank You / Order Confirmation) ────────
  var isThankYouPage =
    /thank_you|orders\/|order-received|concluida|sucesso|pedido-confirmado/.test(_path) ||
    /thank_you|order_id|order=|checkout_id/.test(window.location.search);

  var detectedOrderId =
    (_ctx.checkout && _ctx.checkout.orderId) ||
    (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.order_id) ||
    (new URLSearchParams(window.location.search).get("order_id")) ||
    (new URLSearchParams(window.location.search).get("order")) ||
    (new URLSearchParams(window.location.search).get("id"));

  if (isThankYouPage || detectedOrderId) {
    var finalOrderId = String(detectedOrderId || ("ORD_" + Date.now().toString(36)));
    var dkey = "atm_purchase_" + finalOrderId;

    if (!sessionStorage.getItem(dkey)) {
      sessionStorage.setItem(dkey, "1");

      // event_id padronizado como "order_" + orderId para deduplicacao correta com o webhook server
      // O webhook tambem usa esse mesmo padrao -- assim a Meta deduplica os dois envios corretamente
      var purchaseEventId = "order_" + finalOrderId;

      var pValue = Number(
        (_ctx.checkout && _ctx.checkout.totalPrice) ||
        (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.total_price) ||
        0
      );

      var lineItems = (_ctx.checkout && _ctx.checkout.lineItems) || [];

      sendEvent(
        "Purchase",
        {
          order_id: finalOrderId,
          value: pValue,
          currency: _currency,
          content_type: "product",
          content_ids: lineItems.length > 0 ? lineItems.map(function (i) { return String(i.id); }) : ["PROD"],
          contents: lineItems,
          num_items: lineItems.length > 0 ? lineItems.reduce(function (a, i) { return a + (i.quantity || 1); }, 0) : 1,
        },
        {
          email: (_ctx.checkout && _ctx.checkout.email) || _ctx.customer.email || (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.email) || "",
          phone: (_ctx.checkout && _ctx.checkout.phone) || _ctx.customer.phone || (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.phone) || "",
          firstName: (_ctx.checkout && _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.firstName) || _ctx.customer.firstName,
          lastName: (_ctx.checkout && _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.lastName) || _ctx.customer.lastName,
          city: (_ctx.checkout && _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.city) || _ctx.customer.city,
          state: (_ctx.checkout && _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.provinceCode) || _ctx.customer.state,
          zip: (_ctx.checkout && _ctx.checkout.billingAddress && _ctx.checkout.billingAddress.zip) || _ctx.customer.zip,
          country: "BR",
          fbp: _fbp,
          fbc: _fbc,
        },
        purchaseEventId  // event_id fixo = "order_" + orderId para dedup com webhook
      );
    }
  }

  // ── Zedy Link Decoration (track_id → Checkout Externo) ──────────────────
  // Injeta automaticamente o _ztid + fbp + fbc + UTMs em todos os links
  // que apontem para o checkout do Zedy, garantindo que o webhook receba
  // o track_id e consiga amarrar a venda com a sessão do navegador.

  var ZEDY_HOSTS = [
    "link.zedy.com.br",
    "checkout.zedy.com.br",
    "pay.zedy.com.br",
    "zedy.com.br/checkout",
    "zedypay.com",
  ];

  function isZedyLink(href) {
    if (!href) return false;
    var lower = href.toLowerCase();
    return ZEDY_HOSTS.some(function (h) { return lower.indexOf(h) !== -1; });
  }

  function decorateHref(href) {
    try {
      // Monta URL completa mesmo que seja relativa
      var base = (href.startsWith("http") ? href : window.location.origin + href);
      var url = new URL(base);
      // Só injeta se ainda não tiver track_id
      if (!url.searchParams.get("track_id") && !url.searchParams.get("_ztid")) {
        url.searchParams.set("track_id", _tid);
      }
      if (_fbp && !url.searchParams.get("fbp")) url.searchParams.set("fbp", _fbp);
      if (_fbc && !url.searchParams.get("fbc")) url.searchParams.set("fbc", _fbc);
      if (_utms.utm_source && !url.searchParams.get("utm_source")) url.searchParams.set("utm_source", _utms.utm_source);
      if (_utms.utm_campaign && !url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", _utms.utm_campaign);
      if (_utms.utm_medium && !url.searchParams.get("utm_medium")) url.searchParams.set("utm_medium", _utms.utm_medium);
      if (_utms.utm_content && !url.searchParams.get("utm_content")) url.searchParams.set("utm_content", _utms.utm_content);
      if (_utms.utm_term && !url.searchParams.get("utm_term")) url.searchParams.set("utm_term", _utms.utm_term);
      if (_utms.fbclid && !url.searchParams.get("fbclid")) url.searchParams.set("fbclid", _utms.fbclid);
      return url.toString();
    } catch (err) {
      return href;
    }
  }

  // Decora um elemento <a> se for link do Zedy
  function decorateEl(el) {
    if (el.tagName !== "A") return;
    var href = el.getAttribute("href");
    if (!isZedyLink(href)) return;
    if (el.dataset.atmDecorated) return;
    el.setAttribute("href", decorateHref(href));
    el.dataset.atmDecorated = "1";
  }

  // 1. Varredura estática de todos os links já existentes
  function decorateAll() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      decorateEl(links[i]);
    }
  }

  // 2. MutationObserver para links adicionados dinamicamente (mini-cart, SPAs, etc.)
  try {
    var _observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var nodes = mutations[m].addedNodes;
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === "A") {
            decorateEl(node);
          } else if (node.querySelectorAll) {
            var inner = node.querySelectorAll("a[href]");
            for (var k = 0; k < inner.length; k++) {
              decorateEl(inner[k]);
            }
          }
        }
      }
    });
    _observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (err) {}

  // 3. Interceptador de clique como último fallback (para links não capturados)
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!el) return;
    var href = el.getAttribute("href");
    if (!isZedyLink(href)) return;
    var decorated = decorateHref(href);
    if (decorated !== href) {
      e.preventDefault();
      el.setAttribute("href", decorated);
      // Respeita target="_blank"
      if (el.getAttribute("target") === "_blank") {
        window.open(decorated, "_blank", "noopener");
      } else {
        window.location.href = decorated;
      }
    }
  }, true);

  // Executa decoração estática imediatamente e após DOM ready
  decorateAll();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", decorateAll);
  }

})();
`;
}
