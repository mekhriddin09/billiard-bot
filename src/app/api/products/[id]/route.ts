import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapProduct } from "@/lib/db-map";
import type { Product } from "@/lib/types";

/**
 * Mahsulot "Bor/Tugagan" (available) holatini har qanday faol xodim
 * o'zgartira oladi — bu kunlik operatsion ish. Narx/nom/kategoriya
 * o'zgartirish esa faqat Super Admin uchun.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const patch = (await req.json().catch(() => ({}))) as Partial<Product>;
  const onlyAvailability =
    Object.keys(patch).every((k) => k === "available") && patch.available !== undefined;

  const auth = await requireStaff(onlyAvailability ? undefined : ["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.price !== undefined) dbPatch.price = patch.price;
  if (patch.emoji !== undefined) dbPatch.emoji = patch.emoji;
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.available !== undefined) dbPatch.available = patch.available;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  // Ombor kuzatuvini yoqish/o'chirish — Finance moduli (Rule 2). Faqat
  // super_admin (yuqoridagi onlyAvailability shart bilan bir xil gate).
  if (patch.trackInventory !== undefined) dbPatch.track_inventory = patch.trackInventory;
  // Original/tannarx narxi — ixtiyoriy (2026-08, "product cost price").
  // Faqat super_admin o'zgartira oladi (narx bilan bir xil gate,
  // yuqoridagi onlyAvailability shartiga tegishli).
  if (patch.unitCost !== undefined) dbPatch.unit_cost = patch.unitCost;

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("products").update(dbPatch).eq("id", params.id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ product: mapProduct(data) });
}
