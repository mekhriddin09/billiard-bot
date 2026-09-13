import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { createReservationRequestCore } from "@/lib/services/reservation-requests";
import { ServiceError } from "@/lib/services/errors";

/**
 * Mijoz Mini App'dan stol uchun "Bog'lanish so'rovi" — 2026-08, foydalanuvchi
 * so'rovi bo'yicha avtomatik depozit/hold bron TO'LIQ ALMASHTIRILDI: bu
 * yerda endi HECH QANDAY hold yaratilmaydi, faqat mijozning telefon
 * raqami (+ixtiyoriy izoh) yozib qo'yiladi — admin o'zi qo'ng'iroq qiladi.
 *
 * Xodim auth'idan farqli — bu yerda xodim emas, Telegram orqali
 * identifikatsiya qilingan MIJOZ so'rov yuboradi.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Bot sozlanmagan" }, { status: 500 });

  const { initData, tableId, phone, note } = await req.json().catch(() => ({}));
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "Telegram orqali kirish kerak" }, { status: 401 });
  }
  if (!tableId) return NextResponse.json({ error: "tableId kerak" }, { status: 400 });
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "Telefon raqami kerak" }, { status: 400 });
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) return NextResponse.json({ error: "Tasdiqlanmadi" }, { status: 401 });

  const tgId = String(verified.user.id);
  const supabase = supabaseServer();
  const displayName = [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || "Mijoz";

  let { data: customer } = await supabase.from("customers").select("id, name").eq("tg_id", tgId).maybeSingle();
  if (!customer) {
    const { data: created } = await supabase
      .from("customers")
      .insert({ name: displayName, tg_id: tgId, tg_username: verified.user.username ?? "" })
      .select("id, name")
      .maybeSingle();
    customer = created ?? null;
  }
  if (!customer) return NextResponse.json({ error: "Mijoz aniqlanmadi" }, { status: 500 });

  try {
    const { request } = await createReservationRequestCore(supabase, {
      tableId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: phone,
      note: typeof note === "string" ? note : undefined,
    });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Xatolik" }, { status: 500 });
  }
}
