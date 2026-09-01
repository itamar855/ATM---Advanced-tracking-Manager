/**
 * Meta Ads Domain Types
 * Modelos de dados fortemente tipados para a Meta Graph API v23.0
 */

export interface MetaAdAccount {
  id: string; // Ex: "act_1316835733682937"
  accountId: string; // Ex: "1316835733682937"
  name: string; // Ex: "Minha Conta Principal"
  status: "ACTIVE" | "DISABLED" | "PAUSED" | "PENDING";
  currency: string; // Ex: "BRL", "USD"
  amountSpent: number; // Em unidades monetárias reais (ex: 1250.50)
  businessId?: string | null;
  businessName?: string | null;
}

export interface MetaBusinessManager {
  id: string; // Ex: "1279546367377201" ou "bm_personal"
  name: string; // Ex: "Business Manager Principal"
  accounts: MetaAdAccount[];
}

export interface MetaProfile {
  id: string;
  name: string;
  email?: string | null;
  businesses: MetaBusinessManager[];
  totalAccountsCount: number;
}

export interface MetaIntegrationState {
  connected: boolean;
  pixelId: string;
  testEventCode?: string;
  profile: MetaProfile;
  selectedAccountIds: string[];
  isFromDatabase: boolean;
  permissions?: string[];
  lastUpdated?: string;
}
