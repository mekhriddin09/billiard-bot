import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReceivedRevenue, getSimpleFinanceSummary, getOperatingExpenses, getCashFlow, getDebtAgingBuckets } from "../../finance";
import { fmtMoney } from "../../format";
import type { ToolDefinition, ToolExecutionResult } from "../tool-types";
import { asRecord, optionalDateStr, optionalTimeStr, requireDateStr, requireString, validateDateRange } from "../validate-utils";

/**
 * READ-ONLY TOOL'LAR — Stage C. Hech biri DB'ni o'zgartirmaydi, shuning
 * uchun `mutating: false` va TASDIQLASH TALAB QILINMAYDI (darhol
 * bajariladi). Har biri FAQAT mavjud `src/lib/finance.ts` (Rule 1/12 —
 * markazlashgan hisob-kitob) yoki oddiy, formula bo'lmagan SELECT
 * so'rovlarini ishlatadi — hech qanday moliyaviy formula bu yerda
 * TAKRORLANMAYDI.
 */

const CLUB_TZ = "Asia/Tashkent";

function normalizeRange(args: Record<string, unknown>): { from: string; to: string } {
  const from = requireDateStr(args, "from");
  const to = requireDateStr(args, "to");
  return validateDateRange(from, to);
}

// ─── 1) Tushum ───────────────────────────────────────────────────────────
const getRevenue: ToolDefinition = {
  description:
    "Berilgan sana oralig'ida REAL QABUL QILINGAN tushumni qaytaradi (sessiyalardan naqd/karta + qarz to'lovlari − qaytarimlar). Masalan: 'bugun qancha tushum bo'ldi?', 'kecha qancha pul tushdi?'.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Boshlanish sanasi, YYYY-MM-DD (bugungi sana kontekstda berilgan)" },
      to: { type: "string", description: "Tugash sanasi, YYYY-MM-DD (bitta kun bo'lsa from bilan bir xil)" },
    },
    required: ["from", "to"],
  },
  mutating: false,
  // /api/finance/summary (Web App) shu ma'lumotni FAQAT super_admin'ga
  // ko'rsatadi ("nozik ma'lumot" — Rule 1) — AI ham xuddi shu ruxsat
  // modelini takrorlaydi, kengaytirmaydi.
  allowedRoles: ["super_admin"],
  validate: (raw) => normalizeRange(asRecord(raw)),
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const range = { from: args.from as string, to: args.to as string };
    const r = await getReceivedRevenue(supabase, range);
    const period = range.from === range.to ? range.from : `${range.from} — ${range.to}`;
    const lines = [
      `💰 <b>Real qabul qilingan tushum</b> (${period})`,
      `Sessiyalardan: ${fmtMoney(r.fromSessions)} so'm`,
      `Qarz to'lovlaridan: ${fmtMoney(r.fromDebtPayments)} so'm`,
      r.refunded > 0 ? `Qaytarimlar: −${fmtMoney(r.refunded)} so'm` : undefined,
      `<b>Jami: ${fmtMoney(r.total)} so'm</b>`,
    ].filter(Boolean);
    return { resultSummary: lines.join("\n") };
  },
};

// ─── 2) Foyda (TAXMINIY) ─────────────────────────────────────────────────
const getProfit: ToolDefinition = {
  description:
    "Berilgan sana oralig'ida FOYDA'ni qaytaradi: KELDI (real qabul qilingan tushum) − KETDI (operatsion xarajat + to'langan oylik). Bu — standart, sodda foyda ko'rsatkichi (COGS/ombor tannarxi hisobga OLINMAYDI, chunki ombor xaridi allaqachon oddiy xarajat sifatida KETDI'ga kiradi). Masalan: 'kecha qancha foyda bo'ldi?', 'bugun foyda qancha?'.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Boshlanish sanasi, YYYY-MM-DD" },
      to: { type: "string", description: "Tugash sanasi, YYYY-MM-DD" },
    },
    required: ["from", "to"],
  },
  mutating: false,
  allowedRoles: ["super_admin"],
  validate: (raw) => normalizeRange(asRecord(raw)),
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const range = { from: args.from as string, to: args.to as string };
    const r = await getSimpleFinanceSummary(supabase, range);
    const period = range.from === range.to ? range.from : `${range.from} — ${range.to}`;
    const lines = [
      `📈 <b>Foyda</b> (${period})`,
      `💰 KELDI: ${fmtMoney(r.received)} so'm`,
      `💸 KETDI: ${fmtMoney(r.spent)} so'm`,
      `   — Operatsion xarajat: ${fmtMoney(r.operatingExpenses)} so'm`,
      `   — Oylik (to'langan): ${fmtMoney(r.salaryExpense)} so'm`,
      `<b>📈 FOYDA: ${fmtMoney(r.profit)} so'm</b>`,
    ];
    return { resultSummary: lines.join("\n") };
  },
};

// ─── 2b) TO'LIQ hisobot (bir nechta metrikani BITTA javobda birlashtiradi) ─
// Tizim bitta xabarga faqat BITTA tool-chaqiruvini qo'llab-quvvatlaydi
// (dispatch.ts — bitta LLM round-trip). Shu sabab "oxirgi 7 kunlik TO'LIQ
// hisobot" kabi ko'p qirrali so'rovlar uchun alohida tool kerak — aks holda
// LLM birorta ham tool tanlay olmay, oddiy matn bilan javob berishga
// urinadi (va Telegram HTML/uzunlik chegarasiga urilib jim qolishi mumkin).
const getFullReport: ToolDefinition = {
  description:
    "Berilgan sana oralig'i uchun TO'LIQ moliyaviy hisobot — tushum, foyda, xarajat, naqd/karta oqimi va joriy ochiq qarzlar BIR JAVOBDA. Masalan: 'oxirgi 7 kunlik to'liq hisobot ber', 'shu oy uchun umumiy hisobot', 'kechagi kunlik hisobot'.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Boshlanish sanasi, YYYY-MM-DD" },
      to: { type: "string", description: "Tugash sanasi, YYYY-MM-DD" },
    },
    required: ["from", "to"],
  },
  mutating: false,
  allowedRoles: ["super_admin"],
  validate: (raw) => normalizeRange(asRecord(raw)),
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const range = { from: args.from as string, to: args.to as string };
    const [summary, cashFlow, debtAging] = await Promise.all([
      getSimpleFinanceSummary(supabase, range),
      getCashFlow(supabase, range),
      getDebtAgingBuckets(supabase, range.to),
    ]);
    const period = range.from === range.to ? range.from : `${range.from} — ${range.to}`;
    const lines = [
      `📋 <b>To'liq hisobot</b> (${period})`,
      "",
      `💰 KELDI: ${fmtMoney(summary.received)} so'm`,
      `💸 KETDI: ${fmtMoney(summary.spent)} so'm`,
      `   — Operatsion xarajat: ${fmtMoney(summary.operatingExpenses)} so'm`,
      `   — Oylik (to'langan): ${fmtMoney(summary.salaryExpense)} so'm`,
      `<b>📈 FOYDA: ${fmtMoney(summary.profit)} so'm</b>`,
      "",
      `💵 Naqd: kirim ${fmtMoney(cashFlow.cashIn)} / chiqim ${fmtMoney(cashFlow.cashOut)} (netto ${fmtMoney(cashFlow.netCash)}) so'm`,
      `💳 Karta: kirim ${fmtMoney(cashFlow.cardIn)} / chiqim ${fmtMoney(cashFlow.cardOut)} (netto ${fmtMoney(cashFlow.netCard)}) so'm`,
      "",
      `⏳ Ochiq qarzlar (${range.to} holatiga, davr ichidagi emas — joriy holat): ${fmtMoney(debtAging.totalOpen)} so'm`,
    ];
    return { resultSummary: lines.join("\n") };
  },
};

// ─── 3) Xarajatlar (kategoriya bo'yicha taqsimot) ────────────────────────
const getExpensesTool: ToolDefinition = {
  description:
    "Berilgan sana oralig'ida operatsion xarajatlar jamini va kategoriya bo'yicha taqsimotini qaytaradi. Masalan: 'bugun xarajatlar qancha?'.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Boshlanish sanasi, YYYY-MM-DD" },
      to: { type: "string", description: "Tugash sanasi, YYYY-MM-DD" },
    },
    required: ["from", "to"],
  },
  mutating: false,
  allowedRoles: ["super_admin"],
  validate: (raw) => normalizeRange(asRecord(raw)),
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const range = { from: args.from as string, to: args.to as string };
    const total = await getOperatingExpenses(supabase, range);

    const { data: rows } = await supabase
      .from("expenses")
      .select("amount, category_id")
      .gte("business_date", range.from)
      .lte("business_date", range.to);

    const byCategory = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.category_id ?? "__none__";
      byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
    }

    let breakdownLines: string[] = [];
    if (byCategory.size > 0) {
      const categoryIds = Array.from(byCategory.keys()).filter((k) => k !== "__none__");
      const { data: categories } =
        categoryIds.length > 0
          ? await supabase.from("expense_categories").select("id, name, emoji").in("id", categoryIds)
          : { data: [] as { id: string; name: string; emoji: string }[] };
      const nameById = new Map((categories ?? []).map((c) => [c.id, `${c.emoji ?? ""} ${c.name}`.trim()]));
      breakdownLines = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id, amount]) => `• ${id === "__none__" ? "Kategoriyasiz" : (nameById.get(id) ?? "?")}: ${fmtMoney(amount)} so'm`);
    }

    const period = range.from === range.to ? range.from : `${range.from} — ${range.to}`;
    const lines = [`🧾 <b>Operatsion xarajatlar</b> (${period})`, `<b>Jami: ${fmtMoney(total)} so'm</b>`, ...breakdownLines];
    return { resultSummary: lines.join("\n") };
  },
};

// ─── 4) Mijoz qarzi ──────────────────────────────────────────────────────
const getCustomerDebt: ToolDefinition = {
  description:
    "Mijoz ismi bo'yicha qarz holatini qaytaradi (ochiq va yopilgan qarzlar ro'yxati, jami ochiq qoldiq). Masalan: 'Mehriddinning qarzi qancha?'.",
  parameters: {
    type: "object",
    properties: {
      customerName: { type: "string", description: "Mijozning ismi (to'liq yoki qisman, masalan 'Mehriddin')" },
    },
    required: ["customerName"],
  },
  mutating: false,
  validate: (raw) => {
    const args = asRecord(raw);
    return { customerName: requireString(args, "customerName", { maxLen: 100 }) };
  },
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const name = args.customerName as string;
    const { data: debts } = await supabase
      .from("debts")
      .select("customer_name, remaining_amount, original_amount, status, due_date, created_at")
      .ilike("customer_name", `%${name}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = debts ?? [];
    if (rows.length === 0) {
      return { resultSummary: `🔍 "${name}" bo'yicha qarz topilmadi.` };
    }

    const openTotal = rows.filter((d) => d.status === "open").reduce((s, d) => s + d.remaining_amount, 0);
    const lines = [`💳 <b>"${name}" bo'yicha qarzlar</b>`, `<b>Jami ochiq qoldiq: ${fmtMoney(openTotal)} so'm</b>`, ""];
    for (const d of rows.slice(0, 10)) {
      const statusLabel = d.status === "open" ? "ochiq" : "yopilgan";
      lines.push(
        `• ${d.customer_name} — ${fmtMoney(d.remaining_amount)}/${fmtMoney(d.original_amount)} so'm (${statusLabel}${d.due_date ? `, muddat ${d.due_date}` : ""})`
      );
    }
    return { resultSummary: lines.join("\n") };
  },
};

// ─── 5) Vaqt oralig'idagi sessiyalar ─────────────────────────────────────
const timeToMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

const dayMinutesFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const getSessionsInRange: ToolDefinition = {
  description:
    "Berilgan sanadagi (kerak bo'lsa vaqt oralig'i bilan) sessiyalar ro'yxatini qaytaradi — stol, boshlanish/tugash vaqti, holati, summasi. Masalan: '25-iyuldagi 13:00 atrofidagi sessiyalarni ko'rsat' → date='2026-07-25', fromTime='12:30', toTime='13:30'.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "Sana, YYYY-MM-DD" },
      fromTime: { type: "string", description: "Vaqt oralig'i boshlanishi, HH:MM (ixtiyoriy — 'atrofida' so'rovlari uchun ±30-60 daqiqa oyna hisoblab bering)" },
      toTime: { type: "string", description: "Vaqt oralig'i tugashi, HH:MM (ixtiyoriy)" },
    },
    required: ["date"],
  },
  mutating: false,
  validate: (raw) => {
    const args = asRecord(raw);
    const date = requireDateStr(args, "date");
    const fromTime = optionalTimeStr(args, "fromTime");
    const toTime = optionalTimeStr(args, "toTime");
    return { date, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}) };
  },
  execute: async (supabase, _auth, args): Promise<ToolExecutionResult> => {
    const date = args.date as string;
    const fromTime = args.fromTime as string | undefined;
    const toTime = args.toTime as string | undefined;

    const [{ data: sessions }, { data: tables }] = await Promise.all([
      supabase
        .from("game_sessions")
        .select("id, table_id, started_at, ended_at, status, final_total")
        .eq("business_date", date)
        .order("started_at", { ascending: true }),
      supabase.from("club_tables").select("id, name"),
    ]);

    const tableNameById = new Map((tables ?? []).map((t) => [t.id, t.name]));
    const fromMin = fromTime ? timeToMinutes(fromTime) : undefined;
    const toMin = toTime ? timeToMinutes(toTime) : undefined;

    const filtered = (sessions ?? []).filter((s) => {
      if (fromMin === undefined && toMin === undefined) return true;
      const [hh, mm] = dayMinutesFmt.format(new Date(s.started_at)).split(":").map(Number);
      const startMin = hh * 60 + mm;
      if (fromMin !== undefined && startMin < fromMin) return false;
      if (toMin !== undefined && startMin > toMin) return false;
      return true;
    });

    if (filtered.length === 0) {
      return { resultSummary: `🔍 ${date}${fromTime ? ` (${fromTime}${toTime ? `–${toTime}` : ""})` : ""} — sessiya topilmadi.` };
    }

    const lines = [`🎱 <b>Sessiyalar</b> — ${date}${fromTime ? ` (${fromTime}${toTime ? `–${toTime}` : ""})` : ""}`, ""];
    for (const s of filtered.slice(0, 20)) {
      const start = dayMinutesFmt.format(new Date(s.started_at));
      const end = s.ended_at ? dayMinutesFmt.format(new Date(s.ended_at)) : "hozir faol";
      const total = s.final_total ? `${fmtMoney(s.final_total)} so'm` : "—";
      lines.push(`• ${tableNameById.get(s.table_id) ?? "?"} — ${start}–${end} (${s.status === "active" ? "faol" : "yopilgan"}, ${total})`);
    }
    if (filtered.length > 20) lines.push(`… va yana ${filtered.length - 20} ta`);
    return { resultSummary: lines.join("\n") };
  },
};

export const readTools: Record<string, ToolDefinition> = {
  get_revenue: getRevenue,
  get_profit: getProfit,
  get_full_report: getFullReport,
  get_expenses: getExpensesTool,
  get_customer_debt: getCustomerDebt,
  get_sessions_in_range: getSessionsInRange,
};
