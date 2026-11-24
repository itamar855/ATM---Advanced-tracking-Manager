import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseAnonKey, getServiceRoleKey } from "./env";


export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorado no SSR se middleware renovar
          }
        },
      },
    }
  );
}

export function createAdminClient() {
  return createSupabaseClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false },
  });
}
