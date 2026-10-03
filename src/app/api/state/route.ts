import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  mapAudit,
  mapCategory,
  mapCustomer,
  mapDebt,
  mapDebtPayment,
  mapEditLog,
  mapOrder,
  mapProduct,
  mapReservation,
  mapSession,
  mapSettings,
  mapStaff,
  mapTable,
} from "@/lib/db-map";

/**
 * Ilova ochilganda BIR MARTA chaqiriladigan to'liq boshlang'ich holat.
 * Tarix cheksiz o'smasligi uchun sessiyalar oxirgi 60 kun + barcha aktivlar
 * bilan cheklanadi (Hisobotlar sahifasidagi eng keng oraliq — "Bu oy" — shu
 * bilan qamrab olinadi).
 */
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // `debtsRows` avval ALOHIDA, ketma-ket (Promise.all'dan KEYIN) so'ralar
  // edi — lekin u yuqoridagi hech qanday natijaga bog'liq emas (mustaqil
  // so'rov), shuning uchun bitta katta Promise.all'ga qo'shildi (2026-08
  // performance audit — "/api/state" Web App ochilganda BIR MARTA
  // chaqiriladigan eng og'ir so'rov).
  const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const [tables, categories, products, customers, staff, audit, settingsRow, reservations, sessionsRows, debtsRows] =
    await Promise.all([
      supabase.from("club_tables").select("*").order("number"),
      supabase.from("product_categories").select("*").order("sort_order"),
      supabase.from("products").select("*"),
      supabase.from("customers").select("*"),
      supabase.from("staff").select("*").order("created_at"),
      supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(150),
      supabase.from("club_settings").select("*").eq("id", 1).single(),
      supabase
        .from("reservations")
        .select("*")
        .in("status", ["held", "arrived"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("game_sessions")
        .select("*")
        .or(`status.eq.active,business_date.gte.${sixtyDaysAgo}`)
        .order("started_at", { ascending: false })
        .limit(1000),
      supabase
        .from("debts")
        .select("*")
        .or(`status.eq.open,created_at.gte.${sixtyDaysAgoIso}`)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const firstError =
    tables.error ||
    categories.error ||
    products.error ||
    customers.error ||
    staff.error ||
    audit.error ||
    settingsRow.error ||
    reservations.error ||
    sessionsRows.error ||
    debtsRows.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  // Uchta "ikkinchi qatlam" so'rov (buyurtmalar/tahrir tarixi/qarz
  // to'lovlari) — bir-biriga bog'liq emas (faqat birinchi qatlam
  // natijalariga — sessionIds/debtIds — tayanadi), shuning uchun bitta
  // Promise.all'da (avval `debtPaymentRows` alohida, ketma-ket edi).
  //
  // 2026-10 (bosim ostida tekshiruv — jonli isbotlandi: mahsulotlar
  // DB'da real mavjud bo'lsa ham, TO'LIQ yangi sahifa yuklanganda ham
  // "Hozircha buyurtma yo'q" ko'rsatilgan): SABAB — `.in("session_id",
  // sessionIds)` so'rovi sessionIds'ni BITTA GET so'rovining URL query
  // qatoriga joylaydi. `sessionsRows` oxirgi 60 kun + barcha aktiv
  // sessiyalarni LIMIT 1000gacha qaytaradi — klub bir necha oy
  // ishlagach bu son yuzlab-mingga yetishi mumkin, UUID'lar (36 belgi +
  // vergul) bilan URL o'nlab KB'ga cho'zilib, PostgREST/tarmoq
  // infratuzilmasi tomonidan ba'zan (URL uzunlik chegarasi, vaqti-vaqti
  // bilan) RAD ETILAR edi — VA BU XATO HECH QACHON TEKSHIRILMAGAN edi
  // (`ordersRows.error` pastda `firstError`ga QO'SHILMAGAN edi), shuning
  // uchun muvaffaqiyatsiz so'rov JIMGINA bo'sh massivga
  // (`ordersRows.data ?? []`) aylanib, "mahsulotlar yo'q" deb
  // ko'rsatilar edi — garchi DB'da haqiqatda bo'lsa ham. Bu ANIQ server
  // loglari bilan isbotlangan (har safar 200 OK, lekin orders bo'sh).
  // Tuzatish IKKI qatlamli: (a) `.in()` so'rovlarini KICHIK GURUHLARGA
  // (150 tadan) bo'lib, URL uzunlik chegarasidan umuman qochish; (b) har
  // bir guruh xatosini `firstError`ga qo'shish — endi muvaffaqiyatsiz
  // so'rov hech qachon "bo'sh" deb jimgina ko'rsatilmaydi, aniq xato
  // qaytaradi (Rule 2 — taxmin qilinmaydi).
  const sessionIds = (sessionsRows.data ?? []).map((s) => s.id);
  const debtIds = (debtsRows.data ?? []).map((d) => d.id);

  async function fetchInBatches<T>(
    table: string,
    column: string,
    ids: string[],
    orderBy?: { column: string; ascending: boolean }
  ): Promise<{ data: T[]; error: string | null }> {
    if (!ids.length) return { data: [], error: null };
    const BATCH = 150;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH) chunks.push(ids.slice(i, i + BATCH));
    const results = await Promise.all(
      chunks.map((chunk) => {
        let q = supabase.from(table).select("*").in(column, chunk);
        if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending });
        return q;
      })
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) return { data: [], error: firstErr.message };
    return { data: results.flatMap((r) => (r.data ?? []) as T[]), error: null };
  }

  const [ordersRows, editLogRows, debtPaymentsResult] = await Promise.all([
    fetchInBatches<any>("session_orders", "session_id", sessionIds),
    fetchInBatches<any>("session_edit_log", "session_id", sessionIds, { column: "at", ascending: false }),
    fetchInBatches<any>("debt_payments", "debt_id", debtIds, { column: "at", ascending: true }),
  ]);
  const debtPaymentRows = debtPaymentsResult.data;

  // Avval bu uchtasi TEKSHIRILMAGAN edi — muvaffaqiyatsiz so'rov jimgina
  // bo'sh massivga aylanib ketardi (yuqoridagi izohga qarang). Endi aniq
  // xato qaytariladi.
  const secondLayerError = ordersRows.error || editLogRows.error || debtPaymentsResult.error;
  if (secondLayerError) {
    return NextResponse.json({ error: secondLayerError }, { status: 500 });
  }

  const ordersBySession = new Map<string, ReturnType<typeof mapOrder>[]>();
  for (const row of ordersRows.data ?? []) {
    const arr = ordersBySession.get(row.session_id) ?? [];
    arr.push(mapOrder(row));
    ordersBySession.set(row.session_id, arr);
  }
  const editLogBySession = new Map<string, ReturnType<typeof mapEditLog>[]>();
  for (const row of editLogRows.data ?? []) {
    const arr = editLogBySession.get(row.session_id) ?? [];
    arr.push(mapEditLog(row));
    editLogBySession.set(row.session_id, arr);
  }

  const sessions = (sessionsRows.data ?? []).map((r) =>
    mapSession(r, ordersBySession.get(r.id) ?? [], editLogBySession.get(r.id) ?? [])
  );

  const paymentsByDebt = new Map<string, ReturnType<typeof mapDebtPayment>[]>();
  for (const row of debtPaymentRows ?? []) {
    const arr = paymentsByDebt.get(row.debt_id) ?? [];
    arr.push(mapDebtPayment(row));
    paymentsByDebt.set(row.debt_id, arr);
  }
  const debts = (debtsRows.data ?? []).map((d) => mapDebt(d, paymentsByDebt.get(d.id) ?? []));

  const staffList = (staff.data ?? []).map(mapStaff);
  const currentStaff =
    staffList.find((m) => m.id === auth.id) ??
    { id: auth.id, name: auth.name, tgId: auth.tgId, tgUsername: "", role: auth.role, active: auth.active };

  return NextResponse.json({
    currentStaff,
    tables: (tables.data ?? []).map(mapTable),
    categories: (categories.data ?? []).map(mapCategory),
    products: (products.data ?? []).map(mapProduct),
    customers: (customers.data ?? []).map(mapCustomer),
    staff: staffList,
    audit: (audit.data ?? []).map(mapAudit),
    settings: mapSettings(settingsRow.data),
    reservations: (reservations.data ?? []).map(mapReservation),
    sessions,
    debts,
  });
}
