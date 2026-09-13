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
  const sessionIds = (sessionsRows.data ?? []).map((s) => s.id);
  const debtIds = (debtsRows.data ?? []).map((d) => d.id);
  const [ordersRows, editLogRows, debtPaymentsResult] = await Promise.all([
    sessionIds.length
      ? supabase.from("session_orders").select("*").in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? supabase.from("session_edit_log").select("*").in("session_id", sessionIds).order("at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    debtIds.length
      ? supabase.from("debt_payments").select("*").in("debt_id", debtIds).order("at", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const debtPaymentRows = debtPaymentsResult.data;

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
