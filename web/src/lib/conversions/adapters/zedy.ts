/* eslint-disable @typescript-eslint/no-explicit-any -- payloads de terceiros chegam sem formato fixo; cada campo é validado ao ler */
import type { AdapterResult, ConversionKind } from "../types";
import { compact, detectPaymentMethod, firstString, splitName } from "./util";

/** Valor da Zedy: centavos quando vem inteiro grande, ou texto "R$ 1.234,56". */
export function parseZedyValue(payload: any): number {
  let raw: any =
    payload.commission?.totalPriceInCents ||
    payload.totalPriceInCents ||
    payload.priceInCents ||
    payload.value ||
    payload.total ||
    payload.amount ||
    (Array.isArray(payload.products)
      ? payload.products.reduce((acc: number, p: any) => acc + (Number(p.priceInCents) || 0) * (p.quantity || 1), 0)
      : 0);

  if (typeof raw === "string") {
    raw = parseFloat(raw.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
  }
  const n = Number(raw || 0);
  return n > 1000 && Number.isInteger(n) ? n / 100 : n;
}

/**
 * Adaptador do Zedy Checkout. Mantém as regras de classificação da rota antiga.
 */
export function parseZedy(payload: any): AdapterResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, ignored: false, error: "Corpo do webhook inválido." };
  }

  const eventType = String(payload.eventType || payload.event || "").toUpperCase();
  const status = String(payload.status || payload.order_status || "").toLowerCase();
  const eventLower = eventType.toLowerCase();

  const isApproved = eventType === "ORDER_PAID" || status === "approved" || status === "paid";
  const isExplicitPix = eventType.includes("PIX") || status.includes("pix");
  const isPending =
    isExplicitPix ||
    eventType === "ORDER_CREATED" ||
    eventType === "ORDER_PENDING" ||
    ["pending", "waiting_payment", "aguardando_pagamento", "created"].includes(status);

  if (!isApproved && !isPending) {
    return { ok: false, ignored: true, message: `Ignorado (evento ${eventType || status} não é venda ou pendente)` };
  }

  const orderId = firstString(payload.orderId, payload.id);
  if (!orderId) return { ok: false, ignored: false, error: "Identificador do pedido ausente" };

  const paymentRaw = firstString(
    payload.paymentMethod, payload.payment_method, payload.gateway, payload.payment_type, payload.commission?.paymentMethod
  ).toLowerCase();
  const isPix = paymentRaw.includes("pix") || isExplicitPix;
  const isBoleto = paymentRaw.includes("boleto");
  const combined = `${eventLower} ${status}`;
  const isAbandon =
    combined.includes("abandon") ||
    combined.includes("carrinho_abandonado") ||
    combined.includes("checkout_started") ||
    combined.includes("initiate_checkout") ||
    eventLower === "initiatecheckout";

  const hasPixData = Boolean(
    payload.pixQrCode || payload.pix_code || payload.pix_qr_code || payload.pixCode || payload.qr_code ||
    payload.qrcode || payload.qrCode || payload.pix?.code || payload.pix?.qrcode || payload.pix?.qr_code ||
    payload.pix?.qrCode || payload.payment?.pix?.qrcode || payload.payment?.pix?.code ||
    payload.billet_or_pix_url || payload.pix_url || payload.qr_code_url ||
    payload.charges?.[0]?.last_transaction?.qr_code || payload.charges?.[0]?.last_transaction?.pix_code ||
    payload.charges?.[0]?.last_transaction?.pix_qr_code || payload.point_of_interaction?.transaction_data?.qr_code
  );
  const isWaitingPayment =
    ["waiting_payment", "aguardando_pagamento", "pending", "created"].includes(status) || status.includes("pix");
  const isPixPending = !isAbandon && (isExplicitPix || (isPix && (isWaitingPayment || isPending || hasPixData)));
  const hasBoletoData = Boolean(
    payload.boleto_url || payload.boleto_barcode || payload.barcode ||
    payload.boleto?.barcode || payload.boleto?.url || payload.billet_or_pix_url
  );
  const isBoletoPending = isBoleto && !isAbandon && isPending && hasBoletoData;

  let kind: ConversionKind;
  if (isApproved) kind = "purchase";
  else if (isPixPending || isBoletoPending) kind = "payment_pending";
  else kind = "checkout_started";

  const customer = payload.customer || {};
  const address = payload.address || {};
  const tp = payload.trackingParameters || {};
  const checkoutParams = (() => {
    try {
      const url = firstString(payload.checkoutUrl, payload.checkout_url, payload.orderUrl, tp.checkout_url);
      return url ? new URL(url).searchParams : new URLSearchParams();
    } catch {
      return new URLSearchParams();
    }
  })();
  const name = splitName(customer.name);

  return {
    ok: true,
    conversion: {
      kind,
      source: "zedy",
      orderId,
      value: parseZedyValue(payload),
      currency: payload.currency || "BRL",
      paymentMethod: isPixPending && !paymentRaw ? "pix" : detectPaymentMethod(paymentRaw),
      paymentLabel: firstString(
        payload.paymentMethod, payload.payment_method, payload.gateway, payload.payment_type, payload.commission?.paymentMethod
      ) || undefined,
      occurredAt: firstString(payload.approvedDate, payload.createdAt) || undefined,
      customer: compact({
        email: firstString(customer.email),
        phone: firstString(customer.phone),
        firstName: name.firstName,
        lastName: name.lastName,
        externalId: firstString(customer.email),
      }),
      address: compact({
        city: firstString(address.city),
        state: firstString(address.state),
        zip: firstString(address.zipcode, address.zip),
        country: firstString(address.country) || "BR",
      }),
      products: (Array.isArray(payload.products) ? payload.products : []).map((item: any) => ({
        id: String(item.id || item.planId || "PROD"),
        name: item.name || item.planName || "",
        quantity: Number(item.quantity || 1),
        price: Number(item.priceInCents || 0) / 100,
      })),
      tracking: compact({
        track_id: firstString(
          tp.track_id, tp._ztid, payload.track_id, payload._ztid, checkoutParams.get("track_id"), checkoutParams.get("_ztid")
        ),
        utm_source: firstString(tp.utm_source, payload.utm_source),
        utm_medium: firstString(tp.utm_medium, payload.utm_medium),
        utm_campaign: firstString(tp.utm_campaign, payload.utm_campaign),
        utm_content: firstString(tp.utm_content, payload.utm_content),
        utm_term: firstString(tp.utm_term, payload.utm_term),
      }),
      signals: compact({
        fbp: firstString(tp.fbp, tp._fbp, payload.fbp, payload.meta_fbp),
        fbc: firstString(tp.fbc, tp._fbc, payload.fbc, payload.meta_fbc),
        client_ip: firstString(payload.client_ip, payload.ip, tp.client_ip, tp.ip),
        client_user_agent: firstString(payload.client_user_agent, payload.user_agent, tp.client_user_agent, tp.user_agent),
      }),
    },
  };
}