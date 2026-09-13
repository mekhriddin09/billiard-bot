import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPendingAiAction } from "../db-map";
import type { PendingAiAction } from "../types";
import type { AuthedStaff } from "../api-auth";

/**
 * `pending_ai_actions` uchun CRUD qatlami — A-bosqich infratuzilmasi.
 *
 * MUHIM: bu fayl HOZIRCHA hech qayerdan chaqirilmaydi (webhook/LLM
 * ulanishi keyingi bosqichda). Shu paytgacha faqat ma'lumot modeli va
 * xavfsiz o'tish (state machine) qoidalarini belgilaydi:
 *
 *   pending → confirmed | cancelled   (admin tugma bosganda)
 *   pending → expired                 (muddati o'tganda, sweep orqali)
 *
 * "confirmed"/"cancelled"/"expired" holatlar QAYTA o'zgartirilmaydi —
 * har bir amal FAQAT bir marta hal qilinadi (`resolvePendingAction`dagi
 * `.eq("status","pending")` optimistik qulf shuni kafolatlaydi — ikki
 * marta tugma bosilsa ham faqat birinchisi natija beradi).
 */

export interface CreatePendingActionParams {
  chatId: string;
  staff: AuthedStaff;
  toolName: string;
  args: Record<string, unknown>;
  previewText: string;
}

export async function createPendingAction(
  supabase: SupabaseClient,
  params: CreatePendingActionParams
): Promise<PendingAiAction> {
  const { data, error } = await supabase
    .from("pending_ai_actions")
    .insert({
      chat_id: params.chatId,
      staff_id: params.staff.id,
      staff_name: params.staff.name,
      tool_name: params.toolName,
      args: params.args,
      preview_text: params.previewText,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Pending action yaratilmadi");
  return mapPendingAiAction(data);
}

export async function getPendingAction(supabase: SupabaseClient, id: string): Promise<PendingAiAction | null> {
  const { data } = await supabase.from("pending_ai_actions").select("*").eq("id", id).maybeSingle();
  return data ? mapPendingAiAction(data) : null;
}

/** Tugma bosilgandan keyin: xabar ID'sini biriktiradi (edit qilish uchun kerak bo'ladi). */
export async function attachTelegramMessageId(
  supabase: SupabaseClient,
  id: string,
  telegramMessageId: number
): Promise<void> {
  await supabase.from("pending_ai_actions").update({ telegram_message_id: telegramMessageId }).eq("id", id);
}

/**
 * callback_query kelganda chaqiriladi. Faqat "pending" holatidagi qatorni
 * o'tkazadi (optimistik qulf) — allaqachon hal qilingan yoki muddati
 * o'tgan amal uchun `null` qaytaradi, chaqiruvchi mos xabar ko'rsatishi
 * kerak ("bu amal allaqachon hal qilingan" / "muddati o'tgan").
 */
export async function resolvePendingAction(
  supabase: SupabaseClient,
  id: string,
  outcome: "confirmed" | "cancelled",
  extra?: { resultSummary?: string; errorMessage?: string }
): Promise<PendingAiAction | null> {
  const { data } = await supabase
    .from("pending_ai_actions")
    .update({
      status: outcome,
      resolved_at: new Date().toISOString(),
      result_summary: extra?.resultSummary ?? null,
      error_message: extra?.errorMessage ?? null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ? mapPendingAiAction(data) : null;
}

/**
 * NL orqali kelgan MUTATSION buyruq uchun — bir xil chat + bir xil tool
 * bo'yicha yaqinda (standart 2 daqiqa) yaratilgan, hali "pending" bo'lgan
 * amallarni qaytaradi (kamida bittasi bo'lsa). Chaqiruvchi (`dispatch.ts`)
 * `resolve()`dan keyingi YAKUNIY argumentlarni solishtirib, FAQAT xuddi
 * shu real nishonga (masalan bir xil stol, bir xil mahsulot) tegishli
 * dublikatni bloklaydi — turli stol/mijoz uchun ketma-ket buyruqlar
 * noto'g'ri bloklanmasin (masalan "5 stolni och" dan keyin darhol "7
 * stolni och" — bular ikkita MUSTAQIL amal, dublikat emas).
 */
export async function findRecentPendingByTool(
  supabase: SupabaseClient,
  chatId: string,
  toolName: string,
  withinMs = 2 * 60 * 1000
): Promise<PendingAiAction[]> {
  const sinceIso = new Date(Date.now() - withinMs).toISOString();
  const { data } = await supabase
    .from("pending_ai_actions")
    .select("*")
    .eq("chat_id", chatId)
    .eq("tool_name", toolName)
    .eq("status", "pending")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map(mapPendingAiAction);
}

/** Muddati o'tgan "pending" qatorlarni "expired"ga o'tkazadi. Har bir
 *  callback_query kelganda (B-bosqich) chaqiriladi — shu payt uchun
 *  "real vaqtli" tekshiruv, alohida cron shart emas (bu jadval faqat
 *  admin bosgan tugma orqaligina "harakatga keladi"). */
export async function expireStalePendingActions(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("pending_ai_actions")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return data?.length ?? 0;
}

/** Bajarilish natijasini (yoki xatosini) CONFIRM'dan keyin biriktiradi.
 *  Status'ni o'zgartirmaydi (allaqachon "confirmed") — faqat natija matni. */
export async function attachResult(
  supabase: SupabaseClient,
  id: string,
  result: { resultSummary?: string; errorMessage?: string }
): Promise<void> {
  await supabase
    .from("pending_ai_actions")
    .update({ result_summary: result.resultSummary ?? null, error_message: result.errorMessage ?? null })
    .eq("id", id);
}

// ─── Xavfsizlik matritsasi — SOF funksiya (DB/tarmoqqa tegmaydi) ────────
export type CallbackRejectReason =
  | "inactive_staff"
  | "not_found"
  | "already_resolved"
  | "expired"
  | "wrong_owner";

export type CallbackAuthResult = { ok: true } | { ok: false; reason: CallbackRejectReason };

/**
 * Har bir callback_query uchun MAJBURIY qayta tekshiruv (eski Telegram
 * xabariga yoki callback_data'ga ISHONILMAYDI — faqat shu paytdagi DB
 * holati va Telegram'ning o'zi tasdiqlagan `from.id`).
 *
 * Tartib muhim: avval xodim holatini tekshiramiz (nofaol/topilmagan bo'lsa
 * pending action haqida HECH NARSA oshkor qilinmaydi — mavjudligi/holati
 * ham), keyingina pending action holatini.
 */
export function checkCallbackAuthorization(
  pending: Pick<PendingAiAction, "status" | "staffId" | "expiresAt"> | null,
  resolvedStaff: { id: string; active: boolean } | null,
  now: number
): CallbackAuthResult {
  if (!resolvedStaff || !resolvedStaff.active) return { ok: false, reason: "inactive_staff" };
  if (!pending) return { ok: false, reason: "not_found" };
  if (pending.status !== "pending") return { ok: false, reason: "already_resolved" };
  if (pending.expiresAt <= now) return { ok: false, reason: "expired" };
  if (pending.staffId !== resolvedStaff.id) return { ok: false, reason: "wrong_owner" };
  return { ok: true };
}
