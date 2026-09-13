import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";
import { logAudit } from "../api-audit";
import { mapExpense, mapInventoryPurchase, mapRefund, mapSalaryPayment } from "../db-map";
import { logExpenseEvent, logInventoryPurchaseEvent, logRefundEvent, logSalaryPaymentEvent, bestEffort } from "../telegram-log";
import { findByClientRequestId, UNIQUE_VIOLATION_CODE } from "../idempotent-insert";
import { todayKey } from "../permissions";
import { computeWeightedAverageCost } from "../finance";
import { fmtMoney } from "../format";
import { ServiceError } from "./errors";
import type { Expense, InventoryPurchase, PaymentMethod, Refund, SalaryPayment } from "../types";

/**
 * Moliya (Finance) yozuvlari — asosiy mantiq. Har bir "create" va uning
 * "reverse" (Rule 3 — o'chirilmaydigan tarix) jufti bor. Idempotentlik
 * (Rule 4 — bitta amal = bitta alert) `clientRequestId` orqali saqlanadi:
 * chaqiruvchi (HTTP route yoki kelajakdagi AI tool) qaytaradigan natijada
 * `duplicate: true` bo'lsa, hech qanday yangi Telegram xabari yubormaslik
 * kerak — bu already-hal-qilingan holat, xato emas.
 */

function validateSplitPayment(
  paymentMethod: string | undefined,
  totalAmount: number,
  cashAmountInput: unknown,
  cardAmountInput: unknown
): { method: PaymentMethod; cashAmount?: number; cardAmount?: number } {
  const method: PaymentMethod = paymentMethod === "card" ? "card" : paymentMethod === "mixed" ? "mixed" : "cash";
  if (method !== "mixed") return { method };
  const cashAmount = Math.max(0, Number(cashAmountInput) || 0);
  const cardAmount = Math.max(0, Number(cardAmountInput) || 0);
  if (cashAmount + cardAmount !== totalAmount) {
    throw new ServiceError("Naqd+karta yig'indisi summaga teng emas", 400);
  }
  return { method, cashAmount, cardAmount };
}

// ============================================================
// 1) XARAJAT
// ============================================================
export interface CreateExpenseArgs {
  clientRequestId?: string;
  categoryId?: string;
  categoryName?: string;
  name?: string;
  amount?: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  businessDate?: string;
  note?: string;
  receiptUrl?: string;
}

export async function createExpenseCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: CreateExpenseArgs
): Promise<{ expense: Expense; duplicate?: boolean }> {
  const name = (args.name ?? "").trim();
  const amount = Math.round(Number(args.amount) || 0);
  if (!name) throw new ServiceError("Xarajat nomi kerak", 400);
  if (amount <= 0) throw new ServiceError("Summa noto'g'ri", 400);

  const payment = validateSplitPayment(args.paymentMethod, amount, args.cashAmount, args.cardAmount);

  const existing = await findByClientRequestId(supabase, "expenses", args.clientRequestId);
  if (existing) return { expense: mapExpense(existing), duplicate: true };

  const businessDate = args.businessDate || todayKey();
  const insertPayload = {
    category_id: args.categoryId || null,
    name,
    amount,
    payment_method: payment.method,
    cash_amount: payment.cashAmount ?? null,
    card_amount: payment.cardAmount ?? null,
    business_date: businessDate,
    staff_id: auth.id,
    staff_name: auth.name,
    note: args.note?.trim() || null,
    receipt_url: args.receiptUrl || null,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("expenses").insert(insertPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "expenses", args.clientRequestId);
      if (raced) return { expense: mapExpense(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  // Audit (DB, tez) awaited; Telegram log — fonda (2026-08 performance audit).
  await logAudit(supabase, auth, `Xarajat yozildi: ${name} — ${fmtMoney(amount)} so'm`);
  bestEffort(
    logExpenseEvent(supabase, {
      expenseId: data.id,
      categoryName: args.categoryName,
      name,
      amount,
      paymentMethod: payment.method,
      cashAmount: payment.cashAmount,
      cardAmount: payment.cardAmount,
      staffName: auth.name,
      note: args.note?.trim() || undefined,
      isReversal: false,
    }),
    "logExpenseEvent"
  );

  return { expense: mapExpense(data) };
}

export interface ReverseArgs {
  id: string;
  reason?: string;
  clientRequestId?: string;
}

export async function reverseExpenseCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: ReverseArgs
): Promise<{ expense: Expense; duplicate?: boolean }> {
  const reason = (args.reason ?? "").trim();
  if (!reason) throw new ServiceError("Bekor qilish sababi kerak", 400);

  const existingReversal = await findByClientRequestId(supabase, "expenses", args.clientRequestId);
  if (existingReversal) return { expense: mapExpense(existingReversal), duplicate: true };

  const { data: original } = await supabase.from("expenses").select("*").eq("id", args.id).maybeSingle();
  if (!original) throw new ServiceError("Xarajat topilmadi", 404);
  if (original.reverses_id) throw new ServiceError("Bu allaqachon tuzatish yozuvi — qayta bekor qilib bo'lmaydi", 400);

  const { data: alreadyReversed } = await supabase
    .from("expenses")
    .select("id")
    .eq("reverses_id", original.id)
    .limit(1)
    .maybeSingle();
  if (alreadyReversed) throw new ServiceError("Bu yozuv allaqachon bekor qilingan", 400);

  const reversalPayload = {
    category_id: original.category_id,
    name: `Bekor qilindi: ${original.name}`,
    amount: -original.amount,
    payment_method: original.payment_method,
    cash_amount: original.cash_amount != null ? -original.cash_amount : null,
    card_amount: original.card_amount != null ? -original.card_amount : null,
    business_date: todayKey(),
    staff_id: auth.id,
    staff_name: auth.name,
    note: reason,
    reverses_id: original.id,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("expenses").insert(reversalPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "expenses", args.clientRequestId);
      if (raced) return { expense: mapExpense(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  await logAudit(supabase, auth, `Xarajat bekor qilindi: ${original.name} (${fmtMoney(original.amount)} so'm) — sabab: ${reason}`);
  bestEffort(
    logExpenseEvent(supabase, {
      expenseId: data.id,
      name: original.name,
      amount: -original.amount,
      paymentMethod: original.payment_method,
      cashAmount: original.cash_amount != null ? -original.cash_amount : undefined,
      cardAmount: original.card_amount != null ? -original.card_amount : undefined,
      staffName: auth.name,
      note: reason,
      isReversal: true,
    }),
    "logExpenseEvent(reverse)"
  );

  return { expense: mapExpense(data) };
}

// ============================================================
// 2) OMBOR XARIDI
// ============================================================
export interface CreatePurchaseArgs {
  clientRequestId?: string;
  productId?: string;
  qty?: number;
  unitCost?: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  supplier?: string;
  businessDate?: string;
  note?: string;
  receiptUrl?: string;
}

export async function createPurchaseCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: CreatePurchaseArgs
): Promise<{ purchase: InventoryPurchase; duplicate?: boolean }> {
  const qty = Number(args.qty) || 0;
  const unitCost = Math.round(Number(args.unitCost) || 0);
  if (!args.productId) throw new ServiceError("Mahsulot tanlanmagan", 400);
  if (qty <= 0) throw new ServiceError("Miqdor noto'g'ri", 400);
  if (unitCost < 0) throw new ServiceError("Tannarx noto'g'ri", 400);

  const totalCost = Math.round(qty * unitCost);
  const payment = validateSplitPayment(args.paymentMethod, totalCost, args.cashAmount, args.cardAmount);

  const existing = await findByClientRequestId(supabase, "inventory_purchases", args.clientRequestId);
  if (existing) return { purchase: mapInventoryPurchase(existing), duplicate: true };

  const { data: product } = await supabase
    .from("products")
    .select("id, name, track_inventory, unit_cost, stock_qty")
    .eq("id", args.productId)
    .maybeSingle();
  if (!product) throw new ServiceError("Mahsulot topilmadi", 404);
  if (!product.track_inventory) {
    throw new ServiceError("Bu mahsulotda ombor kuzatuvi yoqilmagan (Sozlamalar → Mahsulotlar)", 400);
  }

  const businessDate = args.businessDate || todayKey();
  const insertPayload = {
    product_id: args.productId,
    qty,
    unit_cost: unitCost,
    total_cost: totalCost,
    payment_method: payment.method,
    cash_amount: payment.cashAmount ?? null,
    card_amount: payment.cardAmount ?? null,
    supplier: args.supplier?.trim() || null,
    business_date: businessDate,
    staff_id: auth.id,
    staff_name: auth.name,
    note: args.note?.trim() || null,
    receipt_url: args.receiptUrl || null,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("inventory_purchases").insert(insertPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "inventory_purchases", args.clientRequestId);
      if (raced) return { purchase: mapInventoryPurchase(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  // Ombor yangilanishi: og'irlik-o'rtacha tannarx + stock_qty (finance.ts formulasi).
  const newUnitCost = computeWeightedAverageCost(product.stock_qty ?? 0, product.unit_cost ?? 0, qty, unitCost);
  const newStockQty = (product.stock_qty ?? 0) + qty;
  const { data: stockUpdated } = await supabase
    .from("products")
    .update({ unit_cost: newUnitCost, stock_qty: newStockQty })
    .eq("id", product.id)
    .eq("stock_qty", product.stock_qty ?? 0)
    .select("id")
    .maybeSingle();
  if (!stockUpdated) {
    console.error(`inventory-purchases: ombor yangilanmadi (race) — mahsulot ${product.id}, qayta hisoblash kerak`);
  }

  await logAudit(supabase, auth, `Ombor xaridi: ${product.name} ×${qty} — ${fmtMoney(totalCost)} so'm`);
  bestEffort(
    logInventoryPurchaseEvent(supabase, {
      purchaseId: data.id,
      productName: product.name,
      qty,
      unitCost,
      totalCost,
      paymentMethod: payment.method,
      cashAmount: payment.cashAmount,
      cardAmount: payment.cardAmount,
      supplier: args.supplier?.trim() || undefined,
      staffName: auth.name,
      note: args.note?.trim() || undefined,
      isReversal: false,
    }),
    "logInventoryPurchaseEvent"
  );

  return { purchase: mapInventoryPurchase(data) };
}

export async function reversePurchaseCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: ReverseArgs
): Promise<{ purchase: InventoryPurchase; duplicate?: boolean }> {
  const reason = (args.reason ?? "").trim();
  if (!reason) throw new ServiceError("Bekor qilish sababi kerak", 400);

  const existingReversal = await findByClientRequestId(supabase, "inventory_purchases", args.clientRequestId);
  if (existingReversal) return { purchase: mapInventoryPurchase(existingReversal), duplicate: true };

  const { data: original } = await supabase.from("inventory_purchases").select("*").eq("id", args.id).maybeSingle();
  if (!original) throw new ServiceError("Xarid topilmadi", 404);
  if (original.reverses_id) throw new ServiceError("Bu allaqachon tuzatish yozuvi", 400);

  const { data: alreadyReversed } = await supabase
    .from("inventory_purchases")
    .select("id")
    .eq("reverses_id", original.id)
    .limit(1)
    .maybeSingle();
  if (alreadyReversed) throw new ServiceError("Bu xarid allaqachon bekor qilingan", 400);

  const { data: product } = await supabase
    .from("products")
    .select("id, name, stock_qty")
    .eq("id", original.product_id)
    .maybeSingle();

  const reversalPayload = {
    product_id: original.product_id,
    qty: -original.qty,
    unit_cost: original.unit_cost,
    total_cost: -original.total_cost,
    payment_method: original.payment_method,
    cash_amount: original.cash_amount != null ? -original.cash_amount : null,
    card_amount: original.card_amount != null ? -original.card_amount : null,
    supplier: original.supplier,
    business_date: todayKey(),
    staff_id: auth.id,
    staff_name: auth.name,
    note: reason,
    reverses_id: original.id,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("inventory_purchases").insert(reversalPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "inventory_purchases", args.clientRequestId);
      if (raced) return { purchase: mapInventoryPurchase(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  if (product) {
    const newStockQty = Math.max(0, (product.stock_qty ?? 0) - original.qty);
    await supabase.from("products").update({ stock_qty: newStockQty }).eq("id", product.id);
  }

  await logAudit(
    supabase,
    auth,
    `Ombor xaridi bekor qilindi: ${product?.name ?? original.product_id} ×${original.qty} (${fmtMoney(original.total_cost)} so'm) — sabab: ${reason}`
  );
  bestEffort(
    logInventoryPurchaseEvent(supabase, {
      purchaseId: data.id,
      productName: product?.name ?? "Mahsulot",
      qty: -original.qty,
      unitCost: original.unit_cost,
      totalCost: -original.total_cost,
      paymentMethod: original.payment_method,
      cashAmount: original.cash_amount != null ? -original.cash_amount : undefined,
      cardAmount: original.card_amount != null ? -original.card_amount : undefined,
      supplier: original.supplier ?? undefined,
      staffName: auth.name,
      note: reason,
      isReversal: true,
    }),
    "logInventoryPurchaseEvent(reverse)"
  );

  return { purchase: mapInventoryPurchase(data) };
}

// ============================================================
// 3) OYLIK TO'LOVI
// ============================================================
export interface CreateSalaryPaymentArgs {
  clientRequestId?: string;
  staffId?: string;
  amount?: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  periodMonth?: string;
  businessDate?: string;
  note?: string;
}

export async function createSalaryPaymentCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: CreateSalaryPaymentArgs
): Promise<{ payment: SalaryPayment; duplicate?: boolean }> {
  const amount = Math.round(Number(args.amount) || 0);
  const periodMonth = (args.periodMonth ?? "").trim();
  if (!args.staffId) throw new ServiceError("Xodim tanlanmagan", 400);
  if (amount <= 0) throw new ServiceError("Summa noto'g'ri", 400);
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new ServiceError("Davr noto'g'ri (YYYY-MM)", 400);

  const payment = validateSplitPayment(args.paymentMethod, amount, args.cashAmount, args.cardAmount);

  const existing = await findByClientRequestId(supabase, "salary_payments", args.clientRequestId);
  if (existing) return { payment: mapSalaryPayment(existing), duplicate: true };

  const { data: staffRow } = await supabase.from("staff").select("id, name").eq("id", args.staffId).maybeSingle();
  if (!staffRow) throw new ServiceError("Xodim topilmadi", 404);

  const businessDate = args.businessDate || todayKey();
  const insertPayload = {
    staff_id: staffRow.id,
    staff_name: staffRow.name,
    amount,
    payment_method: payment.method,
    cash_amount: payment.cashAmount ?? null,
    card_amount: payment.cardAmount ?? null,
    period_month: periodMonth,
    business_date: businessDate,
    paid_by: auth.id,
    paid_by_name: auth.name,
    note: args.note?.trim() || null,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("salary_payments").insert(insertPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "salary_payments", args.clientRequestId);
      if (raced) return { payment: mapSalaryPayment(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  await logAudit(supabase, auth, `Oylik to'landi: ${staffRow.name} — ${fmtMoney(amount)} so'm (${periodMonth})`);
  bestEffort(
    logSalaryPaymentEvent(supabase, {
      paymentId: data.id,
      staffName: staffRow.name,
      amount,
      periodMonth,
      paymentMethod: payment.method,
      cashAmount: payment.cashAmount,
      cardAmount: payment.cardAmount,
      paidByName: auth.name,
      note: args.note?.trim() || undefined,
      isReversal: false,
    }),
    "logSalaryPaymentEvent"
  );

  return { payment: mapSalaryPayment(data) };
}

export async function reverseSalaryPaymentCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: ReverseArgs
): Promise<{ payment: SalaryPayment; duplicate?: boolean }> {
  const reason = (args.reason ?? "").trim();
  if (!reason) throw new ServiceError("Bekor qilish sababi kerak", 400);

  const existingReversal = await findByClientRequestId(supabase, "salary_payments", args.clientRequestId);
  if (existingReversal) return { payment: mapSalaryPayment(existingReversal), duplicate: true };

  const { data: original } = await supabase.from("salary_payments").select("*").eq("id", args.id).maybeSingle();
  if (!original) throw new ServiceError("To'lov topilmadi", 404);
  if (original.reverses_id) throw new ServiceError("Bu allaqachon tuzatish yozuvi", 400);

  const { data: alreadyReversed } = await supabase
    .from("salary_payments")
    .select("id")
    .eq("reverses_id", original.id)
    .limit(1)
    .maybeSingle();
  if (alreadyReversed) throw new ServiceError("Bu to'lov allaqachon bekor qilingan", 400);

  const reversalPayload = {
    staff_id: original.staff_id,
    staff_name: original.staff_name,
    amount: -original.amount,
    payment_method: original.payment_method,
    cash_amount: original.cash_amount != null ? -original.cash_amount : null,
    card_amount: original.card_amount != null ? -original.card_amount : null,
    period_month: original.period_month,
    business_date: todayKey(),
    paid_by: auth.id,
    paid_by_name: auth.name,
    note: reason,
    reverses_id: original.id,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("salary_payments").insert(reversalPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "salary_payments", args.clientRequestId);
      if (raced) return { payment: mapSalaryPayment(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  await logAudit(
    supabase,
    auth,
    `Oylik to'lovi bekor qilindi: ${original.staff_name} — ${fmtMoney(original.amount)} so'm — sabab: ${reason}`
  );
  bestEffort(
    logSalaryPaymentEvent(supabase, {
      paymentId: data.id,
      staffName: original.staff_name,
      amount: -original.amount,
      periodMonth: original.period_month,
      paymentMethod: original.payment_method,
      cashAmount: original.cash_amount != null ? -original.cash_amount : undefined,
      cardAmount: original.card_amount != null ? -original.card_amount : undefined,
      paidByName: auth.name,
      note: reason,
      isReversal: true,
    }),
    "logSalaryPaymentEvent(reverse)"
  );

  return { payment: mapSalaryPayment(data) };
}

// ============================================================
// 4) QAYTARIM
// ============================================================
export interface CreateRefundArgs {
  clientRequestId?: string;
  sessionId?: string;
  debtId?: string;
  customerName?: string;
  amount?: number;
  reason?: string;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  businessDate?: string;
  note?: string;
}

export async function createRefundCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: CreateRefundArgs
): Promise<{ refund: Refund; duplicate?: boolean }> {
  const amount = Math.round(Number(args.amount) || 0);
  const reason = (args.reason ?? "").trim();
  if (amount <= 0) throw new ServiceError("Summa noto'g'ri", 400);
  if (!reason) throw new ServiceError("Sabab kerak", 400);

  const payment = validateSplitPayment(args.paymentMethod, amount, args.cashAmount, args.cardAmount);

  const existing = await findByClientRequestId(supabase, "refunds", args.clientRequestId);
  if (existing) return { refund: mapRefund(existing), duplicate: true };

  const businessDate = args.businessDate || todayKey();
  const insertPayload = {
    session_id: args.sessionId || null,
    debt_id: args.debtId || null,
    customer_name: args.customerName?.trim() || null,
    amount,
    reason,
    payment_method: payment.method,
    cash_amount: payment.cashAmount ?? null,
    card_amount: payment.cardAmount ?? null,
    business_date: businessDate,
    staff_id: auth.id,
    staff_name: auth.name,
    note: args.note?.trim() || null,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("refunds").insert(insertPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "refunds", args.clientRequestId);
      if (raced) return { refund: mapRefund(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  await logAudit(supabase, auth, `Qaytarim: ${args.customerName ?? "mijoz"} — ${fmtMoney(amount)} so'm (sabab: ${reason})`);
  bestEffort(
    logRefundEvent(supabase, {
      refundId: data.id,
      customerName: args.customerName?.trim() || undefined,
      amount,
      reason,
      paymentMethod: payment.method,
      cashAmount: payment.cashAmount,
      cardAmount: payment.cardAmount,
      staffName: auth.name,
      isReversal: false,
    }),
    "logRefundEvent"
  );

  return { refund: mapRefund(data) };
}

export async function reverseRefundCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: ReverseArgs
): Promise<{ refund: Refund; duplicate?: boolean }> {
  const reason = (args.reason ?? "").trim();
  if (!reason) throw new ServiceError("Bekor qilish sababi kerak", 400);

  const existingReversal = await findByClientRequestId(supabase, "refunds", args.clientRequestId);
  if (existingReversal) return { refund: mapRefund(existingReversal), duplicate: true };

  const { data: original } = await supabase.from("refunds").select("*").eq("id", args.id).maybeSingle();
  if (!original) throw new ServiceError("Qaytarim topilmadi", 404);
  if (original.reverses_id) throw new ServiceError("Bu allaqachon tuzatish yozuvi", 400);

  const { data: alreadyReversed } = await supabase
    .from("refunds")
    .select("id")
    .eq("reverses_id", original.id)
    .limit(1)
    .maybeSingle();
  if (alreadyReversed) throw new ServiceError("Bu qaytarim allaqachon bekor qilingan", 400);

  const reversalPayload = {
    session_id: original.session_id,
    debt_id: original.debt_id,
    customer_name: original.customer_name,
    amount: -original.amount,
    reason: `Bekor qilindi: ${original.reason}`,
    payment_method: original.payment_method,
    cash_amount: original.cash_amount != null ? -original.cash_amount : null,
    card_amount: original.card_amount != null ? -original.card_amount : null,
    business_date: todayKey(),
    staff_id: auth.id,
    staff_name: auth.name,
    note: reason,
    reverses_id: original.id,
    client_request_id: args.clientRequestId || null,
  };

  const { data, error } = await supabase.from("refunds").insert(reversalPayload).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      const raced = await findByClientRequestId(supabase, "refunds", args.clientRequestId);
      if (raced) return { refund: mapRefund(raced), duplicate: true };
    }
    throw new ServiceError(error.message, 500);
  }

  await logAudit(
    supabase,
    auth,
    `Qaytarim bekor qilindi: ${original.customer_name ?? "mijoz"} — ${fmtMoney(original.amount)} so'm — sabab: ${reason}`
  );
  bestEffort(
    logRefundEvent(supabase, {
      refundId: data.id,
      customerName: original.customer_name ?? undefined,
      amount: -original.amount,
      reason,
      paymentMethod: original.payment_method,
      cashAmount: original.cash_amount != null ? -original.cash_amount : undefined,
      cardAmount: original.card_amount != null ? -original.card_amount : undefined,
      staffName: auth.name,
      isReversal: true,
    }),
    "logRefundEvent(reverse)"
  );

  return { refund: mapRefund(data) };
}
