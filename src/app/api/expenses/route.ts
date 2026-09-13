import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapExpense } from "@/lib/db-map";
import { createExpenseCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Ro'yxat — har qanday faol xodim (operatsion ko'rish). Ixtiyoriy ?from=&to= (business_date). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = supabaseServer();
  let query = supabase.from("expenses").select("*").order("occurred_at", { ascending: false }).limit(300);
  if (from) query = query.gte("business_date", from);
  if (to) query = query.lte("business_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ expenses: (data ?? []).map(mapExpense) });
}

/** Xarajat yozish — har qanday faol xodim (operatsion amal, debt to'lovi bilan bir xil daraja). */
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => createExpenseCore(supabase, auth, body));
}
