import "server-only";
import { addOrderCore, adjustTimeCore, closeSessionCore, startSessionCore } from "../../services/sessions";
import { fmtMoney } from "../../format";
import { ServiceError } from "../../services/errors";
import type { ToolDefinition, ToolExecutionResult } from "../tool-types";
import { asRecord, optionalEnum, optionalNumber, optionalString, requireNumber, requireString } from "../validate-utils";
import { resolveActiveSessionByTable, resolveProductByName, resolveTable } from "./resolve-helpers";

/**
 * OPERATSION TOOL'LAR — Stage D. Barchasi `mutating: true, risky: false`
 * (✅/❌ minimal tasdiqlash — moliyaviy/xavfli emas). HAR BIRI faqat mavjud
 * `src/lib/services/sessions.ts` funksiyalarini chaqiradi — biznes-mantiq
 * bu yerda TAKRORLANMAYDI.
 *
 * STOLNI ANIQLASH: xodimlar/foydalanuvchilar kunlik ishda stolni odatda
 * NOMI bilan aytishadi ("T1 stolni och", "tenis stol och"), raqami bilan
 * emas ("number" ustuni faqat ichki, har bir TUR (billiard/tennis) ichida
 * alohida hisoblanadi — shuning uchun billiard №1 va tennis T1 bir xil
 * `number=1`ga ega bo'lishi mumkin). Shu sabab har bir tool endi 3 xil
 * identifikatorni qabul qiladi (`tableNumber`/`tableName`/`tableType`) —
 * kamida bittasi kerak, `resolveTable()` (resolve-helpers.ts) ularni
 * ANIQ bitta stolga hal qiladi yoki noaniq bo'lsa tushunarli xato beradi.
 */

const TABLE_ID_PROPS = {
  tableNumber: { type: "integer", description: "Stol raqami, agar foydalanuvchi aniq raqam aytsa (masalan 'stol 5')" },
  tableName: {
    type: "string",
    description: "Stol nomi, agar foydalanuvchi nom bilan aytsa (masalan 'T1', '№5', 'VIP1') — foydalanuvchi aytgan aynan shu nomni yoz",
  },
  tableType: {
    type: "string",
    enum: ["billiard", "tennis"],
    description: "Faqat foydalanuvchi RAQAM/NOM bermay, faqat TURINI aytsa (masalan 'tenis stol och') — shunda shuni to'ldir, tableNumber/tableName'ni bo'sh qoldir",
  },
} as const;

function extractTableId(args: Record<string, unknown>): { tableNumber?: number; tableName?: string; tableType?: string } {
  const tableNumber = optionalNumber(args, "tableNumber", { integer: true, min: 1, max: 999 });
  const tableName = optionalString(args, "tableName", { maxLen: 50 });
  const tableType = optionalEnum(args, "tableType", ["billiard", "tennis"] as const);
  if (tableNumber === undefined && !tableName && !tableType) {
    throw new ServiceError('Qaysi stol ekanini aniqlab bering — raqami, nomi (masalan "T1") yoki turi (billiard/tennis)', 400);
  }
  return { ...(tableNumber !== undefined ? { tableNumber } : {}), ...(tableName ? { tableName } : {}), ...(tableType ? { tableType } : {}) };
}

// ─── 1) Stol ochish ──────────────────────────────────────────────────────
const openTable: ToolDefinition = {
  description:
    "Stolda yangi o'yin sessiyasini boshlaydi. Masalan: '5 stolni och', 'T1 stolni och', 'tenis stol och'. Stolni raqami, nomi YOKI turi bilan aniqlash mumkin.",
  parameters: {
    type: "object",
    properties: { ...TABLE_ID_PROPS, phone: { type: "string", description: "Mijoz telefon raqami, ixtiyoriy (+998...)" } },
    required: [],
  },
  mutating: true,
  risky: false,
  validate: (raw) => {
    const args = asRecord(raw);
    const tableId = extractTableId(args);
    const phone = optionalString(args, "phone", { maxLen: 20 });
    return { ...tableId, ...(phone ? { phone } : {}) };
  },
  resolve: async (supabase, args) => {
    const table = await resolveTable(supabase, args as { tableNumber?: number; tableName?: string; tableType?: string });
    const { data: activeSession } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("table_id", table.id)
      .eq("status", "active")
      .maybeSingle();
    if (activeSession) throw new ServiceError(`Stol ${table.name}da allaqachon aktiv sessiya bor`, 409);

    const preview = `🎱 <b>Stol ${table.name} ni ochish</b>${args.phone ? `\nMijoz: ${args.phone}` : ""}`;
    return { preview, resolvedArgs: { tableId: table.id, tableName: table.name, phone: args.phone } };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { session } = await startSessionCore(supabase, auth, {
      tableId: args.tableId as string,
      phone: args.phone as string | undefined,
    });
    return { resultSummary: `Stol ${args.tableName} ochildi (sessiya #${session.id.slice(0, 8)})` };
  },
};

// ─── 2) Mahsulot qo'shish ────────────────────────────────────────────────
const addProduct: ToolDefinition = {
  description:
    "Faol sessiyaga mahsulot (ichimlik, tamaki va h.k.) qo'shadi. Masalan: '5 stolga 2 ta cola', 'T1 stolga suv'. Stolni raqami, nomi YOKI turi bilan aniqlash mumkin.",
  parameters: {
    type: "object",
    properties: {
      ...TABLE_ID_PROPS,
      productName: { type: "string", description: "Mahsulot nomi (masalan 'Cola', 'Suv')" },
      qty: { type: "integer", description: "Miqdor, standart 1" },
    },
    required: ["productName"],
  },
  mutating: true,
  risky: false,
  validate: (raw) => {
    const args = asRecord(raw);
    const tableId = extractTableId(args);
    const productName = requireString(args, "productName", { maxLen: 100 });
    const qty = optionalNumber(args, "qty", { integer: true, min: 1, max: 999 }) ?? 1;
    return { ...tableId, productName, qty };
  },
  resolve: async (supabase, args) => {
    const table = await resolveTable(supabase, args as { tableNumber?: number; tableName?: string; tableType?: string });
    const session = await resolveActiveSessionByTable(supabase, table.id, `Stol ${table.name}`);
    const product = await resolveProductByName(supabase, args.productName as string);
    const qty = args.qty as number;

    const preview = `🥤 <b>Stol ${table.name}ga qo'shish</b>\n${product.emoji} ${product.name} ×${qty} — ${fmtMoney(product.price * qty)} so'm`;
    return {
      preview,
      resolvedArgs: { sessionId: session.id, productId: product.id, delta: qty, tableName: table.name, productLabel: `${product.emoji} ${product.name}` },
    };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    await addOrderCore(supabase, auth, {
      sessionId: args.sessionId as string,
      productId: args.productId as string,
      delta: args.delta as number,
    });
    return { resultSummary: `${args.productLabel} ×${args.delta} stol ${args.tableName}ga qo'shildi` };
  },
};

// ─── 3) Vaqt qo'shish/ayirish ────────────────────────────────────────────
const addTime: ToolDefinition = {
  description:
    "Faol sessiya vaqtiga korreksiya qo'shadi (musbat — qo'shish, manfiy — ayirish). Masalan: '5 stolga 30 minut qo'sh', 'T1ga 15 daqiqa qo'sh'.",
  parameters: {
    type: "object",
    properties: { ...TABLE_ID_PROPS, minutes: { type: "integer", description: "Daqiqa (musbat yoki manfiy, masalan 30 yoki -15)" } },
    required: ["minutes"],
  },
  mutating: true,
  risky: false,
  validate: (raw) => {
    const args = asRecord(raw);
    const tableId = extractTableId(args);
    const minutes = requireNumber(args, "minutes", { integer: true, min: -1440, max: 1440 });
    if (minutes === 0) throw new ServiceError('"minutes" 0 bo\'lishi mumkin emas', 400);
    return { ...tableId, minutes };
  },
  resolve: async (supabase, args) => {
    const table = await resolveTable(supabase, args as { tableNumber?: number; tableName?: string; tableType?: string });
    const session = await resolveActiveSessionByTable(supabase, table.id, `Stol ${table.name}`);
    const minutes = args.minutes as number;
    const preview = `⏱ <b>Stol ${table.name} vaqtiga tuzatish</b>\n${minutes > 0 ? "+" : ""}${minutes} daqiqa`;
    return { preview, resolvedArgs: { sessionId: session.id, minutes, tableName: table.name } };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { adjustMinutes } = await adjustTimeCore(supabase, auth, {
      sessionId: args.sessionId as string,
      minutes: args.minutes as number,
    });
    return { resultSummary: `Stol ${args.tableName} vaqtiga tuzatildi (jami korreksiya: ${adjustMinutes} daqiqa)` };
  },
};

// ─── 4) Stolni yopish ────────────────────────────────────────────────────
const PAYMENT_METHODS = ["cash", "card", "mixed"] as const;
const PAYMENT_STATUSES = ["paid", "partial", "debt"] as const;
const METHOD_LABEL: Record<string, string> = { cash: "naqd", card: "karta", mixed: "aralash" };
const STATUS_LABEL: Record<string, string> = { paid: "to'liq to'landi", partial: "qisman to'landi", debt: "qarzga yozildi" };

const closeTable: ToolDefinition = {
  description:
    "Faol sessiyani yopadi va hisob-kitob qiladi. To'lov usuli/holatini so'rashda foydalanuvchidan aniqlab oling; berilmasa standart naqd+to'liq to'lov. Masalan: '5 stolni yop', 'T1ni yop'.",
  parameters: {
    type: "object",
    properties: {
      ...TABLE_ID_PROPS,
      method: { type: "string", enum: ["cash", "card", "mixed"], description: "To'lov usuli, standart 'cash'" },
      paymentStatus: { type: "string", enum: ["paid", "partial", "debt"], description: "To'lov holati, standart 'paid'" },
      paidAmount: { type: "number", description: "Qisman to'lov bo'lsa — to'langan summa" },
      note: { type: "string", description: "Izoh, ixtiyoriy" },
    },
    required: [],
  },
  mutating: true,
  risky: false,
  validate: (raw) => {
    const args = asRecord(raw);
    const tableId = extractTableId(args);
    const method = optionalEnum(args, "method", PAYMENT_METHODS) ?? "cash";
    const paymentStatus = optionalEnum(args, "paymentStatus", PAYMENT_STATUSES) ?? "paid";
    const paidAmount = optionalNumber(args, "paidAmount", { min: 0 });
    const note = optionalString(args, "note", { maxLen: 300 });
    return { ...tableId, method, paymentStatus, ...(paidAmount !== undefined ? { paidAmount } : {}), ...(note ? { note } : {}) };
  },
  resolve: async (supabase, args) => {
    const table = await resolveTable(supabase, args as { tableNumber?: number; tableName?: string; tableType?: string });
    const session = await resolveActiveSessionByTable(supabase, table.id, `Stol ${table.name}`);
    const method = args.method as string;
    const paymentStatus = args.paymentStatus as string;
    const preview = `🔒 <b>Stol ${table.name} ni yopish</b>\nTo'lov: ${METHOD_LABEL[method]}, holat: ${STATUS_LABEL[paymentStatus]}${
      args.note ? `\nIzoh: ${args.note}` : ""
    }\n<i>Aniq summa tasdiqlangandan keyin hisoblanadi.</i>`;
    return {
      preview,
      resolvedArgs: { sessionId: session.id, method, paymentStatus, paidAmount: args.paidAmount, note: args.note, tableName: table.name },
    };
  },
  execute: async (supabase, auth, args): Promise<ToolExecutionResult> => {
    const { session, debt } = await closeSessionCore(supabase, auth, {
      sessionId: args.sessionId as string,
      method: args.method as any,
      paymentStatus: args.paymentStatus as any,
      paidAmount: args.paidAmount as number | undefined,
      note: args.note as string | undefined,
    });
    const parts = [`Stol ${args.tableName} yopildi — jami ${fmtMoney(session.finalTotal ?? 0)} so'm`];
    if (debt) parts.push(`Qarz yaratildi: ${fmtMoney(debt.remainingAmount)} so'm (${debt.customerName})`);
    return { resultSummary: parts.join(". ") };
  },
};

export const operationalTools: Record<string, ToolDefinition> = {
  open_table: openTable,
  add_product: addProduct,
  add_time: addTime,
  close_table: closeTable,
};
