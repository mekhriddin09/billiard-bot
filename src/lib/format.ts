export function fmtMoney(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmtSom(n: number): string {
  return `${fmtMoney(n)} so'm`;
}

/** ms → "01:24:35" */
export function fmtTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x: number) => x.toString().padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** minutes → "2s 15d" */
export function fmtDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} daqiqa`;
  if (m === 0) return `${h} soat`;
  return `${h}s ${m}d`;
}

// Har doim klub vaqt mintaqasida (Asia/Tashkent) ko'rsatiladi — server
// (Vercel, odatda UTC) va turli brauzer mintaqalarida bir xil natija
// bo'lishi uchun. src/lib/permissions.ts'dagi dateKey bilan izchil.
const CLUB_TZ = "Asia/Tashkent";
const hmFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** epoch → "18:30" (klub vaqti) */
export function fmtHM(t: number): string {
  return hmFmt.format(new Date(t));
}

/** epoch → "14.08.2026" (klub vaqti) */
export function fmtDate(t: number): string {
  return dateFmt.format(new Date(t)).replace(/\//g, ".");
}

/** 1250000 → "1.25M", 480000 → "480K" — chart o'qlari uchun ixcham format */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/** Foizli o'zgarish: null — solishtirish uchun ma'lumot yo'q */
export function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export function fmtPhone(phone?: string): string {
  if (!phone) return "";
  // +998901234567 → +998 90 123 45 67
  const m = phone.replace(/\s/g, "").match(/^(\+998)(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
}

/** +998901234567 → +998 90 *** ** 12 — Telegram log kanalida to'liq raqam ko'rsatilmaydi. */
export function maskPhone(phone?: string): string {
  if (!phone) return "";
  const m = phone.replace(/\s/g, "").match(/^(\+998)(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `${m[1]} ${m[2]} *** ** ${m[5]}`;
}
