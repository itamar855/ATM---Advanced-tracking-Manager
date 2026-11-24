import type { NextRequest } from "next/server";
import { handleConversionRequest } from "@/lib/conversions/http";
import { parseGenericCheckout } from "@/lib/conversions/adapters/generic-checkout";

/**
 * POST /api/v1/webhook/vega/[store]?token=...
 * Webhook do checkout vega. A tradução do JSON fica no adaptador e o resto no motor único de conversão.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  return handleConversionRequest(request, store, "vega", (payload) => parseGenericCheckout(payload, "vega"));
}
