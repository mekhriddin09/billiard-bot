import "server-only";
import { createExpenseCore, createRefundCore, createSalaryPaymentCore } from "../../services/finance-actions";
import { payDebtCore } from "../../services/debts";
import { fmtMoney } from "../../format";
import { todayKey } from "../../permissions";
import { ServiceError } from "../../services/errors";
import type { ToolDefinition, ToolExecutionResult } from "../tool-types";
import { asRecord, optionalEnum, optionalString, requireNumber, requireString } from "../validate-utils";
import { resolveOpenDebtByCustomerName, resolveStaffByName } from "./resolve-helpers";

/**
 * MOLIYAVIY TOOL'LAR — Stage E. Barchasi `mutating: true, risky: true`
 * (✅/✏️/❌ — 3-tugmali, chunki pul harakati bilan bog'liq). HAR BIRI
 * FAQAT mavjud `src/lib/services/finance-actions.ts` / `debts.ts`
 * funksiyalarini chaqiradi — Rule 3 (immutability)/Rule 4 (idempotency)
 * shu funksiyalar ichida allaqachon ta'minlangan, bu yerda TAKRORLANMAYDI.
 *
 * `clientRequestId` — har bir tasdiqlangan pending action ID'si idempotency
 * kaliti sifatida ishlatiladi (bir xil pending action ikki marta
 * bajarilsa ham — bu strukturaviy jihatdan mumkin emas, chunki
 * `resolvePendingAction` atomik "claim" qiladi — lekin qo'shimcha
 * himoya sifatida DB darajasida ham ikki marta yozilmasligini kafolatlaydi).
 */

const PAYMENT_METHODS = ["cash", "card", "mixed"] as const;
const METHOD_LABEL: Record<string, string> = { cash: "naqd", card: "karta", mixed: "aralash" };

// ─── 1) Xarajat yozish ───────────────────────────────────────────────────
const recordExpense: ToolDefinition = {
  description: "Operatsion xarajat (ijara, svet, tozalash va h.k.) yozadi. Masalan: 'xarajat yoz: svet uchun 150000 so'm'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Xarajat nomi (masalan 'Svet to'lovi')" },
      amount: { type: "number", description: "Summa (so'm)" },
      categoryName: { type: "string", description: "Kategoriya nomi, ixtiyoriy" },
      paymentMethod: { type: "string", enum: ["cash", "card", "mixed"], description: "To'lov usuli, standart 'cash'" },
      note: { type: "string", description: "Izoh, ixtiyoriy" },
    },
    required: ["name", "amount"],
  },
  mutating: true,
  risky: true,
  validate: (raw) => {
    const args = asRecord(raw);
    const name = requireString(args, "name", { maxLen: 200 });
    const amount = requireNumber(args, "amount", { min: 1, max: 1_000_000_000 });
    const categoryName = optionalString(args, "categoryName", { maxLen: 100 });
    const paymentMethod = optionalEnum(args, "paymentMethod", PAYMENT_METHODS) ?? "cash";
    const note = optionalString(args, "note", { maxLen: 300 });
    return { name, amount, paymentMethod, ...(categoryName ? { categoryName } : {}), ...(note ? { note } : {}) };
  },
  resolve: async (supabase, args) => {
    let categoryId: string | undefined;
    let categoryLabel = "";
    if (args.categoryName) {
      const { data } = await supabase
        .from("expense_categories")
        .select("id, name, emoji")
        .ilike("name", `%${args.categoryName}%`)
        .limit(1)
        .maybeSingle();
      if (!data) throw new ServiceError(`"${args.categoryName}" kategoriyasi topilmadi`, 404);
      categoryId = data.id;
      categoryLabel = ` (${data.emoji ?? ""} ${data.name})`.trim();
    }
    const preview = `🧾 <b>Xarajat</b>\n${args.name}${categoryLabel} — ${fmtMoney(args.amount as number)} so'm, ${METHOD_LABEL[args.paymentMethod as string]}${
      args.note ? `\nIzoh: ${args.note}` : ""
    }`;
    return {
      preview,
      resolvedArgs: { name: args.name, amount: args.amount, paymentMethod: args.paymentMethod, note: args.note, ...(categoryId ? { categoryId, categoryName: args.categoryName } : {}) },
    };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { expense, duplicate } = await createExpenseCore(supabase, auth, {
      name: args.name as string,
      amount: args.amount as number,
      categoryId: args.categoryId as string | undefined,
      categoryName: args.categoryName as string | undefined,
      paymentMethod: args.paymentMethod as string,
      note: args.note as string | undefined,
      clientRequestId: args.__pendingActionId as string | undefined,
    });
    return { resultSummary: `${duplicate ? "(allaqachon yozilgan) " : ""}Xarajat yozildi: ${expense.name} — ${fmtMoney(expense.amount)} so'm` };
  },
};

// ─── 2) Qarz to'lovi ─────────────────────────────────────────────────────
const payDebt: ToolDefinition = {
  description: "Mijoz qarziga to'lov qabul qiladi. Masalan: 'Mehriddinning qarzidan 50000 to'lov qabul qil'.",
  parameters: {
    type: "object",
    properties: {
      customerName: { type: "string", description: "Mijoz ismi" },
      amount: { type: "number", description: "To'lov summasi (so'm)" },
      method: { type: "string", enum: ["cash", "card", "mixed"], description: "To'lov usuli, standart 'cash'" },
      note: { type: "string", description: "Izoh, ixtiyoriy" },
    },
    required: ["customerName", "amount"],
  },
  mutating: true,
  risky: true,
  validate: (raw) => {
    const args = asRecord(raw);
    const customerName = requireString(args, "customerName", { maxLen: 100 });
    const amount = requireNumber(args, "amount", { min: 1, max: 1_000_000_000 });
    const method = optionalEnum(args, "method", PAYMENT_METHODS) ?? "cash";
    const note = optionalString(args, "note", { maxLen: 300 });
    return { customerName, amount, method, ...(note ? { note } : {}) };
  },
  resolve: async (supabase, args) => {
    const debt = await resolveOpenDebtByCustomerName(supabase, args.customerName as string);
    const amount = args.amount as number;
    const overpay = amount > debt.remainingAmount;
    const preview = `💳 <b>Qarz to'lovi</b>\n${debt.customerName} — ${fmtMoney(amount)} so'm (${METHOD_LABEL[args.method as string]})\nQoldiq: ${fmtMoney(debt.remainingAmount)} so'm${
      overpay ? `\n<i>Diqqat: to'lov qoldiqdan katta — faqat ${fmtMoney(debt.remainingAmount)} so'm hisoblanadi.</i>` : ""
    }`;
    return { preview, resolvedArgs: { debtId: debt.id, amount, method: args.method, note: args.note, customerName: debt.customerName } };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { debt } = await payDebtCore(supabase, auth, {
      debtId: args.debtId as string,
      amount: args.amount as number,
      method: args.method as any,
      note: args.note as string | undefined,
    });
    return { resultSummary: `${debt.customerName} qarziga to'lov qabul qilindi. Qoldiq: ${fmtMoney(debt.remainingAmount)} so'm` };
  },
};

// ─── 3) Qaytarim ─────────────────────────────────────────────────────────
const createRefund: ToolDefinition = {
  description: "Mijozga qaytarim (refund) chiqaradi. Masalan: 'Aliyevga 30000 qaytarim ber, sababi: xato hisoblangan'.",
  parameters: {
    type: "object",
    properties: {
      customerName: { type: "string", description: "Mijoz ismi" },
      amount: { type: "number", description: "Qaytarim summasi (so'm)" },
      reason: { type: "string", description: "Sabab (majburiy)" },
      paymentMethod: { type: "string", enum: ["cash", "card", "mixed"], description: "To'lov usuli, standart 'cash'" },
    },
    required: ["customerName", "amount", "reason"],
  },
  mutating: true,
  risky: true,
  // /api/refunds (Web App) FAQAT super_admin/admin'ga ruxsat beradi — AI
  // ham xuddi shu ruxsat modelini takrorlaydi.
  allowedRoles: ["super_admin", "admin"],
  validate: (raw) => {
    const args = asRecord(raw);
    const customerName = requireString(args, "customerName", { maxLen: 100 });
    const amount = requireNumber(args, "amount", { min: 1, max: 1_000_000_000 });
    const reason = requireString(args, "reason", { maxLen: 300 });
    const paymentMethod = optionalEnum(args, "paymentMethod", PAYMENT_METHODS) ?? "cash";
    return { customerName, amount, reason, paymentMethod };
  },
  resolve: async (_supabase, args) => {
    const preview = `↩️ <b>Qaytarim</b>\n${args.customerName} — ${fmtMoney(args.amount as number)} so'm (${METHOD_LABEL[args.paymentMethod as string]})\nSabab: ${args.reason}`;
    return { preview, resolvedArgs: args };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { refund, duplicate } = await createRefundCore(supabase, auth, {
      customerName: args.customerName as string,
      amount: args.amount as number,
      reason: args.reason as string,
      paymentMethod: args.paymentMethod as string,
      clientRequestId: args.__pendingActionId as string | undefined,
    });
    return { resultSummary: `${duplicate ? "(allaqachon yozilgan) " : ""}Qaytarim chiqarildi: ${refund.customerName ?? "mijoz"} — ${fmtMoney(refund.amount)} so'm` };
  },
};

// ─── 4) Oylik to'lovi ────────────────────────────────────────────────────
const paySalary: ToolDefinition = {
  description: "Xodimga oylik to'lovini yozadi. Masalan: 'Aliyevga avgust oyi uchun 3000000 oylik to'la'.",
  parameters: {
    type: "object",
    properties: {
      staffName: { type: "string", description: "Xodim ismi" },
      amount: { type: "number", description: "Summa (so'm)" },
      periodMonth: { type: "string", description: "Davr, YYYY-MM (berilmasa joriy oy)" },
      paymentMethod: { type: "string", enum: ["cash", "card", "mixed"], description: "To'lov usuli, standart 'cash'" },
      note: { type: "string", description: "Izoh, ixtiyoriy" },
    },
    required: ["staffName", "amount"],
  },
  mutating: true,
  risky: true,
  // /api/salary-payments (Web App) FAQAT super_admin/admin'ga ruxsat
  // beradi — AI ham xuddi shu ruxsat modelini takrorlaydi.
  allowedRoles: ["super_admin", "admin"],
  validate: (raw) => {
    const args = asRecord(raw);
    const staffName = requireString(args, "staffName", { maxLen: 100 });
    const amount = requireNumber(args, "amount", { min: 1, max: 1_000_000_000 });
    const periodMonthRaw = optionalString(args, "periodMonth", { maxLen: 7 });
    if (periodMonthRaw && !/^\d{4}-\d{2}$/.test(periodMonthRaw)) {
      throw new ServiceError('"periodMonth" YYYY-MM formatida bo\'lishi kerak', 400);
    }
    const periodMonth = periodMonthRaw ?? todayKey().slice(0, 7);
    const paymentMethod = optionalEnum(args, "paymentMethod", PAYMENT_METHODS) ?? "cash";
    const note = optionalString(args, "note", { maxLen: 300 });
    return { staffName, amount, periodMonth, paymentMethod, ...(note ? { note } : {}) };
  },
  resolve: async (supabase, args) => {
    const staff = await resolveStaffByName(supabase, args.staffName as string);
    const preview = `💵 <b>Oylik to'lovi</b>\n${staff.name} — ${fmtMoney(args.amount as number)} so'm (${args.periodMonth}, ${METHOD_LABEL[args.paymentMethod as string]})`;
    return { preview, resolvedArgs: { staffId: staff.id, staffName: staff.name, amount: args.amount, periodMonth: args.periodMonth, paymentMethod: args.paymentMethod, note: args.note } };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { payment, duplicate } = await createSalaryPaymentCore(supabase, auth, {
      staffId: args.staffId as string,
      amount: args.amount as number,
      periodMonth: args.periodMonth as string,
      paymentMethod: args.paymentMethod as string,
      note: args.note as string | undefined,
      clientRequestId: args.__pendingActionId as string | undefined,
    });
    return { resultSummary: `${duplicate ? "(allaqachon yozilgan) " : ""}Oylik to'landi: ${payment.staffName} — ${fmtMoney(payment.amount)} so'm` };
  },
};

export const financialTools: Record<string, ToolDefinition> = {
  record_expense: recordExpense,
  pay_debt: payDebt,
  create_refund: createRefund,
  pay_salary: paySalary,
};
