import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapReservation } from "@/lib/db-map";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();

  // Atomik: faqat hozir ham status='held' bo'lsa bekor qilinadi (arrive
  // route'dagi bir xil uslub). 2026-10 (bosim ostida tekshiruv): guard
  // bo'lmasa, bitta admin "Keldi" bosib sessiya ochib ulgurganda, boshqa
  // admin DEYARLI bir vaqtda "Bekor qilish" bossa, bron ALLAQACHON
  // "arrived" bo'lgan holda ham so'zsiz "cancelled"ga o'zgartirilar edi —
  // natijada aktiv sessiya bor, lekin bron "bekor qilingan" deb
  // ko'rsatiladigan qarama-qarshi holat qolib ketardi.
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", params.id)
    .eq("status", "held")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "Bron holati o'zgargan — ehtimol mijoz allaqachon keldi yoki bekor qilingan" },
      { status: 409 }
    );
  }

  return NextResponse.json({ reservation: mapReservation(data) });
}
