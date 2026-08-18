import { NextRequest, NextResponse } from "next/server";

export interface MercadoPagoPreferenceConfig {
  email: string;
  name: string;
  planName: string;
  price: number;
  tenantId: string;
}

/**
 * POST /api/v1/billing/checkout
 * Gera o link de checkout (preference_id) para assinatura via Mercado Pago
 */
export async function POST(request: NextRequest) {
  try {
    const { email, name, planName, price, tenantId }: MercadoPagoPreferenceConfig = await request.json();

    if (!email || !price || !tenantId) {
      return NextResponse.json({ ok: false, error: "Parâmetros de assinatura ausentes" }, { status: 400 });
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      // Fallback em modo de desenvolvimento se o token não estiver no .env
      const mockCheckoutUrl = `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_pref_${tenantId}`;
      return NextResponse.json({ ok: true, init_point: mockCheckoutUrl });
    }

    // Cria a preferência de checkout no Mercado Pago
    const response = await fetch("https://api.mercadopago.com/v1/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            title: `Assinatura ATM — Plano ${planName}`,
            quantity: 1,
            unit_price: price,
            currency_id: "BRL",
          },
        ],
        payer: {
          name,
          email,
        },
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?status=success`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?status=failed`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?status=pending`,
        },
        auto_return: "approved",
        external_reference: tenantId, // Vincula a transação ao ID do tenant no banco
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/billing/webhook`,
      }),
    });

    const preference = await response.json();

    if (!response.ok) {
      console.error("[Mercado Pago Preference Error]:", preference);
      return NextResponse.json({ ok: false, error: preference.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, init_point: preference.init_point });
  } catch (error: any) {
    console.error("[Mercado Pago Checkout API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
