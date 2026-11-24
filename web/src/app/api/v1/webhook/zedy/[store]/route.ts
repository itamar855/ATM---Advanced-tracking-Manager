import type { NextRequest } from "next/server";
import { handleConversionRequest } from "@/lib/conversions/http";
import { parseZedy } from "@/lib/conversions/adapters/zedy";

/**
 * POST /api/v1/webhook/zedy/[store]?token=...
 * Webhook do Zedy Checkout. A tradução do JSON fica no adaptador e o resto no motor único de conversão.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  return handleConversionRequest(request, store, "zedy", parseZedy);
}
