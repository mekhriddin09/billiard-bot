/**
 * ⚠️ DISABLED (2026-08, "AI Agent olib tashlash") — bu modul ENDI HECH
 * QAYERDAN CHAQIRILMAYDI (`src/app/api/telegram/webhook/route.ts`dan
 * import olib tashlandi — sabab: LLM javob vaqti beqaror bo'lib, Telegram
 * botda operatsion kechikish/timeout keltirib chiqargan, Web App esa
 * xodimlarga qulayroq/tezroq bo'lib chiqdi). Kod XAVFSIZLIK/kelajakda
 * qayta yoqish ehtimoli uchun repo'da SAQLANGAN, lekin production
 * flow'da ISHLAMAYDI. O'chirilgan/o'zgartirilgan hech narsa yo'q — faqat
 * chaqiruvchi tomon uzildi.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";
import { todayKey } from "../permissions";
import { logAudit } from "../api-audit";
import { sendMessage, sendDocument, confirmCancelKeyboard, confirmEditCancelKeyboard, type TelegramSendResult } from "../telegram-bot";
import { getLlmProvider, LlmError } from "./providers";
import { getAllToolSchemas, getToolDefinition, isRoleAllowedForTool } from "./executor";
import { attachTelegramMessageId, createPendingAction, findRecentPendingByTool } from "./pending-actions";
import { consumePendingClarification, savePendingClarification } from "./clarification";
import { ServiceError } from "../services/errors";
import { METRIC_NAMES } from "./analytics/metrics";
import { buildSchemaPromptSection } from "./analytics/schema";
import { tryFastPath } from "./fast-path";
import type { LlmResult } from "./providers/types";

/** AI aniqlashtiruvchi savol berayotganini (tool chaqirmasdan, oddiy matn
 *  bilan) belgilash uchun ishlatiladigan konvensiya — `buildSystemPrompt()`
 *  LLM'ga shuni o'rgatadi, pastda esa shu prefiks orqali aniqlanadi. */
const CLARIFY_PREFIX = "[CLARIFY]";

/**
 * TABIIY TIL (NL) XABAR ISHLOVCHISI — Stage C/D/E.
 *
 * Oqim (har bir bosqich qat'iy tartibda, hech biri o'tkazib yuborilmaydi):
 *   1) LLM chaqiriladi (whitelist qilingan tool sxemalari bilan) — LLM
 *      hech qachon DB'ga bevosita kirmaydi, faqat matn/tool-sxema ko'radi.
 *   2) LLM javobi FAQAT ikkita shaklda bo'lishi mumkin: oddiy matn YOKI
 *      bitta tool-chaqiruvi (nom + argumentlar). Boshqa hech narsa
 *      ishonib bajarilmaydi.
 *   3) Tool nomi whitelist'da bo'lishi SHART (`getToolDefinition`).
 *   4) Rol ruxsati serverda qayta tekshiriladi (`isRoleAllowedForTool`) —
 *      LLM'ning o'zi "ruxsat bor" deb aytishi hech narsani anglatmaydi.
 *   5) Argumentlar `tool.validate()` orqali QAT'IY tekshiriladi — noto'g'ri
 *      bo'lsa amal HECH QACHON bajarilmaydi/pending yaratilmaydi.
 *   6) READ (mutating=false) — darhol bajariladi, natija Telegram'ga
 *      yuboriladi, DB audit yoziladi.
 *   7) MUTATING — `resolve()` orqali nomlar REAL ID'larga aylantiriladi,
 *      `pending_ai_actions`ga yoziladi, tasdiqlash kartasi yuboriladi.
 *      HAQIQIY bajarilish FAQAT Telegram tugma bosilganda, mavjud
 *      B-bosqich xavfsizlik infratuzilmasi (qayta autentifikatsiya,
 *      atomik claim, audit) orqali sodir bo'ladi — bu yerda EMAS.
 *
 * `staff` — HAR DOIM chaqiruvchi (webhook) tomonidan Telegram
 * `from.id`dan hal qilingan, ISHONCHLI `AuthedStaff`. LLM yoki
 * foydalanuvchi xabari ichidan HECH QACHON identifikatsiya olinmaydi.
 */
export async function handleAiMessage(
  supabase: SupabaseClient,
  staff: AuthedStaff,
  chatId: string,
  rawText: string
): Promise<void> {
  // Vaqtinchalik debug log (2026-08 AI timeout audit) — har bir so'rovning
  // to'liq umrini (webhook'dan Telegram javobigacha) o'lchash uchun.
  const requestStartedAt = Date.now();
  console.log(`[ai/dispatch] so'rov boshlandi — chatId=${chatId}, staff=${staff.role}, text.chars=${rawText.length}`);

  // ─── Ko'p-bosqichli aniqlashtirish konteksti (Faza 6) ──────────────────
  // Agar oldingi xabarda AI aniqlashtiruvchi savol bergan bo'lsa (masalan
  // "Qaysi hajmdagi Cola?"), o'sha ASL xabar shu yerda "iste'mol qilinadi"
  // (bir martalik) va yangi xabar bilan birlashtiriladi — LLM ikkalasini
  // BITTA yaxlit so'rov sifatida ko'radi. Agar kutilayotgan aniqlashtirish
  // bo'lmasa (yoki muddati o'tgan bo'lsa), xabar o'zgarishsiz ishlatiladi.
  const pendingOriginal = await consumePendingClarification(supabase, chatId, staff.id);
  const text = pendingOriginal ? `${pendingOriginal}\n(qo'shimcha izoh): ${rawText}` : rawText;

  // ─── FAST-PATH — Gemini'ga murojaat qilmasdan, eng ko'p ishlatiladigan
  // buyruqlarni (hisobot/qarzlar/xarajat qo'shish/stol ochish-yopish)
  // to'g'ridan-to'g'ri aniqlaydi (2026-08, AI javob tezligi audit). Mos
  // kelmasa (`null`) — pastda ODATDAGIDEK Gemini'ga murojaat qilinadi,
  // xatti-harakat o'zgarmaydi. Mos kelsa — natija xuddi Gemini `tool_call`
  // javobi kabi ishlatiladi, keyingi BARCHA xavfsizlik bosqichlari
  // (whitelist/rol/validate/resolve/tasdiqlash) o'zgarishsiz qoladi.
  let result: LlmResult;
  const fastPathMatch = tryFastPath(text);
  if (fastPathMatch) {
    console.log(`[ai/dispatch] fast-path mos keldi — tool=${fastPathMatch.name} (Gemini chetlab o'tildi)`);
    result = { kind: "tool_call", call: { name: fastPathMatch.name, args: fastPathMatch.args } };
  } else {
    let provider, tools, systemPrompt;
    try {
      provider = getLlmProvider();
      tools = getAllToolSchemas();
      systemPrompt = buildSystemPrompt(staff);
    } catch (e) {
      // Avval bu 3 qator hech qanday try/catch'siz edi — throw qilsa
      // webhook route'ning TASHQI catch'i jimgina yutib yuborar edi (200
      // qaytadi, lekin foydalanuvchi HECH NARSA ko'rmaydi). Endi har doim
      // aniq xabar boradi.
      console.error("[ai/dispatch] Sozlash xatosi:", e instanceof Error ? e.message : e);
      await sendMessageSafe(chatId, "⚠️ AI xizmati sozlanmagan (administratorga murojaat qiling).");
      return;
    }

    const llmCallStartedAt = Date.now();
    try {
      result = await provider.generate({ systemPrompt, userMessage: text, tools });
      console.log(`[ai/dispatch] LLM chaqiruvi muvaffaqiyatli — ${Date.now() - llmCallStartedAt}ms, natija=${result.kind}${result.kind === "tool_call" ? ` (${result.call.name})` : ""}`);
    } catch (e) {
      // Har doim Vercel Runtime Logs'da ko'rinadi — audit_log yozuvi
      // (pastda) muvaffaqiyatsiz bo'lsa ham (masalan migratsiya hali
      // qo'llanilmagan bo'lsa), aniq sabab shu yerda yo'qolmaydi.
      console.error(
        `[ai/dispatch] LLM chaqiruvi muvaffaqiyatsiz — ${Date.now() - llmCallStartedAt}ms, kind=${e instanceof LlmError ? e.kind : "?"}:`,
        e instanceof Error ? e.message : e
      );
      const msg = e instanceof LlmError ? llmErrorMessage(e) : "AI xizmatida kutilmagan xatolik";
      await sendMessageSafe(chatId, `⚠️ ${msg}`);
      await logAiAuditRaw(supabase, staff, "__llm__", { text }, `xato: ${e instanceof Error ? e.message : "noma'lum"}`);
      console.log(`[ai/dispatch] so'rov tugadi (LLM xato) — jami ${Date.now() - requestStartedAt}ms`);
      return;
    }
  }

  if (result.kind === "text") {
    let responseText = result.text || "Tushunmadim, iltimos aniqroq yozing.";
    if (responseText.startsWith(CLARIFY_PREFIX)) {
      // AI aniqlashtiruvchi savol berdi (tool chaqirmadi) — ASL (shu
      // xabargacha bo'lgan, allaqachon birlashtirilgan) matnni saqlaymiz,
      // shunda keyingi javob shu bilan bog'lanadi. Foydalanuvchiga esa
      // faqat toza savol matni ko'rsatiladi, texnik prefiks emas.
      responseText = responseText.slice(CLARIFY_PREFIX.length).trim();
      await savePendingClarification(supabase, chatId, staff.id, text);
    }
    await sendMessageSafe(chatId, responseText);
    console.log(`[ai/dispatch] so'rov tugadi (matn javob) — jami ${Date.now() - requestStartedAt}ms`);
    return;
  }

  const { name: toolName, args: rawArgs } = result.call;
  const tool = getToolDefinition(toolName);

  // Faqat whitelist'dagi, LLM'ga ko'rsatilgan tool'lar ishonib bajariladi —
  // dev/test tool'lar (masalan test_open_table) NL orqali ISHLAMAYDI,
  // chunki ular getAllToolSchemas()da yo'q va LLM ularni "bilmaydi", lekin
  // qo'shimcha himoya sifatida shu yerda ham tekshiriladi.
  if (!tool || !getAllToolSchemas().some((s) => s.name === toolName)) {
    await sendMessageSafe(chatId, "⚠️ Noma'lum amal so'raldi.");
    await logAiAuditRaw(supabase, staff, toolName, rawArgs, "xato: noma'lum tool");
    return;
  }

  if (!isRoleAllowedForTool(tool, staff.role)) {
    await sendMessageSafe(chatId, "⛔ Sizda bu amal uchun ruxsat yo'q.");
    await logAiAuditRaw(supabase, staff, toolName, rawArgs, "xato: ruxsat yo'q");
    return;
  }

  let validated: Record<string, unknown>;
  try {
    validated = tool.validate(rawArgs);
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "Argumentlar noto'g'ri";
    await sendMessageSafe(chatId, `⚠️ ${msg}`);
    await logAiAuditRaw(supabase, staff, toolName, rawArgs, `xato: ${msg}`);
    return;
  }

  // ─── READ — darhol bajariladi, tasdiqlash shart emas ──────────────────
  if (!tool.mutating) {
    const toolStartedAt = Date.now();
    try {
      const res = await tool.execute(supabase, staff, validated);
      console.log(`[ai/dispatch] tool.execute(${toolName}) muvaffaqiyatli — ${Date.now() - toolStartedAt}ms`);
      if (res.document) {
        // Natija Telegram xabarida o'qib bo'lmas darajada katta (universal
        // query engine) — fayl (CSV) sifatida yuboriladi, resultSummary
        // hujjatning qisqa "caption"i bo'ladi.
        const docRes = await sendDocument(chatId, res.document.filename, res.document.content, {
          caption: res.document.caption ?? res.resultSummary,
        });
        if (!docRes.ok) {
          // Fayl yuborib bo'lmadi (masalan tarmoq) — foydalanuvchi HECH
          // narsasiz qolmasin, hech bo'lmasa matn xabarini olsin.
          console.error("[ai/dispatch] sendDocument muvaffaqiyatsiz:", docRes.error);
          await sendMessageSafe(chatId, res.resultSummary);
        }
      } else {
        await sendMessageSafe(chatId, res.resultSummary);
      }
      await logAudit(supabase, staff, `[AI] ${toolName}: ${textSnippet(res.resultSummary)}`, {
        source: "telegram_ai",
        metadata: { tool: toolName, args: validated, result: res.resultSummary },
      });
    } catch (e) {
      console.error(`[ai/dispatch] tool.execute(${toolName}) muvaffaqiyatsiz — ${Date.now() - toolStartedAt}ms:`, e instanceof Error ? e.message : e);
      const msg = e instanceof ServiceError ? e.message : "Xatolik yuz berdi";
      await sendMessageSafe(chatId, `⚠️ ${msg}`);
      await logAiAuditRaw(supabase, staff, toolName, validated, `xato: ${msg}`);
    }
    console.log(`[ai/dispatch] so'rov tugadi (READ tool) — jami ${Date.now() - requestStartedAt}ms`);
    return;
  }

  // ─── MUTATING — nomlarni REAL ID'larga hal qilish + preview qurish ────
  try {
    const { preview, resolvedArgs } = await tool.resolve!(supabase, validated);

    // Dublikatni oldini olish: XUDDI SHU real nishonga (bir xil hal
    // qilingan argumentlar — masalan bir xil stol/mahsulot/qarz) tegishli,
    // hali hal qilinmagan pending action bormi? Faqat AYNAN bir xil
    // amal bloklanadi — turli stol/mijoz uchun ketma-ket buyruqlar erkin.
    const recentCandidates = await findRecentPendingByTool(supabase, chatId, toolName);
    const duplicate = recentCandidates.find((c) => JSON.stringify(c.args) === JSON.stringify(resolvedArgs));
    if (duplicate) {
      await sendMessageSafe(
        chatId,
        `⏳ Sizda xuddi shu amal uchun kutilayotgan tasdiqlash bor:\n\n${duplicate.previewText}\n\nAvval uni tasdiqlang yoki bekor qiling.`
      );
      console.log(`[ai/dispatch] so'rov tugadi (duplicate pending) — jami ${Date.now() - requestStartedAt}ms`);
      return;
    }

    const pending = await createPendingAction(supabase, { chatId, staff, toolName, args: resolvedArgs, previewText: preview });
    const keyboard = tool.risky ? confirmEditCancelKeyboard(pending.id) : confirmCancelKeyboard(pending.id);
    const res = await sendMessageSafe(chatId, preview, { replyMarkup: keyboard });
    if (res.ok && res.messageId) await attachTelegramMessageId(supabase, pending.id, res.messageId);
  } catch (e) {
    console.error(`[ai/dispatch] tool.resolve(${toolName}) muvaffaqiyatsiz:`, e instanceof Error ? e.message : e);
    const msg = e instanceof ServiceError ? e.message : "Xatolik yuz berdi";
    await sendMessageSafe(chatId, `⚠️ ${msg}`);
    await logAiAuditRaw(supabase, staff, toolName, validated, `xato: ${msg}`);
  }
  console.log(`[ai/dispatch] so'rov tugadi (MUTATING tool) — jami ${Date.now() - requestStartedAt}ms`);
}

/**
 * `sendMessage()`ning "hech qachon throw qilmaydi" ustiga xavfsizlik
 * qatlami: (1) Telegram'ning 4096 belgili chegarasidan oshmasligini
 * ta'minlaydi (uzun LLM/hisobot matnlari kesiladi), (2) HTML parse xato
 * bersa (masalan LLM matni ichida qochirilmagan `<`/`>` belgilari —
 * "can't parse entities") — bitta marta oddiy matn (teglar olib
 * tashlangan) bilan QAYTA URINADI, shunda foydalanuvchi HECH BO'LMASA
 * kontentni ko'radi, mutlaqo javobsiz qolmaydi. Ikkala urinish ham
 * muvaffaqiyatsiz bo'lsa — sabab Runtime Logs'da ko'rinadi.
 */
async function sendMessageSafe(
  chatId: string,
  text: string,
  opts: { replyMarkup?: Record<string, unknown> } = {}
): Promise<TelegramSendResult> {
  const MAX_LEN = 3900; // Telegram limiti 4096 — kichik zaxira bilan
  const trimmed = text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}\n\n… (xabar juda uzun, qisqartirildi)` : text;

  const res = await sendMessage(chatId, trimmed, { replyMarkup: opts.replyMarkup });
  if (res.ok) return res;

  console.error("[ai/dispatch] sendMessage (HTML) muvaffaqiyatsiz, oddiy matn bilan qayta urinilmoqda:", res.error);
  const plain = trimmed.replace(/<[^>]+>/g, "");
  const retryRes = await sendMessage(chatId, plain, { replyMarkup: opts.replyMarkup, parseMode: false });
  if (!retryRes.ok) {
    console.error("[ai/dispatch] sendMessage (oddiy matn, fallback) HAM muvaffaqiyatsiz:", retryRes.error);
  }
  return retryRes;
}

function textSnippet(s: string, max = 400): string {
  const oneLine = s.replace(/\n/g, " ");
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function logAiAuditRaw(
  supabase: SupabaseClient,
  staff: AuthedStaff,
  toolName: string,
  args: unknown,
  resultText: string
): Promise<void> {
  await logAudit(supabase, staff, `[AI] ${toolName}: ${resultText}`, {
    source: "telegram_ai",
    metadata: { tool: toolName, args: (args as Record<string, unknown>) ?? {}, result: resultText },
  });
}

function llmErrorMessage(e: LlmError): string {
  switch (e.kind) {
    case "timeout":
      return "AI javob berish vaqti tugadi. Birozdan keyin qayta urinib ko'ring.";
    case "config":
      return "AI xizmati sozlanmagan (administratorga murojaat qiling).";
    case "http":
      return "AI xizmatida vaqtinchalik xatolik. Birozdan keyin qayta urinib ko'ring.";
    case "parse":
      return "AI javobini o'qib bo'lmadi. Qaytadan urinib ko'ring.";
  }
}

function buildSystemPrompt(staff: AuthedStaff): string {
  return [
    "Sen — Sho'rchi Billiard Club uchun ichki AI administrator yordamchisisan.",
    "Faqat senga berilgan tool'lar (funksiyalar) orqali ishlaysan — DB yoki SQL'ga to'g'ridan-to'g'ri kirish imkoning YO'Q.",
    "Foydalanuvchi so'ragan amalni eng mos tool bilan bajarishga harakat qil. Agar mos tool bo'lmasa yoki savol AI administrator vazifasiga aloqador bo'lmasa, oddiy matn bilan qisqa javob ber (tool chaqirma).",
    `Bugungi sana (Osiyo/Toshkent vaqti): ${todayKey()}. "bugun"/"kecha"/"ertaga" kabi nisbiy so'zlarni shu sanaga nisbatan HAQIQIY YYYY-MM-DD sanaga aylantirib, tool argumentiga shu holda uzat — hech qachon "bugun" kabi so'zni argument sifatida yuborma.`,
    "Vaqt oralig'i so'ralganda (masalan 'soat 13:00 atrofida') mos fromTime/toTime (HH:MM) hisoblab ber (masalan ±30 daqiqa).",
    "",
    "─── STOLNI ANIQLASH (open_table/add_product/add_time/close_table) ───",
    "Bu tool'larda tableNumber/tableName/tableType — 3 xil ALTERNATIV maydon (bittasi kifoya): agar foydalanuvchi aniq RAQAM aytsa ('5 stolni och'), tableNumber=5 qo'y. Agar NOM bilan aytsa ('T1 stolni och', 'VIP1 stol'), tableName'ga foydalanuvchi aytgan ANIQ nomni yoz (masalan 'T1') — hech qachon 'T1'ni raqam 1 deb tableNumber'ga aylantirma, chunki bitta raqam bir nechta turdagi stolga tegishli bo'lishi mumkin. Agar foydalanuvchi faqat TURINI aytsa va aniq raqam/nom bermasa ('tenis stol och'), tableType='tennis' (yoki 'billiard') qo'y, tableNumber/tableName'ni bo'sh qoldir.",
    `Joriy foydalanuvchi: ${staff.name} (rol: ${staff.role}) — lekin bu ma'lumotni tool argumentiga HECH QACHON qo'shma, u avtomatik hisobga olinadi.`,
    "Pul summalarini so'mda, butun son sifatida uzat (masalan 150000, '150 ming' emas).",
    "Agar foydalanuvchi so'rovi noaniq bo'lsa (masalan qaysi stol, qaysi mijoz, qaysi mahsulot HAJMI/variantI aniq emas), tool chaqirmasdan, aniqlashtiruvchi savol ber (oddiy matn bilan). MUHIM: bunday aniqlashtiruvchi savolni HAR DOIM \"[CLARIFY] \" prefiksi bilan boshla (masalan '[CLARIFY] Qaysi hajmdagi Cola nazarda tutilyapti — 0.5L yoki 1.5L?'). Bu tizimga keyingi xabarni shu savol bilan avtomatik bog'lashga yordam beradi — foydalanuvchi hech narsani takrorlamasdan javob berishi mumkin. Agar oddiy javob/natija berayotgan bo'lsang (aniqlashtirish EMAS), bu prefiksni ISHLATMA.",
    "Ba'zan foydalanuvchi xabari ichida \"(qo'shimcha izoh): ...\" qismi bo'lishi mumkin — bu sening oldingi [CLARIFY] savolingga javob, ikkala qismni BIRGA o'qib yaxlit buyruq sifatida tushun (masalan \"T1 stolga 2 kola / (qo'shimcha izoh): 1.5 lik\" = T1 stolga 2 ta 1.5L Cola).",
    "",
    "Bir xabarda faqat BITTA tool chaqira olasan (ko'p bosqichli/ketma-ket chaqiruv yo'q). Agar foydalanuvchi bir nechta moliyaviy ko'rsatkichni birga so'rasa (masalan 'to'liq hisobot', 'umumiy holat', 'hammasi qancha bo'ldi') — alohida-alohida tool chaqirishga urinma, buning uchun maxsus \"get_full_report\" tool'i bor (tushum+foyda+xarajat+naqd/karta+ochiq qarz — bittasida).",
    "",
    "─── MOLIYAVIY FAKTLAR va ERKIN SO'ROVLAR (2 xil READ tool) ───",
    `1) "analytics_metric" — FAQAT quyidagi nomlangan moliyaviy metrikalar uchun (tushum/foyda/xarajat/qarz eskirishi va h.k. so'ralganda DOIM shuni ishlat, hech qachon analytics_query bilan o'zing tushum/foyda formulasini "hisoblashga" urinma): ${METRIC_NAMES.join(", ")}.`,
    '"Foyda"/"keldi"/"ketdi" haqida UMUMIY savol ("bugun foyda qancha?", "bu oy qancha keldi/ketdi?") berilsa — DOIM "simple_finance" metrikasini ishlat (KELDI − KETDI, COGS\'siz sodda model). "cogs"/"gross_profit"/"estimated_net_profit" FAQAT admin ANIQ "tannarx"/"COGS"/"ombor asosidagi foyda" deb so\'raganda ishlatiladi — bu ikkinchi darajali, kamdan-kam kerak bo\'ladigan batafsil ko\'rsatkich.',
    `2) "analytics_query" — boshqa har qanday ma'lumot so'rovi uchun (ro'yxat, filtr, guruhlash, oddiy son/yig'indi) — quyidagi jadval/maydon/relationship whitelist'idan FAQAT shu yerda ko'rsatilganlarni ishlat, boshqa nom o'ylab topma:`,
    buildSchemaPromptSection(),
    "analytics_query'da: filters operatorlari — eq/neq/gt/gte/lt/lte/in/ilike. aggregate.fn — count/sum/avg/min/max (sum/avg/min/max FAQAT (agg) belgili maydonlarda). groupBy — FAQAT (group) belgili maydonlarda. Natija juda katta bo'lishi mumkin bo'lsa ham xavotir olma — tizim o'zi CSV faylga aylantiradi.",
    "\"Iyulda elektrga qancha ketgan?\", \"iyulda eng katta xarajat nima bo'lgan?\" kabi savollar uchun \"analytics_query\" bilan \"expenses\" jadvalini \"name\" maydoni bo'yicha filtrlash (ilike) yoki miqdor bo'yicha saralash (orderBy) orqali javob ber — xarajatlar KATEGORIYASIZ, faqat ozod matnli nom (\"name\") bilan yoziladi, kategoriya SO'RAMA.",
    "",
    "─── XARAJAT YOZISH (record_expense) — KATEGORIYA SO'RAMA ───",
    "Admin \"svetga 300 ming ketdi\", \"colaga 300 ming ketdi\", \"konditsioner remontiga 700 ming to'ladim\" kabi tabiiy gap yozsa — bu \"record_expense\" tool (name=xarajat nomi, admin aytgan narsadan qisqa/tushunarli qilib o'zing shakllantir, masalan \"Svet / kommunal to'lov\", amount=summa). categoryName MAYDONINI HECH QACHON so'rama va odatda BO'SH qoldir — admin kategoriya tanlashi SHART EMAS, faqat aniq o'zi kategoriya nomini aytgandagina (kam uchraydi) categoryName'ni to'ldir.",
    "Agar foydalanuvchi so'rovi qaysi jadval/maydonga tegishli ekani noaniq bo'lsa, tool chaqirmasdan aniqlashtiruvchi savol ber.",
  ].join("\n");
}
