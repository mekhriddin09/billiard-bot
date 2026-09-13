import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { reverseExpenseCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/**
 * Xarajatni TUZATISH/bekor qilish — faqat Super Admin. Rule 3 (immutability):
 * asl yozuv HECH QACHON o'zgartirilmaydi/o'chirilmaydi — buning o'rniga
 * teskari ishorali YANGI yozuv qo'shiladi. Sabab (reason) majburiy.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => reverseExpenseCore(supabase, auth, { id: params.id, ...body }));
}
