import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/billing/webhook
 * Recebe notificações de transação do Mercado Pago (IPNs)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get("topic") || searchParams.get("type");
    const id = searchParams.get("id") || searchParams.get("data.id");

    if (!id) {
      return new NextResponse("Missing notification ID", { status: 400 });
    }

    console.log(`[Mercado Pago Webhook] Assunto: ${topic} | ID: ${id}`);

    // Filtra e escuta apenas tópicos de pagamento/assinatura
    if (topic === "payment" || topic === "subscription_authorized") {
      
      // 1. Busca os detalhes da transação na API do Mercado Pago
      // GET https://api.mercadopago.com/v1/payments/{id} com Bearer token
      
      // 2. Valida o status do pagamento (approved, rejected, pending)
      
      // 3. Atualiza o status do plano (plan, status) na tabela `tenants` do Supabase
      // correspondente ao e-mail ou external_reference do comprador
      
      console.log(`[Mercado Pago] Pagamento/Assinatura #${id} recebido para processamento.`);
      
      return NextResponse.json({ ok: true, message: "Webhook processado" }, { status: 200 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Mercado Pago Webhook Error]:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
