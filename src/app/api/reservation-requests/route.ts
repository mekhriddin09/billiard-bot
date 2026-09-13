import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapReservationRequest } from "@/lib/db-map";

/** Bog'lanish so'rovlari ro'yxati — har qanday faol xodim ko'ra oladi
 *  (mijozga qo'ng'iroq qilish operatsion ish, moliyaviy emas). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // "pending" | "contacted" | "cancelled" | null (hammasi)

  let query = supabase.from("reservation_requests").select("*").order("created_at", { ascending: false });
  if (status === "pending" || status === "contacted" || status === "cancelled") query = query.eq("status", status);
  query = query.limit(200);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: (data ?? []).map(mapReservationRequest) });
}
