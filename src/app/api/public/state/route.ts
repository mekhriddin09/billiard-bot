import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { mapCustomer, mapSettings, mapSession, mapTable } from "@/lib/db-map";

/** Ommaviy stol holati uchun — mijoz shaxsi/telefon/buyurtma HECH QACHON qo'shilmaydi. */
function mapPublicSession(r: any) {
  return {
    id: r.id as string,
    tableId: r.table_id as string,
    startedAt: new Date(r.started_at).getTime(),
    adjustMinutes: r.adjust_minutes as number,
    status: "active" as const,
  };
}

/** Ommaviy bron holati uchun — mijoz shaxsi/telefon qo'shilmaydi. */
function mapPublicReservation(r: any) {
  return {
    id: r.id as string,
    tableId: r.table_id as string,
    holdUntil: new Date(r.hold_until).getTime(),
    status: "held" as const,
  };
}

/**
 * Mijoz (customer-facing) Mini App uchun boshlang'ich ma'lumot.
 *
 * Xavfsizlik: bu endpoint AUTENTIFIKATSIYASIZ ham ishlaydi (initData
 * bo'lmasa) — chunki stol holati (bo'sh/band) OMMAVIY ma'lumot, QR
 * sahifasi ham shu orqali ishlaydi. Lekin shaxsiy ma'lumot ("me" va
 * "myHistory") faqat initData muvaffaqiyatli tekshirilgandagina qaytadi.
 *
 * initData muvaffaqiyatli bo'lsa: tg_id bo'yicha `customers`dan qidiriladi,
 * topilmasa avtomatik yaratiladi (ism Telegramdan, telefon hali yo'q).
 * Bu — "real Telegram-ID asosida mijoz identifikatsiyasi", eski
 * hardcoded CURRENT_USER_ID/CURRENT_USER_PHONE'ning o'rnini bosadi.
 */
export async function POST(req: NextRequest) {
  const { initData } = await req.json().catch(() => ({ initData: null }));
  const supabase = supabaseServer();

  let me: ReturnType<typeof mapCustomer> | null = null;
  let myHistory: ReturnType<typeof mapSession>[] = [];
  let myWatchedTableIds: string[] = [];

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (initData && typeof initData === "string" && botToken) {
    const verified = verifyTelegramInitData(initData, botToken);
    if (verified) {
      const tgId = String(verified.user.id);
      const tgUsername = verified.user.username ?? "";
      const displayName =
        [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || "Mijoz";

      let { data: customerRow } = await supabase
        .from("customers")
        .select("*")
        .eq("tg_id", tgId)
        .maybeSingle();

      if (!customerRow) {
        const { data: created } = await supabase
          .from("customers")
          .insert({ name: displayName, tg_id: tgId, tg_username: tgUsername })
          .select("*")
          .maybeSingle();
        customerRow = created ?? null;
      } else if (customerRow.tg_username !== tgUsername && tgUsername) {
        // Telegram usernamesi o'zgargan bo'lishi mumkin — yangilab boramiz.
        await supabase.from("customers").update({ tg_username: tgUsername }).eq("id", customerRow.id);
        customerRow = { ...customerRow, tg_username: tgUsername };
      }

      if (customerRow) {
        me = mapCustomer(customerRow);
        const [{ data: historyRows }, { data: watchRows }] = await Promise.all([
          supabase
            .from("game_sessions")
            .select("*")
            .eq("customer_id", customerRow.id)
            .eq("status", "closed")
            .order("ended_at", { ascending: false })
            .limit(20),
          // Faol ("Bo'shaganda xabar ber") kuzatuvlar — client shu
          // ro'yxatdan foydalanib tugma holatini (✓ kuzatilmoqda) sahifa
          // qayta yuklanganda ham to'g'ri ko'rsatadi (2026-08).
          supabase.from("table_watchers").select("table_id").eq("customer_id", customerRow.id).is("notified_at", null),
        ]);
        myHistory = (historyRows ?? []).map((r) => mapSession(r));
        myWatchedTableIds = (watchRows ?? []).map((r) => r.table_id as string);
      }
    }
  }

  const [{ data: tableRows }, { data: sessionRows }, { data: reservationRows }, { data: settingsRow }] =
    await Promise.all([
      supabase.from("club_tables").select("*"),
      // Faqat AKTIV sessiyalar, va faqat stol holati uchun kerakli minimal
      // maydonlar — mijoz sessiyasi, buyurtmalari boshqalarga ko'rinmaydi.
      supabase.from("game_sessions").select("id, table_id, started_at, adjust_minutes, status").eq("status", "active"),
      supabase.from("reservations").select("id, table_id, hold_until, status").eq("status", "held"),
      supabase.from("club_settings").select("*").eq("id", 1).single(),
    ]);

  return NextResponse.json({
    tables: (tableRows ?? []).map(mapTable),
    sessions: (sessionRows ?? []).map(mapPublicSession),
    reservations: (reservationRows ?? []).map(mapPublicReservation),
    settings: settingsRow ? mapSettings(settingsRow) : null,
    me,
    myHistory,
    myWatchedTableIds,
  });
}
