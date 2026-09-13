import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";
import { logAudit } from "../api-audit";
import { mapDebt, mapDebtPayment } from "../db-map";
import { todayKey } from "../permissions";
import { fmtMoney } from "../format";
import { logDebtPaid, bestEffort } from "../telegram-log";
import { ServiceError } from "./errors";
import type { Debt, PaymentMethod } from "../types";

// ─── 1) Qarz to'lovini qayd etish ────────────────────────────────────────
export interface PayDebtArgs {
  debtId: string;
  amount: number;
  method?: PaymentMethod;
  note?: string;
}

export async function payDebtCore(supabase: SupabaseClient, auth: AuthedStaff, args: PayDebtArgs): Promise<{ debt: Debt }> {
  const method: PaymentMethod = args.method === "card" ? "card" : args.method === "mixed" ? "mixed" : "cash";
  const inputAmount = Math.max(0, Number(args.amount) || 0);
  const note = args.note?.trim() || undefined;
  if (inputAmount <= 0) throw new ServiceError("Summa noto'g'ri", 400);

  const { data: debtRow } = await supabase.from("debts").select("*").eq("id", args.debtId).maybeSingle();
  if (!debtRow) throw new ServiceError("Qarz topilmadi", 404);
  if (debtRow.status === "paid" || debtRow.remaining_amount <= 0) {
    throw new ServiceError("Qarz allaqachon to'liq to'langan", 409);
  }

  const amount = Math.min(inputAmount, debtRow.remaining_amount);
  const newPaid = debtRow.paid_amount + amount;
  const newRemaining = Math.max(0, debtRow.remaining_amount - amount);
  const newStatus = newRemaining <= 0 ? "paid" : "open";
  const now = new Date().toISOString();

  // Optimistik qulf: faqat o'qigan qiymatimiz hali ham amal qilsa yangilanadi.
  const { data: updated, error } = await supabase
    .from("debts")
    .update({
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      closed_at: newStatus === "paid" ? now : null,
    })
    .eq("id", args.debtId)
    .eq("remaining_amount", debtRow.remaining_amount)
    .select("*")
    .maybeSingle();

  if (error) throw new ServiceError(error.message, 500);
  if (!updated) {
    throw new ServiceError(
      "Boshqa xodim shu qarzga ayni paytda to'lov kiritdi — sahifani yangilab qayta urinib ko'ring",
      409
    );
  }

  await supabase.from("debt_payments").insert({
    debt_id: args.debtId,
    amount,
    method,
    staff_id: auth.id,
    staff_name: auth.name,
    note: note ?? null,
    // finance.ts cash-basis hisob-kitobi uchun — pul TO'LANGAN kun.
    business_date: todayKey(),
  });

  // Audit (DB, tez) va to'lovlar tarixini qayta o'qish — javob uchun kerak,
  // parallel bajariladi. Telegram log xabari — fonda, javobni KUTTIRMAYDI
  // (2026-08 performance audit — "Qarz to'lovi" tugmasi tezligi).
  const [, { data: paymentRows }] = await Promise.all([
    logAudit(supabase, auth, `${debtRow.customer_name} qarziga to'lov: ${fmtMoney(amount)} so'm (qoldi ${fmtMoney(newRemaining)})`),
    supabase.from("debt_payments").select("*").eq("debt_id", args.debtId).order("at", { ascending: true }),
  ]);
  bestEffort(
    logDebtPaid(supabase, {
      replyToMessageId: debtRow.telegram_log_message_id ?? undefined,
      customerName: debtRow.customer_name,
      oldDebt: debtRow.remaining_amount,
      paidNow: amount,
      remaining: newRemaining,
      method,
      staffName: auth.name,
    }),
    "logDebtPaid"
  );

  return { debt: mapDebt(updated, (paymentRows ?? []).map(mapDebtPayment)) };
}

// ─── 2) Izoh/muddat yangilash YOKI moliyaviy tuzatish ───────────────────
export interface UpdateDebtArgs {
  debtId: string;
  note?: string;
  dueDate?: string | null;
  /** Berilsa — bu moliyaviy KORREKSIYA (faqat super_admin, `reason` majburiy). */
  originalAmount?: number;
  reason?: string;
}

export async function updateDebtCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: UpdateDebtArgs
): Promise<{ debt: Debt }> {
  const isFinancialCorrection = args.originalAmount !== undefined;

  const { data: debtRow } = await supabase.from("debts").select("*").eq("id", args.debtId).maybeSingle();
  if (!debtRow) throw new ServiceError("Qarz topilmadi", 404);

  const dbPatch: Record<string, unknown> = {};
  if (args.note !== undefined) dbPatch.note = args.note;
  if (args.dueDate !== undefined) dbPatch.due_date = args.dueDate || null;

  if (isFinancialCorrection) {
    if (!args.reason?.trim()) throw new ServiceError("Tuzatish sababi kerak", 400);
    const newOriginal = Math.max(0, Number(args.originalAmount));
    const newRemaining = Math.max(0, newOriginal - debtRow.paid_amount);
    dbPatch.original_amount = newOriginal;
    dbPatch.remaining_amount = newRemaining;
    dbPatch.status = newRemaining <= 0 ? "paid" : "open";
    if (newRemaining <= 0 && debtRow.status !== "paid") dbPatch.closed_at = new Date().toISOString();
    if (newRemaining > 0 && debtRow.status === "paid") dbPatch.closed_at = null;
  }

  const { data: updated, error } = await supabase
    .from("debts")
    .update(dbPatch)
    .eq("id", args.debtId)
    .select("*")
    .maybeSingle();
  if (error || !updated) throw new ServiceError(error?.message ?? "Xatolik", 500);

  if (isFinancialCorrection) {
    await logAudit(
      supabase,
      auth,
      `${debtRow.customer_name} qarzi tuzatildi: ${fmtMoney(debtRow.original_amount)} → ${fmtMoney(updated.original_amount)} so'm (sabab: ${args.reason})`
    );
    // Rule 3 (immutability): strukturaviy, o'chirilmaydigan tuzatish yozuvi.
    await supabase.from("debt_corrections").insert({
      debt_id: args.debtId,
      old_original_amount: debtRow.original_amount,
      new_original_amount: updated.original_amount,
      old_remaining_amount: debtRow.remaining_amount,
      new_remaining_amount: updated.remaining_amount,
      reason: args.reason,
      corrected_by: auth.id,
      corrected_by_name: auth.name,
    });
  }

  const { data: paymentRows } = await supabase
    .from("debt_payments")
    .select("*")
    .eq("debt_id", args.debtId)
    .order("at", { ascending: true });

  return { debt: mapDebt(updated, (paymentRows ?? []).map(mapDebtPayment)) };
}

/** Route wrapper'lar `requireStaff` chaqirishdan OLDIN shu sharqni bilishi
 *  kerak (rol talabini aniqlash uchun) — shuning uchun eksport qilingan. */
export function isDebtFinancialCorrection(body: { originalAmount?: number }): boolean {
  return body.originalAmount !== undefined;
}
