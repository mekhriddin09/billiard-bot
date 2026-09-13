import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapEditLog, mapOrder, mapSession } from "@/lib/db-map";
import { canEditSession } from "@/lib/permissions";
import { tableCost, ordersTotal } from "@/lib/calc";
import { fmtDate, fmtHM, fmtMoney } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/types";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

interface CorrectPatch {
  tableId?: string;
  startedAt?: number;
  endedAt?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
}

const dt = (t: number) => `${fmtDate(t)} ${fmtHM(t)}`;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { patch?: CorrectPatch; reason?: string };
  const patch = body.patch ?? {};
  const reason = body.reason?.trim();
  if (!reason) return NextResponse.json({ error: "Sabab yozilishi shart" }, { status: 400 });

  const supabase = supabaseServer();
  const { data: ses } = await supabase.from("game_sessions").select("*").eq("id", params.id).maybeSingle();
  if (!ses) return NextResponse.json({ error: "Sessiya topilmadi" }, { status: 404 });

  const businessDate = ses.business_date as string;
  if (!canEditSession({ businessDate, startedAt: new Date(ses.started_at).getTime() }, auth)) {
    return NextResponse.json({ error: "Bu sessiyani tahrirlash huquqingiz yo'q" }, { status: 403 });
  }

  const [{ data: oldTable }, { data: newTable }] = await Promise.all([
    supabase.from("club_tables").select("*").eq("id", ses.table_id).maybeSingle(),
    patch.tableId
      ? supabase.from("club_tables").select("*").eq("id", patch.tableId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const targetTable = patch.tableId ? newTable : oldTable;
  if (!targetTable) return NextResponse.json({ error: "Stol topilmadi" }, { status: 404 });

  const entries: { field: string; oldValue: string; newValue: string }[] = [];
  const push = (field: string, oldV: string, newV: string) => {
    if (oldV !== newV) entries.push({ field, oldValue: oldV, newValue: newV });
  };

  if (patch.tableId && patch.tableId !== ses.table_id) {
    push("Stol", oldTable?.name ?? ses.table_id, targetTable.name);
  }
  const oldStartedAt = new Date(ses.started_at).getTime();
  if (patch.startedAt !== undefined) push("Boshlangan vaqt", dt(oldStartedAt), dt(patch.startedAt));
  const oldEndedAt = ses.ended_at ? new Date(ses.ended_at).getTime() : undefined;
  if (patch.endedAt !== undefined) push("Tugagan vaqt", oldEndedAt ? dt(oldEndedAt) : "—", dt(patch.endedAt));
  if (patch.paymentMethod && patch.paymentMethod !== ses.payment_method) {
    push("To'lov usuli", ses.payment_method === "card" ? "Karta" : "Naqd", patch.paymentMethod === "card" ? "Karta" : "Naqd");
  }
  const oldPaymentStatus: PaymentStatus = ses.payment_status ?? "paid";
  if (patch.paymentStatus && patch.paymentStatus !== oldPaymentStatus) {
    push("To'lov holati", PAYMENT_STATUS_LABELS[oldPaymentStatus], PAYMENT_STATUS_LABELS[patch.paymentStatus]);
  }
  if (patch.paidAmount !== undefined && patch.paidAmount !== ses.paid_amount) {
    push("To'langan summa", `${fmtMoney(ses.paid_amount ?? 0)} so'm`, `${fmtMoney(patch.paidAmount)} so'm`);
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "O'zgarish yo'q" }, { status: 400 });
  }

  const newStart = patch.startedAt ?? oldStartedAt;
  const newEnd = patch.endedAt ?? oldEndedAt ?? newStart;
  const minutes = Math.max(0, Math.floor((newEnd - newStart) / 60000) + ses.adjust_minutes);
  const tc = tableCost(minutes, targetTable.price_per_hour);

  const { data: orderRows } = await supabase.from("session_orders").select("*").eq("session_id", params.id);
  const orders = (orderRows ?? []).map(mapOrder);
  const ot = ordersTotal(orders);
  const total = tc + ot;

  let paymentStatus: PaymentStatus = patch.paymentStatus ?? oldPaymentStatus;
  let paidAmount = patch.paidAmount ?? ses.paid_amount ?? total;
  if (paymentStatus === "paid") paidAmount = total;
  if (paymentStatus === "debt") paidAmount = 0;
  paidAmount = Math.min(paidAmount, total);
  const debtAmount = Math.max(0, total - paidAmount);

  const { data: updated, error } = await supabase
    .from("game_sessions")
    .update({
      table_id: patch.tableId ?? ses.table_id,
      started_at: new Date(newStart).toISOString(),
      ended_at: patch.endedAt !== undefined ? new Date(patch.endedAt).toISOString() : ses.ended_at,
      payment_method: patch.paymentMethod ?? ses.payment_method,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      debt_amount: debtAmount,
      final_table_cost: tc,
      final_total: total,
    })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  const editLogRows = entries.map((e) => ({
    session_id: params.id,
    staff_id: auth.id,
    staff_name: auth.name,
    role: auth.role,
    field: e.field,
    old_value: e.oldValue,
    new_value: e.newValue,
    reason,
  }));
  await supabase.from("session_edit_log").insert(editLogRows);
  await logAudit(supabase, auth, `Sessiya #${params.id} tuzatildi (${entries.map((e) => e.field).join(", ")})`);

  const { data: editHistoryRows } = await supabase
    .from("session_edit_log")
    .select("*")
    .eq("session_id", params.id)
    .order("at", { ascending: false });

  return NextResponse.json({
    session: mapSession(updated, orders, (editHistoryRows ?? []).map(mapEditLog)),
  });
}
