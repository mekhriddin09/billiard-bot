import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapReservationRequest } from "@/lib/db-map";

/** So'rovni ro'yxatdan olib tashlaydi (masalan noto'g'ri raqam/keraksiz). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("reservation_requests")
    .update({ status: "cancelled" })
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "So'rov topilmadi" }, { status: 404 });

  await logAudit(supabase, auth, `Bog'lanish so'rovini (${data.customer_phone}) bekor qildi`);
  return NextResponse.json({ request: mapReservationRequest(data) });
}
