import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapDebt, mapDebtPayment } from "@/lib/db-map";

/** Qarzlar ro'yxati — har qanday faol xodim ko'ra oladi (yig'ib olish operatsion ish). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // "open" | "paid" | null (hammasi)

  let query = supabase.from("debts").select("*").order("created_at", { ascending: false });
  if (status === "open" || status === "paid") query = query.eq("status", status);
  // Tarix cheksiz o'smasligi uchun — to'langanlardan faqat oxirgi 200 tasi.
  query = query.limit(200);

  const { data: debtRows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (debtRows ?? []).map((d) => d.id);
  const { data: paymentRows } = ids.length
    ? await supabase.from("debt_payments").select("*").in("debt_id", ids).order("at", { ascending: true })
    : { data: [] as any[] };

  const debts = (debtRows ?? []).map((d) =>
    mapDebt(
      d,
      (paymentRows ?? []).filter((p) => p.debt_id === d.id).map(mapDebtPayment)
    )
  );

  return NextResponse.json({ debts });
}
