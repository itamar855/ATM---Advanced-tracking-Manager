/* eslint-disable @typescript-eslint/no-explicit-any -- payloads de terceiros chegam sem formato fixo; cada campo é validado ao ler */
import { NextResponse } from "next/server";
import { isValidWebhookToken } from "@/lib/webhook-auth";
import { processConversion } from "./engine";
import type { AdapterResult } from "./types";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Fluxo HTTP comum a todas as portas de entrada de conversão:
 * token da loja → JSON → adaptador → motor → resposta.
 */
export async function handleConversionRequest(
  request: Request,
  storeId: string,
  label: string,
  parse: (payload: any) => AdapterResult
): Promise<NextResponse> {
  if (!isValidWebhookToken(request, storeId)) {
    console.warn(`[Conversions ${label}] Token ausente ou inválido (store=${storeId}).`);
    return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });
  }

  let payload: any;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Corpo grande demais." }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const parsed = parse(payload);
  if (!parsed.ok) {
    if (parsed.ignored) return NextResponse.json({ ok: true, ignored: true, message: parsed.message });
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const result = await processConversion(storeId, parsed.conversion, { requestHeaders: request.headers });
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  } catch (err) {
    console.error(`[Conversions ${label}] Erro ao processar:`, err);
    return NextResponse.json({ ok: false, error: "Erro interno ao processar a conversão." }, { status: 500 });
  }
}