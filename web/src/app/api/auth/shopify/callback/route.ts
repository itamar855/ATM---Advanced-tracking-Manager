import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";
import { verifyOAuthState } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop")?.trim();
  const code = searchParams.get("code")?.trim();
  const state = searchParams.get("state")?.trim();

  if (!shop || !code || !state) {
    return renderErrorHtml(
      "Parâmetros ausentes",
      "A requisição da Shopify não continha todos os dados obrigatórios (shop, code ou state)."
    );
  }

  // 1. Valida o state assinado com HMAC (não depende de cookies locais!)
  const stateCheck = verifyOAuthState(state);
  if (!stateCheck.valid) {
    return renderErrorHtml(
      "Falha de Validação de Segurança",
      stateCheck.error || "A assinatura de segurança do link expirou ou é inválida. Gere um novo link no painel."
    );
  }

  const storeId = stateCheck.storeId;
  const stateClientId = stateCheck.clientId;

  const supabase = await createClient();

  // 2. Busca a loja no Supabase
  let store: any = null;
  if (storeId && storeId !== "default") {
    const { data } = await supabase.from("stores").select("*").eq("id", storeId).maybeSingle();
    store = data;
  }

  if (!store) {
    const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    const { data } = await supabase
      .from("stores")
      .select("*")
      .or(`shop_domain.ilike.%${cleanShop}%,domain.ilike.%${cleanShop}%`)
      .limit(1)
      .maybeSingle();
    store = data;
  }

  if (!store) {
    // Fallback para a loja padrão de produção
    const { data } = await supabase.from("stores").select("*").limit(1).maybeSingle();
    store = data;
  }

  if (!store) {
    return renderErrorHtml("Loja não encontrada", "Não foi possível localizar a loja correspondente no banco do ATM.");
  }

  // 3. Obtém client_id e client_secret
  const clientId =
    stateClientId ||
    store.settings?.shopify?.client_id ||
    process.env.SHOPIFY_API_KEY ||
    process.env.SHOPIFY_CLIENT_ID ||
    "58504954bae6d390c53081c82eaf76b1";

  let clientSecret = "";
  if (store.settings?.shopify?.client_secret_enc) {
    try {
      clientSecret = decrypt(store.settings.shopify.client_secret_enc);
    } catch {
      // ignore
    }
  }

  // Fallback para o clientSecret mestre gravado no Supabase
  if (!clientSecret) {
    try {
      const { data: masterStore } = await supabase
        .from("stores")
        .select("settings")
        .eq("id", "dckb5g-7d")
        .maybeSingle();
      if (masterStore?.settings?.shopify?.client_secret_enc) {
        clientSecret = decrypt(masterStore.settings.shopify.client_secret_enc);
      }
    } catch {
      // ignore
    }
  }

  if (!clientSecret) {
    clientSecret =
      process.env.SHOPIFY_API_SECRET ||
      process.env.SHOPIFY_CLIENT_SECRET ||
      "";
  }

  if (!clientId || !clientSecret) {
    return renderErrorHtml(
      "Credenciais do App Incompletas",
      "Não foi possível localizar o Client ID ou Client Secret do App ATM para realizar a troca do token."
    );
  }

  const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  // 4. Realiza o POST oficial da Shopify para trocar o code pelo token permanente
  try {
    const tokenRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("[Shopify OAuth Exchange Error]:", tokenRes.status, errorText);
      return renderErrorHtml(
        "Erro na Troca de Token da Shopify",
        `A Shopify retornou status ${tokenRes.status}: ${errorText}. Verifique se o código não expirou e se o Client ID e Secret estão corretos.`
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope || "";

    if (!accessToken) {
      return renderErrorHtml(
        "Token Não Retornado",
        "A Shopify aprovou a requisição mas não enviou o access_token de resposta."
      );
    }

    // 5. Criptografa o token com AES-256-GCM e salva no Supabase
    const encryptedToken = encrypt(accessToken);
    const encryptedSecret = encrypt(clientSecret);

    const currentSettings = store.settings || {};
    const updatedSettings = {
      ...currentSettings,
      shopify: {
        ...(currentSettings.shopify || {}),
        connected: true,
        access_token_enc: encryptedToken,
        client_id: clientId,
        client_secret_enc: encryptedSecret,
        scope,
        shop_domain: cleanShop,
        connected_at: new Date().toISOString(),
        token_prefix: accessToken.slice(0, 10) + "...",
      },
    };

    await supabase
      .from("stores")
      .update({
        settings: updatedSettings,
        shop_domain: cleanShop,
      })
      .eq("id", store.id);

    console.log(`[Shopify OAuth Success] Loja ${store.id} (${cleanShop}) conectada com sucesso! Token gerado.`);

    // 6. Dispara sincronização em segundo plano
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "trackingatm.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const syncUrl = `${protocol}://${host}/api/v1/sync/shopify`;

    try {
      fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: store.id }),
      }).catch((e) => console.warn("[Shopify Auto-Sync trigger failed]:", e.message));
    } catch {
      // non-blocking
    }

    // 7. Renderiza tela moderna de sucesso
    return renderSuccessHtml({
      shop: cleanShop,
      storeName: store.name || "Atacadão das Gaiolas",
      dashboardUrl: "/dashboard",
      integrationsUrl: "/dashboard/settings/integrations?shopify_connected=true",
    });

  } catch (err: any) {
    console.error("[Shopify Callback Fatal]:", err);
    return renderErrorHtml("Erro Interno no Servidor", err.message || "Erro desconhecido");
  }
}

function renderSuccessHtml(data: {
  shop: string;
  storeName: string;
  dashboardUrl: string;
  integrationsUrl: string;
}) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATM Tracking — Conexão Shopify Concluída</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #07090E; color: #E4E4E7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #0F131C; border: 1px solid #1F2433; border-radius: 24px; max-width: 520px; width: 100%; padding: 40px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .icon { width: 72px; height: 72px; border-radius: 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10B981; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 12px; letter-spacing: -0.02em; }
    p { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: #181E2C; border: 1px solid #273045; padding: 8px 16px; border-radius: 100px; font-size: 13px; color: #60A5FA; font-weight: 600; margin-bottom: 28px; font-family: monospace; }
    .btn-group { display: flex; flex-direction: column; gap: 12px; }
    .btn-primary { background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 700; font-size: 14px; transition: all 0.2s; display: block; }
    .btn-primary:hover { background: #1D4ED8; transform: translateY(-1px); }
    .btn-secondary { background: transparent; color: #9CA3AF; text-decoration: none; padding: 12px 24px; border-radius: 14px; font-weight: 600; font-size: 13px; border: 1px solid #273045; display: block; }
    .btn-secondary:hover { color: #FFFFFF; background: #181E2C; }
    .info { font-size: 12px; color: #6B7280; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Shopify Conectada com Sucesso!</h1>
    <p>O token de acesso permanente da API Admin foi gerado, criptografado com segurança e vinculado à sua loja.</p>
    
    <div class="badge">
      <span>🏬</span> ${data.storeName} (${data.shop})
    </div>

    <div class="btn-group">
      <a href="${data.integrationsUrl}" target="_top" class="btn-primary">Ver Configurações de Integração</a>
      <a href="${data.dashboardUrl}" target="_top" class="btn-secondary">Ir para a Dashboard de Lucro</a>
    </div>

    <p class="info">Se você abriu esta janela em outro navegador ou aba, já pode fechá-la com segurança.</p>
  </div>
  <script>
    try {
      if (window.top !== window.self) {
        setTimeout(function() {
          window.top.location.href = ${JSON.stringify(data.integrationsUrl)};
        }, 1200);
      }
    } catch (e) {}
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderErrorHtml(title: string, message: string) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATM Tracking — Erro na Conexão Shopify</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #07090E; color: #E4E4E7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #0F131C; border: 1px solid #331F24; border-radius: 24px; max-width: 520px; width: 100%; padding: 40px; text-align: center; }
    .icon { width: 72px; height: 72px; border-radius: 20px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #EF4444; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 800; color: #FFFFFF; margin-bottom: 12px; }
    p { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
    .btn { background: #273045; color: #FFFFFF; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 700; font-size: 14px; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/dashboard/settings/integrations" class="btn">Voltar para Integrações</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
