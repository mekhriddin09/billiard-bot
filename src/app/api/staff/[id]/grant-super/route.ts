import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapStaff } from "@/lib/db-map";

/** Bir nechta super admin bir vaqtda bo'lishi mumkin — bittasini super
 *  qilish boshqasini pasaytirmaydi. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const { data: target } = await supabase.from("staff").select("*").eq("id", params.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Xodim topilmadi" }, { status: 404 });
  if (target.role === "super_admin") return NextResponse.json({ staff: mapStaff(target) });

  const { data, error } = await supabase
    .from("staff")
    .update({ role: "super_admin" })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  await logAudit(supabase, auth, `${target.name}ga Super Admin huquqi berildi`);
  return NextResponse.json({ staff: mapStaff(data) });
}
