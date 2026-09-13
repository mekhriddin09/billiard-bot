import "server-only";
import { todayKey, dateKey } from "../permissions";
import { parseAmountSom } from "./amount-parser";

/**
 * FAST-PATH ROUTER — 2026-08.
 *
 * MAQSAD: eng ko'p ishlatiladigan buyruqlar (kunlik hisobot, qarzlar,
 * xarajat qo'shish, stol ochish/yopish) uchun Gemini'ga UMUMAN
 * MUROJAAT QILMASDAN, to'g'ridan-to'g'ri tegishli tool'ga yo'naltirish —
 * bu Gemini javob berish vaqti (hozirda beqaror/sekin) tufayli
 * yuzaga kelayotgan kutishni shu buyruqlar uchun BUTUNLAY yo'q qiladi.
 *
 * XAVFSIZLIK MODELI (MUHIM): bu modul faqat tool NOMI va XOM ARGUMENTLARNI
 * aniqlaydi — xuddi Gemini `tool_call` javobi o'rniga. Undan keyingi BARCHA
 * bosqichlar (`dispatch.ts`dagi whitelist tekshiruvi, rol tekshiruvi,
 * `tool.validate()`, MUTATING tool'lar uchun `resolve()` → preview →
 * tasdiqlash tugmasi → qayta autentifikatsiya → `execute()`) O'ZGARISHSIZ
 * qoladi. Ya'ni fast-path faqat "Gemini nima deydi" bosqichini
 * TEZLASHTIRADI — u hech qachon tasdiqlashni chetlab o'tmaydi, hech qachon
 * argumentlarni "ishonib" to'g'ridan-to'g'ri bazaga yozmaydi.
 *
 * KONSERVATIV YONDASHUV: har bir pattern faqat YUQORI ISHONCHLI holatlarda
 * mos keladi (aniq kalit so'z + aniq shakl). Agar biror qism (masalan
 * summani aniq o'qib bo'lmasa) noaniq bo'lsa, funksiya `null` qaytaradi —
 * shunda `dispatch.ts` odatdagidek Gemini'ga murojaat qiladi. Fast-path
 * HECH QACHON "balki shudir" deb taxminiy natija bermaydi.
 */

export interface FastPathMatch {
  name: string;
  args: Record<string, unknown>;
}

const CLUB_TZ_YESTERDAY_MS = 24 * 60 * 60 * 1000;

/** "'" ning turli klaviatura/avtokorrektsiya variantlarini (`'`, `‘`, `’`, "ʻ", "ʼ", "`") bittasiga keltiradi. */
function normalizeApostrophes(s: string): string {
  return s.replace(/[`´ʻʼ‘’]/g, "'");
}

/** Sana oralig'i haqida noaniqlik keltirib chiqaradigan so'zlar/formatlar —
 *  bular mavjud bo'lsa fast-path ISHLAMAYDI (Gemini'ga qoldiriladi), chunki
 *  "bugun"/"kecha"dan boshqa har qanday oraliqni ANIQ hisoblash uchun LLM
 *  kerak (masalan "oxirgi 7 kun", "iyul oyi", "25-avgust"). */
const AMBIGUOUS_DATE_HINTS =
  /\bhafta|\boy\b|oyi\b|oylik|oxirgi|\d{1,2}[-./]\d{1,2}|\b\d{4}-\d{2}-\d{2}\b|yanvar|fevral|mart|aprel|may(?!li)|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|ertaga/i;

function detectDate(text: string): string {
  if (/\bkecha\b|kechagi/i.test(text)) return dateKey(Date.now() - CLUB_TZ_YESTERDAY_MS);
  return todayKey();
}

/** So'z oxiridagi Uzbek jo'nalish kelishigi qo'shimchasini ("-ga/-ka/-qa/-ha")
 *  olib tashlaydi — faqat OXIRGI so'zga qo'llanadi (masalan "Svetga" →
 *  "Svet", "konditsioner remontiga" → "konditsioner remonti"). */
function stripTrailingDative(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  if (words.length === 0) return phrase.trim();
  const last = words[words.length - 1];
  const m = last.match(/^(.{2,})(ga|ka|qa|ha)$/i);
  if (m) words[words.length - 1] = m[1];
  return words.join(" ");
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── 1) Xarajat yozish (record_expense — MUTATING, baribir tasdiqlash talab qilinadi) ─
function matchExpenseAdd(text: string): FastPathMatch | null {
  const t = normalizeApostrophes(text.trim());

  // A) Fe'l-asosli shakl: "<nom>ga <summa> ketdi/to'ladim/sarfladim".
  const verbMatch = t.match(
    /^(.{1,60}?)\s+(\d[\d\s.,]*)\s*(ming|mln|million)?\s*(?:so'?m)?\s*(ketdi|to'?la\w*|sarfla\w*|xarid\s+qildim|sotib\s+oldim)\b/i
  );
  if (verbMatch) {
    const amount = parseAmountSom(`${verbMatch[2]} ${verbMatch[3] ?? ""}`.trim());
    const namePart = stripTrailingDative(verbMatch[1]);
    if (amount !== undefined && namePart.length >= 2) {
      return { name: "record_expense", args: { name: capitalizeFirst(namePart), amount } };
    }
  }

  // B) Aniq buyruq shakli: "xarajat yoz: <nom> <summa>" / "xarajat qo'sh <nom> uchun <summa>".
  const explicitMatch = t.match(
    /^(?:xarajat|harajat)\s*(?:yoz|qo'sh)\w*[:\s]+(.{1,60}?)\s+(?:uchun\s+)?(\d[\d\s.,]*)\s*(ming|mln|million)?\s*(?:so'?m)?\.?\s*$/i
  );
  if (explicitMatch) {
    const amount = parseAmountSom(`${explicitMatch[2]} ${explicitMatch[3] ?? ""}`.trim());
    const namePart = stripTrailingDative(explicitMatch[1]);
    if (amount !== undefined && namePart.length >= 2) {
      return { name: "record_expense", args: { name: capitalizeFirst(namePart), amount } };
    }
  }

  return null;
}

// ─── 2) To'liq hisobot (get_full_report — READ) ──────────────────────────
function matchFullReport(text: string): FastPathMatch | null {
  if (!/hisobot/i.test(text)) return null;
  if (AMBIGUOUS_DATE_HINTS.test(text)) return null;
  const date = detectDate(text);
  return { name: "get_full_report", args: { from: date, to: date } };
}

// ─── 3) Qarzlar (READ) ────────────────────────────────────────────────────
function matchDebtByName(text: string): string | null {
  const m = text.match(/^([A-Za-z][A-Za-z'-]{1,30})\s+(?:ning\s+)?qarz/i);
  if (!m) return null;
  let name = m[1];
  if (!/^[A-Z]/.test(name)) return null; // ism bosh harf bilan yozilmagan — noaniq, o'tkazib yuboriladi
  if (/ning$/i.test(name) && name.length > 4) name = name.slice(0, -4);
  return name.length >= 2 ? name : null;
}

function matchDebts(text: string): FastPathMatch | null {
  const byName = matchDebtByName(text.trim());
  if (byName) return { name: "get_customer_debt", args: { customerName: byName } };

  if (/qarzlar|qarzdorlar|kimda\s+qarz|ochiq\s+qarz/i.test(text)) {
    return {
      name: "analytics_query",
      args: {
        table: "debts",
        filters: [{ field: "status", op: "eq", value: "open" }],
        orderBy: { field: "remainingAmount", direction: "desc" },
        limit: 20,
      },
    };
  }
  return null;
}

// ─── 4) Xarajatlar ro'yxati (get_expenses — READ) ────────────────────────
function matchExpensesRead(text: string): FastPathMatch | null {
  if (!/xarajat/i.test(text)) return null;
  if (AMBIGUOUS_DATE_HINTS.test(text)) return null;
  const date = detectDate(text);
  return { name: "get_expenses", args: { from: date, to: date } };
}

// ─── 5) Foyda / tushum (get_profit / get_revenue — READ) ─────────────────
function matchProfit(text: string): FastPathMatch | null {
  if (!/foyda/i.test(text)) return null;
  if (AMBIGUOUS_DATE_HINTS.test(text)) return null;
  const date = detectDate(text);
  return { name: "get_profit", args: { from: date, to: date } };
}

function matchRevenue(text: string): FastPathMatch | null {
  if (!/tushum/i.test(text)) return null;
  if (AMBIGUOUS_DATE_HINTS.test(text)) return null;
  const date = detectDate(text);
  return { name: "get_revenue", args: { from: date, to: date } };
}

// ─── 6) Stolni ochish/yopish (open_table/close_table — MUTATING) ─────────
const OPEN_VERB = /^(och|ochib|ochamiz|ochaylik|yoq|yoqing|yoqamiz|ishga)/i;
const CLOSE_VERB = /^(yop|tugat|yakunla|tugalla)/i;
// "No1"/"№1"/"T1"/"N1" kabi HARF+RAQAM shakllar — bular `tableName`
// sifatida uzatiladi, chunki DB'da nom "№1" (yoki qo'lda "No1" kabi
// kiritilgan) bo'lishi mumkin — `resolveTable()`ning nom-normallashtirish
// fallback'i (Faza B tuzatishi) shularni to'g'ri hal qiladi.
const PREFIXED_TABLE_RE = /^(№|no\.?|n|t)\d+[a-z]?$/i;

function matchTableAction(text: string): FastPathMatch | null {
  // "5-stolni"/"T1-stolni" kabi tire bilan yopishtirilgan shakllarni
  // "5 stolni" ko'rinishiga keltiramiz — pastdagi regex bo'shliqqa tayanadi.
  const normalized = text.trim().replace(/[-–—]\s*stol/gi, " stol");
  const m = normalized.match(/(\S+)\s+stol(?:ni|i|ga)?\s+(\S+)/i);
  if (!m) return null;
  const token = m[1];
  const verbWord = m[2];

  let idArgs: { tableNumber: number } | { tableName: string };
  if (/^\d+$/.test(token)) {
    // Sof raqam ("5 stolni och") — mavjud, sinalgan LLM xatti-harakati
    // bilan bir xil: `tableNumber` orqali ANIQ (`.eq`) qidiriladi.
    idArgs = { tableNumber: parseInt(token, 10) };
  } else if (PREFIXED_TABLE_RE.test(token)) {
    idArgs = { tableName: token };
  } else {
    // Noma'lum shakl (masalan "VIP1", yoki "qaysi stolni" kabi so'roq) —
    // xato talqin qilmaslik uchun Gemini'ga qoldiriladi.
    return null;
  }

  if (OPEN_VERB.test(verbWord)) {
    return { name: "open_table", args: idArgs };
  }
  if (CLOSE_VERB.test(verbWord)) {
    return { name: "close_table", args: idArgs };
  }
  return null;
}

/**
 * Asosiy eshik — `dispatch.ts` LLM'ni chaqirishdan OLDIN shu funksiyani
 * chaqiradi. `null` qaytsa — odatdagidek Gemini'ga boradi (xatti-harakat
 * o'zgarmaydi). Mos kelsa — natija xuddi Gemini `tool_call` javobi kabi
 * ishlatiladi, keyingi barcha xavfsizlik bosqichlari o'zgarishsiz qoladi.
 */
export function tryFastPath(text: string): FastPathMatch | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return null; // uzun/erkin matnlar — Gemini'ga

  return (
    matchExpenseAdd(trimmed) ??
    matchFullReport(trimmed) ??
    matchDebts(trimmed) ??
    matchExpensesRead(trimmed) ??
    matchProfit(trimmed) ??
    matchRevenue(trimmed) ??
    matchTableAction(trimmed) ??
    null
  );
}
