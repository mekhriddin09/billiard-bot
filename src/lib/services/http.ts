import "server-only";
import { NextResponse } from "next/server";
import { ServiceError } from "./errors";

/**
 * HTTP route'lardagi takrorlanuvchi try/catch qatlamini siqadi: service
 * funksiyasini chaqiradi, natijani to'g'ridan-to'g'ri JSON qilib qaytaradi,
 * `ServiceError`ni mos http status/xabar bilan NextResponse'ga o'giradi.
 * Har bir service funksiyasi eski route qaytargan aniq shu shaklda
 * ob'ekt qaytaradi (masalan `{ session }`, `{ orders }`) — shuning uchun
 * javob formati o'zgarmaydi.
 */
export async function runService<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Xatolik" }, { status: 500 });
  }
}
