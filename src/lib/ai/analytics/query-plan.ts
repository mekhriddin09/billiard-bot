import "server-only";
import { ServiceError } from "../../services/errors";
import {
  ANALYTICS_SCHEMA,
  MAX_DATE_RANGE_DAYS,
  MAX_FILTERS,
  MAX_GROUP_ROWS,
  MAX_INCLUDES,
  MAX_LIST_ROWS,
  type FieldDef,
  type RelationshipDef,
  type TableDef,
} from "./schema";
import { validateDateRange } from "../validate-utils";

/**
 * ============================================================
 * QUERY PLAN — TIP VA QAT'IY VALIDATOR
 * ============================================================
 *
 * LLM'dan keladigan XOM `QueryPlanInput` HECH QACHON to'g'ridan-to'g'ri
 * Supabase so'roviga uzatilmaydi. `validateQueryPlan()` uni
 * `ANALYTICS_SCHEMA` whitelist asosida tekshiradi va faqat shundan
 * keyingina `ValidatedPlan` (haqiqiy ustun nomlari, tasdiqlangan
 * operator/relationship/limit bilan) `query-executor.ts`ga uzatiladi.
 *
 * Bu yerda tasdiqlanmagan HECH NARSA keyingi bosqichga o'tmaydi — arbitrar
 * SQL yo'q, faqat oldindan belgilangan jadval/field/relationship/operator
 * kombinatsiyalari.
 */

export const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "ilike"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const AGGREGATE_FNS = ["count", "sum", "avg", "min", "max"] as const;
export type AggregateFn = (typeof AGGREGATE_FNS)[number];

export interface QueryPlanInput {
  table: string;
  dateRange?: { from: string; to: string };
  timeWindow?: { from: string; to: string };
  filters?: Array<{ field: string; op: string; value: unknown }>;
  include?: string[];
  groupBy?: string;
  aggregate?: { fn: string; field?: string };
  orderBy?: { field: string; direction?: string };
  limit?: number;
}

export interface ValidatedFilter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface ValidatedPlan {
  tableKey: string;
  tableDef: TableDef;
  dateRange?: { from: string; to: string };
  timeWindow?: { from: string; to: string };
  filters: ValidatedFilter[];
  includes: RelationshipDef[];
  groupBy?: { key: string; field: FieldDef };
  aggregate?: { fn: AggregateFn; field?: FieldDef };
  orderBy?: { column: string; direction: "asc" | "desc"; isAggregateValue: boolean };
  limit: number;
}

function fail(msg: string): never {
  throw new ServiceError(msg, 400);
}

function requireTableDef(tableKey: unknown): { key: string; def: TableDef } {
  if (typeof tableKey !== "string" || !ANALYTICS_SCHEMA[tableKey]) {
    fail(`Noma'lum jadval: "${tableKey}". Ruxsat etilgan: ${Object.keys(ANALYTICS_SCHEMA).join(", ")}`);
  }
  return { key: tableKey, def: ANALYTICS_SCHEMA[tableKey] };
}

function requireField(def: TableDef, tableKey: string, fieldKey: unknown, purpose: string): { key: string; field: FieldDef } {
  if (typeof fieldKey !== "string" || !def.fields[fieldKey]) {
    fail(`"${tableKey}" jadvalida "${fieldKey}" maydoni yo'q (${purpose})`);
  }
  const field = def.fields[fieldKey];
  if (field.sensitive) fail(`"${fieldKey}" nozik maydon — ${purpose} uchun ishlatib bo'lmaydi`);
  return { key: fieldKey, field };
}

export function validateQueryPlan(raw: unknown): ValidatedPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Query plan formati noto'g'ri");
  const plan = raw as QueryPlanInput;

  const { key: tableKey, def: tableDef } = requireTableDef(plan.table);

  // ─── Sana oralig'i ──────────────────────────────────────────
  let dateRange: { from: string; to: string } | undefined;
  if (plan.dateRange) {
    if (!tableDef.dateField && !tableDef.dateViaRelationship) {
      fail(`"${tableKey}" jadvali uchun sana filtri qo'llab bo'lmaydi`);
    }
    if (typeof plan.dateRange.from !== "string" || typeof plan.dateRange.to !== "string") {
      fail("dateRange.from/to YYYY-MM-DD bo'lishi kerak");
    }
    dateRange = validateDateRange(plan.dateRange.from, plan.dateRange.to, MAX_DATE_RANGE_DAYS);
  }

  // ─── Kun ichidagi vaqt oynasi ───────────────────────────────
  let timeWindow: { from: string; to: string } | undefined;
  if (plan.timeWindow) {
    if (!tableDef.timeField) fail(`"${tableKey}" jadvali uchun vaqt oynasi (timeWindow) qo'llab bo'lmaydi`);
    const TIME_RE = /^\d{2}:\d{2}$/;
    if (typeof plan.timeWindow.from !== "string" || !TIME_RE.test(plan.timeWindow.from)) fail("timeWindow.from HH:MM bo'lishi kerak");
    if (typeof plan.timeWindow.to !== "string" || !TIME_RE.test(plan.timeWindow.to)) fail("timeWindow.to HH:MM bo'lishi kerak");
    if (!dateRange || dateRange.from !== dateRange.to) {
      fail("timeWindow faqat BITTA kun uchun (dateRange.from === dateRange.to) ishlatiladi");
    }
    timeWindow = { from: plan.timeWindow.from, to: plan.timeWindow.to };
  }

  // ─── Filterlar ──────────────────────────────────────────────
  const rawFilters = plan.filters ?? [];
  if (rawFilters.length > MAX_FILTERS) fail(`Juda ko'p filter (maks ${MAX_FILTERS})`);
  const filters: ValidatedFilter[] = rawFilters.map((f) => {
    const { field } = requireField(tableDef, tableKey, f.field, "filter");
    if (!field.filterable) fail(`"${f.field}" maydonida filter qo'llab bo'lmaydi`);
    if (typeof f.op !== "string" || !FILTER_OPS.includes(f.op as FilterOp)) {
      fail(`Noma'lum operator: "${f.op}". Ruxsat etilgan: ${FILTER_OPS.join(", ")}`);
    }
    const op = f.op as FilterOp;
    if (field.enumValues && (op === "eq" || op === "neq")) {
      if (typeof f.value !== "string" || !field.enumValues.includes(f.value)) {
        fail(`"${f.field}" uchun qiymat quyidagilardan biri bo'lishi kerak: ${field.enumValues.join(", ")}`);
      }
    }
    if (op === "in") {
      if (!Array.isArray(f.value) || f.value.length === 0) fail(`"in" operatori uchun bo'sh bo'lmagan massiv kerak`);
      if (f.value.length > 20) fail(`"in" operatorida ko'pi bilan 20 ta qiymat bo'lishi mumkin`);
    }
    if (f.value === undefined || f.value === null) fail(`"${f.field}" filter qiymati kerak`);
    return { column: field.column, op, value: f.value };
  });

  // ─── Include (relationship) ─────────────────────────────────
  const includeKeys = plan.include ?? [];
  if (includeKeys.length > MAX_INCLUDES) fail(`Juda ko'p include (maks ${MAX_INCLUDES})`);
  const includes: RelationshipDef[] = includeKeys.map((k) => {
    const rel = tableDef.relationships?.[k];
    if (!rel) fail(`"${tableKey}" jadvalida "${k}" relationship yo'q`);
    return rel;
  });

  // ─── GroupBy ────────────────────────────────────────────────
  let groupBy: ValidatedPlan["groupBy"];
  if (plan.groupBy) {
    const { key, field } = requireField(tableDef, tableKey, plan.groupBy, "groupBy");
    if (!field.groupable) fail(`"${plan.groupBy}" maydoni bo'yicha guruhlab bo'lmaydi`);
    groupBy = { key, field };
  }

  // ─── Aggregate ──────────────────────────────────────────────
  let aggregate: ValidatedPlan["aggregate"];
  if (plan.aggregate) {
    if (typeof plan.aggregate.fn !== "string" || !AGGREGATE_FNS.includes(plan.aggregate.fn as AggregateFn)) {
      fail(`Noma'lum aggregate funksiya: "${plan.aggregate.fn}". Ruxsat etilgan: ${AGGREGATE_FNS.join(", ")}`);
    }
    const fn = plan.aggregate.fn as AggregateFn;
    if (fn === "count") {
      aggregate = { fn };
    } else {
      if (!plan.aggregate.field) fail(`"${fn}" uchun "field" kerak`);
      const { field } = requireField(tableDef, tableKey, plan.aggregate.field, "aggregate");
      if (!field.aggregatable) fail(`"${plan.aggregate.field}" maydoni bo'yicha ${fn} qo'llab bo'lmaydi (sonli/moliyaviy formula maydoni emas)`);
      aggregate = { fn, field };
    }
  }

  // ─── OrderBy ────────────────────────────────────────────────
  let orderBy: ValidatedPlan["orderBy"];
  if (plan.orderBy) {
    const direction = plan.orderBy.direction === "asc" ? "asc" : "desc";
    if (plan.orderBy.field === "value") {
      if (!aggregate) fail(`orderBy.field="value" faqat aggregate bilan birga ishlatiladi`);
      orderBy = { column: "__value__", direction, isAggregateValue: true };
    } else {
      const { field } = requireField(tableDef, tableKey, plan.orderBy.field, "orderBy");
      orderBy = { column: field.column, direction, isAggregateValue: false };
    }
  }

  // ─── Limit ──────────────────────────────────────────────────
  const isGrouped = !!groupBy || !!aggregate;
  const hardCap = isGrouped ? MAX_GROUP_ROWS : MAX_LIST_ROWS;
  let limit = typeof plan.limit === "number" && Number.isFinite(plan.limit) ? Math.floor(plan.limit) : isGrouped ? 20 : 50;
  if (limit < 1) fail(`"limit" 1 dan katta bo'lishi kerak`);
  if (limit > hardCap) limit = hardCap;

  return { tableKey, tableDef, dateRange, timeWindow, filters, includes, groupBy, aggregate, orderBy, limit };
}
