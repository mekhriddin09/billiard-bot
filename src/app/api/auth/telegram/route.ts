import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { createStaffSession } from "@/lib/session";

/**
 * Xodim (admin/operator/kassir/super_admin) Telegram orqali kirishi.
 * Front-end Telegram.WebApp.initData'ni shu yerga yuboradi.
 *
 * Oqim:
 *  1. initData HMAC imzosi bot tokeni bilan tekshiriladi (soxtalashtirib
 *     bo'lmaydi — Telegram tomonidan imzolangan).
 *  2. tg_id bo'yicha `staff` jadvalidan qidiriladi.
 *  3. Topilmasa yoki active=false bo'lsa — 403 (bu odam xodim emas).
 *  4. Topilsa — rol shu yerda, serverda, DB'dan olinadi (klient hech qachon
 *     o'z rolini o'zi belgilay olmaydi) va imzolangan sessiya cookie qo'yiladi.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot sozlanmagan" }, { status: 500 });
  }

  const { initData } = await req.json().catch(() => ({ initData: null }));
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "initData yo'q" }, { status: 400 });
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) {
    return NextResponse.json({ error: "Tasdiqlanmadi" }, { status: 401 });
  }

  const tgId = String(verified.user.id);
  const supabase = supabaseServer();
  const { data: staff, error } = await supabase
    .from("staff")
    .select("id, name, role, active")
    .eq("tg_id", tgId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
  if (!staff || !staff.active) {
    return NextResponse.json({ error: "Siz xodim sifatida ro'yxatdan o'tmagansiz" }, { status: 403 });
  }

  await createStaffSession({ staffId: staff.id });

  return NextResponse.json({ ok: true, staff: { id: staff.id, name: staff.name, role: staff.role } });
}
