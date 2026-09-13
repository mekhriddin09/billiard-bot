import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapExpenseCategory } from "@/lib/db-map";

/** Ro'yxat — har qanday faol xodim ko'ra oladi (xarajat yozishda kerak). */
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categories: (data ?? []).map(mapExpenseCategory) });
}

/** Kategoriya qo'shish/tahrirlash — faqat Super Admin. */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nomi kerak" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      name,
      emoji: body.emoji || "💸",
      sort_order: Number(body.sortOrder) || 0,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ category: mapExpenseCategory(data) });
}
