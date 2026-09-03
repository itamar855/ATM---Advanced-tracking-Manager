import { NextRequest, NextResponse } from "next/server";
import { sendStorePushNotification } from "@/lib/notifications/web-push";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/notifications/test
 * Dispara uma notificação de teste imediata com som de venda para todos os aparelhos da loja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, type = "approved" } = body;

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "store_id obrigatório" }, { status: 400 });
    }

    const testOrder = {
      orderId: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      value: 197.90,
      customerName: "Itamar Almeida",
      paymentMethod: "PIX",
      itemsSummary: "1x Produto Teste Premium",
    };

    const result = await sendStorePushNotification(store_id, type, testOrder);

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.message || result.error || "Não foi possível enviar a notificação de teste.",
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Notificação de teste enviada com sucesso para o seu iPhone/aparelho!",
      sent: result.sent,
      total: result.total,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
