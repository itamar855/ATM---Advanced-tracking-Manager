/**
 * Tipos e constantes universais para Web Push Notifications.
 * Este arquivo é 100% livre de dependências de Node.js / servidor
 * e pode ser importado com segurança em Client Components.
 */

export interface PushSubscriptionItem {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  device_name?: string;
  device_type?: "ios" | "android" | "desktop";
  created_at?: string;
}

export interface NotificationConfig {
  enabled: boolean;
  notify_approved: boolean;
  notify_pending: boolean;
  notify_abandoned: boolean;
  min_value: number;
  sound: "chaching" | "coin" | "safe_coins" | "bell" | "subtle" | "custom" | "default" | "silent";
  custom_sound_url?: string;
  custom_sound_name?: string;
  template_approved_title: string;
  template_approved_body: string;
  template_pending_title: string;
  template_pending_body: string;
  template_abandoned_title: string;
  template_abandoned_body: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  notify_approved: true,
  notify_pending: true,
  notify_abandoned: false,
  min_value: 0,
  sound: "chaching",
  template_approved_title: "💰 Venda Aprovada! ({loja})",
  template_approved_body: "{cliente_nome} comprou {valor} via {metodo_pagamento}",
  template_pending_title: "⏳ Pedido Pendente ({loja})",
  template_pending_body: "Novo {metodo_pagamento} de {valor} gerado para {cliente_nome}",
  template_abandoned_title: "🛒 Checkout Abandonado ({loja})",
  template_abandoned_body: "{cliente_nome} iniciou compra de {valor}",
  quiet_hours_enabled: false,
  quiet_hours_start: "23:00",
  quiet_hours_end: "07:00",
};

/**
 * Substitui variáveis dinâmicas no template
 */
export function formatTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(regex, value || "");
  }
  return result;
}

/**
 * Verifica se o momento atual está dentro do Modo Não Perturbe (Horário de Brasília)
 */
export function isInQuietHours(startTime: string, endTime: string): boolean {
  try {
    const now = new Date();
    // Fuso de Brasília UTC-3
    const utcHours = now.getUTCHours() - 3;
    const brHours = (utcHours + 24) % 24;
    const brMinutes = now.getUTCMinutes();
    const currentMinutes = brHours * 60 + brMinutes;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Cruzando meia-noite (ex: 23:00 às 07:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  } catch {
    return false;
  }
}

export type OrderNotificationType = "approved" | "pending" | "abandoned";

export interface OrderNotificationPayload {
  orderId?: string;
  value: number;
  customerName?: string;
  paymentMethod?: string;
  itemsSummary?: string;
}
