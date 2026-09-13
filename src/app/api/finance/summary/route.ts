import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getReceivedRevenue,
  getCOGS,
  getOperatingExpenses,
  getSalaryExpensePaid,
  getCashFlow,
  getDebtAgingBuckets,
  PROFIT_DISCLAIMER,
} from "@/lib/finance";
import { todayKey } from "@/lib/permissions";

/**
 * Moliya sahifasi uchun BITTA so'rovda barcha KPI/cashflow/qarz eskirishi.
 * Faqat Super Admin — Rule 1 (soddalashtirilgan hisob-kitob, nozik
 * ma'lumot: xarajat/foyda).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const today = todayKey();
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;
  const range = { from, to };

  const supabase = supabaseServer();
  const [receivedRevenue, cogs, operatingExpenses, salaryExpense, cashFlow, debtAging] = await Promise.all([
    getReceivedRevenue(supabase, range),
    getCOGS(supabase, range),
    getOperatingExpenses(supabase, range),
    getSalaryExpensePaid(supabase, range),
    getCashFlow(supabase, range),
    getDebtAgingBuckets(supabase, today),
  ]);

  const grossProfit = receivedRevenue.total - cogs.total;
  const estimatedNetProfit = grossProfit - operatingExpenses - salaryExpense;

  return NextResponse.json({
    range,
    receivedRevenue,
    cogs: cogs.total,
    grossProfit,
    operatingExpenses,
    salaryExpense,
    estimatedNetProfit,
    disclaimer: PROFIT_DISCLAIMER,
    cashFlow,
    debtAging,
  });
}
