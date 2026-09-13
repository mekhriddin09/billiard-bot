import "server-only";

/**
 * Telegram Bot API bilan ishlash uchun yupqa qatlam — qo'shimcha kutubxona
 * shart emas, oddiy `fetch` yetarli. Hech qanday funksiya xato bo'lsa
 * `throw` QILMAYDI — asosiy biznes operatsiyasini (sessiya yopish, to'lov)
 * hech qachon to'xtatib qo'ymasligi kerak (Telegram — faqat bildirishnoma
 * qatlami, Supabase — yagona haqiqat).
 */

const API_BASE = "https://api.telegram.org/bot";

export interface TelegramSendResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function callApi(method: string, body: Record<string, unknown>): Promise<TelegramSendResult> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN yo'q" };
  try {
    const res = await fetch(`${API_BASE}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `${method} muvaffaqiyatsiz (${res.status})` };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tarmoq xatosi" };
  }
}

/** Katta natijalarni (universal query engine) fayl sifatida yuborish —
 *  Telegram xabar uzunligi cheklangan va uzun ro'yxatlar o'qib bo'lmas
 *  holga keladi. Haqiqiy `.xlsx` EMAS (loyihada xlsx kutubxonasi
 *  o'rnatilmagan) — oddiy CSV, Excel/Google Sheets'da to'g'ridan-to'g'ri
 *  ochiladi. `multipart/form-data` orqali (Telegram Bot API talabi). */
export async function sendDocument(
  chatId: string | number,
  filename: string,
  content: string,
  opts: { caption?: string } = {}
): Promise<TelegramSendResult> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN yo'q" };
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (opts.caption) form.append("caption", opts.caption.slice(0, 1024));
    // BOM — Excel'da o'zbek/kirill belgilarini to'g'ri ko'rsatish uchun.
    form.append("document", new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }), filename);
    const res = await fetch(`${API_BASE}${token}/sendDocument`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `sendDocument muvaffaqiyatsiz (${res.status})` };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tarmoq xatosi" };
  }
}

export interface SendMessageOpts {
  replyToMessageId?: number;
  replyMarkup?: Record<string, unknown>;
  /** `false` — parse_mode umuman yuborilmaydi (oddiy matn, Telegram HTML
   *  teglarni parse qilishga urinmaydi). Buzuq/qochirilmagan HTML tufayli
   *  "can't parse entities" xatosidan keyin oddiy matn bilan qayta
   *  urinish uchun ishlatiladi (`src/lib/ai/dispatch.ts`dagi
   *  `sendMessageSafe`ga qarang). */
  parseMode?: "HTML" | "Markdown" | false;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: SendMessageOpts = {}
): Promise<TelegramSendResult> {
  const parseMode = opts.parseMode === undefined ? "HTML" : opts.parseMode;
  return callApi("sendMessage", {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(opts.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId, allow_sending_without_reply: true } : {}),
    ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
}

export async function setMyCommands(): Promise<TelegramSendResult> {
  return callApi("setMyCommands", {
    commands: [{ command: "start", description: "Klubni ochish" }],
  });
}

/** Mavjud xabarni tahrirlaydi — tasdiqlash tugmalari bosilgandan keyin
 *  "⏳ kutilmoqda" xabarini natijaga (✅/❌/⏰) almashtirish uchun.
 *  `replyMarkup` berilmasa — mavjud tugmalar OLIB TASHLANADI (bo'sh
 *  inline_keyboard yuboriladi), qayta bosib bo'lmaydigan qilib qo'yiladi. */
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  opts: { replyMarkup?: Record<string, unknown>; parseMode?: "HTML" | "Markdown" } = {}
): Promise<TelegramSendResult> {
  return callApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    reply_markup: opts.replyMarkup ?? { inline_keyboard: [] },
  });
}

/** Tugma bosilganini Telegram'ga "qabul qilindi" deb bildiradi — bo'lmasa
 *  tugma cheksiz "yuklanmoqda" holatida qoladi. `showAlert=true` bo'lsa
 *  xabar popup sifatida ko'rsatiladi (masalan xatolik/rad etish uchun). */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<TelegramSendResult> {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}

/** AI tasdiqlash oqimi uchun standart ✅/❌ inline klaviatura. `callback_data`
 *  FAQAT pending action ID'sini tashiydi — hech qanday staff/role/club
 *  ma'lumoti YO'Q (identifikatsiya har doim Telegram `from.id`dan qayta
 *  hal qilinadi, callback_data ichidan HECH QACHON o'qilmaydi). */
export function confirmCancelKeyboard(pendingActionId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Tasdiqlash", callback_data: `aiact:confirm:${pendingActionId}` },
        { text: "❌ Bekor qilish", callback_data: `aiact:cancel:${pendingActionId}` },
      ],
    ],
  };
}

/** Xavfli/moliyaviy amallar uchun kengaytirilgan klaviatura (3 tugma).
 *  "✏️ Tahrirlash" — to'liq inline tahrirlash oynasi EMAS (bu alohida
 *  ko'p bosqichli suhbat holatini talab qiladi, hozircha implement
 *  qilinmagan — pastdagi qolgan risklar bo'limiga qarang); bosilganda
 *  amal "cancelled" holatiga o'tadi va xodimga tuzatilgan buyruqni
 *  qayta yozish so'raladi — bu ham bekor qilish, ham "tahrirlash niyati"
 *  signalini beradi (audit'da alohida ko'rinadi). */
export function confirmEditCancelKeyboard(pendingActionId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Tasdiqlash", callback_data: `aiact:confirm:${pendingActionId}` },
        { text: "✏️ Tahrirlash", callback_data: `aiact:edit:${pendingActionId}` },
      ],
      [{ text: "❌ Bekor qilish", callback_data: `aiact:cancel:${pendingActionId}` }],
    ],
  };
}

/** Bot Mini App tugmasi — Telegram bu tugmani bosganda WebApp ochadi. */
export function webAppButton(text: string, url: string) {
  return { text, web_app: { url } };
}

export function contactRequestKeyboard() {
  return {
    keyboard: [[{ text: "📱 Telefon raqamingizni yuboring", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function removeKeyboard() {
  return { remove_keyboard: true };
}
