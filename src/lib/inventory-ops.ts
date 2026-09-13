import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ombor (inventar) bilan ishlashning DB-ta'sirli qismi. Sof formulalar
 * (weighted-average, consume) `finance.ts`da — bu yerda faqat ular
 * ustida Supabase o'qish/yozish bor.
 *
 * BEST-EFFORT: ikkalasi ham throw QILMAYDI. Ombor kuzatuvi — yordamchi
 * signal, asosiy operatsiya (stol/buyurtma/sessiya) hech qachon shu
 * sabab bilan to'xtab qolmasligi kerak (xuddi Telegram logging kabi).
 * Xato server konsoliga yoziladi.
 */

/**
 * Sessiyaga mahsulot qo'shilganda/ayirilganda chaqiriladi.
 * `qtyDelta`: musbat = SOTILDI (ombordan ayiriladi), manfiy = OLIB
 * TASHLANDI/QAYTARILDI (ombordga qo'shiladi). Bitta formula ikkalasini
 * ham qamrab oladi: stock_qty -= qtyDelta.
 * trackInventory=false mahsulotlar uchun no-op.
 */
export async function applyInventorySaleDelta(
  supabase: SupabaseClient,
  productId: string,
  qtyDelta: number
): Promise<void> {
  if (!productId || qtyDelta === 0) return;
  try {
    const { data: product } = await supabase
      .from("products")
      .select("id, track_inventory, stock_qty")
      .eq("id", productId)
      .maybeSingle();
    if (!product?.track_inventory) return;
    const newStockQty = Math.max(0, Number(product.stock_qty ?? 0) - qtyDelta);
    await supabase.from("products").update({ stock_qty: newStockQty }).eq("id", productId);
  } catch (e) {
    console.error("applyInventorySaleDelta xato:", e);
  }
}

/**
 * Yangi buyurtma qatori uchun SOTUV PAYTIDAGI tannarxni suratga oladi
 * (keyin mahsulot tannarxi o'zgarsa ham bu qiymat o'zgarmaydi).
 *
 * 2026-08 ("product cost price"): AVVAL faqat `trackInventory=true`
 * (og'ir ombor tizimi yoqilgan) mahsulotlar uchun ishlar edi. Endi admin
 * har qanday mahsulotga (ombor yoqilmagan bo'lsa ham) oddiy "original/
 * tannarx narxi"ni Sozlamalar'da to'g'ridan-to'g'ri kiritishi mumkin —
 * shuning uchun shart YENGILLASHTIRILDI: `unit_cost > 0` bo'lsa YETARLI,
 * `track_inventory` bilan bog'liq EMAS. Mavjud `unit_cost_at_sale`
 * ustuni/mexanizmi qayta ishlatildi — yangi parallel tizim yaratilmadi.
 * `track_inventory`/`stock_qty` (ombor) logikasi (`applyInventorySaleDelta`)
 * bundan MUSTAQIL, o'zgarishsiz qoladi.
 */
export async function snapshotUnitCostAtSale(
  supabase: SupabaseClient,
  productId: string
): Promise<number | undefined> {
  if (!productId) return undefined;
  try {
    const { data: product } = await supabase
      .from("products")
      .select("unit_cost")
      .eq("id", productId)
      .maybeSingle();
    if (!product || !product.unit_cost) return undefined;
    return product.unit_cost;
  } catch (e) {
    console.error("snapshotUnitCostAtSale xato:", e);
    return undefined;
  }
}
