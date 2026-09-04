import webPush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "./vapid-keys";
import {
  NotificationConfig,
  DEFAULT_NOTIFICATION_CONFIG,
  PushSubscriptionItem,
  OrderNotificationType,
  OrderNotificationPayload,
  formatTemplate,
  isInQuietHours,
} from "./types";

export * from "./types";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * Dispara notificação push para todos os aparelhos conectados da loja
 */
export async function sendStorePushNotification(
  storeId: string,
  type: OrderNotificationType,
  data: OrderNotificationPayload
) {
  try {
    const supabase = createAdminClient();
    // Busca resiliente da loja: por ID ou por shop_domain
    let { data: store } = await supabase
      .from("stores")
      .select("id, name, settings, shop_domain")
      .eq("id", storeId)
      .maybeSingle();

    if (!store) {
      const cleanDomain = storeId.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const { data: storeByDomain } = await supabase
        .from("stores")
        .select("id, name, settings, shop_domain")
        .ilike("shop_domain", `%${cleanDomain}%`)
        .maybeSingle();
      store = storeByDomain;
    }

    if (!store) {
      console.warn(`[Web Push] Loja não encontrada para identificador: "${storeId}"`);
      return { ok: false, error: "Loja não encontrada" };
    }

    const settings = store.settings || {};
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...(settings.notifications || {}),
    };

    if (!config.enabled) return { ok: false, message: "Notificações desativadas para esta loja" };

    // Filtro por tipo de evento
    if (type === "approved" && !config.notify_approved) return { ok: false, message: "Alertas de venda desativados" };
    if (type === "pending" && !config.notify_pending) return { ok: false, message: "Alertas de pendente desativados" };
    if (type === "abandoned" && !config.notify_abandoned) return { ok: false, message: "Alertas de abandono desativados" };

    // Filtro por valor mínimo
    if (config.min_value > 0 && data.value < config.min_value) {
      return { ok: false, message: `Valor R$ ${data.value} inferior ao mínimo de R$ ${config.min_value}` };
    }

    // Filtro Não Perturbe
    if (config.quiet_hours_enabled && isInQuietHours(config.quiet_hours_start, config.quiet_hours_end)) {
      return { ok: false, message: "Horário silencioso ativo (Não Perturbe)" };
    }

    const subscriptions: PushSubscriptionItem[] = Array.isArray(settings.push_subscriptions)
      ? settings.push_subscriptions
      : [];

    if (subscriptions.length === 0) {
      return { ok: false, message: "Nenhum dispositivo cadastrado para receber notificações" };
    }

    // Monta as variáveis dinâmicas
    const formattedValue = `R$ ${data.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const firstName = (data.customerName || "Cliente").trim().split(" ")[0];
    const variables = {
      valor: formattedValue,
      cliente_nome: data.customerName || "Cliente",
      cliente_primeiro_nome: firstName,
      metodo_pagamento: (data.paymentMethod || "PIX").toUpperCase(),
      loja: store.name || "ATM PRO",
      pedido_id: data.orderId ? `#${data.orderId.replace(/\D/g, "").slice(-4) || data.orderId.slice(-4)}` : "#1001",
      produtos: data.itemsSummary || "Produto",
    };

    let titleTemplate = config.template_approved_title;
    let bodyTemplate = config.template_approved_body;

    if (type === "pending") {
      titleTemplate = config.template_pending_title;
      bodyTemplate = config.template_pending_body;
    } else if (type === "abandoned") {
      titleTemplate = config.template_abandoned_title;
      bodyTemplate = config.template_abandoned_body;
    }

    const title = formatTemplate(titleTemplate, variables);
    const body = formatTemplate(bodyTemplate, variables);

    const isSilent = config.sound === "silent";
    let soundUrl: string | null = null;
    if (!isSilent) {
      if (config.sound === "custom") {
        soundUrl = `/api/v1/notifications/sound?store_id=${storeId}`;
      } else if (config.sound === "safe_coins" || config.sound === "coin") {
        soundUrl = "/sounds/safe-coins.wav";
      } else if (config.sound === "bell" || config.sound === "subtle") {
        soundUrl = "/sounds/bell.wav";
      } else {
        soundUrl = "/sounds/chaching.wav";
      }
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/favicon-32x32.png",
      sound: soundUrl,
      silent: isSilent,
      data: {
        url: "/dashboard/orders",
        orderId: data.orderId,
        storeId,
        timestamp: Date.now(),
        sound: soundUrl,
      },
    });

    const deadSubscriptions: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload,
            {
              TTL: 86400, // 24 horas de retenção
              urgency: "high",
              headers: {
                "apns-push-type": "alert",
                "apns-priority": "10",
                "apns-expiration": "0",
              },
            }
          );
        } catch (err: any) {
          // Status 410 (Gone) ou 404 significa que o usuário desinstalou ou revogou a permissão
          if (err.statusCode === 410 || err.statusCode === 404) {
            deadSubscriptions.push(sub.endpoint);
          }
          throw err;
        }
      })
    );

    // Limpa tokens mortos da base para manter a loja limpa
    if (deadSubscriptions.length > 0) {
      const activeSubs = subscriptions.filter((s) => !deadSubscriptions.includes(s.endpoint));
      await supabase
        .from("stores")
        .update({
          settings: {
            ...settings,
            push_subscriptions: activeSubs,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", storeId);
    }

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(
      `[Web Push] Disparado para loja ${store.name} | Sucesso: ${succeeded}/${subscriptions.length} | Tipo: ${type}`
    );

    if (subscriptions.length > 0 && succeeded === 0) {
      const firstError: any = results.find((r) => r.status === "rejected");
      const errMsg = firstError?.reason?.message || "Falha ao entregar push para os aparelhos inscritos.";
      return { ok: false, error: errMsg, sent: 0, total: subscriptions.length };
    }

    return { ok: true, sent: succeeded, total: subscriptions.length };
  } catch (err: any) {
    console.error("[Web Push Error]:", err.message);
    return { ok: false, error: err.message };
  }
}
