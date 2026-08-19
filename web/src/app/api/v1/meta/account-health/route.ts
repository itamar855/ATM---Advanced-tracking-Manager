import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

/**
 * Infere o Trust Tier da conta (1, 2 ou 3) com base em sinais reais da Meta API.
 * Meta não expõe o Tier diretamente — inferimos pela combinação de 5 sinais.
 */
function inferTier(metaAccount: any): {
  tier: 1 | 2 | 3;
  signals: { label: string; value: string; points: number; max: number }[];
} {
  const signals: { label: string; value: string; points: number; max: number }[] = [];
  let totalPoints = 0;
  let maxPoints = 0;

  // Sinal 1: Gasto histórico total (amount_spent vem em centavos)
  const amountSpentCents = parseInt(metaAccount.amount_spent || "0", 10);
  const amountSpentBRL = amountSpentCents / 100;
  let spendPoints = 0;
  if (amountSpentBRL >= 50000) spendPoints = 40;
  else if (amountSpentBRL >= 5000) spendPoints = 25;
  else spendPoints = 10;
  signals.push({
    label: "Gasto Histórico",
    value: `R$ ${amountSpentBRL.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
    points: spendPoints,
    max: 40,
  });
  totalPoints += spendPoints;
  maxPoints += 40;

  // Sinal 2: Idade da conta
  const createdTime = metaAccount.created_time ? new Date(metaAccount.created_time) : null;
  const ageInDays = createdTime ? Math.floor((Date.now() - createdTime.getTime()) / 86400000) : 0;
  let agePoints = 0;
  if (ageInDays >= 180) agePoints = 25;
  else if (ageInDays >= 30) agePoints = 15;
  else agePoints = 5;
  signals.push({
    label: "Idade da Conta",
    value: ageInDays > 0 ? `${ageInDays} dias` : "Desconhecida",
    points: agePoints,
    max: 25,
  });
  totalPoints += agePoints;
  maxPoints += 25;

  // Sinal 3: Capabilities desbloqueadas
  const capabilities: string[] = metaAccount.capabilities || [];
  let capPoints = 0;
  if (capabilities.length >= 10) capPoints = 20;
  else if (capabilities.length >= 5) capPoints = 12;
  else capPoints = 4;
  signals.push({
    label: "Capacidades Desbloqueadas",
    value: `${capabilities.length} permissões`,
    points: capPoints,
    max: 20,
  });
  totalPoints += capPoints;
  maxPoints += 20;

  // Sinal 4: Spend cap (ausência = conta madura)
  const hasSpendCap = metaAccount.spend_cap && parseInt(metaAccount.spend_cap) > 0;
  const capLimitPoints = hasSpendCap ? 5 : 10;
  signals.push({
    label: "Limite de Gasto",
    value: hasSpendCap ? "Com limite (spend_cap)" : "Sem limite",
    points: capLimitPoints,
    max: 10,
  });
  totalPoints += capLimitPoints;
  maxPoints += 10;

  // Sinal 5: Status da conta
  const accountStatus = metaAccount.account_status || 1;
  const statusPoints = accountStatus === 1 ? 5 : 0;
  signals.push({
    label: "Status da Conta",
    value: accountStatus === 1 ? "Ativa" : "Restrita/Desativada",
    points: statusPoints,
    max: 5,
  });
  totalPoints += statusPoints;
  maxPoints += 5;

  // Normaliza 0-100 e define o Tier
  const normalized = Math.round((totalPoints / maxPoints) * 100);
  let tier: 1 | 2 | 3 = 1;
  if (normalized >= 70) tier = 3;
  else if (normalized >= 40) tier = 2;

  return { tier, signals };
}

/**
 * GET /api/v1/meta/account-health?store_id=xyz
 * Busca dados REAIS da Meta Graph API e retorna Trust Score + Trust Tier inferido.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", "meta")
      .eq("status", "active")
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({
        ok: false,
        error: "Nenhuma integração do Facebook ativa encontrada para esta loja.",
      }, { status: 404 });
    }

    const adAccountId = (integration.config?.ad_account_id as string) || "";
    if (!adAccountId) {
      return NextResponse.json({
        ok: false,
        error: "ad_account_id não configurado. Selecione uma conta de anúncios.",
      }, { status: 400 });
    }

    const cleanAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const decryptedToken = decrypt(integration.access_token_enc.toString());
    const apiVersion = integration.api_version || "v23.0";

    // Campos expandidos — inclui capabilities e created_time para inferência de Tier
    const fields = [
      "name",
      "account_status",
      "disable_reason",
      "amount_spent",
      "spend_cap",
      "currency",
      "capabilities",
      "created_time",
      "insights.date_preset(last_30d){impressions,spend,actions}",
    ].join(",");

    const accountUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}?fields=${fields}&access_token=${decryptedToken}`;
    const resp = await fetch(accountUrl, { signal: AbortSignal.timeout(10000) });

    if (!resp.ok) {
      const errorJson = await resp.json();
      return NextResponse.json({
        ok: false,
        error: errorJson.error?.message || "Falha na Graph API do Facebook",
      }, { status: resp.status });
    }

    const metaAccount = await resp.json();

    // EMQ médio dos eventos recentes do ATM
    const { data: events } = await supabase
      .from("events")
      .select("health_score")
      .eq("store_id", storeId)
      .eq("source", "server")
      .order("created_at", { ascending: false })
      .limit(50);

    const avgEmq = events && events.length > 0
      ? Math.round(events.reduce((acc, ev) => acc + (ev.health_score || 0), 0) / events.length)
      : 0;

    // 4 Pilares do Trust Score
    const accountStatus = metaAccount.account_status || 1;
    const billingScore = accountStatus === 1 ? 100 : accountStatus === 3 ? 50 : 20;
    const complianceScore = !metaAccount.disable_reason || metaAccount.disable_reason === 0 ? 100 : 30;
    const feedbackScore = 5.0;
    const emqScore = avgEmq;

    const trustScore = Math.round(
      (billingScore * 0.3) +
      (complianceScore * 0.3) +
      ((feedbackScore / 5.0) * 100 * 0.2) +
      (emqScore * 0.2)
    );

    // Trust Tier inferido
    const { tier, signals: tierSignals } = inferTier(metaAccount);

    const risks: string[] = [];
    const recommendations: string[] = [];

    if (accountStatus !== 1) {
      risks.push(`Conta desativada ou com pendências (Código ${accountStatus})`);
      recommendations.push("Regularize o pagamento ou conteste restrições no Meta Ads Manager.");
    }
    if (emqScore < 70) {
      risks.push("EMQ baixo — a Meta precisa de mais sinais para otimizar o público.");
      recommendations.push("Envie fbp, fbc, email e telefone hasheados nos eventos CAPI.");
    }
    if (tier === 1) {
      risks.push("Conta no Tier 1 — limites de gasto baixos e aprovações mais lentas.");
      recommendations.push("Aumente o gasto gradualmente e mantenha pagamento em dia para subir de Tier.");
    }
    if (risks.length === 0) {
      recommendations.push("Conta de anúncio saudável e sem pendências regulamentares.");
    }

    const healthRecord = {
      ad_account_id: cleanAccountId,
      ad_account_name: metaAccount.name || "Conta de Anúncios Integrada",
      account_status: accountStatus,
      trust_score: trustScore,
      compliance_score: complianceScore,
      billing_score: billingScore,
      feedback_score: feedbackScore,
      emq_score: emqScore,
      inferred_tier: tier,
      tier_signals: tierSignals,
      currency: metaAccount.currency || "BRL",
      risks_detected: risks,
      recommendations: recommendations,
      last_analyzed_at: new Date().toISOString(),
    };

    await supabase.from("ad_account_health").upsert({
      store_id: storeId,
      ...healthRecord,
    }, { onConflict: "store_id,ad_account_id" });

    return NextResponse.json({ ok: true, source: "live", data: healthRecord });

  } catch (error: any) {
    console.error("[Meta Account Health API Error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
