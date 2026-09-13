import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "../telegram-bot";
import { ServiceError } from "./errors";

/**
 * "Bo'shaganda xabar ber" — mijoz tomonidan chaqiriladi (xodim EMAS),
 * shuning uchun bu yerda `AuthedStaff` yo'q — chaqiruvchi route
 * (src/app/api/public/table-watch/route.ts) Telegram initData orqali
 * mijozni ALLAQACHON hal qilgan bo'ladi va faqat `customerId`/`tgId`
 * uzatadi (Rule 6 bilan bir xil tamoyil — identifikatsiya route
 * darajasida, ishonchli manbadan).
 */

export interface WatchTableArgs {
  tableId: string;
  customerId: string;
  tgId: string;
}

export async function watchTableCore(supabase: SupabaseClient, args: WatchTableArgs): Promise<void> {
  const { data: table } = await supabase.from("club_tables").select("id").eq("id", args.tableId).maybeSingle();
  if (!table) throw new ServiceError("Stol topilmadi", 404);

  // Idempotent — mijoz tugmani bir necha marta bossa ham, faol
  // (notified_at IS NULL) kuzatuv bitta bo'lib qoladi.
  const { data: existing } = await supabase
    .from("table_watchers")
    .select("id")
    .eq("table_id", args.tableId)
    .eq("customer_id", args.customerId)
    .is("notified_at", null)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("table_watchers").insert({
    table_id: args.tableId,
    customer_id: args.customerId,
    tg_id: args.tgId,
  });
  // 23505 = boshqa so'rov bizdan bir zum oldin xuddi shu kuzatuvni
  // yaratib ulgurdi (UNIQUE indeks) — bu XATO EMAS, natija bir xil.
  if (error && error.code !== "23505") throw new ServiceError(error.message, 500);
}

export async function unwatchTableCore(
  supabase: SupabaseClient,
  args: { tableId: string; customerId: string }
): Promise<void> {
  await supabase
    .from("table_watchers")
    .delete()
    .eq("table_id", args.tableId)
    .eq("customer_id", args.customerId)
    .is("notified_at", null);
}

/**
 * Sessiya yopilganda chaqiriladi (closeSessionCore, best-effort — hech
 * qachon asosiy "stolni yopish" operatsiyasini sekinlashtirmaydi yoki
 * to'xtatmaydi, Telegram — faqat bildirishnoma qatlami). Har bir faol
 * kuzatuvchiga DM yuboriladi, muvaffaqiyatli yuborilganlar notified_at
 * bilan belgilanadi (qayta xabar ketmasligi uchun).
 */
export async function notifyTableWatchers(supabase: SupabaseClient, tableId: string, tableName: string): Promise<void> {
  const { data: watchers } = await supabase
    .from("table_watchers")
    .select("id, tg_id")
    .eq("table_id", tableId)
    .is("notified_at", null);
  if (!watchers || watchers.length === 0) return;

  const text = `🎱 <b>Stol ${tableName} bo'shadi!</b>\n\nHozir band emas — istasangiz kelishingiz mumkin.`;

  await Promise.all(
    watchers.map(async (w) => {
      const res = await sendMessage(w.tg_id, text);
      if (res.ok) {
        await supabase.from("table_watchers").update({ notified_at: new Date().toISOString() }).eq("id", w.id);
      }
      // res.ok=false bo'lsa (masalan mijoz botni bloklagan) — qator
      // notified_at=NULL holida qoladi. Buni "abadiy takror urinish"ga
      // aylantirmaslik uchun keyingi safar shu stol yana yopilganda ham
      // qayta urinib ko'riladi — bu qabul qilingan, xavfsiz trade-off
      // (aks holda mijoz muvaqqat tarmoq xatosi tufayli umuman
      // xabar olmay qolishi mumkin edi).
    })
  );
}
