import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapStaff } from "@/lib/db-map";
import type { StaffRole } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const { name, tgId, tgUsername, role } = (await req.json().catch(() => ({}))) as {
    name?: string;
    tgId?: string;
    tgUsername?: string;
    role?: StaffRole;
  };
  if (!name || !tgId || !role) {
    return NextResponse.json({ error: "name/tgId/role kerak" }, { status: 400 });
  }
  if (role === "super_admin") {
    return NextResponse.json({ error: "Bu yo'l bilan Super Admin qo'sha olmaysiz — grant-super ishlating" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("staff")
    .insert({ name, tg_id: tgId, tg_username: tgUsername ?? "", role, active: true })
    .select("*")
    .single();
  if (error) {
    const msg = error.code === "23505" ? "Bu Telegram ID allaqachon ro'yxatda" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logAudit(supabase, auth, `Yangi xodim qo'shdi: ${name} (${role})`);
  return NextResponse.json({ staff: mapStaff(data) });
}
