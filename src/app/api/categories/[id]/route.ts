import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapCategory } from "@/lib/db-map";
import type { ProductCategory } from "@/lib/types";

/**
 * Kategoriyani Mini POS panelidan yashirish/ko'rsatish (enabled) — bu kunlik
 * operatsion ish, har qanday faol xodim qila oladi (mahsulot "available"
 * toggle bilan bir xil gate, src/app/api/products/[id]/route.ts'ga qarang).
 * Nom/emoji o'zgartirish esa faqat Super Admin uchun.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const patch = (await req.json().catch(() => ({}))) as Partial<ProductCategory>;
  const onlyEnabled =
    Object.keys(patch).every((k) => k === "enabled") && patch.enabled !== undefined;

  const auth = await requireStaff(onlyEnabled ? undefined : ["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.emoji !== undefined) dbPatch.emoji = patch.emoji;
  if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("product_categories")
    .update(dbPatch)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ category: mapCategory(data) });
}

/**
 * Kategoriyani BUTUNLAY o'chirish — faqat Super Admin, va faqat ichida
 * HECH QANDAY mahsulot (faol ham, arxivlangan ham) qolmagan bo'lsa.
 * `products.category_id` DB'da `on delete cascade` bo'lgani uchun, agar
 * bu cheklov bo'lmasa, kategoriyani o'chirish uning mahsulotlarini ham
 * O'chirib yuboradi — bu esa (agar mahsulot sotuv tarixida ishlatilgan
 * bo'lsa) session_orders.product_id FK cheklovi tufayli xato bilan
 * yarim yo'lda to'xtab qolishi yoki keraksiz ma'lumot yo'qotilishiga olib
 * kelishi mumkin. Shu sabab: bo'sh kategoriyani o'chirish oson, mahsuloti
 * bor bo'lsa — foydalanuvchiga "Yashirish"ni tavsiya qilamiz (2026-09).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();

  const { count, error: countErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", params.id);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Bu kategoriyada ${count} ta mahsulot bor — avval ularni boshqa kategoriyaga o'tkazing yoki o'chiring, so'ng qayta urinib ko'ring. Yoki, mahsulotlarni saqlab qolib, faqat kategoriyani Mini POS'dan yashirishingiz mumkin.`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("product_categories").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
