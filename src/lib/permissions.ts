import type { GameSession, StaffMember } from "./types";

/**
 * epoch → "2026-08-15", doim klub vaqt mintaqasida (Asia/Tashkent).
 * Bu muhim: server (Vercel) odatda UTC'da ishlaydi, brauzer esa foydalanuvchi
 * mintaqasida — ikkalasi ham shu funksiya orqali BIR XIL kunni hisoblashi
 * kerak, aks holda kechqurun business_date chetga chiqib ketishi mumkin.
 */
const CLUB_TZ = "Asia/Tashkent";
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateKey(ts: number): string {
  // en-CA locale "YYYY-MM-DD" formatida beradi
  return fmt.format(new Date(ts));
}

export function todayKey(now: number = Date.now()): string {
  return dateKey(now);
}

export function sessionBusinessDate(s: Pick<GameSession, "businessDate" | "startedAt">): string {
  return s.businessDate ?? dateKey(s.startedAt);
}

/**
 * ADMIN/STAFF faqat bugungi (joriy biznes kuni) sessiyalarni tahrirlay oladi.
 * SUPER_ADMIN — istalgan sanadagi sessiyani.
 */
export function canEditSession(
  session: Pick<GameSession, "businessDate" | "startedAt">,
  staff: Pick<StaffMember, "role">,
  now: number = Date.now()
): boolean {
  if (staff.role === "super_admin") return true;
  return sessionBusinessDate(session) === todayKey(now);
}

export function isSuperAdmin(staff: Pick<StaffMember, "role">): boolean {
  return staff.role === "super_admin";
}
