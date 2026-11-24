/* eslint-disable @typescript-eslint/no-explicit-any -- payloads de terceiros chegam sem formato fixo; cada campo é validado ao ler */
import type { AdapterResult, ConversionKind } from "../types";
import { compact, detectPaymentMethod, firstString, splitName } from "./util";

/**
 * Adaptador dos checkouts Vega e Gateway7 (mesmo formato de webhook).
 * Mantém as mesmas regras de classificação que existiam nas rotas antigas.
 */
export function parseGenericCheckout(payload: any, source: "vega" | "gateway7"): AdapterResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, ignored: false, error: "Corpo do webhook inválido." };
  }

  const eventType = String(payload.event || payload.eventType || payload.type || "").toLowerCase();
  const status = String(payload.status || payload.order_status || "").toLowerCase();
  const paymentRaw = firstString(payload.payment_method, payload.paymentMethod, payload.gateway, payload.payment_type).toLowerCase();
  const paymentMethod = detectPaymentMethod(paymentRaw);
  const isPix = paymentRaw.includes("pix");
  const isBoleto = paymentRaw.includes("boleto");
  const eventStr = `${eventType} ${status}`;

  const isAbandon =
    eventStr.includes("abandon") ||
    eventStr.includes("carrinho_abandonado") ||
    eventStr.includes("checkout_started") ||
    eventStr.includes("initiate_checkout") ||
    eventType === "initiatecheckout";

  const hasPixData = Boolean(
    payload.pix_code || payload.pix_qr_code || payload.qr_code || payload.qrcode || payload.qrCode ||
    payload.pix?.code || payload.pix?.qrcode || payload.pix?.qr_code ||
    payload.payment?.pix?.qrcode || payload.payment?.pix?.code ||
    payload.billet_or_pix_url || payload.pix_url || payload.qr_code_url ||
    payload.charges?.[0]?.last_transaction?.qr_code || payload.charges?.[0]?.last_transaction?.pix_code
  );
  const isExplicitPixEvent = eventType === "pix_generated" || eventType === "pix_gerado";
  const isWaitingPayment = eventStr.includes("waiting") || eventStr.includes("aguardando") || eventStr.includes("pending");
  const isPixPending = isPix && !isAbandon && (isExplicitPixEvent || (isWaitingPayment && hasPixData));

  const hasBoletoData = Boolean(
    payload.boleto_url || payload.boleto_barcode || payload.barcode ||
    payload.boleto?.barcode || payload.boleto?.url || payload.billet_or_pix_url
  );
  const isBoletoPending = isBoleto && !isAbandon && isWaitingPayment && hasBoletoData;

  const isApproved =
    eventStr.includes("paid") || eventStr.includes("approved") || eventStr.includes("aprovad") ||
    eventStr.includes("pago") || eventStr.includes("purchase") || eventStr.includes("venda_aprovada");

  let kind: ConversionKind;
  if (isApproved) kind = "purchase";
  else if (isPixPending || isBoletoPending) kind = "payment_pending";
  else if (isAbandon || eventStr.includes("pending") || eventType === "order_created") kind = "checkout_started";
  else return { ok: false, ignored: true, message: `Evento [${eventType || status}] ignorado para CAPI` };

  const isTest = Boolean(payload.test_mode || payload.is_test);
  let orderId = firstString(
    payload.order_id, payload.orderId, payload.id, payload.code, payload.cart_id, payload.transaction_id,
    payload.checkout_id, payload.checkout?.id, payload.checkout?.code, payload.data?.id
  );
  if (!orderId && isTest) orderId = `${source.toUpperCase()}_TEST_${Date.now()}`;
  if (!orderId) return { ok: false, ignored: false, error: "Identificador do pedido/carrinho ausente" };

  let value = 0;
  for (const key of ["total_price", "totalPrice", "value", "amount", "total_amount"]) {
    if (payload[key] !== undefined && payload[key] !== null) { value = Number(payload[key]); break; }
  }
  if (!value && payload.totalPriceInCents != null) value = Number(payload.totalPriceInCents) / 100;
  if (!value && payload.total != null) value = Number(payload.total);
  if (!Number.isFinite(value)) value = 0;

  const rawProducts: any[] = payload.items || payload.products || payload.line_items || [];
  const products = (Array.isArray(rawProducts) ? rawProducts : []).map((item: any) => ({
    id: String(item.id || item.product_id || item.variant_id || "PROD"),
    name: item.title || item.name || "Produto",
    quantity: Number(item.quantity || 1),
    price: Number(item.price || item.unit_price || 0),
  }));

  const customer = payload.customer || payload.buyer || payload.client || {};
  const rawAddress =
    payload.address || customer.address || payload.shipping_address || payload.billing_address ||
    payload.shippingAddress || payload.billingAddress || {};
  const name = splitName(customer.name || customer.first_name || payload.name);
  const tp = payload.tracking_params || payload.trackingParameters || payload.metadata || {};

  return {
    ok: true,
    conversion: {
      kind,
      source,
      orderId,
      value,
      currency: payload.currency || "BRL",
      paymentMethod,
      paymentLabel: firstString(payload.payment_method, payload.gateway, payload.payment_type) || undefined,
      occurredAt: firstString(payload.paid_at, payload.approved_at) || undefined,
      isTest,
      customer: compact({
        email: firstString(customer.email, payload.email),
        phone: firstString(customer.phone, customer.cellphone, payload.phone, payload.telephone),
        firstName: name.firstName,
        lastName: name.lastName || firstString(customer.last_name),
        externalId: firstString(customer.email, customer.document, customer.cpf, customer.id),
      }),
      address: compact({
        city: firstString(rawAddress.city, rawAddress.cidade, customer.city, payload.city),
        state: firstString(rawAddress.state, rawAddress.estado, rawAddress.province, customer.state, payload.state),
        zip: firstString(rawAddress.zipcode, rawAddress.zip, rawAddress.cep, customer.zipcode, payload.zipcode).replace(/\D/g, ""),
        country: firstString(rawAddress.country, rawAddress.pais) || "BR",
      }),
      products,
      tracking: compact({
        track_id: firstString(tp.track_id, tp._ztid, payload.track_id),
        utm_source: firstString(tp.utm_source, payload.utm_source),
        utm_medium: firstString(tp.utm_medium, payload.utm_medium),
        utm_campaign: firstString(tp.utm_campaign, payload.utm_campaign),
        utm_content: firstString(tp.utm_content, payload.utm_content),
        utm_term: firstString(tp.utm_term, payload.utm_term),
      }),
      signals: compact({
        fbp: firstString(tp.fbp, tp._fbp, payload.fbp),
        fbc: firstString(tp.fbc, tp._fbc, payload.fbc),
        client_ip: firstString(payload.client_ip, payload.customer_ip, payload.ip),
        client_user_agent: firstString(payload.client_user_agent, payload.user_agent),
      }),
    },
  };
}