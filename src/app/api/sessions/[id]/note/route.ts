import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapEditLog, mapOrder, mapSession } from "@/lib/db-map";
import { canEditSession } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { note } = await req.json().catch(() => ({ note: "" }));
  const supabase = supabaseServer();
  const { data: ses } = await supabase.from("game_sessions").select("*").eq("id", params.id).maybeSingle();
  if (!ses) return NextResponse.json({ error: "Sessiya topilmadi" }, { status: 404 });

  if (!canEditSession({ businessDate: ses.business_date, startedAt: new Date(ses.started_at).getTime() }, auth)) {
    return NextResponse.json({ error: "Bu sessiyani tahrirlash huquqingiz yo'q" }, { status: 403 });
  }

  const now = Date.now();
  const trimmed = (note ?? "").trim();

  await supabase.from("session_edit_log").insert({
    session_id: params.id,
    staff_id: auth.id,
    staff_name: auth.name,
    role: auth.role,
    field: "Izoh",
    old_value: ses.note ?? "—",
    new_value: trimmed || "—",
  });

  const { data: updated, error } = await supabase
    .from("game_sessions")
    .update({ note: trimmed, note_by: auth.name, note_at: new Date(now).toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  const [{ data: orderRows }, { data: editHistoryRows }] = await Promise.all([
    supabase.from("session_orders").select("*").eq("session_id", params.id),
    supabase.from("session_edit_log").select("*").eq("session_id", params.id).order("at", { ascending: false }),
  ]);

  return NextResponse.json({
    session: mapSession(updated, (orderRows ?? []).map(mapOrder), (editHistoryRows ?? []).map(mapEditLog)),
  });
}
