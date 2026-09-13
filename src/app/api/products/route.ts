import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapProduct } from "@/lib/db-map";
import type { Product } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const p = (await req.json().catch(() => ({}))) as Omit<Product, "id">;
  if (!p.name || !p.categoryId) return NextResponse.json({ error: "Ma'lumot yetarli emas" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("products")
    .insert({
      category_id: p.categoryId,
      name: p.name,
      price: p.price,
      emoji: p.emoji,
      available: p.available ?? true,
      active: p.active ?? true,
      // Original/tannarx narxi — ixtiyoriy (2026-08, "product cost price").
      // Berilmasa DB standart 0 (schema'da not null default 0) — eski
      // mahsulotlar bilan bir xil, backward-compatible.
      unit_cost: p.unitCost ?? 0,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ product: mapProduct(data) });
}
