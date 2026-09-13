import "server-only";
import { NextResponse } from "next/server";
import { readStaffSession } from "./session";
import { supabaseServer } from "./supabase-server";
import type { StaffRole } from "./types";

export interface AuthedStaff {
  id: string;
  name: string;
  tgId: string;
  role: StaffRole;
  active: boolean;
}

/**
 * Joriy so'rovni yuborgan xodimni Supabase'dan JONLI o'qiydi (cookie faqat
 * staffId'ni tashiydi). Rol/active holati har doim eng so'nggi holatga mos —
 * xodim o'chirilgan/nofaol qilingan bo'lsa, keyingi so'rovdayoq bloklanadi.
 */
export async function getAuthedStaff(): Promise<AuthedStaff | null> {
  const session = await readStaffSession();
  if (!session) return null;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, tg_id, role, active")
    .eq("id", session.staffId)
    .maybeSingle();

  if (error || !data || !data.active) return null;

  return {
    id: data.id,
    name: data.name,
    tgId: data.tg_id,
    role: data.role as StaffRole,
    active: data.active,
  };
}

/**
 * API route'larda birinchi qatorda chaqiriladi. Ruxsat bo'lmasa mos xato
 * bilan Response qaytaradi, ruxsat bo'lsa xodim obyektini beradi.
 *
 * Misol:
 *   const auth = await requireStaff();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth — AuthedStaff
 */
export async function requireStaff(
  allowedRoles?: StaffRole[]
): Promise<AuthedStaff | NextResponse> {
  const staff = await getAuthedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Tizimga kirilmagan" }, { status: 401 });
  }
  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  return staff;
}
