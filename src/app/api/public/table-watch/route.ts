import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { watchTableCore, unwatchTableCore } from "@/lib/services/table-watch";
import { ServiceError } from "@/lib/services/errors";

/**
 * Mijoz Mini App'dan "🔔 Bo'shaganda xabar ber" tugmasi — /api/public/
 * reservations/route.ts bilan bir xil naqsh: xodim emas, Telegram
 * initData orqali identifikatsiya qilingan MIJOZ so'rov yuboradi.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Bot sozlanmagan" }, { status: 500 });

  const { initData, tableId, action } = await req.json().catch(() => ({}));
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "Telegram orqali kirish kerak" }, { status: 401 });
  }
  if (!tableId) return NextResponse.json({ error: "tableId kerak" }, { status: 400 });
  const mode = action === "unwatch" ? "unwatch" : "watch";

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) return NextResponse.json({ error: "Tasdiqlanmadi" }, { status: 401 });

  const tgId = String(verified.user.id);
  const supabase = supabaseServer();

  let { data: customer } = await supabase.from("customers").select("id").eq("tg_id", tgId).maybeSingle();
  if (!customer) {
    const displayName =
      [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || "Mijoz";
    const { data: created } = await supabase
      .from("customers")
      .insert({ name: displayName, tg_id: tgId, tg_username: verified.user.username ?? "" })
      .select("id")
      .maybeSingle();
    customer = created ?? null;
  }
  if (!customer) return NextResponse.json({ error: "Mijoz aniqlanmadi" }, { status: 500 });

  try {
    if (mode === "watch") {
      await watchTableCore(supabase, { tableId, customerId: customer.id, tgId });
    } else {
      await unwatchTableCore(supabase, { tableId, customerId: customer.id });
    }
    return NextResponse.json({ ok: true, watching: mode === "watch" });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Xatolik" }, { status: 500 });
  }
}
