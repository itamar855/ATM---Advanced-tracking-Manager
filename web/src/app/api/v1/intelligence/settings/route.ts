import { NextRequest, NextResponse } from "next/server";
import {
  getStoreAutomationSettings,
  updateStoreAutomationSettings,
} from "@/lib/intelligence/campaign-action-engine";

/**
 * GET /api/v1/intelligence/settings?store_id=...
 * Consulta as configurações de segurança, tetos e guardrails da loja.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "store_id é obrigatório." },
        { status: 400 }
      );
    }

    const settings = await getStoreAutomationSettings(storeId);

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (err: any) {
    console.error("[Intelligence Settings GET Error]:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erro ao consultar configurações." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/intelligence/settings
 * Atualiza os parâmetros de segurança e guardrails da loja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, ...updates } = body;

    if (!store_id) {
      return NextResponse.json(
        { ok: false, error: "store_id é obrigatório." },
        { status: 400 }
      );
    }

    const updated = await updateStoreAutomationSettings(store_id, {
      automationEnabled: updates.automationEnabled,
      killSwitch: updates.killSwitch,
      maxDailyBudgetChange: updates.maxDailyBudgetChange !== undefined ? Number(updates.maxDailyBudgetChange) : undefined,
      maxBudgetIncreasePercent: updates.maxBudgetIncreasePercent !== undefined ? Number(updates.maxBudgetIncreasePercent) : undefined,
      maxBudgetDecreasePercent: updates.maxBudgetDecreasePercent !== undefined ? Number(updates.maxBudgetDecreasePercent) : undefined,
      cooldownHours: updates.cooldownHours !== undefined ? Number(updates.cooldownHours) : undefined,
    });

    return NextResponse.json({
      ok: true,
      message: "Configurações de segurança e automação atualizadas com sucesso.",
      settings: updated,
    });
  } catch (err: any) {
    console.error("[Intelligence Settings POST Error]:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erro ao atualizar configurações." },
      { status: 500 }
    );
  }
}
