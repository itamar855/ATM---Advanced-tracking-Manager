import type { NextRequest } from "next/server";
import { handleConversionRequest } from "@/lib/conversions/http";
import { parseAtmApi } from "@/lib/conversions/adapters/atm-api";

/**
 * POST /api/v1/conversions/[store]
 *
 * API universal de conversões do ATM. Qualquer sistema (API de PIX própria, web app com
 * assinatura, outro checkout) manda daqui, do servidor, os eventos de venda e de funil.
 *
 * Autenticação: token da loja em `Authorization: Bearer <token>` (ou x-atm-webhook-token / ?token=).
 * O formato do corpo está documentado em lib/conversions/adapters/atm-api.ts e em docs/API_CONVERSOES.md.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  return handleConversionRequest(request, store, "api", parseAtmApi);
}
