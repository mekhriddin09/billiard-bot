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

  // CAS: faqat nishon xodim HALI HAM super_admin bo'lsa pasaytiriladi — ikki
  // admin bir vaqtda O'SHA bitta xodimni pasaytirsa, faqat biri muvaffaqiyatli
  // bo'ladi (addOrderCore/payDebtCore bilan bir xil uslub).
  const { data, error } = await supabase
    .from("staff")
    .update({ role: "admin" })
    .eq("id", params.id)
    .eq("role", "super_admin")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "Bu xodim allaqachon Super Admin emas" }, { status: 409 });
  }

  // 2026-10 (bosim ostida tekshiruv): yuqoridagi `count` o'qishi va shu
  // update orasida BOSHQA so'rov (BOSHQA xodimni) pasaytirib ulgurishi
  // mumkin edi — ikkala so'rov ham alohida-alohida "count<=1" tekshiruvidan
  // muvaffaqiyatli o'tib, ikkalasi ham o'z nishonini pasaytirsa, YAKUNIY
  // natijada 0 ta Super Admin qolib ketishi mumkin edi (TOCTOU). Shuning
  // uchun update'dan KEYIN invariantni QAYTA tekshiramiz — agar buzilgan
  // bo'lsa, shu so'rov O'ZINING o'zgarishini ORQAGA qaytaradi (boshqa
  // so'rovning o'zgarishiga tegmaydi).
  const { count: afterCount } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  if ((afterCount ?? 0) < 1) {
    await supabase.from("staff").update({ role: "super_admin" }).eq("id", params.id);
    return NextResponse.json(
      { error: "Boshqa so'rov bilan to'qnashdi — oxirgi Super Admin qolib ketardi, bekor qilindi" },
      { status: 409 }
    );
  }

  await logAudit(supabase, auth, `${target.name}ning Super Admin huquqi olib tashlandi (Admin darajasiga tushirildi)`);
  return NextResponse.json({ staff: mapStaff(data) });
}
