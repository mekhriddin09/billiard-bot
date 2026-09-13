import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { addCustomOrderCore } from "@/lib/services/sessions";
import { runService } from "@/lib/services/http";

/** "Tezkor/maxsus mahsulot" — Products katalogida yo'q, faqat shu aktiv
 *  sessiyaga xos qator (2026-08). Faqat BITTA mutation — Products
 *  bo'limiga navigatsiya yoki qo'shimcha so'rov shart emas. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { name, price, qty } = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => addCustomOrderCore(supabase, auth, { sessionId: params.id, name, price, qty }));
}
