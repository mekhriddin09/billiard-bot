import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapReservation, mapSession } from "@/lib/db-map";
import { dateKey } from "@/lib/permissions";

/** Bron mijozi keldi — sessiya BRON VAQTIDAN boshlanadi (kech kelsa ham). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data: r } = await supabase.from("reservations").select("*").eq("id", params.id).maybeSingle();
  if (!r) return NextResponse.json({ error: "Bron topilmadi" }, { status: 404 });

  // Atomik: faqat hozir ham status='held' bo'lsa yangilanadi. Ikki xodim bir
  // vaqtda "Keldi" bossa, faqat bittasi qator qaytaradi — ikkinchisi 409 oladi.
  const { data: updatedReservation, error: reservationError } = await supabase
    .from("reservations")
    .update({ status: "arrived" })
    .eq("id", params.id)
    .eq("status", "held")
    .select("*")
    .maybeSingle();

  if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 });
  if (!updatedReservation) {
    return NextResponse.json({ error: "Bron topilmadi yoki holati mos emas" }, { status: 409 });
  }

  const startedAt = new Date(r.created_at).getTime();
  const { data: session, error } = await supabase
    .from("game_sessions")
    .insert({
      table_id: r.table_id,
      started_at: r.created_at,
      business_date: dateKey(startedAt),
      customer_id: r.customer_id,
      customer_phone: r.customer_phone,
      adjust_minutes: 0,
      status: "active",
      paid: false,
    })
    .select("*")
    .single();

  if (error || !session) {
    // Kompensatsiya: sessiya yaratib bo'lmadi (masalan, stolda allaqachon
    // boshqa aktiv sessiya bor ekan — 23505) — bronni "held"ga qaytaramiz,
    // aks holda bron "arrived" holatida osilib qoladi, lekin sessiyasi yo'q.
    await supabase.from("reservations").update({ status: "held" }).eq("id", params.id);
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Bu stolda allaqachon aktiv sessiya bor" }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });
  }

  const { data: table } = await supabase.from("club_tables").select("name").eq("id", r.table_id).maybeSingle();
  if (table) await logAudit(supabase, auth, `${table.name} — bron mijozi keldi, o'yin boshlandi`);

  return NextResponse.json({
    session: mapSession(session, [], []),
    reservation: updatedReservation ? mapReservation(updatedReservation) : null,
  });
}
