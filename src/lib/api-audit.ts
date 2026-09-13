import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "./api-auth";

export interface AiAuditMetadata {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface LogAuditOpts {
  /** "web" (Admin WebApp) yoki "telegram_ai" (AI agent orqali bajarilgan
   *  amal). Berilmasa — "web" (mavjud barcha chaqiruvlar uchun o'zgarmas
   *  standart xatti-harakat). */
  source?: "web" | "telegram_ai";
  /** AI orqali bajarilganda: qaysi tool, qanday argumentlar, natija —
   *  to'liq iz uchun. */
  metadata?: AiAuditMetadata;
}

/**
 * Mavjud imzo (`logAudit(supabase, staff, action)`) o'zgarmagan — barcha
 * hozirgi chaqiruv joylari HECH NARSA o'zgartirmasdan ishlayveradi
 * (source avtomatik "web"). Yangi, ixtiyoriy 4-parametr — AI agent
 * uchun (A-bosqich: infratuzilma tayyor, hali hech joyda chaqirilmaydi).
 */
export async function logAudit(
  supabase: SupabaseClient,
  staff: AuthedStaff,
  action: string,
  opts?: LogAuditOpts
) {
  const { error } = await supabase.from("audit_log").insert({
    staff_id: staff.id,
    staff_name: staff.name,
    role: staff.role,
    action,
    source: opts?.source ?? "web",
    metadata: opts?.metadata ?? null,
  });
  // Audit yozuvi asosiy oqimni HECH QACHON to'xtatmasligi kerak (shuning
  // uchun throw qilinmaydi) — lekin muvaffaqiyatsizlik butunlay ko'rinmas
  // bo'lib qolmasligi uchun Vercel Runtime Logs'da ko'rinadigan qilib
  // yoziladi (masalan migratsiya hali qo'llanilmagan bo'lsa — "column
  // does not exist" shu yerda chiqadi).
  if (error) {
    console.error("[audit_log] yozib bo'lmadi:", error.message, "| action:", action, "| source:", opts?.source ?? "web");
  }
}
