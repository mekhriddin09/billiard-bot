import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rule 4 (qulflangan qoida): "har bir tasdiqlangan xarajat/xarid/oylik/
 * qarz/qaytarim BITTA Super Admin alert yaratishi kerak — page refresh,
 * retry yoki takroriy so'rovda IKKINCHISI YUBORILMASIN."
 *
 * Yechim: frontend har bir amal (masalan "Saqlash" tugmasi bosilganda)
 * uchun BITTA marta `crypto.randomUUID()` bilan `clientRequestId`
 * yaratadi va shu qiymatni so'rov bilan yuboradi (retry/qayta yuborishda
 * xuddi shu ID qayta ishlatiladi — YANGI ID emas).
 *
 * Route quyidagicha ishlatadi:
 *   1) Avval shu ID bo'yicha qidiradi — topilsa, ESKI yozuvni qaytaradi,
 *      YANGI qator qo'shmaydi, Telegram alert YUBORMAYDI (allaqachon
 *      birinchi urinishda yuborilgan).
 *   2) Topilmasa — normal INSERT qiladi. Jadvaldagi
 *      `client_request_id text unique` DB darajasidagi zaxira himoya —
 *      ikkita so'rov AYNI PAYTDA kelib qolsa ham (race), faqat bittasi
 *      muvaffaqiyatli INSERT bo'ladi.
 */
export async function findByClientRequestId<T = any>(
  supabase: SupabaseClient,
  table: string,
  clientRequestId: string | undefined | null
): Promise<T | null> {
  if (!clientRequestId) return null;
  const { data } = await supabase.from(table).select("*").eq("client_request_id", clientRequestId).maybeSingle();
  return (data as T) ?? null;
}

/** Postgres unique-violation xato kodi — race holatida INSERT tashqarida qolsa shu keladi. */
export const UNIQUE_VIOLATION_CODE = "23505";
