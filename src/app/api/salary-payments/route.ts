import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapSalaryPayment } from "@/lib/db-map";
import { createSalaryPaymentCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Ro'yxat — Admin va Super Admin (xodimlar maoshi nozik ma'lumot). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(["super_admin", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const periodMonth = searchParams.get("periodMonth");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = supabaseServer();
  let query = supabase.from("salary_payments").select("*").order("occurred_at", { ascending: false }).limit(300);
  if (staffId) query = query.eq("staff_id", staffId);
  if (periodMonth) query = query.eq("period_month", periodMonth);
  if (from) query = query.gte("business_date", from);
  if (to) query = query.lte("business_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ payments: (data ?? []).map(mapSalaryPayment) });
}

/**
 * Oylik to'lovini qayd etish — faqat Admin/Super Admin (xodimlarga naqd/
 * karta pul berish — nozik amal, oddiy xarajatdan farqli o'laroq har
 * qanday xodimga ochiq emas).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => createSalaryPaymentCore(supabase, auth, body));
}
