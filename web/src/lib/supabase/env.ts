/**
 * Leitura centralizada das credenciais do Supabase no servidor.
 *
 * Não existe valor reserva: se a variável faltar, a chamada falha com uma
 * mensagem clara em vez de cair silenciosamente numa chave embutida no código.
 * As funções são preguiçosas para não quebrar o build quando o ambiente de
 * build não tem as variáveis.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[ATM] Variável de ambiente ${name} não configurada.`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
