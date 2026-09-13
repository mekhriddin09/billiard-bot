import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";
import type { StaffRole } from "../types";
import type { LlmToolSchema } from "./providers/types";

/**
 * TOOL REGISTRY TIPLARI — whitelist qilingan AI tool'lari uchun umumiy
 * shakl. Bu yerda tavsiflangan tool'lar TASHQARISIDA LLM hech narsa
 * qila olmaydi (DB'ga to'g'ridan-to'g'ri kirish yo'q, arbitrar SQL yo'q).
 *
 * Ikki tur:
 *  - READ (mutating=false): darhol bajariladi, tasdiqlash SHART EMAS
 *    (o'quvchi operatsiya — hech narsani o'zgartirmaydi).
 *  - MUTATING (mutating=true): DARHOL bajarilmaydi. Oqim:
 *      1) `validate()` — LLM argumentlarini qat'iy tekshiradi/normallashtiradi
 *      2) `resolve()`  — nomlarni (stol raqami, mahsulot nomi, mijoz nomi...)
 *                        DB'dagi REAL ID'larga aylantiradi va foydalanuvchiga
 *                        ko'rsatiladigan preview matnini quradi
 *      3) `pending_ai_actions`ga yoziladi, Telegram'da tasdiqlash kartasi
 *         ko'rsatiladi (✅/❌ yoki xavfli/moliyaviy bo'lsa ✅/✏️/❌)
 *      4) tugma bosilganda — `checkCallbackAuthorization` (staff qayta
 *         Telegram `from.id`dan hal qilinadi) → atomik "claim" → `execute()`
 *      5) natija DB'ga (`pending_ai_actions.result_summary`) va
 *         `audit_log`ga yoziladi, Telegram xabari tahrirlanadi.
 *
 * `execute()` HECH QACHON o'zi biznes-mantiq YOZMAYDI — faqat mavjud
 * service-layer funksiyalarini (`src/lib/services/*`) chaqiradi.
 */

export interface ToolExecutionResult {
  resultSummary: string;
  /** Faqat READ tool'lar uchun ixtiyoriy — natija Telegram xabarida
   *  o'qib bo'lmas darajada katta bo'lsa (universal query engine), matn
   *  o'rniga shu fayl (masalan CSV) hujjat sifatida yuboriladi;
   *  `resultSummary` shu holda hujjatning qisqa "caption"i sifatida
   *  ishlatiladi (`dispatch.ts`ga qarang). */
  document?: { filename: string; content: string; caption?: string };
}

export interface ToolDefinition {
  description: string;
  /** LLM function-calling uchun JSON-sxema. */
  parameters: LlmToolSchema["parameters"];
  /** false — o'quvchi (darhol bajariladi). true — o'zgartiruvchi (tasdiqlash shart). */
  mutating: boolean;
  /** Faqat mutating=true bo'lsa ma'noli: true — 3-tugmali (✅/✏️/❌, moliyaviy/xavfli), false — 2-tugmali (✅/❌, operatsion). */
  risky?: boolean;
  /** Berilmasa — istalgan faol xodim. */
  allowedRoles?: StaffRole[];
  /** LLM'dan kelgan XOM argumentlarni qat'iy tekshiradi/normallashtiradi. Noto'g'ri bo'lsa `ServiceError` otadi. */
  validate: (rawArgs: unknown) => Record<string, unknown>;
  /**
   * FAQAT mutating=true tool'lar uchun. Tekshirilgan argumentlardagi
   * nomlarni (stol raqami, mahsulot nomi va h.k.) DB'dan REAL ID'larga hal
   * qiladi, mavjudligini/holatini tekshiradi va tasdiqlash kartasi matnini
   * quradi. `resolvedArgs` — `pending_ai_actions.args`ga yoziladigan,
   * `execute()`ga uzatiladigan YAKUNIY argumentlar (LLM'ning xom
   * argumentlari emas).
   */
  resolve?: (supabase: SupabaseClient, args: Record<string, unknown>) => Promise<{ preview: string; resolvedArgs: Record<string, unknown> }>;
  /** Tasdiqlangandan (yoki READ bo'lsa — darhol) keyin haqiqiy amalni bajaradi. Faqat mavjud service-layer funksiyalarini chaqiradi. */
  execute: (supabase: SupabaseClient, auth: AuthedStaff, args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}
