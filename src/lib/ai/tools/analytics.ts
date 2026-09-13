import "server-only";
import type { ToolDefinition, ToolExecutionResult } from "../tool-types";
import { asRecord } from "../validate-utils";
import { ServiceError } from "../../services/errors";
import { METRIC_NAMES, METRIC_DESCRIPTIONS, runMetric, type MetricRequest } from "../analytics/metrics";
import { validateQueryPlan, FILTER_OPS, AGGREGATE_FNS } from "../analytics/query-plan";
import { executeQueryPlan, resolveGroupLabels } from "../analytics/query-executor";
import { formatMetricResult, formatQueryResultText, shouldInlineResult, buildCsv } from "../analytics/formatter";
import { MAX_DATE_RANGE_DAYS, MAX_FILTERS, MAX_INCLUDES } from "../analytics/schema";

/**
 * ============================================================
 * UNIVERSAL READ/ANALYTICS TOOL'LARI — Fаza 4.
 * ============================================================
 *
 * Ikkalasi ham READ (mutating=false) — tasdiqlash TALAB QILINMAYDI, chunki
 * hech narsani o'zgartirmaydi. Mavjud `get_revenue`/`get_profit`/
 * `get_expenses`/`get_customer_debt`/`get_sessions_in_range` (`read.ts`)
 * BUZILMAGAN/O'ZGARTIRILMAGAN — bular productionda ishlayotgani tasdiqlangan
 * yagona flow (Rule: "mavjud ishlayotganni buzma"). Bu ikkitasi QO'SHIMCHA:
 *
 *  - `analytics_metric`: nomlangan moliyaviy metrikalar — HAR DOIM
 *    `src/lib/finance.ts`ga delegatsiya qiladi (`metrics.ts` orqali),
 *    hech qachon o'z formulasini yozmaydi/ixtiro qilmaydi.
 *  - `analytics_query`: erkin, xavfsiz strukturaviy so'rov — LLM raw SQL
 *    EMAS, balki qat'iy whitelist qilingan `QueryPlan` JSON yuboradi
 *    (`query-plan.ts`da validatsiya qilinadi, `query-executor.ts`da FAQAT
 *    Supabase query builder orqali bajariladi).
 */

// Moliyaviy (pul bilan bog'liq) jadvallar — shu yoki shularga `include`
// qilingan so'rov FAQAT super_admin uchun (Web App'dagi
// /api/finance/summary va h.k. bilan bir xil ruxsat darajasi — Rule: rol
// modelini kengaytirmaydi, faqat takrorlaydi). Katalog jadvallari
// (tables/products/product_categories/expense_categories) — istalgan
// faol xodimga ochiq (booking oqimida allaqachon ko'rinadi).
const FINANCIAL_TABLE_KEYS = new Set(["sessions", "session_orders", "debts", "debt_payments", "expenses"]);

function isFinancialQuery(plan: ReturnType<typeof validateQueryPlan>): boolean {
  if (FINANCIAL_TABLE_KEYS.has(plan.tableKey)) return true;
  for (const rel of plan.includes) {
    if (FINANCIAL_TABLE_KEYS.has(rel.toTable)) return true;
  }
  return false;
}

// ─── 1) analytics_metric ─────────────────────────────────────────────────
const analyticsMetric: ToolDefinition = {
  description: [
    "Nomlangan moliyaviy metrikalarni qaytaradi (tushum, foyda, xarajat, oylik, pul oqimi, qarz eskirishi).",
    "Ruxsat etilgan 'metric' qiymatlari: " + METRIC_NAMES.map((m) => `${m} (${METRIC_DESCRIPTIONS[m]})`).join("; ") + ".",
    "'debt_aging' uchun faqat 'asOfDate' kerak (from/to shart emas). Qolgan barcha metrikalar uchun 'from'/'to' kerak.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      metric: { type: "string", enum: [...METRIC_NAMES], description: "Metrika nomi" },
      from: { type: "string", description: "Boshlanish sanasi, YYYY-MM-DD (debt_aging'dan boshqa barchasi uchun)" },
      to: { type: "string", description: "Tugash sanasi, YYYY-MM-DD (debt_aging'dan boshqa barchasi uchun)" },
      asOfDate: { type: "string", description: "Holat qaysi sanaga nisbatan hisoblansin, YYYY-MM-DD (faqat debt_aging uchun)" },
    },
    required: ["metric"],
  },
  mutating: false,
  // Barcha metrikalar moliyaviy (tushum/foyda/xarajat/qarz) — Web App'da
  // /api/finance/summary bilan bir xil, faqat super_admin ko'radi.
  allowedRoles: ["super_admin"],
  validate: (raw) => {
    const args = asRecord(raw);
    // to'liq tekshiruv `runMetric()` ichida (execute vaqtida) — bu yerda
    // faqat "juda erta" ravishda tool chaqiruvi shaklini tasdiqlaymiz.
    if (typeof args.metric !== "string") throw new ServiceError('"metric" kerak', 400);
    return args;
  },
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const result = await runMetric(supabase, args as unknown as MetricRequest);
    return { resultSummary: formatMetricResult(result) };
  },
};

// ─── 2) analytics_query ──────────────────────────────────────────────────
const analyticsQuery: ToolDefinition = {
  description: [
    "Universal, xavfsiz strukturaviy so'rov — moliyaviy metrikalardan BOSHQA har qanday ma'lumot uchun",
    "(ro'yxat, filtr, guruhlash, oddiy son/yig'indi). Faqat whitelist qilingan jadval/maydon/relationship'lar ishlatiladi.",
    `Ruxsat etilgan operatorlar: ${FILTER_OPS.join(", ")}. Aggregate funksiyalar: ${AGGREGATE_FNS.join(", ")}.`,
    `Cheklovlar: ko'pi bilan ${MAX_FILTERS} filter, ${MAX_INCLUDES} include, ${MAX_DATE_RANGE_DAYS} kunlik sana oralig'i.`,
    "Tushum/foyda/COGS kabi moliyaviy FORMULA so'ralganda bu tool EMAS, 'analytics_metric' ishlatiladi.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      table: { type: "string", description: "Jadval nomi (system promptdagi whitelist'dan)" },
      dateRange: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        description: "Sana oralig'i, YYYY-MM-DD (jadval sana maydoniga ega bo'lsagina)",
      },
      timeWindow: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        description: "Kun ichidagi vaqt oynasi, HH:MM (faqat dateRange bitta kun bo'lsa, va jadvalda vaqt maydoni bo'lsa)",
      },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: { field: { type: "string" }, op: { type: "string" }, value: {} },
          required: ["field", "op", "value"],
        },
        description: "Qo'shimcha filtrlar",
      },
      include: { type: "array", items: { type: "string" }, description: "Bog'liq jadvallardan qo'shimcha ma'lumot (relationship key)" },
      groupBy: { type: "string", description: "Guruhlash uchun maydon (faqat 'group' belgili maydonlar)" },
      aggregate: {
        type: "object",
        properties: { fn: { type: "string" }, field: { type: "string" } },
        description: "Agregatsiya (fn: count/sum/avg/min/max; field faqat sum/avg/min/max uchun kerak, 'agg' belgili maydon)",
      },
      orderBy: {
        type: "object",
        properties: { field: { type: "string" }, direction: { type: "string" } },
        description: "Saralash ('value' — faqat aggregate bilan)",
      },
      limit: { type: "number", description: "Natijalar soni chegarasi" },
    },
    required: ["table"],
  },
  mutating: false,
  // Statik rol cheklovi YO'Q — jadval darajasida DINAMIK tekshiriladi
  // (execute() ichida, pastga qarang), chunki bitta tool ham moliyaviy
  // (masalan "expenses"), ham katalog (masalan "products") jadvallariga
  // murojaat qilishi mumkin.
  validate: (raw) => {
    // Whitelist bo'yicha TO'LIQ tekshiruv — noto'g'ri bo'lsa shu yerda
    // aniq, foydalanuvchiga tushunarli ServiceError bilan to'xtaydi.
    // Natija BEKOR qilinadi (faqat tekshiruv uchun chaqirilgan) — audit_log
    // yengil qolishi uchun xom (LLM yuborgan) argumentlar saqlanadi;
    // execute() xuddi shu, pure/deterministik validatorni QAYTA chaqiradi.
    validateQueryPlan(raw);
    return asRecord(raw);
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const plan = validateQueryPlan(args);

    if (isFinancialQuery(plan) && auth.role !== "super_admin") {
      throw new ServiceError("Sizda bu ma'lumot uchun ruxsat yo'q (faqat super_admin)", 403);
    }

    const result = await executeQueryPlan(supabase, plan);

    let groupLabels: Record<string, string> = {};
    if (result.mode === "aggregate" && plan.groupBy) {
      const keys = (result.rows as { groupKey: string }[]).map((r) => r.groupKey);
      groupLabels = await resolveGroupLabels(supabase, plan, keys);
    }

    const text = formatQueryResultText(plan, result, groupLabels);

    if (result.mode === "list" && !shouldInlineResult(result)) {
      const csv = buildCsv(plan, result, groupLabels);
      return {
        resultSummary: `🔎 <b>${plan.tableDef.label}</b> — ${result.rows.length} ta yozuv (CSV fayl sifatida yuborildi).`,
        document: { filename: csv.filename, content: csv.content, caption: `${plan.tableDef.label} — ${result.rows.length} ta yozuv` },
      };
    }

    return { resultSummary: text };
  },
};

export const analyticsTools: Record<string, ToolDefinition> = {
  analytics_metric: analyticsMetric,
  analytics_query: analyticsQuery,
};
