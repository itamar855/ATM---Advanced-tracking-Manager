/**
 * ATM — Shared TypeScript Types
 *
 * Core type definitions used across the entire platform.
 */

// ========================================
// Multi-tenancy
// ========================================

export interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: "free" | "starter" | "pro" | "enterprise";
  status: "active" | "suspended" | "cancelled";
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  tenant_id: string;
  platform: "shopify" | "woocommerce" | "yampi" | "cartpanda";
  shop_domain: string;
  custom_domains: string[];
  checkout_domain: string | null;
  status: "pending" | "active" | "paused" | "error" | "uninstalled";
  installed_at: string | null;
  created_at: string;
}

export interface Integration {
  id: string;
  store_id: string;
  platform: "meta" | "google" | "tiktok" | "pinterest";
  pixel_id: string;
  api_version: string;
  status: "active" | "paused" | "error" | "expired";
  config: Record<string, unknown>;
  last_health_check: string | null;
  created_at: string;
}

// ========================================
// Tracking & Attribution
// ========================================

export interface Session {
  id: string;
  store_id: string;
  track_id: string;
  fbp: string | null;
  fbc: string | null;
  fbclid: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
  landing_page: string | null;
  event_source_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  enrichment_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  order_id: string;
  session_id: string | null;
  track_id: string | null;
  value: number | null;
  currency: string;
  products: OrderProduct[];
  address: OrderAddress;
  payment_method: string | null;
  status: "created" | "pix_pending" | "paid" | "refunded" | "cancelled";
  order_created_at: string | null;
  order_paid_at: string | null;
  created_at: string;
}

export interface OrderProduct {
  id: string;
  name?: string;
  quantity: number;
  price: number;
  variant_id?: string;
}

export interface OrderAddress {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// ========================================
// Events
// ========================================

export interface TrackingEvent {
  id: string;
  store_id: string;
  integration_id: string | null;
  order_id: string | null;
  event_name: string;
  event_id: string;
  source: "server" | "browser";
  status:
    | "pending"
    | "processing"
    | "sent"
    | "accepted"
    | "rejected"
    | "deduped"
    | "failed";
  payload_hash: string | null;
  user_data_keys: string[];
  health_score: number | null;
  meta_response: Record<string, unknown> | null;
  latency_ms: number | null;
  attempt_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface EventAttempt {
  id: string;
  event_id: string;
  attempt: number;
  status_code: number | null;
  response: Record<string, unknown> | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

// ========================================
// Diagnostics
// ========================================

export interface Diagnostic {
  id: string;
  store_id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  entity_type: "event" | "session" | "integration" | "store" | "order" | null;
  entity_id: string | null;
  title: string;
  description: string | null;
  evidence: Record<string, unknown>;
  state: "open" | "acknowledged" | "resolved" | "dismissed";
  resolved_at: string | null;
  created_at: string;
}

// ========================================
// Campaign Costs & P&L
// ========================================

export interface CampaignCost {
  id: string;
  store_id: string;
  integration_id: string | null;
  date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  currency: string;
  synced_at: string;
}

export interface ProductCost {
  id: string;
  store_id: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  cost_price: number | null;
  currency: string;
  updated_at: string;
}

// ========================================
// P&L Computed Types
// ========================================

export interface CampaignPL {
  campaign_id: string;
  campaign_name: string;
  status: "active" | "paused" | "error";
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  cpa: number;
  margin: number;
  health_score_avg: number;
}

export interface DashboardMetrics {
  total_revenue: number;
  total_spend: number;
  total_profit: number;
  total_orders: number;
  roas: number;
  cpa: number;
  margin: number;
  events_sent: number;
  avg_health_score: number;
  revenue_change: number;
  spend_change: number;
  profit_change: number;
  orders_change: number;
  daily_chart_data?: Array<{
    date: string;
    revenue: number;
    spend: number;
    profit: number;
  }>;
  health_signals?: {
    fbp_fbc: number;
    ip_ua: number;
    email_phone: number;
    external_id: number;
    address: number;
    dedup: number;
  };
}

// ========================================
// API Types
// ========================================

export interface CaptureRequest {
  track_id: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  landing_page?: string;
  event_source_url?: string;
}

export interface WebhookPayload {
  event_type: string;
  order_id: string;
  customer?: Record<string, unknown>;
  address?: Record<string, unknown>;
  products?: Record<string, unknown>[];
  value?: number;
  currency?: string;
  tracking_parameters?: Record<string, string>;
  timestamps?: Record<string, string>;
}

export interface NormalizedOrder {
  orderId: string;
  trackId?: string;
  value: number;
  currency: string;
  customer: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    externalId?: string;
  };
  address: OrderAddress;
  products: OrderProduct[];
  timestamps: {
    created?: string;
    paid?: string;
  };
  trackingParams: Record<string, string>;
}
