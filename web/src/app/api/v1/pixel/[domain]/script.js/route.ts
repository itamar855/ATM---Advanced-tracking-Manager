import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateATMScript, generateNoopScript } from "@/lib/tracking/pixel-script";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{0,252}$/;

/**
 * Descobre a loja do script:
 *  1. ?store=<uuid> (instalação em página própria: o trecho já leva o ID);
 *  2. domínio exato em shop_domain ou custom_domains (com e sem www);
 *  3. compatibilidade com instalações antigas: parte do domínio, só se casar com UMA loja.
 */
async function resolveStoreId(domainParam: string, storeParam: string | null): Promise<string | null> {
  const supabase = createAdminClient();

  if (storeParam && UUID_RE.test(storeParam)) {
    const { data } = await supabase.from("stores").select("id").eq("id", storeParam).maybeSingle();
    return data?.id || null;
  }

  const domain = decodeURIComponent(domainParam || "").trim().toLowerCase().replace(/^www\./, "");
  if (!DOMAIN_RE.test(domain)) return null;

  for (const d of [domain, `www.${domain}`]) {
    const { data } = await supabase.from("stores").select("id").eq("shop_domain", d).limit(1).maybeSingle();
    if (data?.id) return data.id;
    const { data: custom } = await supabase.from("stores").select("id").contains("custom_domains", [d]).limit(1).maybeSingle();
    if (custom?.id) return custom.id;
  }

  const label = domain.split(".")[0];
  if (label.length >= 4) {
    const { data: candidates } = await supabase.from("stores").select("id").ilike("shop_domain", `%${label}%`).limit(2);
    if (candidates && candidates.length === 1) return candidates[0].id;
  }
  return null;
}

/**
 * GET /api/v1/pixel/[domain]/script.js[?store=<uuid>]
 * Script do pixel ATM. Para página própria, use o trecho da tela de Integrações (já vem com ?store=).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://atmtracking.vercel.app";
  const apiBase = `${appUrl.replace(/\/$/, "")}/api/v1`;

  let storeId: string | null = null;
  try {
    storeId = await resolveStoreId(domain, request.nextUrl.searchParams.get("store"));
  } catch (e) {
    console.warn("[Pixel Script] Falha ao identificar a loja:", (e as Error).message);
  }

  const body = storeId
    ? generateATMScript(storeId, apiBase)
    : generateNoopScript("Loja não encontrada para este script. Copie o trecho de instalação em ATM → Integrações.");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
