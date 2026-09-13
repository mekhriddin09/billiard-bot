import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapRefund } from "@/lib/db-map";
import { createRefundCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Ro'yxat — Admin va Super Admin. */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(["super_admin", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = supabaseServer();
  let query = supabase.from("refunds").select("*").order("occurred_at", { ascending: false }).limit(300);
  if (from) query = query.gte("business_date", from);
  if (to) query = query.lte("business_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ refunds: (data ?? []).map(mapRefund) });
}

/**
 * Qaytarim — faqat Admin/Super Admin (mijozga pul qaytarish, nozik amal,
 * suiiste'mol xavfi bor — oddiy xarajatdan farqli o'laroq har qanday
 * xodimga ochiq emas).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => createRefundCore(supabase, auth, body));
}
