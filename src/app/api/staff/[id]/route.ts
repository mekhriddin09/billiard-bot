import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapStaff } from "@/lib/db-map";
import type { StaffMember } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const patch = (await req.json().catch(() => ({}))) as Partial<StaffMember>;
  // super_admin roli faqat grant-super orqali beriladi — bu yerdan hech qachon o'tmaydi.
  if (patch.role === "super_admin") {
    return NextResponse.json({ error: "grant-super ishlating" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: target } = await supabase.from("staff").select("*").eq("id", params.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Xodim topilmadi" }, { status: 404 });

  // Super Adminni bu umumiy yo'l orqali pasaytirib/nofaollashtirib bo'lmaydi —
  // "kamida bitta Super Admin qolishi shart" tekshiruvi faqat revoke-super'da
  // bor. Bu yerdan o'tkazilsa, o'sha himoyani chetlab o'tgan bo'lardi.
  if (target.role === "super_admin") {
    // Bu qatorga yetguncha yuqoridagi tekshiruv patch.role === "super_admin"
    // holatini allaqachon rad etgan — shuning uchun bu yerda patch.role
    // aniqlangan bo'lsa, u avtomatik ravishda "pasaytirish" demakdir.
    const demotingRole = patch.role !== undefined;
    const deactivating = patch.active === false;
    if (demotingRole || deactivating) {
      return NextResponse.json(
        { error: "Super Admin huquqini olib tashlash uchun revoke-super ishlating" },
        { status: 400 }
      );
    }
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.role !== undefined) dbPatch.role = patch.role;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.tgUsername !== undefined) dbPatch.tg_username = patch.tgUsername;

  const { data, error } = await supabase.from("staff").update(dbPatch).eq("id", params.id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  if (patch.role && patch.role !== target.role) {
    await logAudit(supabase, auth, `${target.name} roli o'zgardi: ${target.role} → ${patch.role}`);
  } else if (patch.active !== undefined && patch.active !== target.active) {
    await logAudit(supabase, auth, `${target.name} ${patch.active ? "faollashtirildi" : "o'chirildi (nofaol)"}`);
  }

  return NextResponse.json({ staff: mapStaff(data) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;
  if (params.id === auth.id) return NextResponse.json({ error: "O'zingizni o'chira olmaysiz" }, { status: 400 });

  const supabase = supabaseServer();
  const { data: target } = await supabase.from("staff").select("*").eq("id", params.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Xodim topilmadi" }, { status: 404 });
  if (target.role === "super_admin") {
    return NextResponse.json({ error: "Super Adminni oldin Admin darajasiga tushiring" }, { status: 400 });
  }

  const { error } = await supabase.from("staff").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, auth, `Xodim o'chirildi: ${target.name}`);
  return NextResponse.json({ ok: true });
}
