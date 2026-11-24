import type { NextRequest } from "next/server";
import { handleConversionRequest } from "@/lib/conversions/http";
import { parseGenericCheckout } from "@/lib/conversions/adapters/generic-checkout";

/**
 * POST /api/v1/webhook/gateway7/[store]?token=...
 * Webhook do checkout gateway7. A tradução do JSON fica no adaptador e o resto no motor único de conversão.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  return handleConversionRequest(request, store, "gateway7", (payload) => parseGenericCheckout(payload, "gateway7"));
}
