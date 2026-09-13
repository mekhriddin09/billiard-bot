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
