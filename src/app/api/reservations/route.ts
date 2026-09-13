import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapReservation } from "@/lib/db-map";
import { fmtMoney } from "@/lib/format";

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { tableId, phone } = await req.json().catch(() => ({}));
  if (!tableId) return NextResponse.json({ error: "tableId kerak" }, { status: 400 });

  const supabase = supabaseServer();
  const [{ data: table }, { data: settingsRow }] = await Promise.all([
    supabase.from("club_tables").select("*").eq("id", tableId).maybeSingle(),
    supabase.from("club_settings").select("reservation").eq("id", 1).single(),
  ]);
  if (!table) return NextResponse.json({ error: "Stol topilmadi" }, { status: 404 });

  const reservationSettings = settingsRow?.reservation ?? { deposit: 0, holdMinutes: 60 };
  let customerId: string | null = null;
  if (phone) {
    const { data } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
    customerId = data?.id ?? null;
  }

  const now = Date.now();
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      table_id: tableId,
      customer_id: customerId,
      customer_phone: phone ?? null,
      deposit: reservationSettings.deposit,
      created_at: new Date(now).toISOString(),
      hold_until: new Date(now + reservationSettings.holdMinutes * 60000).toISOString(),
      status: "held",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  await logAudit(supabase, auth, `${table.name} stolga bron qabul qildi (${fmtMoney(reservationSettings.deposit)} depozit)`);
  return NextResponse.json({ reservation: mapReservation(data) });
}
