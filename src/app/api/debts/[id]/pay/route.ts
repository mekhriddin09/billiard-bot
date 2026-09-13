import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { payDebtCore } from "@/lib/services/debts";
import { runService } from "@/lib/services/http";

/**
 * Qarz to'lovini qayd etish — oddiy operatsion amal, har qanday faol xodim.
 * Summani ORQAGA tuzatish/o'chirish uchun emas — bu faqat Super Admin
 * (/api/debts/[id] PATCH).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() =>
    payDebtCore(supabase, auth, { debtId: params.id, amount: body.amount, method: body.method, note: body.note })
  );
}
