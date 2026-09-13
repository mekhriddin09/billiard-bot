import "server-only";

/**
 * ============================================================
 * UNIVERSAL READ/ANALYTICS — SCHEMA WHITELIST
 * ============================================================
 *
 * Bu fayl — universal safe query engine'ning "xavfsizlik devori" ustunlari.
 * LLM'ga BUTUN DB sxemasi xom holda hech qachon berilmaydi — faqat shu
 * yerda ro'yxatga olingan jadval/field/relationship'lar mavjud, boshqa
 * HECH NARSA (masalan `staff.tg_id`, `customers.phone` kabi nozik
 * maydonlar, yoki bu yerda yo'q jadvallar — `session_edit_log`,
 * `cash_reconciliations`, `reservations` va h.k.) LLM'ga umuman
 * ko'rsatilmaydi va query engine ularni QABUL QILMAYDI.
 *
 * `src/lib/ai/analytics/query-plan.ts`dagi validator FAQAT shu whitelist
 * asosida ishlaydi — bu yerda yo'q narsa querydan HECH QACHON o'tmaydi.
 */

export type FieldFormat = "money" | "date" | "datetime" | "time" | "text" | "number" | "bool" | "id" | "enum";

export interface FieldDef {
  /** Haqiqiy DB ustun nomi (snake_case). */
  column: string;
  /** Foydalanuvchiga ko'rsatiladigan o'zbekcha nom. */
  label: string;
  format: FieldFormat;
  /** true bo'lsa — filter'da ishlatish mumkin. */
  filterable: boolean;
  /** true bo'lsa — sum/avg/min/max uchun (faqat sonli maydonlar). */
  aggregatable: boolean;
  /** true bo'lsa — groupBy uchun ishlatish mumkin. */
  groupable: boolean;
  /** true bo'lsa — bu maydon NOZIK (masalan telefon) — natijada standart
   *  chiqmaydi, faqat `allowSensitive: true` aniq so'ralganda (va rol
   *  ruxsat bersa) qo'shiladi. */
  sensitive?: boolean;
  enumValues?: readonly string[];
}

export interface RelationshipDef {
  /** Plan ichida ishlatiladigan nom (masalan "orders", "table", "debt"). */
  key: string;
  toTable: string;
  /** Joriy jadvaldagi ustun. */
  fromColumn: string;
  /** Bog'langan jadvaldagi ustun. */
  toColumn: string;
  description: string;
}

export interface TableDef {
  table: string;
  label: string;
  description: string;
  /** Sana oralig'i filtri UNASHNI QAYSI USTUNGA qo'llash kerak (bu jadvalda mavjud bo'lsa). */
  dateField?: string;
  /** Kun ichidagi vaqt oynasi (HH:MM) filtri qaysi timestamptz ustunga qo'llanadi. */
  timeField?: string;
  /** Bu jadvalda sana ustuni YO'Q bo'lsa — shu relationship orqali
   *  bog'langan jadvalning `dateField`idan foydalaniladi (masalan
   *  session_orders'da sana yo'q — "session" relationship orqali
   *  game_sessions.business_date ishlatiladi). */
  dateViaRelationship?: string;
  fields: Record<string, FieldDef>;
  relationships?: Record<string, RelationshipDef>;
}

const money = (column: string, label: string, opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "money",
  filterable: true,
  aggregatable: true,
  groupable: false,
  ...opts,
});
const text = (column: string, label: string, opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "text",
  filterable: true,
  aggregatable: false,
  groupable: true,
  ...opts,
});
const num = (column: string, label: string, opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "number",
  filterable: true,
  aggregatable: true,
  groupable: false,
  ...opts,
});
const dt = (column: string, label: string, format: "date" | "datetime" = "datetime", opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format,
  filterable: true,
  aggregatable: false,
  groupable: false,
  ...opts,
});
const idField = (column: string, label: string, opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "id",
  filterable: true,
  aggregatable: false,
  groupable: !!opts?.groupable,
  ...opts,
});
const enumField = (column: string, label: string, values: readonly string[], opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "enum",
  filterable: true,
  aggregatable: false,
  groupable: true,
  enumValues: values,
  ...opts,
});
const boolField = (column: string, label: string, opts?: Partial<FieldDef>): FieldDef => ({
  column,
  label,
  format: "bool",
  filterable: true,
  aggregatable: false,
  groupable: true,
  ...opts,
});

export const ANALYTICS_SCHEMA: Record<string, TableDef> = {
  sessions: {
    table: "game_sessions",
    label: "O'yin sessiyalari",
    description: "Har bir stol o'yinining bitta yozuvi — boshlanishi, tugashi, to'lovi, holati.",
    dateField: "business_date",
    timeField: "started_at",
    fields: {
      id: idField("id", "Sessiya ID"),
      tableId: idField("table_id", "Stol ID", { groupable: true }),
      startedAt: dt("started_at", "Boshlangan vaqti"),
      endedAt: dt("ended_at", "Tugagan vaqti"),
      businessDate: dt("business_date", "Biznes kuni", "date"),
      status: enumField("status", "Holati", ["active", "closed"]),
      paymentMethod: enumField("payment_method", "To'lov usuli", ["cash", "card", "mixed"]),
      paymentStatus: enumField("payment_status", "To'lov holati", ["paid", "partial", "debt"]),
      finalTableCost: money("final_table_cost", "Stol narxi (yopilganda)"),
      finalTotal: money("final_total", "Jami summa (yopilganda)"),
      paidAmount: money("paid_amount", "To'langan summa"),
      debtAmount: money("debt_amount", "Qarz summasi"),
      adjustMinutes: num("adjust_minutes", "Vaqt tuzatishi (daqiqa)"),
      closedByName: text("closed_by_name", "Kim yopgan (xodim)"),
      closedByRole: text("closed_by_role", "Yopuvchi roli"),
      note: text("note", "Izoh", { groupable: false }),
      customerPhone: text("customer_phone", "Mijoz telefoni", { sensitive: true, groupable: false }),
    },
    relationships: {
      table: { key: "table", toTable: "tables", fromColumn: "table_id", toColumn: "id", description: "Qaysi stolda" },
      orders: { key: "orders", toTable: "session_orders", fromColumn: "id", toColumn: "session_id", description: "Sessiyadagi buyurtmalar" },
      debt: { key: "debt", toTable: "debts", fromColumn: "id", toColumn: "session_id", description: "Sessiyadan qolgan qarz (bo'lsa)" },
    },
  },

  session_orders: {
    table: "session_orders",
    label: "Sessiya buyurtmalari",
    description: "Sessiya davomida sotilgan mahsulotlar (bitta qator = bitta mahsulot turi).",
    dateViaRelationship: "session",
    fields: {
      id: idField("id", "Buyurtma ID"),
      sessionId: idField("session_id", "Sessiya ID"),
      productId: idField("product_id", "Mahsulot ID", { groupable: true }),
      name: text("name", "Mahsulot nomi"),
      price: money("price", "Narxi"),
      qty: num("qty", "Miqdori"),
    },
    relationships: {
      session: { key: "session", toTable: "sessions", fromColumn: "session_id", toColumn: "id", description: "Qaysi sessiyaga tegishli" },
      product: { key: "product", toTable: "products", fromColumn: "product_id", toColumn: "id", description: "Mahsulot ma'lumoti" },
    },
  },

  tables: {
    table: "club_tables",
    label: "Stollar",
    description: "Klubdagi billiard/tennis stollari.",
    fields: {
      id: idField("id", "Stol ID"),
      number: num("number", "Raqami", { groupable: true }),
      name: text("name", "Nomi"),
      type: enumField("type", "Turi", ["billiard", "tennis"]),
      tier: enumField("tier", "Darajasi", ["standard", "vip"]),
      pricePerHour: money("price_per_hour", "Soatlik narx"),
      enabled: boolField("enabled", "Yoqilganmi"),
    },
  },

  products: {
    table: "products",
    label: "Mahsulotlar",
    description: "Sotiladigan mahsulotlar katalogi (ichimlik, tamaki va h.k.).",
    fields: {
      id: idField("id", "Mahsulot ID"),
      categoryId: idField("category_id", "Kategoriya ID", { groupable: true }),
      name: text("name", "Nomi"),
      price: money("price", "Narxi"),
      active: boolField("active", "Faolmi"),
      trackInventory: boolField("track_inventory", "Ombor kuzatiladimi"),
      stockQty: num("stock_qty", "Ombordagi miqdor"),
    },
    relationships: {
      category: { key: "category", toTable: "product_categories", fromColumn: "category_id", toColumn: "id", description: "Kategoriyasi" },
    },
  },

  product_categories: {
    table: "product_categories",
    label: "Mahsulot kategoriyalari",
    description: "Mahsulotlar guruhlanadigan kategoriyalar.",
    fields: {
      id: idField("id", "Kategoriya ID"),
      name: text("name", "Nomi"),
    },
  },

  debts: {
    table: "debts",
    label: "Qarzlar",
    description: "Mijozlarning ochiq/yopilgan qarzlari (sessiya qarzga yopilganda avtomatik yaratiladi).",
    fields: {
      id: idField("id", "Qarz ID"),
      sessionId: idField("session_id", "Sessiya ID"),
      tableId: idField("table_id", "Stol ID", { groupable: true }),
      customerName: text("customer_name", "Mijoz ismi"),
      customerPhone: text("customer_phone", "Mijoz telefoni", { sensitive: true, groupable: false }),
      originalAmount: money("original_amount", "Boshlang'ich summa"),
      paidAmount: money("paid_amount", "To'langan summa"),
      remainingAmount: money("remaining_amount", "Qolgan summa"),
      status: enumField("status", "Holati", ["open", "paid"]),
      dueDate: dt("due_date", "Muddati", "date"),
      createdByName: text("created_by_name", "Kim yaratgan"),
      createdAt: dt("created_at", "Yaratilgan vaqti"),
    },
    relationships: {
      session: { key: "session", toTable: "sessions", fromColumn: "session_id", toColumn: "id", description: "Qaysi sessiyadan qolgan" },
      payments: { key: "payments", toTable: "debt_payments", fromColumn: "id", toColumn: "debt_id", description: "Qarz to'lovlari tarixi" },
    },
  },

  debt_payments: {
    table: "debt_payments",
    label: "Qarz to'lovlari",
    description: "Qarzga qilingan har bir to'lov yozuvi.",
    fields: {
      id: idField("id", "To'lov ID"),
      debtId: idField("debt_id", "Qarz ID"),
      amount: money("amount", "Summa"),
      method: enumField("method", "To'lov usuli", ["cash", "card", "mixed"]),
      staffName: text("staff_name", "Qabul qilgan xodim"),
      at: dt("at", "Vaqti"),
    },
    relationships: {
      debt: { key: "debt", toTable: "debts", fromColumn: "debt_id", toColumn: "id", description: "Qaysi qarzga tegishli" },
    },
  },

  expenses: {
    table: "expenses",
    label: "Xarajatlar",
    description: "Operatsion xarajatlar (ijara, svet va h.k.) — inventar xaridi/oylik bu yerda EMAS.",
    dateField: "business_date",
    fields: {
      id: idField("id", "Xarajat ID"),
      categoryId: idField("category_id", "Kategoriya ID", { groupable: true }),
      name: text("name", "Nomi"),
      amount: money("amount", "Summa"),
      paymentMethod: enumField("payment_method", "To'lov usuli", ["cash", "card", "mixed"]),
      businessDate: dt("business_date", "Biznes kuni", "date"),
      staffName: text("staff_name", "Kim yozgan"),
    },
    relationships: {
      category: { key: "category", toTable: "expense_categories", fromColumn: "category_id", toColumn: "id", description: "Kategoriyasi" },
    },
  },

  expense_categories: {
    table: "expense_categories",
    label: "Xarajat kategoriyalari",
    description: "Xarajatlar guruhlanadigan kategoriyalar.",
    fields: {
      id: idField("id", "Kategoriya ID"),
      name: text("name", "Nomi"),
    },
  },
};

export const MAX_FILTERS = 6;
export const MAX_INCLUDES = 2;
export const MAX_DATE_RANGE_DAYS = 366;
export const MAX_LIST_ROWS = 200;
export const MAX_AGGREGATE_SCAN_ROWS = 5000;
export const MAX_GROUP_ROWS = 50;

/** LLM uchun — faqat whitelist qilingan, KOMPAKT sxema tavsifi (system promptga qo'shiladi). */
export function buildSchemaPromptSection(): string {
  const lines: string[] = [];
  for (const [key, t] of Object.entries(ANALYTICS_SCHEMA)) {
    const fieldList = Object.entries(t.fields)
      .filter(([, f]) => !f.sensitive)
      .map(([fk, f]) => `${fk}(${f.format}${f.groupable ? ",group" : ""}${f.aggregatable ? ",agg" : ""})`)
      .join(", ");
    const relList = t.relationships ? Object.keys(t.relationships).join(", ") : "-";
    lines.push(`- "${key}" — ${t.label}: ${t.description}\n  fields: ${fieldList}\n  relationships: ${relList}`);
  }
  return lines.join("\n");
}
