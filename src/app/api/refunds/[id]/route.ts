import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { reverseRefundCore } from "@/lib/services/finance-actions";
import { runService } from "@/lib/services/http";

/** Qaytarim yozuvini bekor qilish (xato kiritilgan bo'lsa) — faqat Super Admin. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => reverseRefundCore(supabase, auth, { id: params.id, ...body }));
}
