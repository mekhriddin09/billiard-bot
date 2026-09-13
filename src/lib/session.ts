import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "shorchi_staff_session";
const SESSION_DAYS = 30;

/**
 * Cookie'da FAQAT identifikator saqlanadi — rol emas. Rol har safar
 * `requireStaff()` orqali Supabase'dan yangidan o'qiladi (src/lib/api-auth.ts),
 * shuning uchun xodim rolini olib tashlasang/o'chirsang, kuchi darhol
 * (eski cookie amal qilib turgan bo'lsa ham) yo'qoladi — 30 kunlik token
 * ichida "qotib qolgan" imtiyoz bo'lmaydi.
 */
export interface StaffSessionPayload {
  staffId: string;
}

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET .env.local'da yo'q.");
  return new TextEncoder().encode(s);
}

export async function createStaffSession(payload: StaffSessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function readStaffSession(): Promise<StaffSessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof (payload as { staffId?: unknown }).staffId !== "string") return null;
    return payload as unknown as StaffSessionPayload;
  } catch {
    return null;
  }
}

export function clearStaffSession() {
  cookies().delete(COOKIE_NAME);
}
