import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapInventoryPurchase } from "@/lib/db-map";
import { createPurchaseCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Ro'yxat — har qanday faol xodim. Ixtiyoriy ?from=&to= (business_date). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = supabaseServer();
  let query = supabase.from("inventory_purchases").select("*").order("occurred_at", { ascending: false }).limit(300);
  if (from) query = query.gte("business_date", from);
  if (to) query = query.lte("business_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ purchases: (data ?? []).map(mapInventoryPurchase) });
}

/**
 * Inventar xaridi — har qanday faol xodim yozadi (operatsion). Rule 2:
 * bu CASH FLOW xarajati, COGS EMAS. Mahsulotning `unit_cost`/`stock_qty`'si
 * shu yerda og'irlik-o'rtacha (weighted average) formula bo'yicha
 * yangilanadi (finance.ts — markazlashgan formula).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => createPurchaseCore(supabase, auth, body));
}
