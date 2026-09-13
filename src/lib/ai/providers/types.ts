import "server-only";

/**
 * LLM PROVIDER ABSTRAKSIYASI (Stage C).
 *
 * MUHIM: bu qatlam AI'ni bitta provider'ga ("Gemini" yoki "Claude") qattiq
 * bog'lamaydi — `src/lib/ai/providers/index.ts`dagi `getLlmProvider()`
 * `AI_PROVIDER` env o'zgaruvchisi orqali qaysi provayderni ishlatishni
 * tanlaydi. Hozircha ulangan (haqiqiy API kaliti bilan sinalgan) provider —
 * Gemini. Claude provideri ham TO'LIQ implement qilingan (bir xil interfeys),
 * lekin hozircha API kaliti yo'q — kerak bo'lsa faqat `.env.local`ga
 * `ANTHROPIC_API_KEY` qo'shib, `AI_PROVIDER=claude` qilish yetarli.
 *
 * Hech qanday provider hech qachon Supabase/DB'ga bevosita ulanmaydi —
 * faqat matn (system prompt + foydalanuvchi xabari) va tool-sxemalarni
 * qabul qiladi, javobida esa FAQAT (a) tool chaqiruvi (nom + argumentlar)
 * yoki (b) oddiy matn qaytaradi. DB'ga yozish/o'qish — FAQAT
 * `src/lib/ai/executor.ts`dagi whitelist qilingan tool'lar orqali,
 * chaqiruvchi (webhook) tomonidan Telegram `from.id`dan hal qilingan
 * `AuthedStaff` bilan.
 */

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type LlmResult = { kind: "tool_call"; call: LlmToolCall } | { kind: "text"; text: string };

export type LlmErrorKind = "config" | "timeout" | "http" | "parse";

export class LlmError extends Error {
  kind: LlmErrorKind;
  constructor(message: string, kind: LlmErrorKind) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
  }
}

export interface LlmProvider {
  readonly name: string;
  generate(params: { systemPrompt: string; userMessage: string; tools: LlmToolSchema[] }): Promise<LlmResult>;
}
