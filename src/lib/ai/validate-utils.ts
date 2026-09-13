import "server-only";
import { ServiceError } from "../services/errors";

/**
 * LLM tool-chaqiruv argumentlarini QAT'IY tekshirish uchun kichik, sof
 * yordamchi funksiyalar. Hech qanday tashqi kutubxona (zod va h.k.) shart
 * emas — loyihaning qolgan qismi ham xuddi shu uslubda (qo'lda tekshirish,
 * `ServiceError` bilan) yozilgan.
 *
 * MUHIM: bu funksiyalar LLM natijasiga HECH QACHON "ishonmaydi" — noto'g'ri
 * turdagi/formatdagi/oraliqdan tashqari qiymat kelsa, DOIM `ServiceError`
 * (400) otadi. Chaqiruvchi (`src/lib/ai/dispatch.ts`) buni ushlab,
 * foydalanuvchiga tushunarli xabar qaytaradi — hech qachon xom argument
 * to'g'ridan-to'g'ri DB so'roviga uzatilmaydi.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throw new ServiceError("Argumentlar formati noto'g'ri", 400);
}

export function requireString(args: Record<string, unknown>, key: string, opts?: { maxLen?: number }): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new ServiceError(`"${key}" kerak`, 400);
  const trimmed = v.trim();
  if (opts?.maxLen && trimmed.length > opts.maxLen) {
    throw new ServiceError(`"${key}" juda uzun (maks ${opts.maxLen} belgi)`, 400);
  }
  return trimmed;
}

export function optionalString(args: Record<string, unknown>, key: string, opts?: { maxLen?: number }): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ServiceError(`"${key}" matn bo'lishi kerak`, 400);
  const trimmed = v.trim();
  if (opts?.maxLen && trimmed.length > opts.maxLen) {
    throw new ServiceError(`"${key}" juda uzun (maks ${opts.maxLen} belgi)`, 400);
  }
  return trimmed || undefined;
}

export function requireNumber(args: Record<string, unknown>, key: string, opts?: { min?: number; max?: number; integer?: boolean }): number {
  const v = args[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new ServiceError(`"${key}" son bo'lishi kerak`, 400);
  if (opts?.integer && !Number.isInteger(n)) throw new ServiceError(`"${key}" butun son bo'lishi kerak`, 400);
  if (opts?.min !== undefined && n < opts.min) throw new ServiceError(`"${key}" kamida ${opts.min} bo'lishi kerak`, 400);
  if (opts?.max !== undefined && n > opts.max) throw new ServiceError(`"${key}" ko'pi bilan ${opts.max} bo'lishi kerak`, 400);
  return n;
}

export function optionalNumber(args: Record<string, unknown>, key: string, opts?: { min?: number; max?: number; integer?: boolean }): number | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  return requireNumber(args, key, opts);
}

export function requireDateStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !DATE_RE.test(v)) {
    throw new ServiceError(`"${key}" YYYY-MM-DD formatida bo'lishi kerak (masalan 2026-08-22)`, 400);
  }
  return v;
}

export function optionalDateStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  return requireDateStr(args, key);
}

export function optionalTimeStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !TIME_RE.test(v)) {
    throw new ServiceError(`"${key}" HH:MM formatida bo'lishi kerak (masalan 13:00)`, 400);
  }
  return v;
}

/** `from` <= `to` va oraliq juda katta bo'lmasligini tekshiradi (DB'ga
 *  cheksiz katta so'rov ketmasligi uchun — masalan LLM xato qilib 100 yillik
 *  oraliq yubormasin). */
export function validateDateRange(from: string, to: string, maxDays = 366): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00Z`).getTime();
  const t = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(f) || !Number.isFinite(t)) throw new ServiceError("Sana oralig'i noto'g'ri", 400);
  if (f > t) throw new ServiceError('"from" "to"dan kech bo\'lishi mumkin emas', 400);
  const days = Math.round((t - f) / 86400000);
  if (days > maxDays) throw new ServiceError(`Sana oralig'i juda katta (maks ${maxDays} kun)`, 400);
  return { from, to };
}

export function requireEnum<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const v = args[key];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new ServiceError(`"${key}" quyidagilardan biri bo'lishi kerak: ${allowed.join(", ")}`, 400);
  }
  return v as T;
}

export function optionalEnum<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  return requireEnum(args, key, allowed);
}
