import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `pending_clarifications` uchun CRUD qatlami — Faza 6 (ko'p-bosqichli
 * aniqlashtirish konteksti).
 *
 * MUHIM: bu `pending_ai_actions`dan (tasdiqlash navbati) BUTUNLAY
 * mustaqil, oddiyroq mexanizm. U tool argumentlarini emas — AI oldin
 * qaysi ASL xabarga aniqlashtiruvchi savol berganini eslab qoladi, shunda
 * keyingi xabar kelganda ikkalasini birlashtirib LLM'ga qayta yuboriladi:
 *
 *   Admin: "5 stolga 2 kola"
 *   AI:    "[CLARIFY] Qaysi hajmdagi Cola?" → "Qaysi hajmdagi Cola?"
 *          (asl matn "5 stolga 2 kola" shu jadvalga yoziladi)
 *   Admin: "1.5 lik"
 *   → dispatch.ts "5 stolga 2 kola\n(qo'shimcha izoh): 1.5 lik" deb
 *     BITTA yangi so'rov sifatida LLM'ga yuboradi.
 *
 * Bir martalik iste'mol: `consumePendingClarification` topgan yozuvni
 * DARHOL o'chiradi — muvaffaqiyatli bo'ladimi, yo'qmi, keyingi xabar
 * bilan ikkinchi marta ishlatilmaydi (aks holda eski kontekst abadiy
 * yopishib qolishi mumkin edi).
 */

const TTL_MS = 5 * 60 * 1000; // 5 daqiqa — eski aniqlashtirishlar keyingi keraksiz xabarga yopishmasin
const MAX_COMBINED_LEN = 800; // cheksiz o'sishning oldini olish (ko'p bosqichli zanjir bo'lsa ham)

/**
 * Chat+xodim uchun kutilayotgan aniqlashtirish bormi — bo'lsa OLIB
 * TASHLAYDI (bir martalik) va ASL matnni qaytaradi. Muddati o'tgan
 * bo'lsa ham o'chiriladi (eskirgan qatorni saqlab turishning ma'nosi
 * yo'q), lekin `null` qaytariladi (hisobga olinmaydi).
 */
export async function consumePendingClarification(
  supabase: SupabaseClient,
  chatId: string,
  staffId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("pending_clarifications")
    .select("id, original_text, expires_at")
    .eq("chat_id", chatId)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!data) return null;

  await supabase.from("pending_clarifications").delete().eq("id", data.id);

  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data.original_text as string;
}

/**
 * AI aniqlashtiruvchi savol berganda chaqiriladi — shu chat+xodim uchun
 * (bor bo'lsa ustidan yoziladi, `unique(chat_id, staff_id)` orqali) ASL
 * matnni saqlaydi. Juda uzun bo'lib ketsa (ko'p bosqichli zanjir), FAQAT
 * so'nggi (eng dolzarb) qismini saqlaydi.
 */
export async function savePendingClarification(
  supabase: SupabaseClient,
  chatId: string,
  staffId: string,
  originalText: string
): Promise<void> {
  const trimmed = originalText.length > MAX_COMBINED_LEN ? originalText.slice(-MAX_COMBINED_LEN) : originalText;
  await supabase.from("pending_clarifications").upsert(
    {
      chat_id: chatId,
      staff_id: staffId,
      original_text: trimmed,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: "chat_id,staff_id" }
  );
}
