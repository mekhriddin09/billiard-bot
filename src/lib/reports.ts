import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyReportData } from "./telegram-log";
import { getReceivedRevenue, getCashFlow, getOperatingExpenses, getSalaryExpensePaid } from "./finance";

/**
 * Kunlik hisobot — TO'LIQ real Supabase ma'lumotidan hisoblanadi, mock
 * statistika ishlatilmaydi. `business_date` — game_sessions'dagi ustun bilan
 * bir xil ("YYYY-MM-DD", Toshkent biznes kuni, src/lib/permissions.ts'dagi
 * dateKey() bilan izchil).
 *
 * Rule 1 (qulflangan qoida — TUZATILDI): `totalRevenue`/`cashTotal`/
 * `cardTotal` endi `src/lib/finance.ts` (markazlashgan hisob-kitob qatlami)
 * orqali, REAL QABUL QILINGAN pul asosida hisoblanadi — ilgari `final_total`
 * yig'ilar edi, bu esa hali yig'ilmagan qarzni ham "tushum" deb ko'rsatar
 * edi. `billiardRevenue`/`tennisRevenue`/`productsRevenue` — bular "nima
 * SOTILGANI" tarkibiy taqsimoti (session asosida), tushum bilan bir xil
 * "asos"da emas (agar shu kun qarzga yopilgan sessiya bo'lsa, ularning
 * yig'indisi `totalRevenue`dan katta bo'lishi mumkin — bu normal, ikkalasi
 * boshqa-boshqa savolga javob beradi).
 */
export async function computeDailyReport(
  supabase: SupabaseClient,
  businessDate: string
): Promise<DailyReportData> {
  const range = { from: businessDate, to: businessDate };

  const [{ data: sessions }, { data: tables }, receivedRevenue, cashFlow, operatingExpenses, salaryExpense] =
    await Promise.all([
      supabase
        .from("game_sessions")
        .select(
          "id, table_id, customer_id, final_total, final_table_cost, payment_method, paid_amount, debt_amount, cash_amount, card_amount, started_at, ended_at, adjust_minutes"
        )
        .eq("status", "closed")
        .eq("business_date", businessDate),
      supabase.from("club_tables").select("id, name, type"),
      getReceivedRevenue(supabase, range),
      getCashFlow(supabase, range),
      getOperatingExpenses(supabase, range),
      getSalaryExpensePaid(supabase, range),
    ]);

  const tableById = new Map((tables ?? []).map((t) => [t.id, t]));
  const rows = sessions ?? [];

  // billiard/tennis ustunlari FAQAT stol narxini o'z ichiga oladi
  // (final_table_cost) — mahsulotlar alohida qatorda ko'rsatiladi, shuning
  // uchun taxminiy taqsimlash kerak emas, aniq hisoblanadi. Bu — SOTILGAN
  // tarkib, "qabul qilingan tushum" emas (Rule 1 — pastdagi izohga qarang).
  let billiardRevenue = 0;
  let tennisRevenue = 0;
  let debtTotal = 0; // shu kun yaratilgan YANGI qarz — hali yig'ilmagan
  let totalMinutes = 0;
  const customerIds = new Set<string>();
  const revenueByTable = new Map<string, number>();

  for (const s of rows) {
    const total = s.final_total ?? 0;
    const tableCost = s.final_table_cost ?? 0;

    const table = tableById.get(s.table_id);
    if (table?.type === "tennis") tennisRevenue += tableCost;
    else billiardRevenue += tableCost;

    debtTotal += s.debt_amount ?? 0;

    if (s.customer_id) customerIds.add(s.customer_id);
    revenueByTable.set(s.table_id, (revenueByTable.get(s.table_id) ?? 0) + total);

    if (s.ended_at) {
      const mins = Math.max(
        0,
        Math.floor((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000) + s.adjust_minutes
      );
      totalMinutes += mins;
    }
  }

  const totalRevenue = receivedRevenue.total;
  const cashTotal = cashFlow.cashIn;
  const cardTotal = cashFlow.cardIn;
  // Sodda model (2026-08): KETDI = operatingExpenses + salaryExpense
  // (COGS'siz — finance.ts §6b, getSimpleFinanceSummary bilan bir xil formula).
  const totalExpenses = operatingExpenses + salaryExpense;
  const profit = totalRevenue - totalExpenses;

  const sessionIds = rows.map((s) => s.id);
  let productsRevenue = 0;
  if (sessionIds.length > 0) {
    const { data: orderRows } = await supabase
      .from("session_orders")
      .select("price, qty")
      .in("session_id", sessionIds);
    productsRevenue = (orderRows ?? []).reduce((sum, o) => sum + o.price * o.qty, 0);
  }

  const topTables = Array.from(revenueByTable.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tableId, revenue]) => ({ name: tableById.get(tableId)?.name ?? "?", revenue }));

  const { count: newDebtorsCount } = await supabase
    .from("debts")
    .select("id", { count: "exact", head: true })
    .in("session_id", sessionIds.length > 0 ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  return {
    businessDate,
    totalRevenue,
    billiardRevenue,
    tennisRevenue,
    productsRevenue,
    sessionCount: rows.length,
    totalMinutes,
    customerCount: customerIds.size,
    cashTotal,
    cardTotal,
    debtTotal,
    topTables,
    newDebtorsCount: newDebtorsCount ?? 0,
    operatingExpenses,
    salaryExpense,
    totalExpenses,
    profit,
  };
}
