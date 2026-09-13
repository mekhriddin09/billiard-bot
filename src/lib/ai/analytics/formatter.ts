import "server-only";
import { fmtMoney, fmtDate, fmtHM } from "../../format";
import { PROFIT_DISCLAIMER } from "../../finance";
import { ANALYTICS_SCHEMA, type FieldDef, type TableDef } from "./schema";
import type { ValidatedPlan } from "./query-plan";
import type { QueryResult } from "./query-executor";
import type { MetricResult } from "./metrics";

/**
 * ============================================================
 * DETERMINISTIK FORMATTER — LLM natijani IKKINCHI marta
 * "tushuntirmaydi"/formatlamaydi. Xom DB qiymatlaridan Telegram
 * xabariga aylantirish TO'LIQ oddiy, testlanadigan kod bilan
 * qilinadi — shu bilan AI hech qachon taqdimot bosqichida ham
 * fakt "ixtiro qila olmaydi" (raqamlar har doim DB'dan).
 * ============================================================
 */

// Telegram xabari juda uzun/o'qib bo'lmas holga kelmasligi uchun — shundan
// ko'p qator bo'lsa, matn o'rniga CSV fayl (sendDocument) yuboriladi.
export const LIST_INLINE_ROW_THRESHOLD = 15;

// ─── 1) METRIC natijalari ────────────────────────────────────────────────

const MONEY_FIELDS = new Set([
  "fromSessions",
  "fromDebtPayments",
  "refunded",
  "total",
  "received",
  "spent",
  "profit",
  "receivedRevenue",
  "cogs",
  "grossProfit",
  "operatingExpenses",
  "salaryExpense",
  "estimatedNetProfit",
  "cashIn",
  "cardIn",
  "cashOut",
  "cardOut",
  "netCash",
  "netCard",
  "unsplitMixedDebtPayments",
  "d0_1",
  "d2_7",
  "d8_30",
  "d31plus",
  "totalOpen",
]);
const SKIP_FIELDS = new Set(["disclaimer"]);
const PLAIN_NUMBER_FIELDS = new Set(["lineCount"]);

const FIELD_LABELS: Record<string, string> = {
  fromSessions: "Sessiyalardan",
  fromDebtPayments: "Qarz to'lovlaridan",
  refunded: "Qaytarimlar",
  total: "Jami",
  received: "💰 KELDI",
  spent: "💸 KETDI",
  profit: "📈 FOYDA",
  receivedRevenue: "Real qabul qilingan tushum",
  cogs: "COGS",
  grossProfit: "Yalpi foyda",
  operatingExpenses: "Operatsion xarajat",
  salaryExpense: "Oylik (to'langan)",
  estimatedNetProfit: "TAXMINIY sof foyda",
  cashIn: "Naqd kirim",
  cardIn: "Karta kirim",
  cashOut: "Naqd chiqim",
  cardOut: "Karta chiqim",
  netCash: "Naqd netto",
  netCard: "Karta netto",
  unsplitMixedDebtPayments: "Aralash qarz to'lovlari (bo'linmagan, taxminiy)",
  lineCount: "Hisobga olingan qator",
  d0_1: "0–1 kun",
  d2_7: "2–7 kun",
  d8_30: "8–30 kun",
  d31plus: "31+ kun",
  totalOpen: "Jami ochiq qarz",
};

const METRIC_TITLES: Record<string, string> = {
  simple_finance: "Moliya",
  received_revenue: "💰 Real qabul qilingan tushum",
  cogs: "📦 COGS",
  gross_profit: "📊 Yalpi foyda",
  operating_expenses: "🧾 Operatsion xarajatlar",
  salary_expense_paid: "👥 Oylik (to'langan)",
  estimated_net_profit: "📈 TAXMINIY sof foyda",
  cash_flow: "💵 Naqd/karta pul oqimi",
  debt_aging: "⏳ Qarz eskirishi",
};

export function formatMetricResult(r: MetricResult): string {
  const title = METRIC_TITLES[r.metric] ?? r.metric;
  const lines: string[] = [`<b>${title}</b> (${r.period})`];

  for (const [key, value] of Object.entries(r.data)) {
    if (SKIP_FIELDS.has(key)) continue;
    if (typeof value !== "number") continue;
    const label = FIELD_LABELS[key] ?? key;
    if (PLAIN_NUMBER_FIELDS.has(key)) {
      lines.push(`${label}: ${value}`);
    } else if (MONEY_FIELDS.has(key)) {
      lines.push(`${label}: ${fmtMoney(value)} so'm`);
    } else {
      lines.push(`${label}: ${value}`);
    }
  }

  if (r.metric === "estimated_net_profit") lines.push(`<i>${PROFIT_DISCLAIMER}</i>`);
  return lines.join("\n");
}

// ─── 2) QUERY (universal engine) natijalari — matn ─────────────────────

function fmtFieldValue(field: FieldDef, raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  switch (field.format) {
    case "money":
      return `${fmtMoney(Number(raw))} so'm`;
    case "date":
      return String(raw);
    case "datetime": {
      const t = new Date(String(raw)).getTime();
      return Number.isFinite(t) ? `${fmtDate(t)} ${fmtHM(t)}` : String(raw);
    }
    case "time":
      return String(raw);
    case "bool":
      return raw ? "ha" : "yo'q";
    default:
      return String(raw);
  }
}

function fmtRelatedObject(tableDef: TableDef, raw: unknown): string {
  if (!raw || typeof raw !== "object") return "—";
  const parts: string[] = [];
  for (const field of Object.values(tableDef.fields)) {
    if (field.sensitive) continue;
    const v = (raw as Record<string, unknown>)[field.column];
    if (v === null || v === undefined) continue;
    if (field.format === "id") continue; // ID'lar odam uchun ma'nosiz — o'tkazib yuboriladi
    parts.push(fmtFieldValue(field, v));
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

function periodLabel(plan: ValidatedPlan): string {
  if (!plan.dateRange) return "";
  const { from, to } = plan.dateRange;
  const base = from === to ? from : `${from} — ${to}`;
  if (plan.timeWindow) return `${base}, ${plan.timeWindow.from}–${plan.timeWindow.to}`;
  return base;
}

function formatListRow(plan: ValidatedPlan, row: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const field of Object.values(plan.tableDef.fields)) {
    if (field.sensitive) continue;
    if (field.format === "id") continue; // ID ustunlar chiqarilmaydi (odam o'qishi uchun ma'nosiz)
    const v = row[field.column];
    if (v === null || v === undefined) continue;
    parts.push(`${field.label}: ${fmtFieldValue(field, v)}`);
  }
  for (const rel of plan.includes) {
    const relatedDef = ANALYTICS_SCHEMA[rel.toTable];
    const nested = row[rel.key];
    if (nested !== undefined) parts.push(`${relatedDef.label}: ${fmtRelatedObject(relatedDef, nested)}`);
  }
  return `• ${parts.join(", ")}`;
}

/** true — natija Telegram xabarida to'g'ridan-to'g'ri chiqarilsin. false —
 *  juda katta, `buildCsv()` orqali fayl sifatida yuborilishi kerak. */
export function shouldInlineResult(result: QueryResult): boolean {
  return result.rows.length <= LIST_INLINE_ROW_THRESHOLD;
}

export function formatQueryResultText(plan: ValidatedPlan, result: QueryResult, groupLabels: Record<string, string>): string {
  const period = periodLabel(plan);
  const header = `🔎 <b>${plan.tableDef.label}</b>${period ? ` (${period})` : ""}`;

  if (result.mode === "aggregate") {
    const aggLabel = plan.aggregate
      ? plan.aggregate.fn === "count"
        ? "soni"
        : `${plan.aggregate.fn} — ${plan.aggregate.field?.label ?? ""}`
      : "soni";
    const groupLabel = plan.groupBy?.field.label;
    const lines = [`📊 <b>${plan.tableDef.label}</b> — ${aggLabel}${groupLabel ? `, "${groupLabel}" bo'yicha guruhlangan` : ""}${period ? ` (${period})` : ""}`];
    if (result.rows.length === 0) {
      lines.push("Natija topilmadi.");
      return lines.join("\n");
    }
    const isMoneyAgg = plan.aggregate?.field?.format === "money";
    for (const r of result.rows as { groupKey: string; value: number }[]) {
      const label = groupLabels[r.groupKey] ?? r.groupKey;
      const value = isMoneyAgg ? `${fmtMoney(r.value)} so'm` : String(Math.round(r.value * 100) / 100);
      lines.push(`• ${label}: ${value}`);
    }
    if (result.truncated) lines.push(`… (faqat birinchi ${result.rows.length} ta guruh ko'rsatildi)`);
    return lines.join("\n");
  }

  if (result.rows.length === 0) {
    return `${header}\n\nHech narsa topilmadi.`;
  }

  const lines = [header, ""];
  for (const row of result.rows) lines.push(formatListRow(plan, row));
  if (result.truncated) {
    lines.push(`\n… jami ${result.totalCount} ta yozuvdan ${result.rows.length} tasi ko'rsatildi. Aniqroq filtr/sana oralig'i bilan qayta so'rang.`);
  }
  return lines.join("\n");
}

// ─── 3) CSV eksport (katta natijalar uchun) ─────────────────────────────

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(plan: ValidatedPlan, result: QueryResult, groupLabels: Record<string, string>): { filename: string; content: string } {
  const dateTag = new Date().toISOString().slice(0, 10);

  if (result.mode === "aggregate") {
    const groupLabel = plan.groupBy?.field.label ?? "guruh";
    const valueLabel = plan.aggregate?.field ? `${plan.aggregate.fn}(${plan.aggregate.field.label})` : plan.aggregate?.fn ?? "qiymat";
    const header = [groupLabel, valueLabel].map(csvEscape).join(",");
    const rows = (result.rows as { groupKey: string; value: number }[]).map((r) =>
      [groupLabels[r.groupKey] ?? r.groupKey, r.value].map(csvEscape).join(",")
    );
    return { filename: `${plan.tableKey}_${dateTag}.csv`, content: [header, ...rows].join("\n") };
  }

  const fieldEntries = Object.entries(plan.tableDef.fields).filter(([, f]) => !f.sensitive);
  const header = fieldEntries.map(([, f]) => csvEscape(f.label)).join(",");
  const rows = result.rows.map((row) =>
    fieldEntries
      .map(([, f]) => {
        const v = row[f.column];
        return csvEscape(v === null || v === undefined ? "" : fmtFieldValue(f, v));
      })
      .join(",")
  );
  return { filename: `${plan.tableKey}_${dateTag}.csv`, content: [header, ...rows].join("\n") };
}
