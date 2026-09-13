import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { computeDailyReport } from "@/lib/reports";
import { logDailyReport, logDebtDueReminder, logDebtOverdueReminder } from "@/lib/telegram-log";
import { todayKey } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import type { DebtReminderPolicy } from "@/lib/types";

/**
 * Bitta kunlik cron (Vercel Hobby tarifi — kuniga faqat 1 marta, aniq
 * daqiqasi kafolatlanmaydi). Ikkala vazifani ham shu yerda bajaradi:
 *  1) Kunlik hisobot — o'tgan, hali yuborilmagan biznes kunlari uchun
 *     (o'z-o'zini tuzatadigan: agar bir kun cron ishlamasa, keyingi
 *     ishga tushishda o'sha kunni ham topib yuboradi).
 *  2) Qarz eslatmalari — muddati bugun/o'tgan ochiq qarzlar uchun.
 *
 * docs/PHASE2_TELEGRAM_DEBT_PLAN.md — 6-bo'lim (Vercel tarifi qarori).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const results = { dailyReports: 0, dueReminders: 0, overdueReminders: 0 };

  // ─── 1) Kunlik hisobot(lar) ───────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from("club_settings")
    .select("daily_report_enabled, debt_reminder_policy")
    .eq("id", 1)
    .maybeSingle();

  if (settingsRow?.daily_report_enabled !== false) {
    const today = todayKey();
    const [{ data: sentRows }, { data: dateRows }] = await Promise.all([
      supabase.from("daily_reports_sent").select("business_date"),
      supabase.from("game_sessions").select("business_date").eq("status", "closed").lt("business_date", today),
    ]);
    const sentSet = new Set((sentRows ?? []).map((r) => r.business_date));
    const uniqueDates = Array.from(new Set((dateRows ?? []).map((r) => r.business_date))).sort();
    const pending = uniqueDates.filter((d) => !sentSet.has(d)).slice(0, 5);

    for (const businessDate of pending) {
      const report = await computeDailyReport(supabase, businessDate);
      const messageId = await logDailyReport(supabase, report);
      await supabase.from("daily_reports_sent").insert({
        business_date: businessDate,
        telegram_message_id: messageId,
        total_revenue: report.totalRevenue,
      });
      results.dailyReports += 1;
    }
  }

  // ─── 2) Qarz eslatmalari ────────────────────────────────────────────
  const policy: DebtReminderPolicy = settingsRow?.debt_reminder_policy ?? {
    dueDateReminder: true,
    overdueReminder: true,
    overdueRepeatDays: 3,
    dailyReminder: false,
  };

  if (policy.dueDateReminder || policy.overdueReminder) {
    const [{ data: openDebts }, { data: tables }] = await Promise.all([
      supabase.from("debts").select("*").eq("status", "open").not("due_date", "is", null),
      supabase.from("club_tables").select("id, name"),
    ]);
    const tableById = new Map((tables ?? []).map((t) => [t.id, t.name]));
    const today = todayKey();
    const now = new Date();

    for (const debt of openDebts ?? []) {
      const dueDate: string = debt.due_date;
      const diffDays = daysBetweenDateStrings(dueDate, today);

      if (diffDays === 0 && policy.dueDateReminder) {
        const alreadyToday = debt.last_reminder_stage === "due_date" && sameDay(debt.last_reminder_at, now);
        if (!alreadyToday) {
          await logDebtDueReminder(supabase, {
            replyToMessageId: debt.telegram_log_message_id ?? undefined,
            customerName: debt.customer_name,
            customerPhone: debt.customer_phone ?? undefined,
            amount: debt.remaining_amount,
            tableName: debt.table_id ? tableById.get(debt.table_id) : undefined,
            sessionDate: fmtDate(new Date(debt.created_at).getTime()),
            note: debt.note ?? undefined,
          });
          await supabase
            .from("debts")
            .update({ last_reminder_stage: "due_date", last_reminder_at: now.toISOString() })
            .eq("id", debt.id);
          results.dueReminders += 1;
        }
      } else if (diffDays > 0 && policy.overdueReminder) {
        const daysSinceLast = debt.last_reminder_at ? daysBetweenDates(new Date(debt.last_reminder_at), now) : Infinity;
        if (daysSinceLast >= policy.overdueRepeatDays) {
          await logDebtOverdueReminder(supabase, {
            replyToMessageId: debt.telegram_log_message_id ?? undefined,
            customerName: debt.customer_name,
            amount: debt.remaining_amount,
            dueDate,
            daysOverdue: diffDays,
          });
          await supabase
            .from("debts")
            .update({ last_reminder_stage: "overdue", last_reminder_at: now.toISOString() })
            .eq("id", debt.id);
          results.overdueReminders += 1;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

/** "YYYY-MM-DD" ikkita sanani solishtiradi: b - a, kunlarda. */
function daysBetweenDateStrings(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

function daysBetweenDates(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function sameDay(isoOrNull: string | null, now: Date): boolean {
  if (!isoOrNull) return false;
  const d = new Date(isoOrNull);
  return d.toDateString() === now.toDateString();
}
