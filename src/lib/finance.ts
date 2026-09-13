import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentMethod } from "./types";

/**
 * ============================================================
 * MARKAZLASHGAN MOLIYAVIY HISOB-KITOB QATLAMI (Rule 12)
 * ============================================================
 *
 * MUHIM OGOHLANTIRISH (Rule 1 — qulflangan qoida):
 * Bu yerdagi hisob-kitoblar BOSHQARUV (management) darajasidagi
 * SODDALASHTIRILGAN model — TO'LIQ yuridik/statutory buxgalteriya
 * tizimi EMAS (soliq, amortizatsiya, QQS va h.k. hisobga olinmagan).
 * Shu sababli har bir natija aniq, xolis nom bilan qaytariladi va UI
 * qatlami ham xuddi shu nomlarni ko'rsatishi kerak:
 *   - "Real qabul qilingan tushum" (receivedRevenue)
 *   - "COGS" (sotilgan mahsulot tannarxi)
 *   - "Yalpi foyda" (grossProfit)
 *   - "Operatsion xarajat" (operatingExpenses)
 *   - "Oylik xarajati" (salaryExpense)
 *   - "TAXMINIY sof foyda" (estimatedNetProfit) — hech qachon shunchaki
 *     "sof foyda" yoki "aniq foyda" deb ko'rsatilmasin.
 *
 * QOIDA (Rule 12): bitta formula — bitta joy. API route'lar/UI bu
 * funksiyalarni chaqiradi, hech qachon formulani o'zi qayta yozmaydi.
 *
 * QOIDA (Rule 2 — Cash flow ≠ Profit):
 * Inventar xaridi haqiqiy to'langanda CASH FLOW'ni kamaytiradi, lekin
 * COGS'ga sotilmaguncha KIRMAYDI. Masalan 100 dona Coca-Cola 900 000
 * so'mga olinsa: cash flow -900 000, ombor +100, COGS shu paytda 0.
 * 10 tasi sotilganda: COGS = 10 × sotib olingan paytdagi tannarx.
 *
 * DATA MODEL ESLATMASI: revenue "qabul qilingan" (cash-basis) — agar 3
 * hafta oldingi qarz BUGUN to'lansa, bu pul BUGUNGI davrga hisoblanadi
 * (qarz yaratilgan kunga emas). COGS esa SOTUV kuniga bog'liq (session
 * yopilgan business_date) — bu qasddan tanlangan aralash yondashuv,
 * chunki COGS "nima sotilgani"ni, tushum esa "qachon pul kelgani"ni
 * ifodalaydi. Ikkalasi ham ayni bir davr uchun hisoblanadi, lekin
 * kontseptual jihatdan bir xil "asos" (basis)da emasligini bilib
 * turish kerak — shuning uchun labellar shart.
 */

const CLUB_TZ_OFFSET = "+05:00"; // Asia/Tashkent — doimiy, DST yo'q

export interface DateRange {
  /** "YYYY-MM-DD", ikkalasi ham chegara ICHIDA (inclusive) */
  from: string;
  to: string;
}

function tashkentDayStartUTC(dateStr: string): string {
  return `${dateStr}T00:00:00${CLUB_TZ_OFFSET}`;
}

/** Berilgan "YYYY-MM-DD" kunidan KEYINGI kun 00:00 (Tashkent) — exclusive yuqori chegara. */
function tashkentDayEndExclusiveUTC(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00${CLUB_TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function daysBetweenDateStrings(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// ─── Naqd/karta bo'linishini bitta formula orqali hisoblash ────────────
function splitCashCard(row: {
  paymentMethod: PaymentMethod;
  amount: number;
  cashAmount?: number | null;
  cardAmount?: number | null;
}): { cash: number; card: number } {
  if (row.paymentMethod === "cash") return { cash: row.amount, card: 0 };
  if (row.paymentMethod === "card") return { cash: 0, card: row.amount };
  return { cash: row.cashAmount ?? 0, card: row.cardAmount ?? 0 };
}

// ============================================================
// 1) REAL QABUL QILINGAN TUSHUM (Rule 1)
// ============================================================
export interface ReceivedRevenue {
  /** Sessiya yopilganda darhol olingan naqd+karta (qarz qismisiz) */
  fromSessions: number;
  /** Davr ICHIDA yig'ilgan qarz to'lovlari — qarzning yaratilgan kuni
   *  emas, TO'LANGAN kuni bo'yicha (cash-basis) */
  fromDebtPayments: number;
  /** Davr ichida chiqarilgan qaytarimlar — tushumdan ayiriladi */
  refunded: number;
  /** = fromSessions + fromDebtPayments - refunded. Label: "Real qabul qilingan tushum" */
  total: number;
}

export async function getReceivedRevenue(supabase: SupabaseClient, range: DateRange): Promise<ReceivedRevenue> {
  const [{ data: sessions }, { data: debtPayments }, { data: refunds }] = await Promise.all([
    supabase
      .from("game_sessions")
      .select("paid_amount")
      .eq("status", "closed")
      .gte("business_date", range.from)
      .lte("business_date", range.to),
    supabase
      .from("debt_payments")
      .select("amount, at")
      .gte("at", tashkentDayStartUTC(range.from))
      .lt("at", tashkentDayEndExclusiveUTC(range.to)),
    supabase.from("refunds").select("amount").gte("business_date", range.from).lte("business_date", range.to),
  ]);

  const fromSessions = (sessions ?? []).reduce((sum, s) => sum + (s.paid_amount ?? 0), 0);
  const fromDebtPayments = (debtPayments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const refunded = (refunds ?? []).reduce((sum, r) => sum + r.amount, 0);

  return {
    fromSessions,
    fromDebtPayments,
    refunded,
    total: fromSessions + fromDebtPayments - refunded,
  };
}

// ============================================================
// 2) COGS — session_orders.unit_cost_at_sale suratga olingan barcha
//    qatorlar bo'yicha (2026-08'dan — trackInventory'dan MUSTAQIL, admin
//    Sozlamalar'da to'g'ridan-to'g'ri kiritgan "original/tannarx narxi"
//    ham shu yerga kiradi, qarang: inventory-ops.ts#snapshotUnitCostAtSale)
// ============================================================
export interface CogsResult {
  /** Label: "COGS" — sotilgan mahsulotlarning suratga olingan tannarxi yig'indisi */
  total: number;
  /** Nechta buyurtma qatori hisobga olindi (diagnostika uchun) */
  lineCount: number;
}

export async function getCOGS(supabase: SupabaseClient, range: DateRange): Promise<CogsResult> {
  const { data: sessions } = await supabase
    .from("game_sessions")
    .select("id")
    .eq("status", "closed")
    .gte("business_date", range.from)
    .lte("business_date", range.to);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { total: 0, lineCount: 0 };

  const { data: orders } = await supabase
    .from("session_orders")
    .select("qty, unit_cost_at_sale")
    .in("session_id", sessionIds)
    .not("unit_cost_at_sale", "is", null);

  const rows = orders ?? [];
  const total = rows.reduce((sum, o) => sum + (o.unit_cost_at_sale ?? 0) * o.qty, 0);
  return { total, lineCount: rows.length };
}

// ============================================================
// 3) YALPI FOYDA = Real qabul qilingan tushum − COGS
// ============================================================
export interface GrossProfitResult {
  receivedRevenue: number;
  cogs: number;
  /** Label: "Yalpi foyda" */
  grossProfit: number;
}

export async function getGrossProfit(supabase: SupabaseClient, range: DateRange): Promise<GrossProfitResult> {
  const [revenue, cogs] = await Promise.all([getReceivedRevenue(supabase, range), getCOGS(supabase, range)]);
  return {
    receivedRevenue: revenue.total,
    cogs: cogs.total,
    grossProfit: revenue.total - cogs.total,
  };
}

// ============================================================
// 4) OPERATSION XARAJAT — expenses jadvalidan (tuzatish yozuvlari
//    manfiy summa bilan avtomatik netto bo'ladi)
// ============================================================
export async function getOperatingExpenses(supabase: SupabaseClient, range: DateRange): Promise<number> {
  const { data } = await supabase
    .from("expenses")
    .select("amount")
    .gte("business_date", range.from)
    .lte("business_date", range.to);
  return (data ?? []).reduce((sum, e) => sum + e.amount, 0);
}

// ============================================================
// 5) OYLIK XARAJATI — davr ichida HAQIQATDA TO'LANGAN summa
//    (cash-basis; accrual holati uchun getSalaryStatus() ishlatiladi)
// ============================================================
export async function getSalaryExpensePaid(supabase: SupabaseClient, range: DateRange): Promise<number> {
  const { data } = await supabase
    .from("salary_payments")
    .select("amount")
    .gte("business_date", range.from)
    .lte("business_date", range.to);
  return (data ?? []).reduce((sum, p) => sum + p.amount, 0);
}

/** Bitta xodim, bitta oy uchun: hisoblangan / to'langan / qoldiq. */
export async function getSalaryStatus(
  supabase: SupabaseClient,
  staffId: string,
  periodMonth: string
): Promise<{ accrued: number; paid: number; remaining: number }> {
  const [{ data: staffRow }, { data: payments }] = await Promise.all([
    supabase.from("staff").select("monthly_salary").eq("id", staffId).maybeSingle(),
    supabase.from("salary_payments").select("amount").eq("staff_id", staffId).eq("period_month", periodMonth),
  ]);
  const accrued = staffRow?.monthly_salary ?? 0;
  const paid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  return { accrued, paid, remaining: accrued - paid };
}

// ============================================================
// 6) TAXMINIY SOF FOYDA (Rule 1 — hech qachon "aniq" deyilmaydi)
// ============================================================
export interface EstimatedNetProfitResult {
  receivedRevenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  salaryExpense: number;
  /** Label: "TAXMINIY sof foyda" */
  estimatedNetProfit: number;
  disclaimer: string;
}

export const PROFIT_DISCLAIMER =
  "Bu — boshqaruv darajasidagi soddalashtirilgan hisob-kitob, to'liq yuridik/statutory buxgalteriya emas.";

export async function getEstimatedNetProfit(
  supabase: SupabaseClient,
  range: DateRange
): Promise<EstimatedNetProfitResult> {
  const [gp, operatingExpenses, salaryExpense] = await Promise.all([
    getGrossProfit(supabase, range),
    getOperatingExpenses(supabase, range),
    getSalaryExpensePaid(supabase, range),
  ]);
  return {
    receivedRevenue: gp.receivedRevenue,
    cogs: gp.cogs,
    grossProfit: gp.grossProfit,
    operatingExpenses,
    salaryExpense,
    estimatedNetProfit: gp.grossProfit - operatingExpenses - salaryExpense,
    disclaimer: PROFIT_DISCLAIMER,
  };
}

// ============================================================
// 6b) SODDA MODEL — KELDI / KETDI / FOYDA (cash-basis, COGS'siz)
// ============================================================
/**
 * Klub egasi uchun STANDART, birinchi darajali ko'rsatkich (2026-08
 * "Finance Simplification" so'rovi bilan qo'shilgan). COGS QASDDAN
 * chiqarib tashlangan — bu modelda ombor xaridi (masalan "Colaga 300
 * ming ketdi") ALLAQACHON oddiy `expenses` yozuvi sifatida KETDI'ga
 * kiradi; agar COGS ham ayirilsa, xarid xarajati IKKI MARTA hisobga
 * olinadi (xarid paytida VA sotuv paytida). Shuning uchun:
 *
 *   KETDI = operatsion xarajat (expenses) + to'langan oylik
 *   FOYDA = Real qabul qilingan tushum (KELDI) − KETDI
 *
 * Bu — getEstimatedNetProfit()ning O'RNIGA EMAS, balki UNGA QO'SHIMCHA
 * sodda ko'rsatkich (Rule 12 bilan bir xil tamoyil: bitta formula —
 * bitta joy, hech qachon UI/AI o'zi qayta hisoblamaydi). COGS-asosli
 * batafsil ("Yalpi foyda"/"Taxminiy sof foyda") model kerak bo'lganda
 * hamon getEstimatedNetProfit() ishlatiladi — masalan trackInventory
 * yoqilgan mahsulotlar uchun aniqroq tahlil kerak bo'lsa.
 */
export interface SimpleFinanceSummary {
  /** Label: "KELDI" — getReceivedRevenue().total bilan bir xil */
  received: number;
  /** Label: "KETDI" = operatingExpenses + salaryExpense */
  spent: number;
  operatingExpenses: number;
  salaryExpense: number;
  /** Label: "FOYDA" = received − spent */
  profit: number;
}

export async function getSimpleFinanceSummary(supabase: SupabaseClient, range: DateRange): Promise<SimpleFinanceSummary> {
  const [revenue, operatingExpenses, salaryExpense] = await Promise.all([
    getReceivedRevenue(supabase, range),
    getOperatingExpenses(supabase, range),
    getSalaryExpensePaid(supabase, range),
  ]);
  const spent = operatingExpenses + salaryExpense;
  return {
    received: revenue.total,
    spent,
    operatingExpenses,
    salaryExpense,
    profit: revenue.total - spent,
  };
}

// ============================================================
// 7) CASH FLOW (naqd/karta oqimi — Rule 2: bu PROFIT emas)
// ============================================================
export interface CashFlowResult {
  cashIn: number;
  cardIn: number;
  cashOut: number;
  cardOut: number;
  netCash: number;
  netCard: number;
  /** "Aralash" usulidagi qarz to'lovlari — debt_payments jadvalida
   *  naqd/karta bo'linishi saqlanmaydi, shuning uchun bu summa jami
   *  ichida bor, lekin cash/card split'ga kiritilmagan (bilinadigan
   *  cheklov — pastdagi "Taxminlar" bo'limiga qarang). */
  unsplitMixedDebtPayments: number;
}

export async function getCashFlow(supabase: SupabaseClient, range: DateRange): Promise<CashFlowResult> {
  const [{ data: sessions }, { data: debtPayments }, { data: expenses }, { data: purchases }, { data: salaries }, { data: refunds }] =
    await Promise.all([
      supabase
        .from("game_sessions")
        .select("payment_method, paid_amount, cash_amount, card_amount")
        .eq("status", "closed")
        .gte("business_date", range.from)
        .lte("business_date", range.to),
      supabase
        .from("debt_payments")
        .select("amount, method")
        .gte("at", tashkentDayStartUTC(range.from))
        .lt("at", tashkentDayEndExclusiveUTC(range.to)),
      supabase
        .from("expenses")
        .select("amount, payment_method, cash_amount, card_amount")
        .gte("business_date", range.from)
        .lte("business_date", range.to),
      supabase
        .from("inventory_purchases")
        .select("total_cost, payment_method, cash_amount, card_amount")
        .gte("business_date", range.from)
        .lte("business_date", range.to),
      supabase
        .from("salary_payments")
        .select("amount, payment_method, cash_amount, card_amount")
        .gte("business_date", range.from)
        .lte("business_date", range.to),
      supabase
        .from("refunds")
        .select("amount, payment_method, cash_amount, card_amount")
        .gte("business_date", range.from)
        .lte("business_date", range.to),
    ]);

  let cashIn = 0;
  let cardIn = 0;
  for (const s of sessions ?? []) {
    const { cash, card } = splitCashCard({
      paymentMethod: (s.payment_method ?? "cash") as PaymentMethod,
      amount: s.paid_amount ?? 0,
      cashAmount: s.cash_amount,
      cardAmount: s.card_amount,
    });
    cashIn += cash;
    cardIn += card;
  }

  let unsplitMixedDebtPayments = 0;
  for (const p of debtPayments ?? []) {
    if (p.method === "cash") cashIn += p.amount;
    else if (p.method === "card") cardIn += p.amount;
    else unsplitMixedDebtPayments += p.amount; // "mixed" — split saqlanmagan (schema cheklovi)
  }

  let cashOut = 0;
  let cardOut = 0;
  for (const rows of [expenses ?? [], purchases ?? [], salaries ?? [], refunds ?? []]) {
    for (const r of rows as any[]) {
      const amount = "total_cost" in r ? r.total_cost : r.amount;
      const { cash, card } = splitCashCard({
        paymentMethod: r.payment_method as PaymentMethod,
        amount,
        cashAmount: r.cash_amount,
        cardAmount: r.card_amount,
      });
      cashOut += cash;
      cardOut += card;
    }
  }

  return {
    cashIn,
    cardIn,
    cashOut,
    cardOut,
    netCash: cashIn - cashOut,
    netCard: cardIn - cardOut,
    unsplitMixedDebtPayments,
  };
}

// ============================================================
// 8) OMBOR — og'irlik-o'rtacha (weighted average) tannarx
// ============================================================

/**
 * Yangi xarid kelganda mahsulotning joriy tannarxini qayta hisoblaydi.
 * Sof funksiya — DB'ga tegmaydi, chaqiruvchi natijani UPDATE qiladi.
 */
export function computeWeightedAverageCost(
  currentStockQty: number,
  currentUnitCost: number,
  purchaseQty: number,
  purchaseUnitCost: number
): number {
  const newQty = currentStockQty + purchaseQty;
  if (newQty <= 0) return purchaseUnitCost;
  return Math.round((currentStockQty * currentUnitCost + purchaseQty * purchaseUnitCost) / newQty);
}

/**
 * Mahsulot sotilganda: qancha ombordan kamayishi va sotuv paytidagi
 * (suratga olinadigan) tannarx qancha bo'lishi kerakligini hisoblaydi.
 * Sof funksiya — DB'ga tegmaydi.
 */
export function consumeInventoryOnSale(
  currentStockQty: number,
  currentUnitCost: number,
  qtySold: number
): { newStockQty: number; unitCostAtSale: number } {
  return {
    newStockQty: Math.max(0, currentStockQty - qtySold),
    unitCostAtSale: currentUnitCost,
  };
}

// ============================================================
// 9) QARZ ESKIRISHI (aging) — Finance/Reports UI uchun
// ============================================================
export interface DebtAgingBuckets {
  d0_1: number;
  d2_7: number;
  d8_30: number;
  d31plus: number;
  totalOpen: number;
}

/**
 * Ochiq qarzlarni muddat bo'yicha guruhlaydi. Muddat (due_date) bo'lsa
 * shundan, bo'lmasa yaratilgan kunidan hisoblanadi (taxminiy — buxgalter
 * emas, operatsion signal sifatida).
 */
export async function getDebtAgingBuckets(supabase: SupabaseClient, asOfDate: string): Promise<DebtAgingBuckets> {
  const { data: debts } = await supabase.from("debts").select("remaining_amount, due_date, created_at").eq("status", "open");

  const buckets: DebtAgingBuckets = { d0_1: 0, d2_7: 0, d8_30: 0, d31plus: 0, totalOpen: 0 };
  for (const d of debts ?? []) {
    const anchor: string = d.due_date ?? String(d.created_at).slice(0, 10);
    const days = Math.max(0, daysBetweenDateStrings(anchor, asOfDate));
    const amount = d.remaining_amount ?? 0;
    buckets.totalOpen += amount;
    if (days <= 1) buckets.d0_1 += amount;
    else if (days <= 7) buckets.d2_7 += amount;
    else if (days <= 30) buckets.d8_30 += amount;
    else buckets.d31plus += amount;
  }
  return buckets;
}
