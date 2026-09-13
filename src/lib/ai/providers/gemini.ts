import "server-only";
import { LlmError, type LlmProvider, type LlmResult, type LlmToolSchema } from "./types";

/**
 * Gemini provider — Stage C'da ULANGAN (haqiqiy) provider. Qo'shimcha
 * kutubxona shart emas, oddiy `fetch` (loyihadagi boshqa tashqi
 * integratsiyalar — Telegram Bot API — bilan bir xil uslub).
 *
 * Timeout: `LLM_TIMEOUT_MS` (standart 20000ms) — Vercel serverless funksiya
 * chegarasidan ancha kichik, shunda webhook har doim tezda javob qaytaradi.
 */

// "latest" alias ishlatiladi — Google modelni pensiyaga chiqarganda/
// yangilaganda ham qattiq kodlangan versiya nomi eskirib qolmasligi uchun
// (2026-08'da bevosita "gemini-2.5-flash" bilan sinalganda 404 qaytdi —
// hisobga/kalitga bog'liq model ruxsati farqlari bo'lishi mumkin;
// "latest" alias shu turdagi muammolarni oldini oladi).
const DEFAULT_MODEL = "gemini-flash-latest";
// Webhook route'ning maxDuration'i (30s) ichida DB so'rovlari uchun ham
// joy qolishi kerak — shuning uchun LLM timeout shundan sezilarli kichik.
const DEFAULT_TIMEOUT_MS = 25_000;

function apiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? null;
}

function model(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function toGeminiSchema(tools: LlmToolSchema[]) {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Google'ning o'zida vaqtincha yuklama bo'lganda (503 UNAVAILABLE) yoki
 *  limitga tegilganda (429) qaytariladigan holatlar — bir martalik
 *  qisqa qayta urinish bilan ko'pincha o'zi tuzaladi. Boshqa xatolar
 *  (400/401/403/404) qayta urinishga arzimaydi — darhol otiladi. */
function isRetryableStatus(status: number): boolean {
  return status === 503 || status === 429;
}

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  tools: LlmToolSchema[],
  key: string,
  attemptTimeoutMs: number,
  attemptLabel: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        tools: toGeminiSchema(tools),
        ...(tools.length > 0 ? { toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
        // thinkingBudget: 0 — "thinking" (kengaytirilgan fikrlash) o'chirilgan.
        // Bizning vazifamiz — oddiy buyruqni to'g'ri tool'ga yo'naltirish,
        // chuqur fikrlash shart emas; thinking o'chirilganda javob SEZILARLI
        // tezroq keladi (timeout muammosining asosiy sababi shu edi).
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    // Vaqtinchalik debug log (2026-08 AI timeout audit) — API keyni
    // hech qachon chiqarmaydi, faqat status+vaqt. Bu yordamida Vercel
    // Runtime Logs'da har bir urinish qancha vaqt olganini va Google'dan
    // haqiqatan JAVOB kelganmi (status bor) yoki umuman javobsiz
    // (abort/tarmoq) qolganini ajratib ko'rish mumkin.
    console.log(`[ai/gemini] ${attemptLabel} — javob keldi: status=${res.status}, ${Date.now() - startedAt}ms`);
    return res;
  } catch (e) {
    const elapsed = Date.now() - startedAt;
    if (e instanceof Error && e.name === "AbortError") {
      console.error(`[ai/gemini] ${attemptLabel} — TIMEOUT (${elapsed}ms ichida Google'dan HECH QANDAY javob kelmadi, limit=${attemptTimeoutMs}ms)`);
      throw new LlmError("Gemini javob berish vaqti tugadi", "timeout");
    }
    console.error(`[ai/gemini] ${attemptLabel} — tarmoq xatosi (${elapsed}ms): ${e instanceof Error ? e.message : e}`);
    throw new LlmError(e instanceof Error ? e.message : "Gemini bilan tarmoq xatosi", "http");
  } finally {
    clearTimeout(timer);
  }
}

export const geminiProvider: LlmProvider = {
  name: "gemini",

  async generate({ systemPrompt, userMessage, tools }): Promise<LlmResult> {
    const requestStartedAt = Date.now();
    const key = apiKey();
    // Vaqtinchalik debug log (2026-08 AI timeout audit) — API KEYNING O'ZI
    // hech qachon chiqarilmaydi, faqat mavjudligi (true/false) va uzunligi.
    console.log(
      `[ai/gemini] so'rov boshlandi — model=${model()}, timeoutMs=${timeoutMs()}, key.exists=${!!key}, key.len=${key?.length ?? 0}, tools=${tools.length}, systemPrompt.chars=${systemPrompt.length}, userMessage.chars=${userMessage.length}`
    );
    if (!key) {
      console.error("[ai/gemini] GEMINI_API_KEY topilmadi (process.env'da yo'q) — bu Vercel Production environment'da alohida tekshirilishi kerak (local .env.local'dan farq qilishi mumkin).");
      throw new LlmError("GEMINI_API_KEY .env.local'da yo'q", "config");
    }

    const totalBudget = timeoutMs();
    const maxAttempts = 2; // 1 ta asl urinish + 1 ta qayta urinish
    const perAttempt = Math.floor(totalBudget / maxAttempts);

    let res: Response | undefined;
    let lastError: LlmError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await callGemini(systemPrompt, userMessage, tools, key, perAttempt, `urinish ${attempt}/${maxAttempts}`);
      } catch (e) {
        // Timeout/tarmoq xatosi — agar hali urinish qolgan bo'lsa, qayta
        // urinamiz (bitta sekin javob butun so'rovni o'ldirmasin).
        lastError = e instanceof LlmError ? e : new LlmError("Gemini bilan bog'lanib bo'lmadi", "http");
        res = undefined;
        if (attempt === maxAttempts) {
          console.error(`[ai/gemini] BARCHA urinishlar muvaffaqiyatsiz — jami ${Date.now() - requestStartedAt}ms, oxirgi xato kind=${lastError.kind}`);
          throw lastError;
        }
        continue;
      }
      if (res.ok || !isRetryableStatus(res.status) || attempt === maxAttempts) break;
      console.log(`[ai/gemini] urinish ${attempt} — retryable status ${res.status}, qayta urinishdan oldin kutilmoqda`);
      await sleep(500 * attempt); // qisqa backoff (500ms, keyin 1000ms)
    }
    if (!res) throw lastError ?? new LlmError("Gemini bilan bog'lanib bo'lmadi", "http");

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(`[ai/gemini] Gemini HTTP xatosi — status=${res.status}, body=${bodyText.slice(0, 500)}`);
      const friendly =
        res.status === 503
          ? "Gemini hozir band (yuklama yuqori) — birozdan keyin qayta urining."
          : res.status === 429
            ? "Gemini limiti tugadi (kvota/billing) — birozdan keyin qayta urining."
            : res.status === 401 || res.status === 403
              ? "Gemini autentifikatsiya xatosi — API kalit noto'g'ri yoki ruxsatsiz."
              : res.status === 404
                ? `Gemini model topilmadi (model="${model()}") — model nomi noto'g'ri/eskirgan bo'lishi mumkin.`
                : `Gemini API xatosi (${res.status}): ${bodyText.slice(0, 300)}`;
      throw new LlmError(friendly, "http");
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new LlmError("Gemini javobini o'qib bo'lmadi", "parse");
    console.log(`[ai/gemini] muvaffaqiyatli — jami ${Date.now() - requestStartedAt}ms`);

    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const fnPart = parts.find((p) => p?.functionCall?.name);
    if (fnPart) {
      return {
        kind: "tool_call",
        call: { name: fnPart.functionCall.name, args: fnPart.functionCall.args ?? {} },
      };
    }

    const textPart = parts.find((p) => typeof p?.text === "string");
    if (textPart) return { kind: "text", text: textPart.text };

    // Blok bo'lgan / bo'sh javob (masalan safety filter) — tool ham, matn
    // ham topilmadi. Xato emas, lekin foydalanuvchiga tushuntirish kerak.
    const finishReason = data?.candidates?.[0]?.finishReason;
    return { kind: "text", text: finishReason ? `(AI javob bermadi: ${finishReason})` : "(AI bo'sh javob qaytardi)" };
  },
};
