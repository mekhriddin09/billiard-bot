"use client";

import type { Expense, ExpenseCategory, InventoryPurchase, Refund, SalaryPayment } from "./types";

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `${res.status} xatolik`);
  return body as T;
}

/** Rule 4: har bir "Saqlash" bosilganda BITTA marta yaratiladi, retry/qayta
 *  yuborishda O'SHA QIYMAT qayta ishlatiladi (yangisi emas). */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface FinanceSummary {
  range: { from: string; to: string };
  receivedRevenue: { fromSessions: number; fromDebtPayments: number; refunded: number; total: number };
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  salaryExpense: number;
  estimatedNetProfit: number;
  disclaimer: string;
  cashFlow: {
    cashIn: number;
    cardIn: number;
    cashOut: number;
    cardOut: number;
    netCash: number;
    netCard: number;
    unsplitMixedDebtPayments: number;
  };
  debtAging: { d0_1: number; d2_7: number; d8_30: number; d31plus: number; totalOpen: number };
}

export const financeApi = {
  summary: (from: string, to: string) => api<FinanceSummary>(`/api/finance/summary?from=${from}&to=${to}`),

  expenses: {
    list: (from: string, to: string) => api<{ expenses: Expense[] }>(`/api/expenses?from=${from}&to=${to}`),
    create: (body: Record<string, unknown>) =>
      api<{ expense: Expense; duplicate?: boolean }>("/api/expenses", { method: "POST", body: JSON.stringify(body) }),
    reverse: (id: string, body: Record<string, unknown>) =>
      api<{ expense: Expense }>(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  categories: {
    list: () => api<{ categories: ExpenseCategory[] }>("/api/expense-categories"),
    create: (body: Record<string, unknown>) =>
      api<{ category: ExpenseCategory }>("/api/expense-categories", { method: "POST", body: JSON.stringify(body) }),
  },
  purchases: {
    list: (from: string, to: string) =>
      api<{ purchases: InventoryPurchase[] }>(`/api/inventory-purchases?from=${from}&to=${to}`),
    create: (body: Record<string, unknown>) =>
      api<{ purchase: InventoryPurchase }>("/api/inventory-purchases", { method: "POST", body: JSON.stringify(body) }),
    reverse: (id: string, body: Record<string, unknown>) =>
      api<{ purchase: InventoryPurchase }>(`/api/inventory-purchases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  salaries: {
    list: (from: string, to: string) =>
      api<{ payments: SalaryPayment[] }>(`/api/salary-payments?from=${from}&to=${to}`),
    create: (body: Record<string, unknown>) =>
      api<{ payment: SalaryPayment }>("/api/salary-payments", { method: "POST", body: JSON.stringify(body) }),
    reverse: (id: string, body: Record<string, unknown>) =>
      api<{ payment: SalaryPayment }>(`/api/salary-payments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  refunds: {
    list: (from: string, to: string) => api<{ refunds: Refund[] }>(`/api/refunds?from=${from}&to=${to}`),
    create: (body: Record<string, unknown>) =>
      api<{ refund: Refund }>("/api/refunds", { method: "POST", body: JSON.stringify(body) }),
    reverse: (id: string, body: Record<string, unknown>) =>
      api<{ refund: Refund }>(`/api/refunds/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
};
