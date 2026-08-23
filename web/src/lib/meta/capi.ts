import { encrypt, decrypt } from "../encryption";

export interface MetaEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url: string;
  action_source: "email" | "website" | "app" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
  user_data: {
    em?: string[];
    ph?: string[];
    fn?: string[];
    ln?: string[];
    ct?: string[];
    st?: string[];
    zp?: string[];
    co?: string[];
    external_id?: string[];
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_type?: string;
    content_ids?: string[];
    contents?: Array<{
      id: string;
      quantity: number;
      item_price?: number;
    }>;
    order_id?: string;
    [key: string]: any;
  };
}

export interface MetaConfig {
  pixelId: string;
  accessToken: string;
  apiVersion?: string;
  testEventCode?: string;
}

/**
 * Dispatcher para envio de eventos à Meta Conversions API (CAPI)
 */
export async function sendMetaCAPIEvent(
  config: MetaConfig,
  event: MetaEvent
): Promise<{ ok: boolean; response?: any; error?: string }> {
  try {
    const apiVersion = config.apiVersion || "v23.0";
    const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(config.pixelId)}/events`;

    const payload = {
      data: [event],
      ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    };

    console.log(
      `[Meta CAPI Request] Enviando ${event.event_name} (${event.event_id})` +
      `${config.testEventCode ? ` com código de teste: ${config.testEventCode}` : ""}`
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // Timeout de 10 segundos
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Meta CAPI Error Response]`, data);
      return {
        ok: false,
        error: data.error?.message || `Meta API respondeu com status ${response.status}`,
        response: data,
      };
    }

    console.log(`[Meta CAPI Success] Eventos recebidos pela Meta: ${data.events_received || 0}`);
    return { ok: true, response: data };
  } catch (error: any) {
    console.error("[Meta CAPI Dispatcher Catch Exception]:", error);
    return {
      ok: false,
      error: error.message || "Erro desconhecido ao despachar evento",
    };
  }
}
