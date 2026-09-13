import "server-only";
import type {
  AuditEntry,
  CashReconciliation,
  ClubSettings,
  ClubTable,
  Customer,
  Debt,
  DebtCorrection,
  DebtPaymentEntry,
  Expense,
  ExpenseCategory,
  GameSession,
  InventoryPurchase,
  OrderItem,
  PendingAiAction,
  Product,
  ProductCategory,
  Refund,
  Reservation,
  ReservationRequest,
  SalaryPayment,
  SessionEditLogEntry,
  StaffMember,
} from "./types";

/**
 * Supabase (snake_case) qatorlarini ilova tiplariga (camelCase) o'giradi.
 * Bu yagona joy — har bir API route shu funksiyalardan foydalanadi, shuning
 * uchun maydon nomlari hech qachon ikki xil joyda mos kelmay qolmaydi.
 */

const t = (v: string | null) => (v ? new Date(v).getTime() : undefined);

export function mapTable(r: any): ClubTable {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    type: r.type,
    tier: r.tier,
    pricePerHour: r.price_per_hour,
    onlineReservable: r.online_reservable,
    enabled: r.enabled,
    archived: r.archived,
  };
}

export function mapCategory(r: any): ProductCategory {
  return { id: r.id, name: r.name, emoji: r.emoji };
}

export function mapProduct(r: any): Product {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    price: r.price,
    emoji: r.emoji,
    available: r.available,
    active: r.active,
    trackInventory: r.track_inventory ?? false,
    unitCost: r.unit_cost ?? 0,
    stockQty: r.stock_qty ?? 0,
  };
}

export function mapCustomer(r: any): Customer {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    tgId: r.tg_id ?? undefined,
    tgUsername: r.tg_username ?? undefined,
    points: r.points,
    totalVisits: r.total_visits,
    totalMinutes: r.total_minutes,
  };
}

export function mapStaff(r: any): StaffMember {
  return {
    id: r.id,
    name: r.name,
    tgId: r.tg_id,
    tgUsername: r.tg_username,
    role: r.role,
    active: r.active,
    monthlySalary: r.monthly_salary ?? 0,
  };
}

export function mapAudit(r: any): AuditEntry {
  return {
    id: r.id,
    at: t(r.at)!,
    staffName: r.staff_name,
    role: r.role,
    action: r.action,
    source: r.source ?? "web",
    metadata: r.metadata ?? undefined,
  };
}

export function mapPendingAiAction(r: any): PendingAiAction {
  return {
    id: r.id,
    chatId: r.chat_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    toolName: r.tool_name,
    args: r.args ?? {},
    previewText: r.preview_text,
    status: r.status,
    telegramMessageId: r.telegram_message_id ?? undefined,
    resultSummary: r.result_summary ?? undefined,
    errorMessage: r.error_message ?? undefined,
    createdAt: t(r.created_at)!,
    expiresAt: t(r.expires_at)!,
    resolvedAt: t(r.resolved_at),
  };
}

export function mapEditLog(r: any): SessionEditLogEntry {
  return {
    id: r.id,
    at: t(r.at)!,
    staffName: r.staff_name,
    role: r.role,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    reason: r.reason ?? undefined,
  };
}

export function mapOrder(r: any): OrderItem {
  return {
    id: r.id,
    productId: r.product_id ?? "",
    name: r.name,
    emoji: r.emoji,
    price: r.price,
    qty: r.qty,
    unitCostAtSale: r.unit_cost_at_sale ?? undefined,
  };
}

export function mapReservation(r: any): Reservation {
  return {
    id: r.id,
    tableId: r.table_id,
    customerId: r.customer_id ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    deposit: r.deposit,
    createdAt: t(r.created_at)!,
    holdUntil: t(r.hold_until)!,
    status: r.status,
  };
}

export function mapReservationRequest(r: any): ReservationRequest {
  return {
    id: r.id,
    tableId: r.table_id,
    customerId: r.customer_id ?? undefined,
    customerPhone: r.customer_phone,
    note: r.note ?? undefined,
    status: r.status,
    createdAt: t(r.created_at)!,
    contactedAt: r.contacted_at ? t(r.contacted_at)! : undefined,
    contactedByName: r.contacted_by_name ?? undefined,
  };
}

/** `orders` — session_orders jadvalidan alohida so'ralib, shu yerda birlashtiriladi. */
export function mapSession(r: any, orders: OrderItem[] = [], editHistory: SessionEditLogEntry[] = []): GameSession {
  return {
    id: r.id,
    tableId: r.table_id,
    startedAt: t(r.started_at)!,
    endedAt: t(r.ended_at),
    businessDate: r.business_date,
    customerId: r.customer_id ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    orders,
    adjustMinutes: r.adjust_minutes,
    status: r.status,
    paid: r.paid,
    paymentMethod: r.payment_method ?? undefined,
    cashAmount: r.cash_amount ?? undefined,
    cardAmount: r.card_amount ?? undefined,
    finalTableCost: r.final_table_cost ?? undefined,
    finalTotal: r.final_total ?? undefined,
    pointsEarned: r.points_earned ?? undefined,
    rewardMinutesUsed: r.reward_minutes_used ?? undefined,
    paymentStatus: r.payment_status ?? undefined,
    paidAmount: r.paid_amount ?? undefined,
    debtAmount: r.debt_amount ?? undefined,
    note: r.note ?? undefined,
    noteBy: r.note_by ?? undefined,
    noteAt: t(r.note_at),
    closedBy: r.closed_by_name ?? undefined,
    closedByRole: r.closed_by_role ?? undefined,
    editHistory,
  };
}

export function mapSettings(r: any): ClubSettings {
  return {
    clubName: r.club_name,
    address: r.address,
    phone: r.phone,
    workHours: r.work_hours,
    telegram: r.telegram,
    instagram: r.instagram,
    info: r.info,
    cardPaymentEnabled: r.card_payment_enabled,
    loyalty: r.loyalty,
    reservation: r.reservation,
    telegramLog: {
      channelId: r.telegram_log_channel_id ?? null,
      enabled: r.telegram_log_enabled ?? false,
    },
    superAdminAlert: {
      channelId: r.super_admin_alert_channel_id ?? null,
      enabled: r.super_admin_alert_enabled ?? false,
    },
    debtReminderPolicy: r.debt_reminder_policy ?? {
      dueDateReminder: true,
      overdueReminder: true,
      overdueRepeatDays: 3,
      dailyReminder: false,
    },
    dailyReport: {
      enabled: r.daily_report_enabled ?? true,
      time: r.daily_report_time ?? "23:30",
    },
  };
}

export function mapDebtPayment(r: any): DebtPaymentEntry {
  return {
    id: r.id,
    debtId: r.debt_id,
    amount: r.amount,
    method: r.method,
    staffName: r.staff_name,
    note: r.note ?? undefined,
    at: t(r.at)!,
    businessDate: r.business_date ?? undefined,
  };
}

/** `payments` — debt_payments jadvalidan alohida so'ralib, shu yerda birlashtiriladi. */
export function mapDebt(r: any, payments: DebtPaymentEntry[] = []): Debt {
  return {
    id: r.id,
    sessionId: r.session_id,
    tableId: r.table_id ?? undefined,
    customerId: r.customer_id ?? undefined,
    customerName: r.customer_name,
    customerPhone: r.customer_phone ?? undefined,
    originalAmount: r.original_amount,
    paidAmount: r.paid_amount,
    remainingAmount: r.remaining_amount,
    status: r.status,
    dueDate: r.due_date ?? undefined,
    note: r.note ?? undefined,
    createdByName: r.created_by_name,
    createdAt: t(r.created_at)!,
    closedAt: t(r.closed_at),
    payments,
  };
}

export function mapDebtCorrection(r: any): DebtCorrection {
  return {
    id: r.id,
    debtId: r.debt_id,
    oldOriginalAmount: r.old_original_amount,
    newOriginalAmount: r.new_original_amount,
    oldRemainingAmount: r.old_remaining_amount,
    newRemainingAmount: r.new_remaining_amount,
    reason: r.reason,
    correctedByName: r.corrected_by_name,
    correctedAt: t(r.corrected_at)!,
  };
}

// ─── Moliya (Finance) ────────────────────────────────────────────────

export function mapExpenseCategory(r: any): ExpenseCategory {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    active: r.active,
    sortOrder: r.sort_order,
  };
}

export function mapExpense(r: any): Expense {
  return {
    id: r.id,
    categoryId: r.category_id ?? undefined,
    name: r.name,
    amount: r.amount,
    paymentMethod: r.payment_method,
    cashAmount: r.cash_amount ?? undefined,
    cardAmount: r.card_amount ?? undefined,
    businessDate: r.business_date,
    occurredAt: t(r.occurred_at)!,
    staffName: r.staff_name,
    note: r.note ?? undefined,
    receiptUrl: r.receipt_url ?? undefined,
    reversesId: r.reverses_id ?? undefined,
    createdAt: t(r.created_at)!,
  };
}

export function mapInventoryPurchase(r: any): InventoryPurchase {
  return {
    id: r.id,
    productId: r.product_id,
    qty: r.qty,
    unitCost: r.unit_cost,
    totalCost: r.total_cost,
    paymentMethod: r.payment_method,
    cashAmount: r.cash_amount ?? undefined,
    cardAmount: r.card_amount ?? undefined,
    supplier: r.supplier ?? undefined,
    businessDate: r.business_date,
    occurredAt: t(r.occurred_at)!,
    staffName: r.staff_name,
    note: r.note ?? undefined,
    receiptUrl: r.receipt_url ?? undefined,
    reversesId: r.reverses_id ?? undefined,
    createdAt: t(r.created_at)!,
  };
}

export function mapSalaryPayment(r: any): SalaryPayment {
  return {
    id: r.id,
    staffId: r.staff_id ?? undefined,
    staffName: r.staff_name,
    amount: r.amount,
    paymentMethod: r.payment_method,
    cashAmount: r.cash_amount ?? undefined,
    cardAmount: r.card_amount ?? undefined,
    periodMonth: r.period_month,
    businessDate: r.business_date,
    occurredAt: t(r.occurred_at)!,
    paidByName: r.paid_by_name,
    note: r.note ?? undefined,
    reversesId: r.reverses_id ?? undefined,
    createdAt: t(r.created_at)!,
  };
}

export function mapRefund(r: any): Refund {
  return {
    id: r.id,
    sessionId: r.session_id ?? undefined,
    debtId: r.debt_id ?? undefined,
    customerName: r.customer_name ?? undefined,
    amount: r.amount,
    reason: r.reason,
    paymentMethod: r.payment_method,
    cashAmount: r.cash_amount ?? undefined,
    cardAmount: r.card_amount ?? undefined,
    businessDate: r.business_date,
    occurredAt: t(r.occurred_at)!,
    staffName: r.staff_name,
    note: r.note ?? undefined,
    reversesId: r.reverses_id ?? undefined,
    createdAt: t(r.created_at)!,
  };
}

export function mapCashReconciliation(r: any): CashReconciliation {
  return {
    id: r.id,
    businessDate: r.business_date,
    openingCash: r.opening_cash,
    expectedCash: r.expected_cash,
    countedCash: r.counted_cash,
    difference: r.difference,
    countedByName: r.counted_by_name,
    countedAt: t(r.counted_at)!,
    note: r.note ?? undefined,
  };
}
