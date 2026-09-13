import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapSettings } from "@/lib/db-map";
import { CLUB_FIELD_LIMITS, type ClubSettings } from "@/lib/types";

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(["super_admin"]);
  if (auth instanceof NextResponse) return auth;

  const patch = (await req.json().catch(() => ({}))) as Partial<ClubSettings>;

  // Klub matn maydonlari — xavfsiz max-length tekshiruvi (2026-08, "Club
  // haqida" uzun matn muammosi bo'yicha). DB'da haqiqiy uzunlik cheklovi
  // yo'q (barchasi `text`), bu — foydalanuvchiga ANIQ tushuntiriladigan,
  // ilova darajasidagi xavfsiz limit (CLUB_FIELD_LIMITS — client bilan
  // bitta manba, types.ts).
  for (const key of Object.keys(CLUB_FIELD_LIMITS) as (keyof typeof CLUB_FIELD_LIMITS)[]) {
    const value = patch[key];
    if (typeof value === "string" && value.length > CLUB_FIELD_LIMITS[key]) {
      return NextResponse.json(
        { error: `"${key}" maydoni juda uzun — maksimal ${CLUB_FIELD_LIMITS[key]} belgi (kiritilgan: ${value.length}).` },
        { status: 400 }
      );
    }
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.clubName !== undefined) dbPatch.club_name = patch.clubName;
  if (patch.address !== undefined) dbPatch.address = patch.address;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.workHours !== undefined) dbPatch.work_hours = patch.workHours;
  if (patch.telegram !== undefined) dbPatch.telegram = patch.telegram;
  if (patch.instagram !== undefined) dbPatch.instagram = patch.instagram;
  if (patch.info !== undefined) dbPatch.info = patch.info;
  if (patch.cardPaymentEnabled !== undefined) dbPatch.card_payment_enabled = patch.cardPaymentEnabled;
  if (patch.loyalty !== undefined) dbPatch.loyalty = patch.loyalty;
  if (patch.reservation !== undefined) dbPatch.reservation = patch.reservation;
  if (patch.telegramLog?.channelId !== undefined) dbPatch.telegram_log_channel_id = patch.telegramLog.channelId;
  if (patch.telegramLog?.enabled !== undefined) dbPatch.telegram_log_enabled = patch.telegramLog.enabled;
  if (patch.debtReminderPolicy !== undefined) dbPatch.debt_reminder_policy = patch.debtReminderPolicy;
  if (patch.dailyReport?.enabled !== undefined) dbPatch.daily_report_enabled = patch.dailyReport.enabled;
  if (patch.dailyReport?.time !== undefined) dbPatch.daily_report_time = patch.dailyReport.time;
  dbPatch.updated_at = new Date().toISOString();

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("club_settings").update(dbPatch).eq("id", 1).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  return NextResponse.json({ settings: mapSettings(data) });
}
