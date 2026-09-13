import "server-only";
import { LlmError, type LlmProvider, type LlmResult, type LlmToolSchema } from "./types";

/**
 * Claude provider — TO'LIQ implement qilingan, lekin HOZIRCHA ULANMAGAN
 * (`.env.local`da `ANTHROPIC_API_KEY` yo'q). Provider abstraksiyasining
 * ikkinchi, real ishlaydigan implementatsiyasi sifatida mavjud — kerak
 * bo'lganda faqat `ANTHROPIC_API_KEY` qo'shib, `AI_PROVIDER=claude`
 * qilish yetarli, boshqa hech qanday kod o'zgarmaydi (Gemini bilan bir xil
 * `LlmProvider` interfeysi).
 */

const DEFAULT_MODEL = "claude-sonnet-4-5";
// Webhook route'ning maxDuration'i (30s) ichida DB so'rovlari uchun ham
// joy qolishi kerak — shuning uchun LLM timeout shundan sezilarli kichik.
const DEFAULT_TIMEOUT_MS = 15_000;
const API_VERSION = "2023-06-01";

function apiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

function model(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function toClaudeTools(tools: LlmToolSchema[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export const claudeProvider: LlmProvider = {
  name: "claude",

  async generate({ systemPrompt, userMessage, tools }): Promise<LlmResult> {
    const key = apiKey();
    if (!key) throw new LlmError("ANTHROPIC_API_KEY .env.local'da yo'q", "config");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: model(),
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          ...(tools.length > 0 ? { tools: toClaudeTools(tools) } : {}),
          temperature: 0,
        }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new LlmError("Claude javob berish vaqti tugadi", "timeout");
      }
      throw new LlmError(e instanceof Error ? e.message : "Claude bilan tarmoq xatosi", "http");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new LlmError(`Claude API xatosi (${res.status}): ${bodyText.slice(0, 300)}`, "http");
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new LlmError("Claude javobini o'qib bo'lmadi", "parse");

    const blocks: any[] = data?.content ?? [];
    const toolUse = blocks.find((b) => b?.type === "tool_use");
    if (toolUse) {
      return { kind: "tool_call", call: { name: toolUse.name, args: toolUse.input ?? {} } };
    }

    const textBlock = blocks.find((b) => b?.type === "text" && typeof b?.text === "string");
    if (textBlock) return { kind: "text", text: textBlock.text };

    return { kind: "text", text: "(AI bo'sh javob qaytardi)" };
  },
};
