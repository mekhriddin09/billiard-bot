import "server-only";
import type { StaffRole } from "../types";
import type { LlmToolSchema } from "./providers/types";
import type { ToolDefinition } from "./tool-types";
import { startSessionCore } from "../services/sessions";
import { readTools } from "./tools/read";
import { operationalTools } from "./tools/operational";
import { financialTools } from "./tools/financial";
import { analyticsTools } from "./tools/analytics";

export type { ToolDefinition, ToolExecutionResult } from "./tool-types";

/**
 * TOOL REGISTRY — LLM/NL qatlami faqat shu ro'yxatdagi nomlarni chaqira
 * oladi, boshqa hech narsa YO'Q (whitelist). Har bir tool guruhi alohida
 * faylda (`tools/read.ts`, `tools/operational.ts`, `tools/financial.ts`) —
 * bu yerda faqat birlashtiriladi.
 */
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // B-bosqich demo/dev tool'i — /test_confirm shu bilan ishlaydi, LLM/NL
  // orqali chaqirilmaydi (system promptga qo'shilmaydi, pastdagi
  // `getAllToolSchemas()`ga kirmaydi — faqat `getToolDefinition` orqali
  // to'g'ridan-to'g'ri nomi bilan chaqiriladi).
  test_open_table: {
    description: "(dev/test) — /test_confirm buyrug'i uchun ichki tool, LLM orqali chaqirilmaydi.",
    parameters: { type: "object", properties: {} },
    mutating: true,
    risky: false,
    validate: (raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}),
    resolve: async (_supabase, args) => ({
      preview: `🧪 Test action\n\nStol ${args.tableName ?? args.tableId} ni ochish`,
      resolvedArgs: args,
    }),
    execute: async (supabase, auth, args) => {
      const tableId = String(args.tableId ?? "");
      const tableName = String(args.tableName ?? tableId);
      const { session } = await startSessionCore(supabase, auth, { tableId });
      return { resultSummary: `Stol ${tableName} ochildi (sessiya #${session.id.slice(0, 8)})` };
    },
  },

  ...readTools,
  ...operationalTools,
  ...financialTools,
  ...analyticsTools,
};

/** Faqat LLM'ga ko'rsatiladigan (NL orqali chaqirilishi mumkin bo'lgan) tool nomlari — dev/test tool'lar bu yerga kirmaydi. */
const NL_VISIBLE_TOOLS = new Set([
  ...Object.keys(readTools),
  ...Object.keys(operationalTools),
  ...Object.keys(financialTools),
  ...Object.keys(analyticsTools),
]);

export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[toolName];
}

/** Xodim shu tool'ni bajarishga ruxsati bormi (rol darajasida). */
export function isRoleAllowedForTool(tool: ToolDefinition, role: StaffRole): boolean {
  if (!tool.allowedRoles) return true;
  return tool.allowedRoles.includes(role);
}

/** LLM function-calling uchun — FAQAT whitelist qilingan, NL orqali chaqiriladigan tool'lar sxemasi. */
export function getAllToolSchemas(): LlmToolSchema[] {
  return Array.from(NL_VISIBLE_TOOLS).map((name) => {
    const t = TOOL_REGISTRY[name];
    return { name, description: t.description, parameters: t.parameters };
  });
}
