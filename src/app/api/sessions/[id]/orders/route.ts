import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { addOrderCore } from "@/lib/services/sessions";
import { runService } from "@/lib/services/http";

/** Aktiv sessiyaga mahsulot qo'shish/ayirish (+/-1 va h.k.). Yopilgan
 *  sessiyalar uchun bu emas, /correct-orders (audit'li) ishlatiladi. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { productId, delta } = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => addOrderCore(supabase, auth, { sessionId: params.id, productId, delta }));
}
