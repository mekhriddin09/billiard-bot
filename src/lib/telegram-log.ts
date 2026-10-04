import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "./telegram-bot";
import { fmtDate, fmtDurationMin, fmtHM, fmtMoney, maskPhone } from "./format";
import type { PaymentMethod, PaymentStatus } from "./types";

/**
 * Har bir funksiya: (1) log kanal yoqilgan/ulanganmi tekshiradi, (2) matnni
 * quradi, (3) yuboradi, (4) birinchi xabar bo'lsa message_id'ni tegishli
 * qatorga yozadi (thread uchun). Hech qachon throw qilmaydi — chaqiruvchi
 * route har doim try/catch bilan o'raydi, lekin bu yerda ham himoyalanadi.
 */

/**
 * 2026-08 performance audit: Telegram log chaqiruvlari (tarmoq so'rovi —
 * eng sekin, o'zgaruvchan qism) ASOSIY amalning (stol ochish/yopish,
 * mahsulot qo'shish, to'lov) javob vaqtiga endi TA'SIR QILMAYDI — chaqiruvchi
 * (`sessions.ts`/`debts.ts`/`finance-actions.ts`) bu funksiyani AWAIT
 * QILMASDAN chaqiradi, natija fonda kutiladi. Xato bo'lsa faqat server
 * konsoliga yoziladi — Telegram bildirishnomasi yo'qolishi mumkin bo'lgan
 * YAGONA holat, lekin asosiy operatsiya (DB yozuvi, audit) hech qachon
 * bunga bog'liq emas (Supabase — yagona haqiqat manbai, Telegram — faqat
 * bildirishnoma qatlami).
 */
export function bestEffort(p: Promise<unknown>, label: string): void {
  p.catch((e) => console.error(`[telegram-log] ${label} — fon xatosi (asosiy amalga ta'sir qilmadi):`, e));
}

interface LogChannel {
  channelId: string;
}

export async function getLogChannel(supabase: SupabaseClient): Promise<LogChannel | null> {
  try {
    const { data } = await supabase
      .from("club_settings")
      .select("telegram_log_channel_id, telegram_log_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (!data?.telegram_log_enabled || !data?.telegram_log_channel_id) return null;
    return { channelId: data.telegram_log_channel_id as string };
  } catch {
    return null;
  }
}

/**
 * 2-Telegram kanal — "Super Admin Alert" (faqat moliyaviy voqealar).
 * HOZIRCHA `super_admin_alert_enabled` sozlamada har doim false (foydalanuvchi
 * so'rovi bo'yicha keyingi sessiyaga qoldirilgan) — shuning uchun bu funksiya
 * hozircha doim `null` qaytaradi va hech qanday xabar yubormaydi. Kod TAYYOR
 * turibdi: kanal keyinroq Sozlamalar orqali yoqilsa, qo'shimcha kod
 * o'zgarishisiz avtomatik ishga tushadi.
 */
export async function getSuperAdminAlertChannel(supabase: SupabaseClient): Promise<LogChannel | null> {
  try {
    const { data } = await supabase
      .from("club_settings")
      .select("super_admin_alert_channel_id, super_admin_alert_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (!data?.super_admin_alert_enabled || !data?.super_admin_alert_channel_id) return null;
    return { channelId: data.super_admin_alert_channel_id as string };
  } catch {
    return null;
  }
}

/**
 * Moliyaviy voqea — ikkala kanalga ham (Audit + Super Admin Alert, ikkinchisi
 * yoqilgan bo'lsa) yuboradi. Chaqiruvchi natijadagi ikkita message_id'ni
 * o'z jadvaliga (telegram_log_message_id / telegram_alert_message_id)
 * yozib qo'yishi kerak — Rule 4: shu maydonlar to'ldirilgan bo'lsa, bir xil
 * moliyaviy voqea uchun ikkinchi marta alert yuborilmaydi (chaqiruvchi
 * route buni client_request_id orqali allaqachon oldini oladi).
 */
export async function sendFinanceEvent(
  supabase: SupabaseClient,
  text: string
): Promise<{ auditMessageId?: number; alertMessageId?: number }> {
  const [audit, alert] = await Promise.all([getLogChannel(supabase), getSuperAdminAlertChannel(supabase)]);
  const result: { auditMessageId?: number; alertMessageId?: number } = {};
  if (audit) {
    const res = await sendMessage(audit.channelId, text);
    if (res.ok) result.auditMessageId = res.messageId;
  }
  if (alert) {
    const res = await sendMessage(alert.channelId, text);
    if (res.ok) result.alertMessageId = res.messageId;
  }
  return result;
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Naqd",
  card: "Karta",
  mixed: "Aralash (naqd+karta)",
};

function joinLines(lines: Array<string | false | undefined>): string {
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

// ─── SESSIYA OCHILDI ────────────────────────────────────────────────────
export async function logSessionStarted(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    tableName: string;
    customerName?: string;
    customerPhone?: string;
    startedAt: number;
    staffName: string;
    pricePerHour: number;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "🎱 <b>SESSIYA OCHILDI</b>",
    "",
    `Stol: ${params.tableName}`,
    params.customerName ? `Mijoz: ${params.customerName}` : undefined,
    params.customerPhone ? `Telefon: ${maskPhone(params.customerPhone)}` : undefined,
    "",
    "🕐 Boshlanish:",
    `${fmtDate(params.startedAt)} — ${fmtHM(params.startedAt)}`,
    "",
    "👨‍💼 Operator:",
    params.staffName,
    "",
    "💰 Tarif:",
    `${fmtMoney(params.pricePerHour)} so'm / soat`,
  ]);

  const res = await sendMessage(channel.channelId, text);
  if (res.ok && res.messageId) {
    await supabase
      .from("game_sessions")
      .update({ telegram_log_message_id: res.messageId })
      .eq("id", params.sessionId);
  }
}

// ─── BILDIRISHNOMA (admin qo'lda o'rnatgan eslatma) ────────────────────
// 2026-10 — sessiya ochilgandan boshlab belgilangan daqiqa o'tgach bitta
// marta yuboriladi (stolni yopmaydi). Sessiya ochilgan xabariga REPLY
// qilib yuboriladi (replyToMessageId bo'lsa) — xuddi boshqa thread'langan
// voqealar kabi.
export async function logSessionReminder(
  supabase: SupabaseClient,
  params: {
    tableName: string;
    durationLabel: string;
    replyToMessageId?: number;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = `⏰ ${params.tableName} uchun ${params.durationLabel} vaqti bo'ldi`;
  await sendMessage(channel.channelId, text, { replyToMessageId: params.replyToMessageId });
}

// ─── MAHSULOT QO'SHILDI ─────────────────────────────────────────────────
export async function logProductAdded(
  supabase: SupabaseClient,
  params: {
    replyToMessageId?: number;
    tableName: string;
    productEmoji: string;
    productName: string;
    qty: number;
    lineTotal: number;
    staffName: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "🍹 <b>MAHSULOT QO'SHILDI</b>",
    "",
    `Stol ${params.tableName}`,
    `${params.productEmoji} ${params.productName} ×${params.qty}`,
    `${fmtMoney(params.lineTotal)} so'm`,
    "",
    `👨‍💼 ${params.staffName}`,
  ]);

  await sendMessage(channel.channelId, text, {
    replyToMessageId: params.replyToMessageId,
  });
}

// ─── SESSIYA YOPILDI ────────────────────────────────────────────────────
export async function logSessionClosed(
  supabase: SupabaseClient,
  params: {
    replyToMessageId?: number;
    tableName: string;
    customerName?: string;
    startedAt: number;
    endedAt: number;
    minutes: number;
    tableCost: number;
    orders: { emoji: string; name: string; qty: number; price: number }[];
    total: number;
    paymentMethod: PaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    paymentStatus: PaymentStatus;
    paidAmount: number;
    debtAmount: number;
    staffName: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const paymentLine =
    params.paymentMethod === "mixed"
      ? `${PAYMENT_METHOD_LABEL.mixed} (naqd ${fmtMoney(params.cashAmount ?? 0)} + karta ${fmtMoney(params.cardAmount ?? 0)})`
      : PAYMENT_METHOD_LABEL[params.paymentMethod];

  const text = joinLines([
    "🔴 <b>SESSIYA YOPILDI</b>",
    "",
    `🎱 Stol ${params.tableName}`,
    params.customerName ? `👤 ${params.customerName}` : undefined,
    `🕐 ${fmtHM(params.startedAt)} — ${fmtHM(params.endedAt)}`,
    `⏱ ${fmtDurationMin(params.minutes)}`,
    "",
    "🎱 Billiard:",
    `${fmtMoney(params.tableCost)} so'm`,
    params.orders.length > 0 ? "" : undefined,
    params.orders.length > 0 ? "🍹 Mahsulotlar:" : undefined,
    ...params.orders.map((o) => `${o.emoji} ${o.name} ×${o.qty} — ${fmtMoney(o.price * o.qty)}`),
    "",
    "💰 JAMI:",
    `${fmtMoney(params.total)} so'm`,
    "",
    "💳 To'lov:",
    paymentLine,
    params.paymentStatus !== "paid"
      ? `⚠️ ${params.paymentStatus === "partial" ? "Qisman to'landi" : "Qarzga yozildi"} — to'landi ${fmtMoney(params.paidAmount)}, qarz ${fmtMoney(params.debtAmount)}`
      : undefined,
    "",
    "👨‍💼 Yopdi:",
    params.staffName,
  ]);

  await sendMessage(channel.channelId, text, {
    replyToMessageId: params.replyToMessageId,
  });
}

// ─── QARZ QAYD ETILDI ───────────────────────────────────────────────────
export async function logDebtCreated(
  supabase: SupabaseClient,
  params: {
    debtId: string;
    replyToMessageId?: number;
    customerName: string;
    customerPhone?: string;
    amount: number;
    dueDate?: string;
    note?: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "⚠️ <b>QARZ QAYD ETILDI</b>",
    "",
    `👤 ${params.customerName}`,
    params.customerPhone ? `📱 ${maskPhone(params.customerPhone)}` : undefined,
    "",
    "💰 Qarz:",
    `${fmtMoney(params.amount)} so'm`,
    params.dueDate
      ? joinLines(["", "📅 To'lash muddati:", params.dueDate])
      : undefined,
    params.note ? joinLines(["", "📝 Izoh:", `"${params.note}"`]) : undefined,
  ]);

  const res = await sendMessage(channel.channelId, text, {
    replyToMessageId: params.replyToMessageId,
  });
  if (res.ok && res.messageId) {
    await supabase.from("debts").update({ telegram_log_message_id: res.messageId }).eq("id", params.debtId);
  }
}

// ─── QARZ TO'LANDI ──────────────────────────────────────────────────────
export async function logDebtPaid(
  supabase: SupabaseClient,
  params: {
    replyToMessageId?: number;
    customerName: string;
    oldDebt: number;
    paidNow: number;
    remaining: number;
    method: PaymentMethod;
    staffName: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    remaining0(params.remaining) ? "✅ <b>QARZ TO'LANDI</b>" : "💵 <b>QARZ QISMAN TO'LANDI</b>",
    "",
    `👤 ${params.customerName}`,
    "",
    "Eski qarz:",
    `${fmtMoney(params.oldDebt)} so'm`,
    "To'landi:",
    `${fmtMoney(params.paidNow)} so'm`,
    "Qoldi:",
    `${fmtMoney(params.remaining)} so'm`,
    "",
    `💳 ${PAYMENT_METHOD_LABEL[params.method]}`,
    `👨‍💼 ${params.staffName}`,
  ]);

  await sendMessage(channel.channelId, text, {
    replyToMessageId: params.replyToMessageId,
  });
}

function remaining0(remaining: number) {
  return remaining <= 0;
}

// ─── BOG'LANISH SO'ROVI (mijoz telefon qoldirdi) ────────────────────────
/**
 * 2026-08 — "Oldindan bron" avtomatik hold/deposit'dan "Bog'lanish
 * so'rovi"ga TO'LIQ ALMASHTIRILDI. Mijoz stol uchun telefon raqamini
 * qoldirganda darhol shu xabar boradi — admin qo'ng'iroq qilishi kerak.
 */
export async function logReservationRequestCreated(
  supabase: SupabaseClient,
  params: {
    tableName: string;
    customerName?: string;
    customerPhone: string;
    note?: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "📞 <b>BOG'LANISH SO'ROVI</b>",
    "",
    `🎱 Stol ${params.tableName}`,
    params.customerName ? `👤 ${params.customerName}` : undefined,
    `📱 ${params.customerPhone}`,
    params.note ? joinLines(["", "📝 Izoh:", `"${params.note}"`]) : undefined,
    "",
    "Mijozga qo'ng'iroq qilib, bron kelishilsin.",
  ]);

  await sendMessage(channel.channelId, text);
}

// ─── QARZ ESLATMASI (muddat bugun) ──────────────────────────────────────
export async function logDebtDueReminder(
  supabase: SupabaseClient,
  params: {
    replyToMessageId?: number;
    customerName: string;
    customerPhone?: string;
    amount: number;
    tableName?: string;
    sessionDate?: string;
    note?: string;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "⚠️ <b>QARZ ESLATMASI</b>",
    "Bugun to'lanishi kerak:",
    "",
    `👤 ${params.customerName}`,
    params.customerPhone ? `📱 ${maskPhone(params.customerPhone)}` : undefined,
    `💰 ${fmtMoney(params.amount)} so'm`,
    params.tableName ? `🎱 Stol ${params.tableName}` : undefined,
    params.sessionDate ? `📅 Sessiya: ${params.sessionDate}` : undefined,
    params.note ? `📝 "${params.note}"` : undefined,
  ]);

  await sendMessage(channel.channelId, text, { replyToMessageId: params.replyToMessageId });
}

// ─── MUDDATI O'TGAN QARZ ────────────────────────────────────────────────
export async function logDebtOverdueReminder(
  supabase: SupabaseClient,
  params: {
    replyToMessageId?: number;
    customerName: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
  }
) {
  const channel = await getLogChannel(supabase);
  if (!channel) return;

  const text = joinLines([
    "🔴 <b>MUDDATI O'TGAN QARZ</b>",
    "",
    `👤 ${params.customerName}`,
    `💰 ${fmtMoney(params.amount)} so'm`,
    "📅 Muddat:",
    params.dueDate,
    `⏰ ${params.daysOverdue} kun o'tgan`,
  ]);

  await sendMessage(channel.channelId, text, { replyToMessageId: params.replyToMessageId });
}

// ─── KUNLIK HISOBOT ─────────────────────────────────────────────────────
/**
 * Rule 1 (qulflangan qoida): `totalRevenue` (= KELDI) — REAL QABUL QILINGAN
 * tushum (cash-basis: sessiyadan darhol olingan + shu kun ichida yig'ilgan
 * qarz to'lovlari − qaytarimlar). Hali yig'ilmagan qarz BU YERGA KIRMAYDI —
 * shuning uchun `debtTotal` alohida, "yangi qarz" sifatida ko'rsatiladi.
 *
 * 2026-08 "Finance Simplification": `profit` (= FOYDA) endi SODDA cash-basis
 * model — `totalExpenses` (= KETDI = operatingExpenses + salaryExpense),
 * COGS'siz (ombor xaridi allaqachon oddiy xarajat sifatida KETDI'ga kiradi
 * — finance.ts §6b, `getSimpleFinanceSummary`). Eski COGS-asosli
 * "Taxminiy sof foyda" bu hisobotda endi ko'rsatilmaydi (kerak bo'lsa
 * `analytics_metric`/`estimated_net_profit` orqali AI'dan so'ralishi mumkin).
 */
export interface DailyReportData {
  businessDate: string;
  /** Label: "KELDI" (real qabul qilingan tushum) */
  totalRevenue: number;
  billiardRevenue: number;
  tennisRevenue: number;
  productsRevenue: number;
  sessionCount: number;
  totalMinutes: number;
  customerCount: number;
  /** Shu kun ICHIDA qabul qilingan naqd (sessiya + qarz to'lovlari) */
  cashTotal: number;
  /** Shu kun ICHIDA qabul qilingan karta (sessiya + qarz to'lovlari) */
  cardTotal: number;
  /** Shu kun yaratilgan YANGI qarz (hali yig'ilmagan — tushumga kirmaydi) */
  debtTotal: number;
  topTables: { name: string; revenue: number }[];
  newDebtorsCount: number;
  /** Label: "Operatsion xarajat" (KETDI'ning bir qismi) */
  operatingExpenses: number;
  /** Label: "Oylik xarajati" (shu kun to'langan, KETDI'ning bir qismi) */
  salaryExpense: number;
  /** Label: "KETDI" = operatingExpenses + salaryExpense */
  totalExpenses: number;
  /** Label: "FOYDA" = KELDI − KETDI */
  profit: number;
}

export async function logDailyReport(supabase: SupabaseClient, report: DailyReportData) {
  const channel = await getLogChannel(supabase);
  if (!channel) return null;

  const [y, m, d] = report.businessDate.split("-");
  const dateLabel = `${d}.${m}.${y}`;
  const hours = Math.floor(report.totalMinutes / 60);
  const mins = report.totalMinutes % 60;

  const text = joinLines([
    "📊 <b>KUNLIK HISOBOT</b>",
    dateLabel,
    "",
    "💰 Real qabul qilingan tushum:",
    `${fmtMoney(report.totalRevenue)} so'm`,
    "",
    "🎱 Billiard (sotilgan):",
    `${fmtMoney(report.billiardRevenue)} so'm`,
    "🎾 Tennis (sotilgan):",
    `${fmtMoney(report.tennisRevenue)} so'm`,
    "🍹 Mahsulotlar (sotilgan):",
    `${fmtMoney(report.productsRevenue)} so'm`,
    "",
    "🎱 Sessiyalar:",
    String(report.sessionCount),
    "⏱ O'yin vaqti:",
    `${hours} soat ${mins} daqiqa`,
    "👥 Mijozlar:",
    String(report.customerCount),
    "",
    "💵 Naqd (qabul qilindi):",
    `${fmtMoney(report.cashTotal)} so'm`,
    "💳 Karta (qabul qilindi):",
    `${fmtMoney(report.cardTotal)} so'm`,
    "⚠️ Yangi qarz (hali yig'ilmagan):",
    `${fmtMoney(report.debtTotal)} so'm`,
    "",
    "🧾 Operatsion xarajat:",
    `${fmtMoney(report.operatingExpenses)} so'm`,
    "💼 Oylik xarajati:",
    `${fmtMoney(report.salaryExpense)} so'm`,
    "💸 KETDI (jami xarajat):",
    `${fmtMoney(report.totalExpenses)} so'm`,
    "",
    "📈 FOYDA:",
    `<b>${fmtMoney(report.profit)} so'm</b>`,
    report.topTables.length > 0 ? "" : undefined,
    report.topTables.length > 0 ? "🏆 TOP STOLLAR:" : undefined,
    ...report.topTables.map((t) => `${t.name} — ${fmtMoney(t.revenue)}`),
    report.newDebtorsCount > 0 ? "" : undefined,
    report.newDebtorsCount > 0 ? "⚠️ Qarzdorlar:" : undefined,
    report.newDebtorsCount > 0 ? `${report.newDebtorsCount} ta` : undefined,
  ]);

  const res = await sendMessage(channel.channelId, text);
  return res.ok ? res.messageId ?? null : null;
}

// ─── MOLIYA: XARAJAT ────────────────────────────────────────────────────
export async function logExpenseEvent(
  supabase: SupabaseClient,
  params: {
    expenseId: string;
    categoryName?: string;
    name: string;
    amount: number;
    paymentMethod: PaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    staffName: string;
    note?: string;
    isReversal: boolean;
  }
) {
  const paymentLine =
    params.paymentMethod === "mixed"
      ? `${PAYMENT_METHOD_LABEL.mixed} (naqd ${fmtMoney(params.cashAmount ?? 0)} + karta ${fmtMoney(params.cardAmount ?? 0)})`
      : PAYMENT_METHOD_LABEL[params.paymentMethod];

  const text = joinLines([
    params.isReversal ? "🔁 <b>XARAJAT TUZATILDI (bekor qilindi)</b>" : "💸 <b>XARAJAT QAYD ETILDI</b>",
    "",
    params.categoryName ? `Kategoriya: ${params.categoryName}` : undefined,
    `Nomi: ${params.name}`,
    "",
    "Summa:",
    `${fmtMoney(Math.abs(params.amount))} so'm`,
    "To'lov:",
    paymentLine,
    params.note ? joinLines(["", "Izoh:", `"${params.note}"`]) : undefined,
    "",
    `👨‍💼 ${params.staffName}`,
  ]);

  const { auditMessageId, alertMessageId } = await sendFinanceEvent(supabase, text);
  if (auditMessageId || alertMessageId) {
    await supabase
      .from("expenses")
      .update({
        ...(auditMessageId ? { telegram_log_message_id: auditMessageId } : {}),
        ...(alertMessageId ? { telegram_alert_message_id: alertMessageId } : {}),
      })
      .eq("id", params.expenseId);
  }
}

// ─── MOLIYA: OMBOR XARIDI ───────────────────────────────────────────────
export async function logInventoryPurchaseEvent(
  supabase: SupabaseClient,
  params: {
    purchaseId: string;
    productName: string;
    qty: number;
    unitCost: number;
    totalCost: number;
    paymentMethod: PaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    supplier?: string;
    staffName: string;
    note?: string;
    isReversal: boolean;
  }
) {
  const paymentLine =
    params.paymentMethod === "mixed"
      ? `${PAYMENT_METHOD_LABEL.mixed} (naqd ${fmtMoney(params.cashAmount ?? 0)} + karta ${fmtMoney(params.cardAmount ?? 0)})`
      : PAYMENT_METHOD_LABEL[params.paymentMethod];

  const text = joinLines([
    params.isReversal ? "🔁 <b>OMBOR XARIDI TUZATILDI (bekor qilindi)</b>" : "📦 <b>OMBOR XARIDI</b>",
    "",
    `${params.productName} ×${Math.abs(params.qty)} — ${fmtMoney(params.unitCost)} so'mdan`,
    params.supplier ? `Ta'minotchi: ${params.supplier}` : undefined,
    "",
    "Jami:",
    `${fmtMoney(Math.abs(params.totalCost))} so'm`,
    "To'lov:",
    paymentLine,
    "",
    "⚠️ Bu — CASH FLOW xarajati, COGS EMAS (mahsulot sotilganda tan olinadi).",
    params.note ? joinLines(["", "Izoh:", `"${params.note}"`]) : undefined,
    "",
    `👨‍💼 ${params.staffName}`,
  ]);

  const { auditMessageId, alertMessageId } = await sendFinanceEvent(supabase, text);
  if (auditMessageId || alertMessageId) {
    await supabase
      .from("inventory_purchases")
      .update({
        ...(auditMessageId ? { telegram_log_message_id: auditMessageId } : {}),
        ...(alertMessageId ? { telegram_alert_message_id: alertMessageId } : {}),
      })
      .eq("id", params.purchaseId);
  }
}

// ─── MOLIYA: OYLIK TO'LOVI ───────────────────────────────────────────────
export async function logSalaryPaymentEvent(
  supabase: SupabaseClient,
  params: {
    paymentId: string;
    staffName: string;
    amount: number;
    periodMonth: string;
    paymentMethod: PaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    paidByName: string;
    note?: string;
    isReversal: boolean;
  }
) {
  const paymentLine =
    params.paymentMethod === "mixed"
      ? `${PAYMENT_METHOD_LABEL.mixed} (naqd ${fmtMoney(params.cashAmount ?? 0)} + karta ${fmtMoney(params.cardAmount ?? 0)})`
      : PAYMENT_METHOD_LABEL[params.paymentMethod];

  const text = joinLines([
    params.isReversal ? "🔁 <b>OYLIK TO'LOVI TUZATILDI (bekor qilindi)</b>" : "💼 <b>OYLIK TO'LANDI</b>",
    "",
    `👤 ${params.staffName}`,
    `Davr: ${params.periodMonth}`,
    "",
    "Summa:",
    `${fmtMoney(Math.abs(params.amount))} so'm`,
    "To'lov:",
    paymentLine,
    params.note ? joinLines(["", "Izoh:", `"${params.note}"`]) : undefined,
    "",
    `👨‍💼 To'ladi: ${params.paidByName}`,
  ]);

  const { auditMessageId, alertMessageId } = await sendFinanceEvent(supabase, text);
  if (auditMessageId || alertMessageId) {
    await supabase
      .from("salary_payments")
      .update({
        ...(auditMessageId ? { telegram_log_message_id: auditMessageId } : {}),
        ...(alertMessageId ? { telegram_alert_message_id: alertMessageId } : {}),
      })
      .eq("id", params.paymentId);
  }
}

// ─── MOLIYA: QAYTARIM ────────────────────────────────────────────────────
export async function logRefundEvent(
  supabase: SupabaseClient,
  params: {
    refundId: string;
    customerName?: string;
    amount: number;
    reason: string;
    paymentMethod: PaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    staffName: string;
    isReversal: boolean;
  }
) {
  const paymentLine =
    params.paymentMethod === "mixed"
      ? `${PAYMENT_METHOD_LABEL.mixed} (naqd ${fmtMoney(params.cashAmount ?? 0)} + karta ${fmtMoney(params.cardAmount ?? 0)})`
      : PAYMENT_METHOD_LABEL[params.paymentMethod];

  const text = joinLines([
    params.isReversal ? "🔁 <b>QAYTARIM TUZATILDI (bekor qilindi)</b>" : "↩️ <b>QAYTARIM</b>",
    "",
    params.customerName ? `👤 ${params.customerName}` : undefined,
    "Summa:",
    `${fmtMoney(Math.abs(params.amount))} so'm`,
    "Sabab:",
    `"${params.reason}"`,
    "To'lov:",
    paymentLine,
    "",
    `👨‍💼 ${params.staffName}`,
  ]);

  const { auditMessageId, alertMessageId } = await sendFinanceEvent(supabase, text);
  if (auditMessageId || alertMessageId) {
    await supabase
      .from("refunds")
      .update({
        ...(auditMessageId ? { telegram_log_message_id: auditMessageId } : {}),
        ...(alertMessageId ? { telegram_alert_message_id: alertMessageId } : {}),
      })
      .eq("id", params.refundId);
  }
}
