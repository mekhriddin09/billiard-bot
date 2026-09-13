import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { reversePurchaseCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/**
 * Xaridni bekor qilish — faqat Super Admin. Rule 3: asl yozuv o'zgarmaydi,
 * teskari ishorali YANGI yozuv qo'shiladi. Ombordan mos miqdor ayiriladi.
 *
 * BILINADIGAN CHEKLOV: og'irlik-o'rtacha (weighted average) tannarxni
 * "orqaga qaytarib" aniq hisoblash mumkin emas — bekor qilishda `unit_cost`
 * QAYTA HISOBLANMAYDI, faqat `stock_qty` tuzatiladi.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => reversePurchaseCore(supabase, auth, { id: params.id, ...body }));
}
