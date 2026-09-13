import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapReservationRequest } from "@/lib/db-map";

/** Admin mijozga qo'ng'iroq qilib bo'lgach — "bog'landim" deb belgilaydi. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("reservation_requests")
    .update({
      status: "contacted",
      contacted_at: new Date().toISOString(),
      contacted_by: auth.id,
      contacted_by_name: auth.name,
    })
    .eq("id", params.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" }, { status: 409 });

  await logAudit(supabase, auth, `Bog'lanish so'roviga (${data.customer_phone}) qo'ng'iroq qildi`);
  return NextResponse.json({ request: mapReservationRequest(data) });
}
