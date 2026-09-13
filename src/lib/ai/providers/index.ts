/**
 * ⚠️ DISABLED (2026-08) — faqat `dispatch.ts` orqali ishlatiladi, u o'zi
 * hech qayerdan chaqirilmaydi (qarang: dispatch.ts tepasidagi izoh).
 * Kod saqlangan, lekin production'da ishlamaydi.
 */
import "server-only";
import type { LlmProvider } from "./types";
import { geminiProvider } from "./gemini";
import { claudeProvider } from "./claude";

export type { LlmProvider, LlmResult, LlmToolCall, LlmToolSchema, LlmErrorKind } from "./types";
export { LlmError } from "./types";

/**
 * `AI_PROVIDER` env o'zgaruvchisi orqali tanlanadi ("gemini" | "claude").
 * Standart — "gemini" (Stage C'da haqiqiy ulangan provider). Chaqiruvchi
 * kod (`src/lib/ai/dispatch.ts`) provider tanlovidan MUTLAQO XABARSIZ —
 * faqat `LlmProvider` interfeysi bilan ishlaydi, shuning uchun provider
 * almashtirilsa (masalan keyinroq `AI_PROVIDER=claude`), boshqa hech qanday
 * kod o'zgarishi shart emas.
 */
export function getLlmProvider(): LlmProvider {
  const which = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
  if (which === "claude") return claudeProvider;
  return geminiProvider;
}
