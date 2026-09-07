import { NextRequest, NextResponse } from "next/server";
import { recoverOrderAttribution, batchRecoverUntrackedOrders } from "@/lib/tracking/attribution-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/attribution/recover
 * Executa o motor forense de recuperação de atribuição para uma venda específica ou em lote
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = body.store_id || request.nextUrl.searchParams.get("store_id") || "dckb5g-7d";
    const mode = body.mode || request.nextUrl.searchParams.get("mode") || "single";

    if (mode === "batch") {
      const clickWindow = Number(body.click_window_days || 7);
      const batchResult = await batchRecoverUntrackedOrders(storeId, { clickWindowDays: clickWindow });
      return NextResponse.json({
        ok: true,
        store_id: storeId,
        mode: "batch",
        ...batchResult,
      });
    }

    const orderId = body.order_id || request.nextUrl.searchParams.get("order_id");
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "order_id é obrigatório para modo single" }, { status: 400 });
    }

    const recoveryResult = await recoverOrderAttribution(
      storeId,
      {
        orderId: String(orderId),
        customerEmail: body.customer_email || body.email,
        customerPhone: body.customer_phone || body.phone,
        externalId: body.external_id,
        trackId: body.track_id,
        fbp: body.fbp,
        fbc: body.fbc,
        orderCreatedAt: body.order_created_at,
        existingCampaign: body.existing_campaign,
        existingSource: body.existing_source,
      },
      {
        clickWindowDays: Number(body.click_window_days || 7),
        viewWindowDays: Number(body.view_window_days || 1),
      }
    );

    return NextResponse.json({
      ok: true,
      store_id: storeId,
      result: recoveryResult,
    });
  } catch (err: any) {
    console.error("[Attribution Recover API Error]:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
