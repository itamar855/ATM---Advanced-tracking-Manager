import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Guardas de acesso das rotas de API.
 *
 * As rotas do painel usam o cliente admin (service_role), que ignora o RLS do banco.
 * Por isso a autorização precisa acontecer aqui: toda rota que recebe um store_id
 * deve confirmar que o usuário logado é dono daquela loja (stores.tenant_id = user.id),
 * exatamente a mesma regra das políticas RLS da tabela stores.
 *
 * Uso:
 *   const access = await requireStoreAccess(storeId);
 *   if (!access.ok) return access.response;
 */

export interface AuthedUser {
  id: string;
  email: string | null;
}

export type GuardResult<T = object> =
  | ({ ok: true; user: AuthedUser } & T)
  | { ok: false; response: NextResponse };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: 400 | 401 | 403, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ ok: false, error }, { status }) };
}

/** Exige uma sessão válida do Supabase (cookie do painel). */
export async function requireUser(): Promise<GuardResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return deny(401, "Não autenticado.");
    return { ok: true, user: { id: user.id, email: user.email ?? null } };
  } catch {
    return deny(401, "Não autenticado.");
  }
}

/**
 * Exige sessão válida e que a loja pertença ao usuário.
 * Responde 403 tanto para loja inexistente quanto para loja de outro dono,
 * para não revelar quais IDs existem.
 */
export async function requireStoreAccess(
  storeId: string | null | undefined
): Promise<GuardResult<{ storeId: string }>> {
  if (!storeId) return deny(400, "store_id obrigatório.");

  const auth = await requireUser();
  if (!auth.ok) return auth;

  if (!UUID_RE.test(storeId)) return deny(403, "Acesso negado a esta loja.");

  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("tenant_id", auth.user.id)
    .maybeSingle();

  if (error || !store) return deny(403, "Acesso negado a esta loja.");
  return { ok: true, user: auth.user, storeId };
}

/** IDs de todas as lojas do usuário (para rotas que não recebem store_id). */
export async function getUserStoreIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("stores").select("id").eq("tenant_id", userId);
  return (data || []).map((s: { id: string }) => s.id);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Chamadas automáticas (cron da Vercel ou agendador externo) se autenticam com
 * "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET configurado, nada passa.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return safeEqual(header, `Bearer ${secret}`);
}

/** Aceita o cron OU um usuário logado. */
export async function requireCronOrUser(request: Request): Promise<GuardResult<{ viaCron: boolean }>> {
  if (isCronRequest(request)) {
    return { ok: true, user: { id: "cron", email: null }, viaCron: true };
  }
  const auth = await requireUser();
  if (!auth.ok) return auth;
  return { ...auth, viaCron: false };
}
