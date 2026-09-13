import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapStaff } from "@/lib/db-map";

/** Oxirgi super adminni pasaytirib bo'lmaydi — doim kamida bittasi qolishi kerak. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data: target } = await supabase.from("staff").select("*").eq("id", params.id).maybeSingle();
  if (!target || target.role !== "super_admin") {
    return NextResponse.json({ error: "Bu xodim Super Admin emas" }, { status: 400 });
  }

  const { count } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Oxirgi Super Admin — kamida bittasi qolishi shart" }, { status: 400 });
  }

  const { data, error } = await supabase.from("staff").update({ role: "admin" }).eq("id", params.id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  await logAudit(supabase, auth, `${target.name}ning Super Admin huquqi olib tashlandi (Admin darajasiga tushirildi)`);
  return NextResponse.json({ staff: mapStaff(data) });
}
