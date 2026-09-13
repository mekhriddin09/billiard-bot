import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapTable } from "@/lib/db-map";
import type { ClubTable } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const t = (await req.json().catch(() => ({}))) as Omit<ClubTable, "id">;
  if (!t.name || !t.type) return NextResponse.json({ error: "Ma'lumot yetarli emas" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("club_tables")
    .insert({
      number: t.number,
      name: t.name,
      type: t.type,
      tier: t.tier,
      price_per_hour: t.pricePerHour,
      online_reservable: t.onlineReservable,
      enabled: t.enabled ?? true,
      archived: t.archived ?? false,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  await logAudit(supabase, auth, `Yangi stol qo'shdi: ${t.name}`);
  return NextResponse.json({ table: mapTable(data) });
}
