import { NextRequest, NextResponse } from "next/server";
import { syncMetaAssetsHealth } from "@/lib/intelligence/meta-asset-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intelligence/assets/sync
 * GET /api/v1/intelligence/assets/sync?store_id=xyz
 *
 * Dispara o Meta Asset Data Collector e calcula o ATM Asset Intelligence Score™
 * para as contas e ativos vinculados à loja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);

    const storeId = body.store_id || searchParams.get("store_id");
    const adAccountId = body.ad_account_id || searchParams.get("ad_account_id");

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro store_id é obrigatório." },
        { status: 400 }
      );
    }

    const result = await syncMetaAssetsHealth({
      storeId,
      adAccountId,
      forceFresh: true,
    });

    return NextResponse.json({
      ok: result.success,
      data: result,
    });
  } catch (error: any) {
    console.error("[Asset Intelligence Sync Error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Falha na sincronização de ativos da Meta." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id");
    const adAccountId = searchParams.get("ad_account_id") || undefined;

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro store_id é obrigatório." },
        { status: 400 }
      );
    }

    const result = await syncMetaAssetsHealth({
      storeId,
      adAccountId,
      forceFresh: false,
    });

    return NextResponse.json({
      ok: result.success,
      data: result,
    });
  } catch (error: any) {
    console.error("[Asset Intelligence Get/Sync Error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Falha ao obter saúde de ativos da Meta." },
      { status: 500 }
    );
  }
}
