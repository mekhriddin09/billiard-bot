import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
}

/**
 * Telegram Mini App `initData`ni tekshiradi (rasmiy algoritm):
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * `hash` maydonidan tashqari barcha juftliklar alifbo tartibida
 * "key=value" qilib qatorga birlashtiriladi, so'ng bot tokenidan
 * olingan maxfiy kalit bilan HMAC-SHA256 hisoblanadi va solishtiriladi.
 *
 * Muvaffaqiyatsiz bo'lsa (soxta/eskirgan/token noto'g'ri) — null qaytaradi.
 * `maxAgeSeconds` — auth_date qancha eski bo'lishi mumkinligi (soxtalashtirilgan
 * eski so'rovlarni qayta ishlatishning oldini olish uchun).
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): VerifiedInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs: string[] = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Doimiy vaqtli solishtirish — oddiy `!==` timing hujumga ochiq bo'lardi
  // (hash noto'g'ri bo'lsa ham, mos kelgan boshlang'ich baytlar sonini
  // javob vaqtidan taxmin qilish nazariy jihatdan mumkin).
  const computedBuf = Buffer.from(computedHash, "hex");
  const receivedBuf = Buffer.from(hash, "hex");
  if (
    computedBuf.length !== receivedBuf.length ||
    receivedBuf.length === 0 ||
    !timingSafeEqual(computedBuf, receivedBuf)
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (!user?.id) return null;

  return { user, authDate };
}
