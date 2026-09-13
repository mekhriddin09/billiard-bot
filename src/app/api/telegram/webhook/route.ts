import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  answerCallbackQuery,
  contactRequestKeyboard,
  editMessageText,
  removeKeyboard,
  sendMessage,
  webAppButton,
} from "@/lib/telegram-bot";
import { logAudit } from "@/lib/api-audit";
import { resolveStaffFromTelegram } from "@/lib/ai/resolve-staff";
import {
  attachResult,
  checkCallbackAuthorization,
  expireStalePendingActions,
  getPendingAction,
  resolvePendingAction,
  type CallbackRejectReason,
} from "@/lib/ai/pending-actions";
import { getToolDefinition, isRoleAllowedForTool } from "@/lib/ai/executor";
import type { AuthedStaff } from "@/lib/api-auth";
import type { PendingAiAction } from "@/lib/types";

/**
 * MUHIM (2026-08, "AI Agent olib tashlash"): matn-asosidagi AI Admin Agent
 * (Gemini/Claude LLM chaqiruvi) PRODUCTION FLOW'DAN O'CHIRILDI — Web
 * App'ning o'zi (stol/mahsulot/hisobot/moliya) xodimlarga qulayroq va
 * TEZROQ bo'lib chiqdi, LLM javob vaqti esa beqaror bo'lib, Telegram
 * botda operatsion kechikish/timeout'larga sabab bo'layotgan edi.
 *
 * Bu route hali ham `maxDuration = 30`ga ega (DB so'rovlari + Telegram
 * API chaqiruvlari uchun xavfsiz zaxira) — lekin ENDI hech qanday tashqi
 * LLM chaqiruvi YO'Q, shuning uchun amalda javob har doim juda tez keladi.
 *
 * `src/lib/ai/dispatch.ts`, `providers/*`, `tools/*`, `analytics/*`,
 * `fast-path.ts`, `clarification.ts` — kod REPO'da qoladi (kelajakda
 * qayta yoqish kerak bo'lsa, xavfsiz/tekshirilgan holda saqlanadi), lekin
 * ENDI HECH QAYERDAN CHAQIRILMAYDI — pastdagi handler ro'yxatida yo'q.
 * `resolve-staff.ts`, `pending-actions.ts`, `executor.ts` (faqat tool
 * ta'riflari va rol tekshiruvi uchun) — bular AI-XOS EMAS, tasdiqlash
 * infratuzilmasi umumiy va shu yerda ishlatilishda davom etadi (masalan
 * deploy paytida DB'da qolgan "pending" amal bo'lsa, tugma bosilganda
 * baribir to'g'ri hal qilinishi kerak).
 */
export const maxDuration = 30;

/**
 * Bitta endpoint — Telegram'ning barcha yangiliklari (/start, kontakt,
 * kanalga forward qilingan xabar, eski AI tasdiqlash tugmalari) shu yerga
 * keladi. setWebhook chaqirilganda berilgan secret_token header orqali
 * tekshiriladi — soxta so'rovlardan himoya.
 *
 * `/` bilan boshlanmagan erkin matn (masalan eski odat bilan "5 stolni
 * och" deb yozilsa) endi LLM'ga UMUMAN YUBORILMAYDI — `handleFreeTextMessage`
 * darhol, deterministik ravishda Web App'ga yo'naltiradi (pastga qarang).
 * Mavjud /start, kontakt, kanal-forward branch'lari BUZILMAGAN.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const gotSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && gotSecret !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  const supabase = supabaseServer();
  const msg = update.message;
  const callbackQuery = update.callback_query;

  try {
    if (callbackQuery) {
      await handleCallbackQuery(supabase, callbackQuery);
    } else if (msg?.text === "/start") {
      await handleStart(supabase, msg);
    } else if (msg?.contact) {
      await handleContact(supabase, msg);
    } else if (msg?.forward_from_chat?.type === "channel") {
      await handleChannelForward(supabase, msg);
    } else if (msg?.text && !msg.text.startsWith("/")) {
      await handleFreeTextMessage(supabase, msg);
    }
  } catch {
    // Webhook har doim 200 qaytarishi kerak — aks holda Telegram qayta-qayta
    // urinib, keyingi yangiliklarni navbatga to'plashi mumkin.
  }

  return NextResponse.json({ ok: true });
}

async function upsertCustomerFromTelegram(supabase: ReturnType<typeof supabaseServer>, from: any) {
  const tgId = String(from.id);
  const { data: existing } = await supabase.from("customers").select("*").eq("tg_id", tgId).maybeSingle();
  if (existing) return existing;

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Mijoz";
  const { data: created } = await supabase
    .from("customers")
    .insert({ name: displayName, tg_id: tgId, tg_username: from.username ?? "" })
    .select("*")
    .maybeSingle();
  return created;
}

async function handleStart(supabase: ReturnType<typeof supabaseServer>, msg: any) {
  const chatId = msg.chat.id;
  const from = msg.from;
  const customer = await upsertCustomerFromTelegram(supabase, from);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const firstName = from.first_name || "do'stim";

  const greeting = `🎱 <b>SHO'RCHI BILLIARD CLUB</b>\n\nAssalomu alaykum, ${firstName}! 👋\nBilyard va tennis stollarini ko'ring, bo'sh stolni tanlang va klub xizmatlaridan foydalaning.`;

  const replyMarkup = appUrl
    ? { inline_keyboard: [[webAppButton("🎱 Klubni ochish", appUrl)]] }
    : undefined;

  await sendMessage(chatId, greeting, { replyMarkup });

  if (!customer?.phone) {
    await sendMessage(
      chatId,
      "📱 Telefon raqamingizni yuboring\n\nTelefon raqamingiz klub xizmatlari va buyurtma/sessiya bilan bog'lanish uchun kerak.",
      { replyMarkup: contactRequestKeyboard() }
    );
  }
}

async function handleContact(supabase: ReturnType<typeof supabaseServer>, msg: any) {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  // Faqat o'zining raqamini yuborgan bo'lsa qabul qilamiz — boshqa birovning
  // kontaktini forward qilib, o'sha odam nomidan telefon "tasdiqlab" bo'lmaydi.
  if (!contact || String(contact.user_id) !== String(msg.from.id)) {
    await sendMessage(chatId, "Iltimos, faqat o'zingizning raqamingizni yuboring.");
    return;
  }

  const phone = contact.phone_number.startsWith("+") ? contact.phone_number : `+${contact.phone_number}`;
  const tgId = String(msg.from.id);

  const { data: existingByPhone } = await supabase
    .from("customers")
    .select("id, tg_id")
    .eq("phone", phone)
    .maybeSingle();
  if (existingByPhone && existingByPhone.tg_id !== tgId) {
    // Bu raqam boshqa Telegram akkauntga biriktirilgan — ustidan yozib
    // yubormaymiz, xodimga murojaat qilishni so'raymiz.
    await sendMessage(chatId, "Bu raqam allaqachon boshqa hisobda ro'yxatdan o'tgan. Klub xodimiga murojaat qiling.", {
      replyMarkup: removeKeyboard(),
    });
    return;
  }

  await supabase.from("customers").update({ phone }).eq("tg_id", tgId);

  await sendMessage(chatId, "✅ Rahmat! Telefon raqamingiz saqlandi.", {
    replyMarkup: removeKeyboard(),
  });
}

async function handleChannelForward(supabase: ReturnType<typeof supabaseServer>, msg: any) {
  const chatId = msg.chat.id;
  const tgId = String(msg.from.id);

  const { data: staff } = await supabase
    .from("staff")
    .select("id, role, active")
    .eq("tg_id", tgId)
    .maybeSingle();
  if (!staff || !staff.active || staff.role !== "super_admin") {
    // Jim turadi — bu funksiya faqat Super Admin uchun, boshqa hech kimga
    // "kanal ulash" imkoniyati borligini bildirmaymiz.
    return;
  }

  const channelId = String(msg.forward_from_chat.id);
  const channelTitle = msg.forward_from_chat.title ?? channelId;

  await supabase
    .from("club_settings")
    .update({ telegram_log_channel_id: channelId, telegram_log_enabled: true })
    .eq("id", 1);

  const testResult = await sendMessage(channelId, "✅ Ulandi — bu kanal endi Sho'rchi Billiard Club operatsion logi.");

  if (testResult.ok) {
    await sendMessage(
      chatId,
      `✅ Kanal ulandi: <b>${channelTitle}</b>\n\nEndi sessiya, qarz va kunlik hisobot xabarlari shu kanalga yuboriladi.`
    );
  } else {
    await sendMessage(
      chatId,
      `⚠️ Kanal ID topildi (${channelTitle}), lekin botga xabar yuborib bo'lmadi: ${testResult.error}\n\nBotni kanalga ADMIN sifatida qo'shganingizga ishonch hosil qiling, keyin qayta forward qiling.`
    );
  }
}

// ============================================================
// ERKIN MATN — AI O'RNIGA DETERMINISTIK YO'NALTIRISH (2026-08)
// ============================================================

/**
 * `/` bilan boshlanmagan har qanday matn shu yerga keladi. Avval (LLM
 * orqali) AI Admin Agentga uzatilar edi — endi HECH QANDAY tashqi
 * chaqiruv (LLM/HTTP) YO'Q, faqat ikkita tez DB so'rovi
 * (`resolveStaffFromTelegram`) va bitta Telegram xabari: xodim eski odat
 * bilan matn yozsa ("5 stolni och" va h.k.), darhol Web App'ga
 * yo'naltiriladi. Mijozlarning tasodifiy xabarlariga (avvalgidek) hech
 * qanday javob berilmaydi.
 */
async function handleFreeTextMessage(supabase: ReturnType<typeof supabaseServer>, msg: any) {
  const chatId = msg.chat.id;
  const staff = await resolveStaffFromTelegram(supabase, msg.from.id);
  if (!staff) return; // jim turadi — mijoz yoki nofaol/noma'lum xodim (avvalgidek)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  await sendMessage(
    chatId,
    "🎱 Klubni endi Web App orqali boshqaring — stol ochish/yopish, mahsulot qo'shish, hisobot va moliya shu yerda tezroq va qulayroq ishlaydi.",
    { replyMarkup: appUrl ? { inline_keyboard: [[webAppButton("🎱 Klubni ochish", appUrl)]] } : undefined }
  );
}

function rejectMessage(reason: CallbackRejectReason): string {
  switch (reason) {
    case "inactive_staff":
      return "Siz ro'yxatdan o'tmagansiz yoki nofaolsiz.";
    case "not_found":
      return "Amal topilmadi.";
    case "already_resolved":
      return "Bu amal allaqachon hal qilingan.";
    case "expired":
      return "Bu amalning muddati o'tgan.";
    case "wrong_owner":
      return "Bu amal sizga tegishli emas.";
  }
}

async function logAiAudit(
  supabase: ReturnType<typeof supabaseServer>,
  staff: AuthedStaff,
  pending: PendingAiAction,
  resultText: string
) {
  await logAudit(supabase, staff, `[AI] ${pending.previewText.replace(/\n/g, " ")} — ${resultText}`, {
    source: "telegram_ai",
    metadata: { tool: pending.toolName, args: pending.args, result: resultText },
  });
}

/**
 * ✅/❌ tugma bosilganda kelgan callback_query. HAR DOIM qayta tekshiradi:
 * eski Telegram xabariga, callback_data ichidagi HECH NARSAGA (faqat
 * pending action ID'sidan tashqari) ishonilmaydi — identifikatsiya
 * `callback_query.from.id`dan qayta hal qilinadi, pending action holati
 * DB'dan qayta o'qiladi.
 */
async function handleCallbackQuery(supabase: ReturnType<typeof supabaseServer>, cq: any) {
  const raw: string = cq.data ?? "";
  const [prefix, action, pendingId] = raw.split(":");

  if (prefix !== "aiact" || (action !== "confirm" && action !== "cancel" && action !== "edit") || !pendingId) {
    await answerCallbackQuery(cq.id, "Noma'lum amal", true);
    return;
  }

  // Har bir callback — shu paytgacha muddati o'tgan barcha "pending"
  // qatorlarni "expired"ga o'tkazish uchun ham qulay nuqta.
  await expireStalePendingActions(supabase);

  const [pending, staff] = await Promise.all([
    getPendingAction(supabase, pendingId),
    resolveStaffFromTelegram(supabase, cq.from.id),
  ]);

  const authResult = checkCallbackAuthorization(pending, staff, Date.now());
  if (!authResult.ok) {
    await answerCallbackQuery(cq.id, rejectMessage(authResult.reason), true);
    // Faqat "expired" holatida xabarni yangilaymiz (foydalanuvchi ko'rib
    // qo'ysin) — "wrong_owner"da xabar o'zgarmaydi, chunki asl egasi hali
    // ham tugmani bosishi mumkin bo'lishi kerak.
    if (authResult.reason === "expired" && pending?.telegramMessageId && cq.message?.chat?.id) {
      await editMessageText(
        cq.message.chat.id,
        pending.telegramMessageId,
        `⏰ ${pending.previewText}\n\n<i>Bu amalning muddati o'tgan.</i>`
      );
    }
    return;
  }

  // checkCallbackAuthorization "ok" qaytargan bo'lsa, `pending` va `staff`
  // logik jihatdan albatta mavjud (funksiya shuni tekshirdi) — TypeScript
  // buni bila olmaydi, shuning uchun aniq tasdiqlaymiz.
  const p = pending as PendingAiAction;
  const s = staff as AuthedStaff;
  const chatId = cq.message?.chat?.id;

  if (action === "cancel" || action === "edit") {
    // Atomik: faqat "pending" holatidagi qatorni "cancelled"ga o'tkazadi —
    // ikki marta bosilsa, ikkinchisi `null` oladi (7-band). "edit" ham
    // texnik jihatdan bekor qilish — to'liq inline tahrirlash oynasi
    // hozircha implement qilinmagan (qolgan risklarga qarang), lekin
    // xodimga aniq ko'rsatma va alohida audit matni beriladi.
    const resolved = await resolvePendingAction(supabase, p.id, "cancelled");
    if (!resolved) {
      await answerCallbackQuery(cq.id, "Bu amal allaqachon hal qilingan", true);
      return;
    }
    const finalText =
      action === "edit"
        ? `✏️ ${p.previewText}\n\n<b>Tahrirlash uchun bekor qilindi.</b> Iltimos, to'g'irlangan buyruqni qayta yozing.`
        : `❌ ${p.previewText}\n\n<b>Bekor qilindi.</b>`;
    if (chatId && p.telegramMessageId) {
      await editMessageText(chatId, p.telegramMessageId, finalText);
    }
    await logAiAudit(supabase, s, p, action === "edit" ? "tahrirlash uchun bekor qilindi" : "bekor qilindi");
    await answerCallbackQuery(cq.id, action === "edit" ? "Qayta yozing" : "Bekor qilindi");
    return;
  }

  // action === "confirm" — avval SLOT'ni ATOMIK band qilamiz (6-band:
  // bitta tugma ikki marta bosilsa ham faqat BITTASI shu yerdan o'tadi,
  // chunki `.eq("status","pending")` optimistik qulf mavjud).
  const claimed = await resolvePendingAction(supabase, p.id, "confirmed");
  if (!claimed) {
    await answerCallbackQuery(cq.id, "Bu amal allaqachon hal qilingan", true);
    return;
  }

  const tool = getToolDefinition(p.toolName);
  if (!tool || !isRoleAllowedForTool(tool, s.role)) {
    const message = "Ruxsat yo'q yoki noma'lum amal";
    await attachResult(supabase, p.id, { errorMessage: message });
    if (chatId && p.telegramMessageId) {
      await editMessageText(chatId, p.telegramMessageId, `❌ ${p.previewText}\n\n<b>Xatolik:</b> ${message}`);
    }
    await logAiAudit(supabase, s, p, `xato: ${message}`);
    await answerCallbackQuery(cq.id, "Xatolik", true);
    return;
  }

  try {
    // `__pendingActionId` — moliyaviy tool'lar uchun idempotency kaliti
    // (clientRequestId). Atomik "claim" (yuqorida) allaqachon ikki marta
    // bajarilishning oldini oladi — bu DB darajasidagi QO'SHIMCHA himoya.
    const result = await tool.execute(supabase, s, { ...p.args, __pendingActionId: p.id });
    await attachResult(supabase, p.id, { resultSummary: result.resultSummary });
    if (chatId && p.telegramMessageId) {
      await editMessageText(chatId, p.telegramMessageId, `✅ ${p.previewText}\n\n<b>Bajarildi:</b> ${result.resultSummary}`);
    }
    await logAiAudit(supabase, s, p, `bajarildi: ${result.resultSummary}`);
    await answerCallbackQuery(cq.id, "✅ Bajarildi");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Noma'lum xatolik";
    await attachResult(supabase, p.id, { errorMessage: message });
    if (chatId && p.telegramMessageId) {
      await editMessageText(chatId, p.telegramMessageId, `❌ ${p.previewText}\n\n<b>Xatolik:</b> ${message}`);
    }
    await logAiAudit(supabase, s, p, `xato: ${message}`);
    await answerCallbackQuery(cq.id, "Xatolik", true);
  }
}
