import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapTable } from "@/lib/db-map";
import type { ClubTable } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const patch = (await req.json().catch(() => ({}))) as Partial<ClubTable>;
  const dbPatch: Record<string, unknown> = {};
  if (patch.number !== undefined) dbPatch.number = patch.number;
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.tier !== undefined) dbPatch.tier = patch.tier;
  if (patch.pricePerHour !== undefined) dbPatch.price_per_hour = patch.pricePerHour;
  if (patch.onlineReservable !== undefined) dbPatch.online_reservable = patch.onlineReservable;
  if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled;
  if (patch.archived !== undefined) dbPatch.archived = patch.archived;

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("club_tables").update(dbPatch).eq("id", params.id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ table: mapTable(data) });
}
