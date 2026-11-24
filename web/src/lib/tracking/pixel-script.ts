/**
 * Gerador do script do pixel ATM (v5).
 *
 * Funciona em dois cenários, detectados sozinhos:
 *  - Loja Shopify: lê window.__ATM_CTX__ (produto, carrinho, checkout) do theme.liquid;
 *  - Página própria (infoproduto, web app): sem nada de carrinho. Os eventos vêm do
 *    harvester de formulários, dos atributos data-atm-* e da API pública window.ATM.
 *
 * API pública (também funciona antes do script carregar, pela fila `atm(...)`):
 *   ATM.track(nome, dados?, opções?)  → envia um evento; devolve o event_id
 *   ATM.identify({ email, phone, name, ... })
 *   ATM.getTrackId()                  → ID do visitante, para mandar ao backend junto da cobrança
 *   ATM.getAttribution()              → { track_id, fbp, fbc, utm_* } pronto para a API de conversões
 *   ATM.decorate(url)                 → URL com track_id/fbp/fbc/UTMs (checkout em outro domínio)
 *
 * O template usa String.raw (sem escapes duplos) e marcadores __ATM_*__ trocados no fim.
 * Por isso o JavaScript abaixo NÃO pode usar crase nem "${".
 */

export const PIXEL_VERSION = "5.0";

export const PIXEL_TRACKABLE_EVENTS = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Search",
  "Lead",
  "CompleteRegistration",
  "Subscribe",
  "StartTrial",
] as const;

const TEMPLATE = String.raw`/**
 * ATM Pixel v__ATM_VERSION__ — Advanced Tracking Manager
 * Loja: __ATM_STORE_ID_RAW__
 */
(function () {
  "use strict";
  if (window.__ATM_LOADED__) return;
  window.__ATM_LOADED__ = true;

  var CFG = { storeId: __ATM_STORE_ID__, apiBase: __ATM_API_BASE__, version: __ATM_VERSION_JSON__ };
  var EVENTS = __ATM_EVENTS__;
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"];
  var UTM_TTL_MS = 30 * 864e5;

  var _ctx = window.__ATM_CTX__ || {};
  _ctx.customer = _ctx.customer || {};
  var _isShopify = !!(window.Shopify || _ctx.shop || _ctx.product || _ctx.cart);

  // ── Utilitários ─────────────────────────────────────────────────────────────

  function getCookie(name) {
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].replace(/^\s+/, "");
      if (kv.indexOf(name + "=") === 0) {
        try { return decodeURIComponent(kv.substring(name.length + 1)); } catch (e) { return kv.substring(name.length + 1); }
      }
    }
    return null;
  }

  function setCookie(name, val, days) {
    var exp = new Date(Date.now() + (days || 730) * 864e5).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(val) + "; expires=" + exp + "; path=/; SameSite=Lax";
  }

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function num(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  // ── Identificadores do visitante ────────────────────────────────────────────

  function getTrackId() {
    var key = "atm_ztid_" + CFG.storeId.slice(0, 8);
    var id = getCookie("_ztid") || lsGet(key);
    if (!id) { try { id = window.sessionStorage.getItem(key); } catch (e) {} }
    if (id && /^[A-Za-z0-9_-]{16,80}$/.test(id)) {
      setCookie("_ztid", id, 730);
      return id;
    }
    id = uuid().replace(/-/g, "");
    setCookie("_ztid", id, 730);
    lsSet(key, id);
    return id;
  }

  function getFbp() {
    var c = getCookie("_fbp");
    if (c) return c;
    var newFbp = "fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e15);
    setCookie("_fbp", newFbp, 730);
    return newFbp;
  }

  function getFbc() {
    var p = new URLSearchParams(window.location.search);
    var fbclid = p.get("fbclid") || p.get("FBCLID");
    var c = getCookie("_fbc");
    // Clique novo em anúncio troca o fbc antigo
    if (fbclid && (!c || c.split(".").slice(3).join(".") !== fbclid)) {
      c = "fb.1." + Date.now() + "." + fbclid;
      setCookie("_fbc", c, 90);
    }
    return c || null;
  }

  // UTMs: a última campanha com UTM fica guardada por 30 dias, para as páginas seguintes
  function getUtms() {
    var p = new URLSearchParams(window.location.search);
    var cur = {};
    var hasAny = false;
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var v = p.get(UTM_KEYS[i]);
      cur[UTM_KEYS[i]] = v || null;
      if (v) hasAny = true;
    }
    cur.fbclid = p.get("fbclid") || null;
    if (hasAny || cur.fbclid) {
      lsSet("atm_utms", JSON.stringify({ ts: Date.now(), data: cur }));
      return cur;
    }
    try {
      var saved = JSON.parse(lsGet("atm_utms") || "null");
      if (saved && saved.data && Date.now() - saved.ts < UTM_TTL_MS) return saved.data;
    } catch (e) {}
    return cur;
  }

  // ── Dados do comprador (formulários e ATM.identify) ─────────────────────────

  var PII_KEYS = { email: "atm_p_em", phone: "atm_p_ph", firstName: "atm_p_fn", lastName: "atm_p_ln", zip: "atm_p_zp", city: "atm_p_ct", state: "atm_p_st" };
  for (var pk in PII_KEYS) {
    if (!_ctx.customer[pk]) _ctx.customer[pk] = lsGet(PII_KEYS[pk]) || "";
  }
  _ctx.customer.country = _ctx.customer.country || "BR";

  function setPii(field, value) {
    if (!value) return;
    _ctx.customer[field] = value;
    if (PII_KEYS[field]) lsSet(PII_KEYS[field], value);
  }

  function setFullName(full) {
    var parts = String(full || "").trim().split(/\s+/);
    if (!parts[0]) return;
    setPii("firstName", parts[0]);
    if (parts.length > 1) setPii("lastName", parts.slice(1).join(" "));
  }

  var _leadTimeout = null;
  var _leadDispatched = false;

  function harvestInput(t) {
    if (!t || !t.value || t.type === "password" || t.type === "hidden") return;
    var name = (t.name || t.id || t.placeholder || t.getAttribute("aria-label") || "").toLowerCase();
    var val = String(t.value).trim();
    if (val.length < 2) return;

    if (t.type === "email" || name.indexOf("email") !== -1 || name.indexOf("e-mail") !== -1 || (val.indexOf("@") !== -1 && val.indexOf(".") !== -1)) {
      setPii("email", val);
    } else if (t.type === "tel" || /phone|celular|telefone|whatsapp|\btel\b/.test(name)) {
      setPii("phone", val.replace(/\D/g, ""));
    } else if (/sobrenome|last_?name/.test(name)) {
      setPii("lastName", val);
    } else if (/nome|first_?name|\bname\b/.test(name)) {
      setFullName(val);
    } else if (/cep|zip|postal/.test(name)) {
      var z = val.replace(/\D/g, "");
      if (z.length >= 5) setPii("zip", z);
    } else if (/cidade|city/.test(name)) {
      setPii("city", val);
    } else if (/estado|state|\buf\b/.test(name)) {
      setPii("state", val);
    }

    var c = _ctx.customer;
    if ((c.email && c.email.indexOf("@") !== -1) || (c.phone && c.phone.length >= 10)) {
      clearTimeout(_leadTimeout);
      _leadTimeout = setTimeout(triggerLeadEvent, 1500);
    }
  }

  document.addEventListener("input", function (e) { harvestInput(e.target); }, true);
  document.addEventListener("change", function (e) { harvestInput(e.target); }, true);

  function triggerLeadEvent() {
    if (_leadDispatched || _ctx.autoLead === false) return;
    if (_ctx.customer.email || _ctx.customer.phone) {
      _leadDispatched = true;
      sendEvent("Lead", { content_name: "Captura de contato" });
    }
  }

  // ── Sessão ──────────────────────────────────────────────────────────────────

  var _tid = getTrackId();
  var _fbp = getFbp();
  var _fbc = getFbc();
  var _utms = getUtms();
  var _currency = (_ctx.shop && _ctx.shop.currency) || (_ctx.offer && _ctx.offer.currency) || "BRL";

  function post(path, obj) {
    var payload = JSON.stringify(obj);
    var url = CFG.apiBase + path;
    if (window.fetch) {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true, mode: "cors" }).catch(function () {});
    } else if (navigator.sendBeacon) {
      try { navigator.sendBeacon(url, new Blob([payload], { type: "application/json" })); } catch (e) {}
    }
  }

  function captureSession() {
    var body = {
      store_id: CFG.storeId,
      track_id: _tid,
      fbp: _fbp,
      fbc: _fbc,
      fbclid: _utms.fbclid,
      landing_page: document.referrer || null,
      event_source_url: window.location.href,
    };
    for (var i = 0; i < UTM_KEYS.length; i++) body[UTM_KEYS[i]] = _utms[UTM_KEYS[i]];
    post("/capture", body);
  }

  // ── Envio de eventos ────────────────────────────────────────────────────────

  function sendEvent(eventName, customData, extraUserData, eventId) {
    var ud = {};
    var k;
    for (k in _ctx.customer) ud[k] = _ctx.customer[k];
    if (extraUserData) for (k in extraUserData) if (extraUserData[k]) ud[k] = extraUserData[k];
    _fbp = getFbp();
    _fbc = getFbc();
    _utms = getUtms();
    ud.fbp = _fbp || ud.fbp;
    ud.fbc = _fbc || ud.fbc;

    var cd = {};
    if (customData) for (k in customData) if (customData[k] !== undefined && customData[k] !== null && customData[k] !== "") cd[k] = customData[k];
    if (cd.value !== undefined && !cd.currency) cd.currency = _currency;
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (!cd[UTM_KEYS[i]] && _utms[UTM_KEYS[i]]) cd[UTM_KEYS[i]] = _utms[UTM_KEYS[i]];
    }
    if (!cd.fbclid && _utms.fbclid) cd.fbclid = _utms.fbclid;

    var id = eventId || uuid();
    post("/events/browser", {
      store_id: CFG.storeId,
      track_id: _tid,
      event_name: eventName,
      event_id: id,
      event_source_url: window.location.href,
      user_data: ud,
      custom_data: cd,
      utms: _utms,
    });
    return id;
  }

  captureSession();
  sendEvent("PageView", null);

  // Heartbeat para o "ao vivo" do painel (não apaga as UTMs: o servidor só grava o que vier preenchido)
  setInterval(function () { try { captureSession(); } catch (e) {} }, 15000);

  // ── Loja Shopify: produto e carrinho ────────────────────────────────────────

  var _path = window.location.pathname;

  if (_isShopify && /^\/products\//.test(_path) && _ctx.product) {
    sendEvent("ViewContent", {
      content_ids: [String(_ctx.product.variantId || _ctx.product.id)],
      content_name: _ctx.product.title,
      content_type: "product",
      value: Number(_ctx.product.price || 0),
    });
  }

  var _lastCartKey = "";
  var _lastCartTime = 0;
  function dispatchAddToCart(variantId, title, price, qty) {
    var now = Date.now();
    var key = variantId + "_" + price;
    if (key === _lastCartKey && now - _lastCartTime < 1500) return;
    _lastCartKey = key;
    _lastCartTime = now;
    var p = Number(price || 0);
    var q = Number(qty || 1);
    var cd = {
      content_ids: [String(variantId || (_ctx.product ? _ctx.product.variantId || _ctx.product.id : "PROD"))],
      content_name: title || (_ctx.product ? _ctx.product.title : "Produto"),
      content_type: "product",
      num_items: q,
    };
    var total = p > 0 ? p * q : Number(_ctx.product ? _ctx.product.price : 0) * q;
    if (total > 0) cd.value = total;
    sendEvent("AddToCart", cd);
  }

  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function () {
      var url = arguments[0];
      var promise = origFetch.apply(this, arguments);
      if (typeof url === "string" && url.indexOf("/cart/add") !== -1) {
        promise.then(function (res) { return res.clone().json(); }).then(function (data) {
          if (!data) return;
          var p = typeof data.final_price === "number" ? data.final_price / 100 : (typeof data.price === "number" ? data.price / 100 : 0);
          dispatchAddToCart(data.variant_id || data.id, data.title || data.product_title, p, data.quantity || 1);
        }).catch(function () {
          if (_ctx.product) dispatchAddToCart(_ctx.product.variantId, _ctx.product.title, _ctx.product.price, 1);
        });
      }
      return promise;
    };
  }

  // ── InitiateCheckout ────────────────────────────────────────────────────────

  var _lastCheckoutTime = 0;
  function dispatchInitiateCheckout(explicitValue) {
    var now = Date.now();
    if (now - _lastCheckoutTime < 2500) return;
    _lastCheckoutTime = now;

    var cartPrice = _ctx.cart && _ctx.cart.total_price ? _ctx.cart.total_price / 100 : 0;
    var value = num(explicitValue) || num(_ctx.offer && _ctx.offer.value) || cartPrice || num(_ctx.product && _ctx.product.price);
    var cd = { num_items: (_ctx.cart && _ctx.cart.item_count) || 1 };
    if (value && value > 0) cd.value = value;

    if (_ctx.cart && _ctx.cart.items && _ctx.cart.items.length) {
      cd.content_type = "product";
      cd.content_ids = _ctx.cart.items.map(function (i) { return String(i.id || i.variant_id); });
    } else if (_ctx.offer && _ctx.offer.id) {
      cd.content_type = "product";
      cd.content_ids = [String(_ctx.offer.id)];
      if (_ctx.offer.name) cd.content_name = _ctx.offer.name;
    } else if (_ctx.product) {
      cd.content_type = "product";
      cd.content_ids = [String(_ctx.product.variantId || _ctx.product.id)];
    }
    sendEvent("InitiateCheckout", cd);
  }

  // ── Links e formulários de checkout ─────────────────────────────────────────

  var CHECKOUT_DOMAINS = ["zedy", "vega", "cartpanda", "yampi", "appmax", "greenn", "kiwify", "hotmart", "monetizze", "braip", "perfectpay", "turbocheckout", "cakto", "ticto", "eduzz", "pepper"];
  if (_ctx.checkoutDomains && _ctx.checkoutDomains.length) CHECKOUT_DOMAINS = CHECKOUT_DOMAINS.concat(_ctx.checkoutDomains);

  function isCheckoutLink(href) {
    if (!href) return false;
    var lower = String(href).toLowerCase();
    if (lower.indexOf("javascript:") === 0 || lower.indexOf("#") === 0 || lower.indexOf("mailto:") === 0) return false;
    if (lower.indexOf("/checkout") !== -1 || lower.indexOf("/cart") !== -1) return true;
    for (var i = 0; i < CHECKOUT_DOMAINS.length; i++) if (lower.indexOf(String(CHECKOUT_DOMAINS[i]).toLowerCase()) !== -1) return true;
    return false;
  }

  function decorateHref(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return href;
      _fbp = getFbp();
      _fbc = getFbc();
      var sp = url.searchParams;
      if (!sp.get("track_id") && !sp.get("_ztid")) sp.set("track_id", _tid);
      if (_fbp && !sp.get("fbp") && !sp.get("_fbp")) sp.set("fbp", _fbp);
      if (_fbc && !sp.get("fbc") && !sp.get("_fbc")) sp.set("fbc", _fbc);
      var keys = UTM_KEYS.concat(["fbclid"]);
      for (var i = 0; i < keys.length; i++) {
        if (_utms[keys[i]] && !sp.get(keys[i])) sp.set(keys[i], _utms[keys[i]]);
      }
      var cur = new URLSearchParams(window.location.search);
      ["src", "sck"].forEach(function (k) { if (cur.get(k) && !sp.get(k)) sp.set(k, cur.get(k)); });
      return url.toString();
    } catch (err) {
      return href;
    }
  }

  function decorateEl(el) {
    if (!el || el.tagName !== "A" || el.getAttribute("data-atm-decorated")) return;
    var href = el.getAttribute("href");
    if (!el.hasAttribute("data-atm-checkout") && !isCheckoutLink(href)) return;
    el.setAttribute("href", decorateHref(href));
    el.setAttribute("data-atm-decorated", "1");
  }

  function decorateAll() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) decorateEl(links[i]);
  }

  document.addEventListener("click", function (e) {
    var target = e.target;
    var el = target && target.closest ? target.closest("[data-atm-event], button, a, input[type='submit']") : null;
    if (!el) return;

    // Sem código: <a data-atm-event="InitiateCheckout" data-atm-value="97">
    var custom = el.getAttribute("data-atm-event");
    if (custom) {
      if (custom === "InitiateCheckout") dispatchInitiateCheckout(el.getAttribute("data-atm-value"));
      else api.track(custom, { value: num(el.getAttribute("data-atm-value")) || undefined, content_name: el.getAttribute("data-atm-name") || undefined });
      if (el.tagName === "A") decorateEl(el);
      return;
    }

    var text = (el.innerText || el.value || "").toLowerCase();
    var rawHref = el.getAttribute("href") || "";
    var href = rawHref.toLowerCase();
    var name = (el.getAttribute("name") || "").toLowerCase();
    var cls = typeof el.className === "string" ? el.className.toLowerCase() : "";

    var isCheckout =
      el.hasAttribute("data-atm-checkout") ||
      text.indexOf("finalizar") !== -1 || text.indexOf("checkout") !== -1 || text.indexOf("pagamento") !== -1 ||
      text.indexOf("comprar agora") !== -1 || text.indexOf("quero comprar") !== -1 || text.indexOf("garantir") !== -1 ||
      isCheckoutLink(href) || href.indexOf("pay.") !== -1 || name === "checkout" || cls.indexOf("checkout") !== -1;

    if (isCheckout) {
      if (el.tagName === "A") decorateEl(el);
      dispatchInitiateCheckout(el.getAttribute("data-atm-value"));
      return;
    }

    if (_isShopify && _ctx.product) {
      var isBuy = text.indexOf("comprar") !== -1 || text.indexOf("adicionar") !== -1 || text.indexOf("carrinho") !== -1 ||
        name === "add" || cls.indexOf("buy") !== -1 || cls.indexOf("cart") !== -1;
      if (isBuy) dispatchAddToCart(_ctx.product.variantId, _ctx.product.title, _ctx.product.price, 1);
    }
  }, true);

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.getAttribute) return;
    var action = (form.getAttribute("action") || "").toLowerCase();
    var marked = form.hasAttribute("data-atm-checkout");
    if (!marked && !(action.indexOf("checkout") !== -1 || action.indexOf("cart") !== -1 || action.indexOf("pay.") !== -1 || isCheckoutLink(action))) return;

    dispatchInitiateCheckout(form.getAttribute("data-atm-value"));
    function injectHidden(n, v) {
      if (!v || form.querySelector("input[name='" + n + "']")) return;
      var inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = n;
      inp.value = v;
      form.appendChild(inp);
    }
    injectHidden("track_id", _tid);
    injectHidden("fbp", getFbp());
    injectHidden("fbc", getFbc());
  }, true);

  try {
    new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var nodes = mutations[m].addedNodes;
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === "A") decorateEl(node);
          else if (node.querySelectorAll) {
            var inner = node.querySelectorAll("a[href]");
            for (var k = 0; k < inner.length; k++) decorateEl(inner[k]);
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (err) {}

  decorateAll();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorateAll);

  // ── Loja Shopify: checkout e página de obrigado ─────────────────────────────

  if (_isShopify && /^\/checkout|^\/checkouts\//.test(_path)) dispatchInitiateCheckout();

  var shopCheckout = window.Shopify && window.Shopify.checkout;
  var qs = new URLSearchParams(window.location.search);
  var isThankYouPage = /thank_you|orders\/|order-received|pedido-confirmado/.test(_path);
  // Só dispara compra automática com ID de pedido de verdade (nunca inventa um)
  var autoOrderId =
    (_ctx.checkout && _ctx.checkout.orderId) ||
    (shopCheckout && shopCheckout.order_id) ||
    (isThankYouPage ? qs.get("order_id") || qs.get("order") : null);

  if (autoOrderId) {
    var dkey = "atm_purchase_" + autoOrderId;
    var already = false;
    try { already = !!window.sessionStorage.getItem(dkey); window.sessionStorage.setItem(dkey, "1"); } catch (e) {}
    if (!already) {
      var co = _ctx.checkout || {};
      var bill = co.billingAddress || {};
      var lineItems = co.lineItems || [];
      var pValue = num(co.totalPrice) || num(shopCheckout && shopCheckout.total_price) || 0;
      var pcd = { order_id: String(autoOrderId), num_items: lineItems.length || 1 };
      if (pValue > 0) pcd.value = pValue;
      if (lineItems.length) {
        pcd.content_type = "product";
        pcd.content_ids = lineItems.map(function (i) { return String(i.id); });
        pcd.contents = lineItems;
      }
      sendEvent("Purchase", pcd, {
        email: co.email || (shopCheckout && shopCheckout.email) || "",
        phone: co.phone || (shopCheckout && shopCheckout.phone) || "",
        firstName: bill.firstName || "",
        lastName: bill.lastName || "",
        city: bill.city || "",
        state: bill.provinceCode || "",
        zip: bill.zip || "",
      }, "Purchase_" + autoOrderId); // mesmo event_id do servidor: a Meta deduplica
    }
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  var api = {
    version: CFG.version,
    storeId: CFG.storeId,

    track: function (eventName, data, options) {
      if (EVENTS.indexOf(eventName) === -1) {
        if (window.console) console.warn("[ATM] Evento desconhecido: " + eventName + ". Use: " + EVENTS.join(", "));
        return null;
      }
      data = data || {};
      options = options || {};
      if (eventName === "InitiateCheckout" && !options.eventId && data.value === undefined && !data.content_ids) {
        dispatchInitiateCheckout();
        return null;
      }
      var eid = options.eventId;
      if (!eid && eventName === "Purchase" && data.order_id) eid = "Purchase_" + data.order_id;
      if (options.user) api.identify(options.user);
      return sendEvent(eventName, data, null, eid);
    },

    identify: function (u) {
      if (!u || typeof u !== "object") return api;
      if (u.email) setPii("email", String(u.email).trim());
      if (u.phone) setPii("phone", String(u.phone).replace(/\D/g, ""));
      if (u.name) setFullName(u.name);
      if (u.firstName || u.first_name) setPii("firstName", u.firstName || u.first_name);
      if (u.lastName || u.last_name) setPii("lastName", u.lastName || u.last_name);
      if (u.city) setPii("city", u.city);
      if (u.state) setPii("state", u.state);
      if (u.zip) setPii("zip", String(u.zip).replace(/\D/g, ""));
      if (u.id || u.externalId) _ctx.customer.externalId = String(u.id || u.externalId);
      return api;
    },

    getTrackId: function () { return _tid; },

    getAttribution: function () {
      var a = { track_id: _tid, fbp: getFbp(), fbc: getFbc() };
      var u = getUtms();
      for (var i = 0; i < UTM_KEYS.length; i++) if (u[UTM_KEYS[i]]) a[UTM_KEYS[i]] = u[UTM_KEYS[i]];
      a.page_url = window.location.href;
      a.user_agent = navigator.userAgent;
      return a;
    },

    decorate: function (url) { return decorateHref(url); },
  };

  window.ATM = api;

  // Fila de chamadas feitas antes do script carregar: atm("track", "Lead", {...})
  function runQueued(args) {
    var method = args[0];
    if (typeof api[method] !== "function") return undefined;
    try { return api[method].apply(api, Array.prototype.slice.call(args, 1)); } catch (e) { if (window.console) console.warn("[ATM]", e); }
  }
  var queue = window.atmq || [];
  window.atm = function () { return runQueued(arguments); };
  window.atmq = { push: function (args) { return runQueued(args); } };
  for (var qi = 0; qi < queue.length; qi++) runQueued(queue[qi]);

  try { document.dispatchEvent(new CustomEvent("atm:ready", { detail: api })); } catch (e) {}
})();
`;

/** Script do pixel para uma loja. */
export function generateATMScript(storeId: string, apiBase: string): string {
  if (TEMPLATE.includes("`") || TEMPLATE.includes("${")) {
    throw new Error("[ATM] Template do pixel inválido: não pode conter crase nem ${.");
  }
  return TEMPLATE
    .replace(/__ATM_STORE_ID_RAW__/g, storeId.replace(/[^A-Za-z0-9-]/g, ""))
    .replace(/__ATM_STORE_ID__/g, JSON.stringify(storeId))
    .replace(/__ATM_API_BASE__/g, JSON.stringify(apiBase))
    .replace(/__ATM_VERSION_JSON__/g, JSON.stringify(PIXEL_VERSION))
    .replace(/__ATM_VERSION__/g, PIXEL_VERSION)
    .replace(/__ATM_EVENTS__/g, JSON.stringify(PIXEL_TRACKABLE_EVENTS));
}

/** Script vazio quando a loja não é encontrada: avisa no console e não envia nada. */
export function generateNoopScript(reason: string): string {
  return `/* ATM Pixel: ${reason.replace(/\*\//g, "")} */\n(function(){if(window.console)console.warn(${JSON.stringify("[ATM] " + reason)});window.atm=window.atm||function(){};})();\n`;
}
