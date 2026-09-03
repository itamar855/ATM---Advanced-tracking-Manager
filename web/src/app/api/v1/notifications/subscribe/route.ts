import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid-keys";
import {
  DEFAULT_NOTIFICATION_CONFIG,
  NotificationConfig,
  PushSubscriptionItem,
} from "@/lib/notifications/web-push";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications/subscribe?store_id=xyz
 * Retorna a chave pública VAPID, configurações da loja e lista de aparelhos inscritos.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id") || "dckb5g-7d";

    const supabase = createAdminClient();
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, settings")
      .eq("id", storeId)
      .maybeSingle();

    if (error || !store) {
      return NextResponse.json({ ok: false, error: "Loja não encontrada" }, { status: 404 });
    }

    const settings = store.settings || {};
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...(settings.notifications || {}),
    };

    const subscriptions: PushSubscriptionItem[] = Array.isArray(settings.push_subscriptions)
      ? settings.push_subscriptions
      : [];

    return NextResponse.json({
      ok: true,
      vapid_public_key: VAPID_PUBLIC_KEY,
      config,
      subscriptions_count: subscriptions.length,
      subscriptions: subscriptions.map((s) => ({
        device_name: s.device_name || "Dispositivo",
        device_type: s.device_type || "desconhecido",
        created_at: s.created_at || new Date().toISOString(),
        endpoint_masked: s.endpoint.slice(0, 35) + "...",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/notifications/subscribe
 * Inscreve o aparelho (iPhone / Android / PC) para receber Web Push da loja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, subscription, device_name, device_type } = body;

    if (!store_id || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json(
        { ok: false, error: "store_id e subscription completa são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, settings")
      .eq("id", store_id)
      .maybeSingle();

    if (error || !store) {
      return NextResponse.json({ ok: false, error: "Loja não encontrada" }, { status: 404 });
    }

    const settings = store.settings || {};
    const existingSubs: PushSubscriptionItem[] = Array.isArray(settings.push_subscriptions)
      ? settings.push_subscriptions
      : [];

    // Remove qualquer duplicata existente do mesmo endpoint
    const filteredSubs = existingSubs.filter((s) => s.endpoint !== subscription.endpoint);

    const newSub: PushSubscriptionItem = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      device_name: device_name || "iPhone",
      device_type: device_type || "ios",
      created_at: new Date().toISOString(),
    };

    filteredSubs.push(newSub);

    const { error: updateErr } = await supabase
      .from("stores")
      .update({
        settings: {
          ...settings,
          push_subscriptions: filteredSubs,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", store_id);

    if (updateErr) throw updateErr;

    console.log(
      `[Push Subscribe] Novo aparelho inscrito na loja ${store.name}: ${newSub.device_name} (${newSub.device_type})`
    );

    return NextResponse.json({
      ok: true,
      message: "Aparelho inscrito com sucesso nas notificações da loja!",
      device_name: newSub.device_name,
      total_devices: filteredSubs.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/v1/notifications/subscribe
 * Salva as preferências de personalização de notificações (templates, toggles, sons, etc.).
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, config } = body;

    if (!store_id || !config) {
      return NextResponse.json(
        { ok: false, error: "store_id e config são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, settings")
      .eq("id", store_id)
      .maybeSingle();

    if (error || !store) {
      return NextResponse.json({ ok: false, error: "Loja não encontrada" }, { status: 404 });
    }

    const settings = store.settings || {};
    const updatedConfig: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...(settings.notifications || {}),
      ...config,
    };

    const { error: updateErr } = await supabase
      .from("stores")
      .update({
        settings: {
          ...settings,
          notifications: updatedConfig,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", store_id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      ok: true,
      message: "Configurações de notificação salvas com sucesso!",
      config: updatedConfig,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/notifications/subscribe
 * Remove um aparelho específico das notificações.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, endpoint } = body;

    if (!store_id || !endpoint) {
      return NextResponse.json({ ok: false, error: "store_id e endpoint são obrigatórios" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, settings")
      .eq("id", store_id)
      .maybeSingle();

    if (error || !store) return NextResponse.json({ ok: false, error: "Loja não encontrada" }, { status: 404 });

    const settings = store.settings || {};
    const existingSubs: PushSubscriptionItem[] = Array.isArray(settings.push_subscriptions)
      ? settings.push_subscriptions
      : [];

    const filtered = existingSubs.filter((s) => s.endpoint !== endpoint);

    await supabase
      .from("stores")
      .update({
        settings: {
          ...settings,
          push_subscriptions: filtered,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", store_id);

    return NextResponse.json({ ok: true, message: "Aparelho desconectado com sucesso!" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
