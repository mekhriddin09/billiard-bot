import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapCategory } from "@/lib/db-map";

export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const { name, emoji } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: "Nomi kerak" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("product_categories")
    .insert({ name, emoji: emoji || "🛒" })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ category: mapCategory(data) });
}
