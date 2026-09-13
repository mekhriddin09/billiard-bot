import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedStaff } from "../api-auth";
import { logAudit } from "../api-audit";
import { mapDebt, mapOrder, mapSession } from "../db-map";
import { dateKey } from "../permissions";
import { computeBill } from "../calc";
import { applyInventorySaleDelta, snapshotUnitCostAtSale } from "../inventory-ops";
import { logSessionStarted, logSessionClosed, logDebtCreated, bestEffort } from "../telegram-log";
import { notifyTableWatchers } from "./table-watch";
import { fmtMoney } from "../format";
import { ServiceError } from "./errors";
import type { Debt, GameSession, OrderItem, PaymentMethod, PaymentStatus } from "../types";

/**
 * Sessiya hayot-sikli — asosiy mantiq. HAR IKKALASI ham (Admin WebApp HTTP
 * route'lari VA kelajakdagi AI agent tool'lari) shu funksiyalarni
 * chaqiradi — biznes-mantiq faqat BIR joyda yashaydi (Rule: "AI mavjud
 * biznes logikani qayta yozmasin").
 *
 * `auth` parametri HAR DOIM chaqiruvchi tomonidan, ISHONCHLI manbadan
 * (HTTP — cookie session; AI — Telegram `from.id`dan hal qilingan xodim)
 * uzatiladi — hech qachon `args` ichidan olinmaydi.
 */

// ─── 1) Sessiya ochish ──────────────────────────────────────────────────
export interface StartSessionArgs {
  tableId: string;
  phone?: string;
}

export async function startSessionCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: StartSessionArgs
): Promise<{ session: GameSession }> {
  if (!args.tableId) throw new ServiceError("tableId kerak", 400);

  // Stol va mijoz (agar telefon berilgan bo'lsa) — ikkalasi ham bir-biriga
  // bog'liq bo'lmagan mustaqil o'qishlar, parallel bajariladi (2026-08
  // performance audit — "Stolni ochish" tezligi).
  const normalizedPhone = args.phone ? args.phone.replace(/\s/g, "") : undefined;
  const [{ data: table }, customerResult] = await Promise.all([
    supabase.from("club_tables").select("*").eq("id", args.tableId).maybeSingle(),
    normalizedPhone
      ? supabase.from("customers").select("id, phone, name").eq("phone", normalizedPhone).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!table) throw new ServiceError("Stol topilmadi", 404);
  const customer = customerResult.data as { id: string; phone: string; name: string } | null;

  const now = Date.now();
  const { data: inserted, error } = await supabase
    .from("game_sessions")
    .insert({
      table_id: args.tableId,
      started_at: new Date(now).toISOString(),
      business_date: dateKey(now),
      customer_id: customer?.id ?? null,
      customer_phone: customer?.phone ?? args.phone ?? null,
      adjust_minutes: 0,
      status: "active",
      paid: false,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    // 23505 = unique_violation — DB darajasidagi "one_active_session_per_table"
    // indeksi ushladi: boshqa so'rov bizdan bir zum oldin shu stolni ochib ulgurgan.
    if (error?.code === "23505") throw new ServiceError("Bu stolda allaqachon aktiv sessiya bor", 409);
    throw new ServiceError(error?.message ?? "Xatolik", 500);
  }

  // Audit (DB, tez) — javobdan OLDIN kutiladi. Telegram log xabari (tarmoq
  // so'rovi, eng sekin/o'zgaruvchan qism) — fonda, javobni KUTTIRMAYDI
  // (2026-08 performance audit — "Stolni ochish" tugmasi tezligi).
  await logAudit(supabase, auth, `${table.name} stolda o'yin boshladi`);
  bestEffort(
    logSessionStarted(supabase, {
      sessionId: inserted.id,
      tableName: table.name,
      customerName: customer?.name,
      customerPhone: customer?.phone ?? args.phone ?? undefined,
      startedAt: now,
      staffName: auth.name,
      pricePerHour: table.price_per_hour,
    }),
    "logSessionStarted"
  );

  return { session: mapSession(inserted, [], []) };
}

// ─── 2) Sessiyaga mahsulot qo'shish/ayirish ─────────────────────────────
export interface AddOrderArgs {
  sessionId: string;
  productId: string;
  delta: number;
}

export async function addOrderCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: AddOrderArgs
): Promise<{ orders: OrderItem[] }> {
  if (!args.productId || typeof args.delta !== "number") {
    throw new ServiceError("productId/delta kerak", 400);
  }

  // Ikki mustaqil o'qish (sessiya/mahsulot) — bir-biriga bog'liq emas,
  // parallel bajariladi (2026-08 performance audit — "Mahsulot qo'shish"
  // eng tez-tez ishlatiladigan amal). "Mavjud qator" ATAYLAB bu yerda
  // OLDINDAN o'qilmaydi — pastdagi CAS tsiklining HAR bir urinishi buni
  // o'zi, YANGI holda o'qiydi (qarang: pastdagi izoh — "attempt 0"da ham
  // eski/oldindan olingan qiymatga tayanish xatoga olib kelgan edi).
  const [{ data: session }, { data: product }] = await Promise.all([
    supabase.from("game_sessions").select("id, table_id, status, telegram_log_message_id").eq("id", args.sessionId).maybeSingle(),
    supabase.from("products").select("*").eq("id", args.productId).maybeSingle(),
  ]);
  if (!session) throw new ServiceError("Sessiya topilmadi", 404);
  if (session.status !== "active") throw new ServiceError("Sessiya yopiq — /correct-orders ishlating", 409);
  if (!product) throw new ServiceError("Mahsulot topilmadi", 404);

  // Qator yozish — RACE-SAFE (2026-08, foydalanuvchi xabari: "Cola +ni 3
  // marta tez ketma-ket bossam keyin o'zidan 1/2/3 yoki 0 bo'lib
  // qolyapti"). Sabab: oddiy "o'qi → hisobla → yoz" ketma-ketligi bir
  // nechta PARALLEL so'rov kelganda "lost update" beradi (ikkalasi ham
  // eski qiymatni o'qib, bitta yangi qiymatni yozadi) yoki bitta mahsulot
  // uchun ikkita alohida qator yaratadi. Tuzatish: compare-and-swap (CAS)
  // — yozish faqat O'ZI O'QIGAN eski qiymat hali ham amal qilsa
  // muvaffaqiyatli bo'ladi (0010_session_orders_race_guard.sql'dagi
  // UNIQUE indeks bilan birga); aks holda qayta o'qib qayta urinadi.
  // game_sessions'dagi "bitta faol sessiya" himoyasi bilan bir xil uslub.
  //
  // MUHIM: har bir urinish (attempt 0 ham) qatorni YANGI o'qiydi — oldin
  // "birinchi urinish uchun oldindan (parallel) o'qilgan qiymatni qayta
  // ishlatamiz" degan mikro-optimallashtirish bor edi, lekin bu ANIQ
  // XATOGA olib kelar edi: agar shu oraliqda (parallel so'rov boshlangach,
  // lekin tsikl ishga tushgunicha) BOSHQA so'rov qator yaratib ulgurgan
  // bo'lsa-yu, bu so'rov manfiy delta (masalan "−1") bilan kelib, eski
  // ("qator yo'q") qiymatga ishonib "qilinadigan ish yo'q" deb bekor
  // qilib qo'yar edi — o'zining hissasini butunlay yo'qotib. Offline test
  // (addorder-race-test.ts) buni aniq ushladi.
  let done = false;
  for (let attempt = 0; attempt < 8 && !done; attempt++) {
    const { data: current } = await supabase
      .from("session_orders")
      .select("id, qty")
      .eq("session_id", args.sessionId)
      .eq("product_id", args.productId)
      .maybeSingle();

    if (current) {
      const newQty = current.qty + args.delta;
      if (newQty <= 0) {
        const { data: deleted } = await supabase
          .from("session_orders")
          .delete()
          .eq("id", current.id)
          .eq("qty", current.qty)
          .select("id")
          .maybeSingle();
        done = !!deleted;
      } else {
        const { data: updated } = await supabase
          .from("session_orders")
          .update({ qty: newQty })
          .eq("id", current.id)
          .eq("qty", current.qty)
          .select("id")
          .maybeSingle();
        done = !!updated;
      }
    } else if (args.delta > 0) {
      // COGS uchun: sotuv PAYTIDAGI tannarx suratga olinadi (keyin mahsulot
      // tannarxi o'zgarsa ham bu yozuv o'zgarmaydi). Mahsulotning
      // unit_cost'i 0/bo'sh bo'lsa undefined qoladi (trackInventory'dan
      // MUSTAQIL — 2026-08, qarang: inventory-ops.ts).
      const unitCostAtSale = await snapshotUnitCostAtSale(supabase, args.productId);
      const { error: insertError } = await supabase.from("session_orders").insert({
        session_id: args.sessionId,
        product_id: args.productId,
        name: product.name,
        emoji: product.emoji,
        price: product.price,
        qty: args.delta,
        unit_cost_at_sale: unitCostAtSale ?? null,
      });
      if (!insertError) {
        done = true;
      } else if (insertError.code !== "23505") {
        throw new ServiceError(insertError.message, 500);
      }
      // 23505 = boshqa so'rov bizdan bir zum oldin xuddi shu mahsulot
      // uchun qator yaratib ulgurdi (UNIQUE indeks ushladi) — KUTILGAN
      // race holati, keyingi urinishda uni "current" sifatida topib
      // "update" sifatida davom etamiz.
    } else {
      // delta<=0 va qator umuman yo'q — olib tashlanadigan narsa yo'q.
      done = true;
    }
  }
  if (!done) {
    throw new ServiceError("Mahsulot qo'shishda ziddiyat — qayta urinib ko'ring", 409);
  }

  // Ombor yangilash (best-effort) va yakuniy buyurtmalar ro'yxati — javob
  // uchun ZARUR, parallel bajariladi (2026-08 performance audit — "+/-"
  // tugmalari tezligi).
  const [, { data: orders }] = await Promise.all([
    // Ombor: delta>0 — sotildi (ombordan ayiriladi), delta<0 — olib
    // tashlandi (ombordga qaytariladi). Bitta formula, best-effort.
    applyInventorySaleDelta(supabase, args.productId, args.delta),
    supabase.from("session_orders").select("*").eq("session_id", args.sessionId),
  ]);

  // Audit (DB, faqat ichki audit tarixi uchun — Rule 7) — FAQAT
  // qo'shilganda (delta>0). Bu butunlay FONDA ishlaydi — client javobini
  // KUTTIRMAYDI.
  //
  // 2026-08 (foydalanuvchi so'rovi): Telegram log kanaliga HAR BIR +/-
  // bosilganda alohida xabar ENDI YUBORILMAYDI — bir nechta tez ketma-ket
  // bosish (masalan "+3" uchun 3 marta bosish, keyin "-1" bilan tuzatish)
  // avval 3-4 ta chalkash/keraksiz Telegram xabari yuborar edi. Buning
  // o'rniga (a) stol OCHILGANDA va (b) stol YOPILGANDA (unda QO'SHILGAN
  // BARCHA mahsulotlar ro'yxati bilan — pastga, `logSessionClosed`ga
  // qarang, u buni allaqachon ko'rsatadi) — shu ikkitasi YETARLI, aniq va
  // chalkash emas.
  if (args.delta > 0) {
    bestEffort(
      (async () => {
        const { data: table } = await supabase.from("club_tables").select("name").eq("id", session.table_id).maybeSingle();
        if (!table) return;
        await logAudit(supabase, auth, `${table.name} stolga ${product.name} qo'shdi`);
      })(),
      "addOrder audit"
    );
  }

  return { orders: (orders ?? []).map(mapOrder) };
}

// ─── 2b) Tezkor/maxsus mahsulot qo'shish (Products katalogidan MUSTAQIL) ─
/**
 * 2026-08, foydalanuvchi so'rovi — "STOLGA TEZKOR MAXSUS MAHSULOT
 * QO'SHISH": ba'zida mijoz katalogda YO'Q narsani oladi (masalan hali
 * kiritilmagan Red Bull, bir martalik maxsus taom). Admin bunday holatda
 * avval Products bo'limiga kirib mahsulot yaratishga MAJBUR bo'lmasligi
 * kerak.
 *
 * MUHIM ARXITEKTURA QOIDASI: bu CUSTOM ORDER ITEM, Product EMAS —
 * shuning uchun: (a) `products` jadvaliga HECH QANDAY yozuv qo'shilmaydi,
 * (b) kategoriya yaratilmaydi, (c) ombor/inventoryga (stockQty/
 * unitCost/COGS) HECH QANDAY ta'sir qilinmaydi — `unit_cost_at_sale`
 * har doim NULL qoladi (finance.ts'dagi COGS so'rovi buni avtomatik
 * chetlab o'tadi, `.not("unit_cost_at_sale", "is", null)`), (d) boshqa
 * stollarda/kategoriyalarda HECH QACHON ko'rinmaydi — faqat shu bitta
 * `session_orders` qatori sifatida, shu sessiyaga.
 *
 * Schema o'zgarishi SHART EMAS edi: `session_orders.product_id` allaqachon
 * NULLABLE (unique indeks ham faqat `where product_id is not null`),
 * `name`/`price` ustunlari har doim ham suratga olingan qiymat sifatida
 * ishlatiladi (correct-orders/route.ts'da xuddi shu naqsh — `product_id:
 * o.productId || null` — allaqachon mavjud edi custom/productsiz qatorlar
 * uchun). Shuning uchun bu funksiya ham xuddi shu, allaqachon sinovdan
 * o'tgan konvensiyani davom ettiradi — yangi jadval/ustun YO'Q.
 *
 * CAS/retry loop kerak EMAS (addOrderCore'dan farqli) — bu doim YANGI
 * qator INSERT qiladi (mavjud qatorni o'qib-yangilamaydi), shuning uchun
 * "lost update" xavfi yo'q; UNIQUE indeks ham product_id=NULL qatorlarga
 * qo'llanilmaydi, demak bir nechta custom qator xotirjam yonma-yon turadi.
 */
export interface AddCustomOrderArgs {
  sessionId: string;
  name: string;
  price: number;
  qty: number;
}

export async function addCustomOrderCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: AddCustomOrderArgs
): Promise<{ orders: OrderItem[] }> {
  const name = args.name?.trim();
  if (!name) throw new ServiceError("Mahsulot nomi kerak", 400);

  const price = Math.round(Number(args.price));
  if (!Number.isFinite(price) || price <= 0) {
    throw new ServiceError("Narx 0 dan katta bo'lishi kerak", 400);
  }

  const qty = Math.round(Number(args.qty));
  if (!Number.isFinite(qty) || qty < 1) {
    throw new ServiceError("Miqdor kamida 1 bo'lishi kerak", 400);
  }

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, table_id, status")
    .eq("id", args.sessionId)
    .maybeSingle();
  if (!session) throw new ServiceError("Sessiya topilmadi", 404);
  if (session.status !== "active") {
    throw new ServiceError("Sessiya yopiq — /correct-orders ishlating", 409);
  }

  const { error: insertError } = await supabase.from("session_orders").insert({
    session_id: args.sessionId,
    product_id: null,
    name,
    emoji: "⚡",
    price,
    qty,
    unit_cost_at_sale: null,
  });
  if (insertError) throw new ServiceError(insertError.message, 500);

  const { data: orders } = await supabase.from("session_orders").select("*").eq("session_id", args.sessionId);

  // Audit + Telegram log — bu ham FONDA (2026-08 performance audit bilan
  // bir xil uslub), javobni kuttirmaydi.
  bestEffort(
    (async () => {
      const { data: table } = await supabase.from("club_tables").select("name").eq("id", session.table_id).maybeSingle();
      if (!table) return;
      await logAudit(
        supabase,
        auth,
        `${table.name} stolga tezkor mahsulot qo'shdi: ${name} ×${qty} (${fmtMoney(price)} so'm)`
      );
    })(),
    "addCustomOrder audit"
  );

  return { orders: (orders ?? []).map(mapOrder) };
}

// ─── 3) Vaqtni tuzatish ─────────────────────────────────────────────────
export interface AdjustTimeArgs {
  sessionId: string;
  minutes: number;
}

export async function adjustTimeCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: AdjustTimeArgs
): Promise<{ adjustMinutes: number }> {
  if (typeof args.minutes !== "number") throw new ServiceError("minutes kerak", 400);

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, table_id, adjust_minutes, status")
    .eq("id", args.sessionId)
    .maybeSingle();
  if (!session) throw new ServiceError("Sessiya topilmadi", 404);

  const newAdjust = session.adjust_minutes + args.minutes;
  const { error } = await supabase.from("game_sessions").update({ adjust_minutes: newAdjust }).eq("id", args.sessionId);
  if (error) throw new ServiceError(error.message, 500);

  const { data: table } = await supabase.from("club_tables").select("name").eq("id", session.table_id).maybeSingle();
  if (table) {
    await logAudit(
      supabase,
      auth,
      `${table.name} stol vaqtiga korreksiya: ${args.minutes > 0 ? "+" : ""}${args.minutes} daqiqa`
    );
  }

  return { adjustMinutes: newAdjust };
}

// ─── 4) Sessiyani yopish ────────────────────────────────────────────────
export interface CloseSessionArgs {
  sessionId: string;
  method?: PaymentMethod;
  useReward?: boolean;
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  note?: string;
  debtDueDate?: string;
  cashAmount?: number;
  cardAmount?: number;
}

export async function closeSessionCore(
  supabase: SupabaseClient,
  auth: AuthedStaff,
  args: CloseSessionArgs
): Promise<{ session: GameSession; debt: Debt | null }> {
  const method: PaymentMethod = args.method === "card" ? "card" : args.method === "mixed" ? "mixed" : "cash";
  const useReward = !!args.useReward;
  const optCashAmount = Math.max(0, Number(args.cashAmount) || 0);
  const optCardAmount = Math.max(0, Number(args.cardAmount) || 0);

  const { data: sessionRow } = await supabase.from("game_sessions").select("*").eq("id", args.sessionId).maybeSingle();
  if (!sessionRow) throw new ServiceError("Sessiya topilmadi", 404);
  if (sessionRow.status !== "active") throw new ServiceError("Sessiya allaqachon yopilgan", 409);

  // To'rtta mustaqil o'qish — biri ham boshqasining natijasiga bog'liq
  // emas (mijoz ID sessionRow'dan allaqachon ma'lum), parallel bajariladi
  // (2026-08 performance audit — "Stolni yopish/To'lov" tezligi).
  const [{ data: table }, { data: settingsRow }, { data: orderRows }, customerResult] = await Promise.all([
    supabase.from("club_tables").select("*").eq("id", sessionRow.table_id).maybeSingle(),
    supabase.from("club_settings").select("*").eq("id", 1).single(),
    supabase.from("session_orders").select("*").eq("session_id", args.sessionId),
    sessionRow.customer_id
      ? supabase
          .from("customers")
          .select("id, name, phone, points, total_visits, total_minutes")
          .eq("id", sessionRow.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!table || !settingsRow) throw new ServiceError("Ma'lumot topilmadi", 500);

  const orders = (orderRows ?? []).map(mapOrder);
  const sessionForCalc = {
    id: sessionRow.id,
    tableId: sessionRow.table_id,
    startedAt: new Date(sessionRow.started_at).getTime(),
    endedAt: undefined,
    businessDate: sessionRow.business_date,
    customerId: sessionRow.customer_id ?? undefined,
    orders,
    adjustMinutes: sessionRow.adjust_minutes,
    status: "active" as const,
    paid: false,
  };
  const tableForCalc = {
    id: table.id,
    number: table.number,
    name: table.name,
    type: table.type,
    tier: table.tier,
    pricePerHour: table.price_per_hour,
    onlineReservable: table.online_reservable,
    enabled: table.enabled,
    archived: table.archived,
  };
  const settings = {
    clubName: settingsRow.club_name,
    address: settingsRow.address,
    phone: settingsRow.phone,
    workHours: settingsRow.work_hours,
    telegram: settingsRow.telegram,
    instagram: settingsRow.instagram,
    info: settingsRow.info,
    cardPaymentEnabled: settingsRow.card_payment_enabled,
    loyalty: settingsRow.loyalty,
    reservation: settingsRow.reservation,
  };

  const customer = customerResult.data as {
    id: string;
    name: string;
    phone: string | null;
    points: number;
    total_visits: number;
    total_minutes: number;
  } | null;

  const { data: arrivedReservation } = await supabase
    .from("reservations")
    .select("*")
    .eq("table_id", table.id)
    .eq("status", "arrived")
    .maybeSingle();

  const now = Date.now();
  const bill = computeBill(sessionForCalc, tableForCalc, settings, now, {
    useReward,
    customerPoints: customer?.points,
    depositCredit: arrivedReservation?.deposit ?? 0,
  });

  const paymentStatus: PaymentStatus = args.paymentStatus ?? "paid";
  const paidAmount =
    paymentStatus === "paid"
      ? bill.total
      : paymentStatus === "debt"
        ? 0
        : Math.min(bill.total, Math.max(0, args.paidAmount ?? bill.total));
  const debtAmount = Math.max(0, bill.total - paidAmount);
  const trimmedNote = args.note?.trim();

  const cashAmount = method === "mixed" ? Math.min(optCashAmount, paidAmount) : method === "cash" ? paidAmount : 0;
  const cardAmount =
    method === "mixed" ? Math.min(optCardAmount, Math.max(0, paidAmount - cashAmount)) : method === "card" ? paidAmount : 0;

  const { data: updated, error } = await supabase
    .from("game_sessions")
    .update({
      status: "closed",
      ended_at: new Date(now).toISOString(),
      paid: true,
      payment_method: method,
      cash_amount: method === "mixed" ? cashAmount : null,
      card_amount: method === "mixed" ? cardAmount : null,
      final_table_cost: bill.tableCost,
      final_total: bill.total,
      points_earned: bill.pointsToEarn,
      reward_minutes_used: bill.rewardMinutesUsed,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      debt_amount: debtAmount,
      note: trimmedNote ? trimmedNote : sessionRow.note,
      note_by: trimmedNote ? auth.name : sessionRow.note_by,
      note_at: trimmedNote ? new Date(now).toISOString() : sessionRow.note_at,
      closed_by: auth.id,
      closed_by_name: auth.name,
      closed_by_role: auth.role,
    })
    .eq("id", args.sessionId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error) throw new ServiceError(error.message, 500);
  if (!updated) {
    // .eq("status","active") hech qanday qatorga mos kelmadi — demak boshqa
    // so'rov bizdan oldinroq shu sessiyani allaqachon yopib ulgurgan.
    throw new ServiceError("Sessiya allaqachon yopilgan", 409);
  }

  // Mijoz ballari yangilanishi va bron yozuvini o'chirish — ikkalasi ham
  // mustaqil, bir-biriga bog'liq emas (parallel — 2026-08 performance audit).
  const spent = bill.rewardMinutesUsed > 0 ? settings.loyalty.pointsForReward : 0;
  await Promise.all([
    customer
      ? supabase
          .from("customers")
          .update({
            points: customer.points - spent + bill.pointsToEarn,
            total_visits: customer.total_visits + 1,
            total_minutes: customer.total_minutes + bill.minutes,
          })
          .eq("id", customer.id)
      : Promise.resolve(),
    arrivedReservation ? supabase.from("reservations").delete().eq("id", arrivedReservation.id) : Promise.resolve(),
  ]);

  const statusNote =
    paymentStatus === "paid"
      ? ""
      : paymentStatus === "partial"
        ? ` — qisman (qarz ${fmtMoney(debtAmount)})`
        : ` — qarzga (${fmtMoney(debtAmount)})`;
  const methodLabel = method === "cash" ? "naqd" : method === "card" ? "karta" : "aralash";

  // Audit (DB, tez) — javobdan OLDIN kutiladi. Telegram log xabari — fonda,
  // javobni KUTTIRMAYDI (2026-08 performance audit — "Stolni yopish/To'lov"
  // tugmasi darhol javob qaytarishi kerak).
  await logAudit(supabase, auth, `${table.name} stolni yopdi — ${fmtMoney(bill.total)} so'm (${methodLabel})${statusNote}`);
  bestEffort(
    logSessionClosed(supabase, {
      replyToMessageId: sessionRow.telegram_log_message_id ?? undefined,
      tableName: table.name,
      customerName: customer?.name,
      startedAt: sessionForCalc.startedAt,
      endedAt: now,
      minutes: bill.minutes,
      tableCost: bill.tableCost,
      orders: orders.map((o) => ({ emoji: o.emoji, name: o.name, qty: o.qty, price: o.price })),
      total: bill.total,
      paymentMethod: method,
      cashAmount: method === "mixed" ? cashAmount : undefined,
      cardAmount: method === "mixed" ? cardAmount : undefined,
      paymentStatus,
      paidAmount,
      debtAmount,
      staffName: auth.name,
    }),
    "logSessionClosed"
  );

  // "Bo'shaganda xabar ber" — stol endi bo'shadi, shu stolni kuzatib
  // turgan mijozlarga Telegram DM yuboriladi (best-effort, fonda —
  // 2026-08, qarang: table-watch.ts).
  bestEffort(notifyTableWatchers(supabase, table.id, table.name), "notifyTableWatchers");

  // Qarz avtomatik yaratiladi — sessiyaning o'zi (game_sessions.debt_amount)
  // bu paytdagi holatni abadiy saqlaydi; `debts` esa qarzning KEYINGI, jonli
  // holatini kuzatadi.
  let createdDebt: Debt | null = null;
  if (debtAmount > 0) {
    const { data: debtRow } = await supabase
      .from("debts")
      .insert({
        session_id: updated.id,
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? "Mehmon",
        customer_phone: customer?.phone ?? sessionRow.customer_phone ?? null,
        table_id: table.id,
        original_amount: debtAmount,
        paid_amount: 0,
        remaining_amount: debtAmount,
        status: "open",
        due_date: args.debtDueDate || null,
        note: trimmedNote || null,
        created_by: auth.id,
        created_by_name: auth.name,
      })
      .select("*")
      .maybeSingle();

    if (debtRow) {
      createdDebt = mapDebt(debtRow);
      // Telegram log — fonda (2026-08 performance audit).
      bestEffort(
        logDebtCreated(supabase, {
          debtId: debtRow.id,
          replyToMessageId: sessionRow.telegram_log_message_id ?? undefined,
          customerName: debtRow.customer_name,
          customerPhone: debtRow.customer_phone ?? undefined,
          amount: debtAmount,
          dueDate: debtRow.due_date ?? undefined,
          note: debtRow.note ?? undefined,
        }),
        "logDebtCreated"
      );
    }
  }

  return { session: mapSession(updated, orders, []), debt: createdDebt };
}
