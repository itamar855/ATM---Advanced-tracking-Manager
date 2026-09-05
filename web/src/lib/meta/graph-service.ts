import { MetaAdAccount, MetaBusinessManager, MetaProfile } from "./types";

const GRAPH_API_VERSION = "v23.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Normaliza o ID de uma conta de anúncio garantindo o prefixo "act_"
 */
export function normalizeAdAccountId(id: string): string {
  const clean = id.trim();
  return clean.startsWith("act_") ? clean : `act_${clean}`;
}

/**
 * Consulta perfil básico do usuário (ID, Nome, Email)
 */
export async function fetchUserProfile(accessToken: string): Promise<{ id: string; name: string; email?: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE_URL}/me?fields=id,name,email&access_token=${accessToken}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return {
        id: data.id || "me",
        name: data.name || "Perfil Facebook",
        email: data.email || undefined,
      };
    }
  } catch (err) {
    console.warn("[Meta GraphService] Erro ao consultar /me:", err);
  }
  return { id: "me", name: "Perfil Facebook" };
}

/**
 * Consulta permissões concedidas ao token (/me/permissions)
 */
export async function fetchTokenPermissions(accessToken: string): Promise<string[]> {
  const permissions: string[] = [];
  try {
    const res = await fetch(`${GRAPH_BASE_URL}/me/permissions?access_token=${accessToken}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        data.data.forEach((p: any) => {
          if (p.status === "granted" && p.permission) {
            permissions.push(p.permission);
          }
        });
      }
    }
  } catch (err) {
    console.warn("[Meta GraphService] Erro ao consultar /me/permissions:", err);
  }
  return permissions;
}

/**
 * Normaliza um objeto bruto retornado pela Meta para MetaAdAccount
 */
function parseRawAccount(raw: any, defaultBmId?: string, defaultBmName?: string): MetaAdAccount | null {
  if (!raw || (!raw.id && !raw.account_id)) return null;

  const cleanId = normalizeAdAccountId(raw.id || raw.account_id);
  const accountId = raw.account_id || cleanId.replace("act_", "");
  const name = raw.name || `Conta ${accountId}`;
  const currency = String(raw.currency || "BRL").toUpperCase();
  const rawSpend = Number(raw.amount_spent || raw.spend || 0);
  const amountSpent = raw.amount_spent ? rawSpend / 100 : rawSpend;

  let status: MetaAdAccount["status"] = "ACTIVE";
  if (raw.account_status === 2) status = "DISABLED";
  else if (raw.account_status === 3) status = "PAUSED";
  else if (raw.account_status !== 1 && raw.account_status !== undefined) status = "PENDING";

  const businessName = defaultBmName || raw.business_name || null;
  const businessId = defaultBmId || (businessName ? `bm_${businessName.toLowerCase().replace(/[^a-z0-9]/g, "_")}` : null);
  const timezone_name = raw.timezone_name || null;
  const timezone_offset_hours_utc = raw.timezone_offset_hours_utc !== undefined ? Number(raw.timezone_offset_hours_utc) : null;

  return {
    id: cleanId,
    accountId,
    name,
    status,
    currency,
    amountSpent,
    businessId,
    businessName,
    timezone_name,
    timezone_offset_hours_utc,
  };
}

/**
 * Descoberta exaustiva e inteligente de toda a árvore de Business Managers e Contas de Anúncio
 */
export async function discoverFullMetaHierarchy(
  accessToken: string,
  preferredProfileName?: string
): Promise<MetaProfile> {
  const user = await fetchUserProfile(accessToken);
  const profileName = preferredProfileName || user.name || "Perfil Facebook";

  const allAccountsMap = new Map<string, MetaAdAccount>();
  const bmMap = new Map<string, { id: string; name: string; accounts: MetaAdAccount[] }>();

  const registerAccount = (acc: MetaAdAccount, bmId?: string, bmName?: string) => {
    if (!acc || !acc.id) return;

    // Registra no mapa global
    allAccountsMap.set(acc.id, acc);

    // Determina BM
    const targetBmName = bmName || acc.businessName || "Contas Pessoais / Outras";
    const targetBmId = bmId || (acc.businessName ? `bm_${acc.businessName.toLowerCase().replace(/[^a-z0-9]/g, "_")}` : "bm_personal");

    if (!bmMap.has(targetBmId)) {
      bmMap.set(targetBmId, {
        id: targetBmId,
        name: targetBmName,
        accounts: [],
      });
    }

    const bm = bmMap.get(targetBmId)!;
    if (!bm.accounts.some((a) => a.id === acc.id)) {
      bm.accounts.push(acc);
    }
  };

  // 1. Consulta /me/adaccounts (Usa campos seguros e universais)
  try {
    const accUrl = `${GRAPH_BASE_URL}/me/adaccounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name,timezone_name,timezone_offset_hours_utc&access_token=${accessToken}&limit=100`;
    const accRes = await fetch(accUrl, { cache: "no-store" });
    if (accRes.ok) {
      const accData = await accRes.json();
      if (Array.isArray(accData.data)) {
        accData.data.forEach((raw: any) => {
          const parsed = parseRawAccount(raw);
          if (parsed) registerAccount(parsed, undefined, raw.business_name || undefined);
        });
      }
    }
  } catch (err) {
    console.warn("[Meta GraphService] Erro ao consultar /me/adaccounts:", err);
  }

  // 2. Consulta /me/businesses (Descobre BMs formais às quais o token tem acesso)
  try {
    const bmsUrl = `${GRAPH_BASE_URL}/me/businesses?fields=id,name&access_token=${accessToken}&limit=50`;
    const bmsRes = await fetch(bmsUrl, { cache: "no-store" });
    if (bmsRes.ok) {
      const bmsData = await bmsRes.json();
      if (Array.isArray(bmsData.data)) {
        for (const rawBm of bmsData.data) {
          const bmId = String(rawBm.id);
          const bmName = rawBm.name || `Business Manager ${bmId}`;

          // Para cada BM, busca owned_ad_accounts e client_ad_accounts
          try {
            const [ownedRes, clientRes] = await Promise.all([
              fetch(`${GRAPH_BASE_URL}/${bmId}/owned_ad_accounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name,timezone_name,timezone_offset_hours_utc&access_token=${accessToken}&limit=100`, { cache: "no-store" }),
              fetch(`${GRAPH_BASE_URL}/${bmId}/client_ad_accounts?fields=id,account_id,name,account_status,currency,amount_spent,business_name,timezone_name,timezone_offset_hours_utc&access_token=${accessToken}&limit=100`, { cache: "no-store" }),
            ]);

            if (ownedRes.ok) {
              const owned = await ownedRes.json();
              if (Array.isArray(owned.data)) {
                owned.data.forEach((raw: any) => {
                  const parsed = parseRawAccount(raw, bmId, bmName);
                  if (parsed) registerAccount(parsed, bmId, bmName);
                });
              }
            }

            if (clientRes.ok) {
              const client = await clientRes.json();
              if (Array.isArray(client.data)) {
                client.data.forEach((raw: any) => {
                  const parsed = parseRawAccount(raw, bmId, bmName);
                  if (parsed) registerAccount(parsed, bmId, bmName);
                });
              }
            }
          } catch (bmErr) {
            console.warn(`[Meta GraphService] Erro ao buscar contas da BM ${bmId}:`, bmErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Meta GraphService] Erro ao consultar /me/businesses:", err);
  }

  // 3. Monta a lista final de Business Managers
  let businesses: MetaBusinessManager[] = Array.from(bmMap.values());

  // Se houver contas descobertas mas nenhum BM formal, cria o BM Principal
  if (businesses.length === 0 && allAccountsMap.size > 0) {
    businesses = [
      {
        id: "bm_main",
        name: "Business Manager Principal",
        accounts: Array.from(allAccountsMap.values()),
      },
    ];
  }

  return {
    id: user.id,
    name: profileName,
    email: user.email,
    businesses,
    totalAccountsCount: allAccountsMap.size,
  };
}
