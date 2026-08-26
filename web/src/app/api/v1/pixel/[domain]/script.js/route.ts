import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/pixel/[domain]/script.js
 *
 * Retorna o script ATM completo, já configurado para a loja identificada
 * pelo domínio Shopify (ex: minhaloja.myshopify.com).
 *
 * O script é cacheado por 5 minutos (CDN) e versionado pelo store_id,
 * então mudanças de configuração propagam rapidamente.
 *
 * O usuário instala apenas UMA linha no theme.liquid:
 *   <script src="https://app.atm.com/api/v1/pixel/{{ shop.permanent_domain }}/script.js" defer></script>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;

  if (!domain || !domain.includes(".")) {
    return new NextResponse("// ATM: domínio inválido", {
      status: 400,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const supabase = await createClient();

  // Busca a loja pelo shop_domain
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, shop_domain, status, checkout_domain")
    .eq("shop_domain", domain)
    .maybeSingle();

  if (storeError || !store) {
    // Retorna script vazio comentado para não quebrar a loja
    return new NextResponse(
      `// ATM Pixel: loja não encontrada para domínio "${domain}". Verifique a configuração no painel.`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (store.status !== "active") {
    return new NextResponse(
      `// ATM Pixel: loja "${domain}" está com status "${store.status}". Verifique o painel ATM.`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const storeId = store.id;
  const apiBase = request.nextUrl.origin + "/api/v1";

  const scriptContent = generateATMScript(storeId, apiBase);

  return new NextResponse(scriptContent, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Cache de 5 minutos no CDN, 1 minuto no browser
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      // ETag baseado no store_id para invalidação correta
      ETag: `"atm-${storeId.slice(0, 8)}"`,
    },
  });
}

/**
 * Gera o JavaScript completo do ATM Pixel para uma loja específica.
 * storeId e apiBase já vêm configurados — o usuário não precisa editar nada.
 */
function generateATMScript(storeId: string, apiBase: string): string {
  return `/**
 * ATM Pixel — Advanced Tracking Manager
 * Loja: ${storeId.slice(0, 8)}...
 * Gerado automaticamente. Não edite.
 */
(function () {
  "use strict";

  var ATM = {
    storeId: "${storeId}",
    apiBase: "${apiBase}",
  };

  // ── Utilitários ────────────────────────────────────────────────────────

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|;\\\\s*)" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
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
    var id = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (id && /^[A-Za-z0-9_-]{16,80}$/.test(id)) return id;
    id = uuid().replace(/-/g, "");
    try { localStorage.setItem(key, id); } catch (e) { sessionStorage.setItem(key, id); }
    return id;
  }

  function getFbp() { return getCookie("_fbp") || null; }

  function getFbc() {
    var c = getCookie("_fbc");
    if (c) return c;
    var fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) {
      var fbc = "fb.1." + Math.floor(Date.now() / 1000) + "." + fbclid;
      var exp = new Date(Date.now() + 90 * 864e5).toUTCString();
      document.cookie = "_fbc=" + encodeURIComponent(fbc) + "; expires=" + exp + "; path=/; SameSite=Lax";
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
      fbclid: p.get("fbclid"),
    };
  }

  // ── Estado da sessão ────────────────────────────────────────────────────

  var _tid = getTrackId();
  var _fbp = getFbp();
  var _fbc = getFbc();
  var _utms = getUtms();
  var _ctx = window.__ATM_CTX__ || {};  // Dados do contexto Liquid (injetados pelo theme.liquid)
  var _captured = false;

  // ── Bridge de sessão ─────────────────────────────────────────────────────

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
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ATM.apiBase + "/capture", payload);
    } else {
      fetch(ATM.apiBase + "/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }
  }

  // ── Envio de eventos ─────────────────────────────────────────────────────

  function sendEvent(eventName, customData, extraUserData) {
    var ud = Object.assign({}, _ctx.customer || {}, extraUserData || {});
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

  // ── Lógica por página ────────────────────────────────────────────────────

  var _path = window.location.pathname;
  var _currency = (_ctx.shop && _ctx.shop.currency) || "BRL";

  // PageView — toda página
  captureSession();
  sendEvent("PageView", null);

  // ViewContent — página de produto
  if (/^\\/products\\//.test(_path) && _ctx.product) {
    sendEvent("ViewContent", {
      content_ids: [String(_ctx.product.variantId || _ctx.product.id)],
      content_name: _ctx.product.title,
      content_type: "product",
      value: _ctx.product.price,
      currency: _currency,
    });
  }

  // AddToCart — formulário de carrinho + Shopify Web Pixels API
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("form[action='/cart/add']").forEach(function (form) {
      form.addEventListener("submit", function () {
        if (!_ctx.product) return;
        sendEvent("AddToCart", {
          content_ids: [String(_ctx.product.variantId || _ctx.product.id)],
          content_name: _ctx.product.title,
          content_type: "product",
          value: _ctx.product.price,
          currency: _currency,
          num_items: 1,
        });
      });
    });

    // Shopify Web Pixels API (se disponível)
    if (window.Shopify && window.Shopify.analytics && window.Shopify.analytics.subscribe) {
      window.Shopify.analytics.subscribe("cart:item_added", function (event) {
        var item = event.data && event.data.cartLine && event.data.cartLine.merchandise;
        if (!item) return;
        sendEvent("AddToCart", {
          content_ids: [String(item.id || item.sku)],
          content_name: item.product && item.product.title,
          content_type: "product",
          value: item.price && item.price.amount ? parseFloat(item.price.amount) : null,
          currency: item.price && item.price.currencyCode || _currency,
          num_items: (event.data.cartLine && event.data.cartLine.quantity) || 1,
        });
      });
    }
  });

  // InitiateCheckout — entrada no /checkout
  if (/^\\/checkout|^\\/checkouts\\//.test(_path)) {
    sendEvent("InitiateCheckout", { content_type: "product", currency: _currency });
  }

  // AddPaymentInfo — step de pagamento
  if (/payment/.test(window.location.search) || /payment/.test(_path)) {
    sendEvent("AddPaymentInfo", { content_type: "product", currency: _currency });
  }

  // Purchase — página thank_you (deduplicado com o servidor)
  if (_ctx.checkout && _ctx.checkout.orderId) {
    var dkey = "atm_purchase_" + _ctx.checkout.orderId;
    if (!sessionStorage.getItem(dkey)) {
      sessionStorage.setItem(dkey, "1");
      var lineItems = _ctx.checkout.lineItems || [];
      sendEvent(
        "Purchase",
        {
          order_id: String(_ctx.checkout.orderId),
          value: _ctx.checkout.totalPrice,
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
