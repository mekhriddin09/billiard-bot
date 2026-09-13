import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "../../services/errors";
import { ANALYTICS_SCHEMA, MAX_AGGREGATE_SCAN_ROWS, type TableDef } from "./schema";
import type { AggregateFn, ValidatedFilter, ValidatedPlan } from "./query-plan";

/**
 * ============================================================
 * QUERY EXECUTOR — FAQAT Supabase query builder (supabase-js), HECH
 * QANDAY raw SQL/RPC YO'Q. Har bir metod PostgREST'ning rasman
 * hujjatlashtirilgan operatorlaridan (`.eq/.gte/.in/.ilike/...` va
 * "embedded resource" select sintaksisi `alias:table(cols)`) foydalanadi
 * — bular hammasi parametrlashtirilgan, SQL-inyeksiyaga ochiq emas.
 * ============================================================
 */

const CLUB_TZ_OFFSET = "+05:00"; // Asia/Tashkent

function tashkentDateTimeToUTC(dateStr: string, hhmm: string): string {
  return new Date(`${dateStr}T${hhmm}:00${CLUB_TZ_OFFSET}`).toISOString();
}

export interface QueryResult {
  /** groupBy/aggregate bo'lsa — {label, value}[]; aks holda — xom qatorlar ro'yxati. */
  rows: Record<string, unknown>[];
  mode: "list" | "aggregate";
  /** LIST rejimida: filtrga mos JAMI son (limit qo'llanishidan oldin). */
  totalCount?: number;
  truncated: boolean;
}

function applyFilters(query: any, filters: ValidatedFilter[]) {
  for (const f of filters) {
    switch (f.op) {
      case "eq":
        query = query.eq(f.column, f.value);
        break;
      case "neq":
        query = query.neq(f.column, f.value);
        break;
      case "gt":
        query = query.gt(f.column, f.value);
        break;
      case "gte":
        query = query.gte(f.column, f.value);
        break;
      case "lt":
        query = query.lt(f.column, f.value);
        break;
      case "lte":
        query = query.lte(f.column, f.value);
        break;
      case "in":
        query = query.in(f.column, f.value as unknown[]);
        break;
      case "ilike":
        query = query.ilike(f.column, `%${f.value}%`);
        break;
    }
  }
  return query;
}

function nonSensitiveColumns(tableDef: TableDef): string[] {
  return Object.values(tableDef.fields)
    .filter((f) => !f.sensitive)
    .map((f) => f.column);
}

/** dateViaRelationship (masalan session_orders → sessions.business_date) uchun
 *  embedded-resource select fragmenti va filtr prefiksini tayyorlaydi. */
function resolveDateJoin(plan: ValidatedPlan): { selectFragment: string; filterPrefix: string; dateColumn: string } | null {
  if (!plan.dateRange) return null;
  if (plan.tableDef.dateField) return null; // to'g'ridan-to'g'ri ustun bor — join shart emas
  if (!plan.tableDef.dateViaRelationship) return null;

  const rel = plan.tableDef.relationships?.[plan.tableDef.dateViaRelationship];
  if (!rel) throw new ServiceError("Sana relationship topilmadi (ichki xato)", 500);
  const relatedDef = ANALYTICS_SCHEMA[rel.toTable];
  if (!relatedDef?.dateField) throw new ServiceError("Bog'langan jadvalda sana maydoni yo'q (ichki xato)", 500);

  return {
    selectFragment: `${rel.key}:${relatedDef.table}!inner(${relatedDef.dateField})`,
    filterPrefix: rel.key,
    dateColumn: relatedDef.dateField,
  };
}

function buildIncludeFragments(plan: ValidatedPlan): string[] {
  return plan.includes.map((rel) => {
    const relatedDef = ANALYTICS_SCHEMA[rel.toTable];
    const cols = nonSensitiveColumns(relatedDef).join(",");
    return `${rel.key}:${relatedDef.table}(${cols})`;
  });
}

// ============================================================
// LIST rejimi — filtr/sana/vaqt/include, limit bilan cheklangan
// ============================================================
async function runListQuery(supabase: SupabaseClient, plan: ValidatedPlan): Promise<QueryResult> {
  const ownColumns = nonSensitiveColumns(plan.tableDef);
  const includeFragments = buildIncludeFragments(plan);
  const dateJoin = resolveDateJoin(plan);

  const selectParts = [...ownColumns, ...includeFragments];
  if (dateJoin) selectParts.push(dateJoin.selectFragment);

  // Select ustunlari runtime'da dinamik quriladi (literal string emas) —
  // supabase-js'ning select() literal-parser generiklari bunday holatda
  // amaliy foyda bermaydigan xato tiplarini chiqaradi (masalan
  // `GenericStringError`). Runtime xatti-harakatiga ta'sir qilmaydi —
  // Postgrest bu qatorni oddiy matn sifatida qabul qiladi; shuning uchun
  // faqat TIP darajasida `any`ga tushiramiz.
  let query = (supabase.from(plan.tableDef.table) as any).select(selectParts.join(","), { count: "exact" });

  query = applyFilters(query, plan.filters);

  if (plan.dateRange) {
    if (plan.tableDef.dateField) {
      query = query.gte(plan.tableDef.dateField, plan.dateRange.from).lte(plan.tableDef.dateField, plan.dateRange.to);
    } else if (dateJoin) {
      query = query.gte(`${dateJoin.filterPrefix}.${dateJoin.dateColumn}`, plan.dateRange.from).lte(`${dateJoin.filterPrefix}.${dateJoin.dateColumn}`, plan.dateRange.to);
    }
  }

  if (plan.timeWindow && plan.tableDef.timeField && plan.dateRange) {
    const fromIso = tashkentDateTimeToUTC(plan.dateRange.from, plan.timeWindow.from);
    const toIso = tashkentDateTimeToUTC(plan.dateRange.to, plan.timeWindow.to);
    query = query.gte(plan.tableDef.timeField, fromIso).lte(plan.tableDef.timeField, toIso);
  }

  if (plan.orderBy && !plan.orderBy.isAggregateValue) {
    query = query.order(plan.orderBy.column, { ascending: plan.orderBy.direction === "asc" });
  }

  query = query.limit(plan.limit);

  const { data, error, count } = await query;
  if (error) throw new ServiceError(`So'rov xatosi: ${error.message}`, 500);

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows,
    mode: "list",
    totalCount: count ?? rows.length,
    truncated: (count ?? rows.length) > rows.length,
  };
}

// ============================================================
// AGGREGATE/GROUP BY rejimi — avval HAJM tekshiruvi (exact count,
// qatorlarni o'qimasdan), keyingina cheklangan hajmda o'qib, JS'da
// hisoblanadi (custom RPC/raw SQL shart emas).
// ============================================================
async function runAggregateQuery(supabase: SupabaseClient, plan: ValidatedPlan): Promise<QueryResult> {
  const dateJoin = resolveDateJoin(plan);

  function baseQuery(selectCols: string, forCount: boolean) {
    // Xuddi runListQuery'dagidek — dinamik select string, faqat TIP
    // darajasida `any` (runtime xatti-harakatga ta'sir qilmaydi).
    let q = (supabase.from(plan.tableDef.table) as any).select(selectCols, forCount ? { count: "exact", head: true } : undefined);
    q = applyFilters(q, plan.filters);
    if (plan.dateRange) {
      if (plan.tableDef.dateField) {
        q = q.gte(plan.tableDef.dateField, plan.dateRange!.from).lte(plan.tableDef.dateField, plan.dateRange!.to);
      } else if (dateJoin) {
        q = q.gte(`${dateJoin.filterPrefix}.${dateJoin.dateColumn}`, plan.dateRange!.from).lte(`${dateJoin.filterPrefix}.${dateJoin.dateColumn}`, plan.dateRange!.to);
      }
    }
    if (plan.timeWindow && plan.tableDef.timeField && plan.dateRange) {
      const fromIso = tashkentDateTimeToUTC(plan.dateRange.from, plan.timeWindow.from);
      const toIso = tashkentDateTimeToUTC(plan.dateRange.to, plan.timeWindow.to);
      q = q.gte(plan.tableDef.timeField, fromIso).lte(plan.tableDef.timeField, toIso);
    }
    return q;
  }

  // 1) Hajm tekshiruvi — qatorlarni o'qimasdan, faqat sonini bilamiz.
  const countSelect = dateJoin ? dateJoin.selectFragment : "id";
  const { count, error: countError } = await baseQuery(countSelect, true);
  if (countError) throw new ServiceError(`So'rov xatosi: ${countError.message}`, 500);
  if ((count ?? 0) > MAX_AGGREGATE_SCAN_ROWS) {
    throw new ServiceError(
      `Bu so'rov juda ko'p yozuvni (${count}) qamrab oladi — sana oralig'ini toraytiring (maks ${MAX_AGGREGATE_SCAN_ROWS} yozuv)`,
      400
    );
  }

  // 2) Kerakli ustunlarni (groupBy + aggregate maydoni) o'qiymiz.
  const cols = new Set<string>();
  if (plan.groupBy) cols.add(plan.groupBy.field.column);
  if (plan.aggregate?.field) cols.add(plan.aggregate.field.column);
  if (cols.size === 0) cols.add("id");
  const selectCols = Array.from(cols).join(",") + (dateJoin ? `,${dateJoin.selectFragment}` : "");

  const { data, error } = await baseQuery(selectCols, false).limit(MAX_AGGREGATE_SCAN_ROWS);
  if (error) throw new ServiceError(`So'rov xatosi: ${error.message}`, 500);
  const rows = (data ?? []) as Record<string, unknown>[];

  // 3) JS'da agregatsiya.
  const groupKey = plan.groupBy?.field.column;
  const aggField = plan.aggregate?.field?.column;
  const fn: AggregateFn = plan.aggregate?.fn ?? "count";

  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = groupKey ? String(row[groupKey] ?? "—") : "__all__";
    const numVal = aggField ? Number(row[aggField] ?? 0) : 1;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(numVal);
  }

  function reduce(values: number[]): number {
    switch (fn) {
      case "count":
        return values.length;
      case "sum":
        return values.reduce((s, v) => s + v, 0);
      case "avg":
        return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      case "min":
        return values.length ? Math.min(...values) : 0;
      case "max":
        return values.length ? Math.max(...values) : 0;
    }
  }

  let groupRows = Array.from(buckets.entries()).map(([key, values]) => ({ groupKey: key, value: reduce(values) }));

  if (plan.orderBy?.isAggregateValue) {
    groupRows.sort((a, b) => (plan.orderBy!.direction === "asc" ? a.value - b.value : b.value - a.value));
  } else {
    groupRows.sort((a, b) => b.value - a.value); // standart: kattadan kichikka
  }

  const truncated = groupRows.length > plan.limit;
  groupRows = groupRows.slice(0, plan.limit);

  return { rows: groupRows, mode: "aggregate", truncated };
}

/** groupBy'da ID maydoni ishlatilgan bo'lsa (masalan tableId, productId) —
 *  natijadagi kalitlarni inson o'qiy oladigan nomga aylantiradi. Faqat
 *  `ANALYTICS_SCHEMA`da e'lon qilingan relationship orqali — ixtiyoriy
 *  jadvalga so'rov yubormaydi. */
export async function resolveGroupLabels(
  supabase: SupabaseClient,
  plan: ValidatedPlan,
  groupKeys: string[]
): Promise<Record<string, string>> {
  if (!plan.groupBy) return {};
  const rel = Object.values(plan.tableDef.relationships ?? {}).find((r) => r.fromColumn === plan.groupBy!.field.column);
  if (!rel) return {};
  const relatedDef = ANALYTICS_SCHEMA[rel.toTable];
  if (!relatedDef?.fields.name) return {};

  const validIds = groupKeys.filter((k) => k !== "—");
  if (validIds.length === 0) return {};
  const { data } = await (supabase.from(relatedDef.table) as any).select(`id,${relatedDef.fields.name.column}`).in("id", validIds);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    map[String(row.id)] = String(row[relatedDef.fields.name.column] ?? row.id);
  }
  return map;
}

export async function executeQueryPlan(supabase: SupabaseClient, plan: ValidatedPlan): Promise<QueryResult> {
  if (plan.groupBy || plan.aggregate) {
    return runAggregateQuery(supabase, plan);
  }
  return runListQuery(supabase, plan);
}
