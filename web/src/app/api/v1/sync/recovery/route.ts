import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/sync/recovery
 * 
 * Reativa eventos de um determinado período para serem enviados novamente à Meta CAPI.
 * Utiliza o mesmo event_id original para garantir a deduplicação na Meta.
 * 
 * Body esperado:
 * {
 *   "startDate": "2026-08-28T00:00:00.000Z",
 *   "endDate": "2026-08-28T23:59:59.999Z",
 *   "eventNames": ["Purchase", "InitiateCheckout"]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, eventNames } = body as {
      startDate?: string;
      endDate?: string;
      eventNames?: string[];
    };

    if (!startDate) {
      return NextResponse.json({ ok: false, error: "A data de início (startDate) é obrigatória." }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Por padrão, resgatamos apenas compras se nada for especificado
    const eventsToRescue = eventNames && eventNames.length > 0 ? eventNames : ["Purchase"];

    const supabase = createAdminClient();

    // Atualiza todos os eventos que coincidem com os critérios, setando-os de volta para pending e zerando a contagem
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("events")
      .update({ 
        status: "pending", 
        attempt_count: 0 
      })
      .in("event_name", eventsToRescue)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .select("id");

    if (fallbackError) {
      throw new Error("Falha ao atualizar eventos no banco: " + fallbackError.message);
    }

    // Chama o queue-engine assincronamente para começar a disparar imediatamente (fire and forget)
    fetch(`${request.nextUrl.origin}/api/v1/events/queue`, { method: "POST" }).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `${fallbackData?.length || 0} eventos encontrados e reenfileirados para resgate com sucesso.`,
      recovered_count: fallbackData?.length || 0,
    });
  } catch (error: any) {
    console.error("[Conversion Recovery Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
