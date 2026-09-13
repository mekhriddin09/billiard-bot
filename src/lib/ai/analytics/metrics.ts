import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "../../services/errors";
import {
  getReceivedRevenue,
  getCOGS,
  getGrossProfit,
  getOperatingExpenses,
  getSalaryExpensePaid,
  getEstimatedNetProfit,
  getSimpleFinanceSummary,
  getCashFlow,
  getDebtAgingBuckets,
} from "../../finance";
import { validateDateRange } from "../validate-utils";

/**
 * ============================================================
 * METRIC LIBRARY — moliyaviy FAKTLAR uchun YAGONA eshik.
 * ============================================================
 *
 * Bu yerdagi HAR BIR metrika `src/lib/finance.ts`dagi mavjud, markazlashgan
 * (Rule 12) funksiyaga to'g'ridan-to'g'ri delegatsiya qiladi — HECH QANDAY
 * formula bu yerda QAYTA YOZILMAYDI yoki "ixtiro qilinmaydi". AI (LLM)
 * "revenue"/"profit" so'ralganda universal `analytics_query` query-plan
 * mexanizmidan EMAS, aynan shu ro'yxatdan FAQAT NOM tanlaydi — moliyaviy
 * hisob-kitob mantig'i har doim inson yozgan, testlangan kodda qoladi.
 */

export const METRIC_NAMES = [
  "simple_finance",
  "received_revenue",
  "cogs",
  "gross_profit",
  "operating_expenses",
  "salary_expense_paid",
  "estimated_net_profit",
  "cash_flow",
  "debt_aging",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export const METRIC_DESCRIPTIONS: Record<MetricName, string> = {
  simple_finance:
    "STANDART/DEFAULT moliyaviy ko'rsatkich — KELDI (real qabul qilingan tushum), KETDI (operatsion xarajat + to'langan oylik, COGS'siz) va FOYDA (KELDI − KETDI). 'Bugun/oyda foyda qancha', 'qancha keldi', 'qancha ketdi' kabi UMUMIY savollar uchun standart tanlov — estimated_net_profit'dan FARQLI, COGS ayirilmaydi (chunki ombor xaridi allaqachon oddiy xarajat sifatida KETDI'ga kiradi).",
  received_revenue: "Real qabul qilingan tushum (sessiyalardan naqd/karta + qarz to'lovlari − qaytarimlar) — 'simple_finance'dagi KELDI bilan bir xil son",
  cogs: "COGS — sotilgan mahsulotlarning tannarxi (faqat ombor kuzatiladigan mahsulotlar) — FAQAT aniq 'COGS'/'tannarx' so'ralganda ishlatiladi",
  gross_profit: "Yalpi foyda = Real qabul qilingan tushum − COGS — FAQAT aniq COGS-asosli tahlil so'ralganda ishlatiladi",
  operating_expenses: "Operatsion xarajatlar jami (ijara, svet va h.k.), oyliksiz — 'simple_finance'ning bir qismi",
  salary_expense_paid: "Davr ichida HAQIQATDA to'langan oylik summasi — 'simple_finance'ning bir qismi",
  estimated_net_profit:
    "TAXMINIY sof foyda = Yalpi foyda − Operatsion xarajat − Oylik (COGS-asosli, BATAFSIL/ADVANCED model). Standart 'foyda' savoliga bu EMAS, 'simple_finance' javob beradi — bu faqat admin aniq COGS/ombor tannarxini so'raganda ishlatiladi.",
  cash_flow: "Naqd/karta pul oqimi (kirim/chiqim) — bu PROFIT emas",
  debt_aging: "Ochiq qarzlarni muddat bo'yicha guruhlash (0-1, 2-7, 8-30, 31+ kun)",
};

export interface MetricRequest {
  metric: string;
  from?: string;
  to?: string;
  asOfDate?: string;
}

export interface MetricResult {
  metric: MetricName;
  period: string;
  data: Record<string, unknown>;
}

function requireMetricName(raw: unknown): MetricName {
  if (typeof raw !== "string" || !(METRIC_NAMES as readonly string[]).includes(raw)) {
    throw new ServiceError(`Noma'lum metrika: "${raw}". Ruxsat etilgan: ${METRIC_NAMES.join(", ")}`, 400);
  }
  return raw as MetricName;
}

export async function runMetric(supabase: SupabaseClient, req: MetricRequest): Promise<MetricResult> {
  const metric = requireMetricName(req.metric);

  if (metric === "debt_aging") {
    if (typeof req.asOfDate !== "string" || !req.asOfDate) {
      throw new ServiceError('"debt_aging" metrikasi uchun "asOfDate" (YYYY-MM-DD) kerak', 400);
    }
    const data = await getDebtAgingBuckets(supabase, req.asOfDate);
    return { metric, period: req.asOfDate, data: data as unknown as Record<string, unknown> };
  }

  if (typeof req.from !== "string" || typeof req.to !== "string") {
    throw new ServiceError(`"${metric}" metrikasi uchun "from"/"to" (YYYY-MM-DD) kerak`, 400);
  }
  const range = validateDateRange(req.from, req.to);
  const period = range.from === range.to ? range.from : `${range.from} — ${range.to}`;

  switch (metric) {
    case "simple_finance":
      return { metric, period, data: (await getSimpleFinanceSummary(supabase, range)) as unknown as Record<string, unknown> };
    case "received_revenue":
      return { metric, period, data: (await getReceivedRevenue(supabase, range)) as unknown as Record<string, unknown> };
    case "cogs":
      return { metric, period, data: (await getCOGS(supabase, range)) as unknown as Record<string, unknown> };
    case "gross_profit":
      return { metric, period, data: (await getGrossProfit(supabase, range)) as unknown as Record<string, unknown> };
    case "operating_expenses":
      return { metric, period, data: { total: await getOperatingExpenses(supabase, range) } };
    case "salary_expense_paid":
      return { metric, period, data: { total: await getSalaryExpensePaid(supabase, range) } };
    case "estimated_net_profit":
      return { metric, period, data: (await getEstimatedNetProfit(supabase, range)) as unknown as Record<string, unknown> };
    case "cash_flow":
      return { metric, period, data: (await getCashFlow(supabase, range)) as unknown as Record<string, unknown> };
    default: {
      const _exhaustive: never = metric;
      throw new ServiceError("Noma'lum metrika", 400);
    }
  }
}
