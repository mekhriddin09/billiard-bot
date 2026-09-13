import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { reverseSalaryPaymentCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Oylik to'lovini bekor qilish — faqat Super Admin (Rule 3: teskari yozuv). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => reverseSalaryPaymentCore(supabase, auth, { id: params.id, ...body }));
}
