import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";

/**
 * Telegram bot chatida "kim yozyapti"ni hal qiladi. YAGONA ishonchli
 * kirish — `tgId` (webhook `message.from.id` / `callback_query.from.id`,
 * Telegram'ning o'zi tasdiqlagan, secret-token bilan himoyalangan webhook
 * orqali kelgan qiymat). Boshqa HECH QANDAY manba (masalan callback_data
 * ichidagi biror maydon, xabar matni) staffId/role sifatida ishlatilmaydi.
 *
 * Bu — `api-auth.ts`dagi `getAuthedStaff()`ning Telegram-ekvivalenti: u
 * yerda cookie'dagi staffId'dan, bu yerda tg_id'dan — ikkalasi ham DB'dan
 * JONLI (real-time) rol/active holatini o'qiydi.
 */
export async function resolveStaffFromTelegram(
  supabase: SupabaseClient,
  tgId: string | number
): Promise<AuthedStaff | null> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, tg_id, role, active")
    .eq("tg_id", String(tgId))
    .maybeSingle();

  if (error || !data || !data.active) return null;

  return {
    id: data.id,
    name: data.name,
    tgId: data.tg_id,
    role: data.role,
    active: data.active,
  };
}
