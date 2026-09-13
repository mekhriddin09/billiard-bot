import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/api-audit";
import { mapEditLog, mapOrder, mapSession } from "@/lib/db-map";
import { canEditSession } from "@/lib/permissions";
import { ordersTotal } from "@/lib/calc";
import { applyInventorySaleDelta, snapshotUnitCostAtSale } from "@/lib/inventory-ops";
import type { OrderItem } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { newOrders?: OrderItem[]; reason?: string };
  const newOrders = body.newOrders ?? [];
  const reason = body.reason?.trim();
  if (!reason) return NextResponse.json({ error: "Sabab yozilishi shart" }, { status: 400 });

  const supabase = supabaseServer();
  const { data: ses } = await supabase.from("game_sessions").select("*").eq("id", params.id).maybeSingle();
  if (!ses) return NextResponse.json({ error: "Sessiya topilmadi" }, { status: 404 });

  if (!canEditSession({ businessDate: ses.business_date, startedAt: new Date(ses.started_at).getTime() }, auth)) {
    return NextResponse.json({ error: "Bu sessiyani tahrirlash huquqingiz yo'q" }, { status: 403 });
  }

  const { data: oldOrderRows } = await supabase.from("session_orders").select("*").eq("session_id", params.id);
  const oldOrders = (oldOrderRows ?? []).map(mapOrder);

  const names = new Set([...oldOrders, ...newOrders].map((o) => o.name));
  const diffs: string[] = [];
  names.forEach((name) => {
    const b = oldOrders.find((o) => o.name === name)?.qty ?? 0;
    const a = newOrders.find((o) => o.name === name)?.qty ?? 0;
    if (b !== a) diffs.push(`${name} ×${b} → ×${a}`);
  });
  if (diffs.length === 0) return NextResponse.json({ error: "O'zgarish yo'q" }, { status: 400 });

  // COGS uchun: mahsulot AVVAL ham shu sessiyada bo'lsa, uning suratga
  // olingan tannarxi (unitCostAtSale) SAQLANADI (Rule 3 mantig'i — narx
  // qayta suratga olinmaydi). Faqat butunlay YANGI qo'shilgan mahsulot
  // uchun joriy tannarx suratga olinadi.
  const oldCostByProduct = new Map<string, number | undefined>();
  for (const o of oldOrders) {
    if (o.productId && !oldCostByProduct.has(o.productId)) oldCostByProduct.set(o.productId, o.unitCostAtSale);
  }
  const newOrdersWithCost = await Promise.all(
    newOrders.map(async (o) => {
      if (!o.productId) return { ...o, unitCostAtSale: undefined };
      if (oldCostByProduct.has(o.productId)) return { ...o, unitCostAtSale: oldCostByProduct.get(o.productId) };
      return { ...o, unitCostAtSale: await snapshotUnitCostAtSale(supabase, o.productId) };
    })
  );

  await supabase.from("session_orders").delete().eq("session_id", params.id);
  if (newOrdersWithCost.length > 0) {
    await supabase.from("session_orders").insert(
      newOrdersWithCost.map((o) => ({
        session_id: params.id,
        product_id: o.productId || null,
        name: o.name,
        emoji: o.emoji,
        price: o.price,
        qty: o.qty,
        unit_cost_at_sale: o.unitCostAtSale ?? null,
      }))
    );
  }

  // Ombor: eski/yangi buyurtmalar orasidagi FARQNI mahsulot bo'yicha
  // qo'llash (bitta formula: stock_qty -= qtyDelta, best-effort).
  const productIds = Array.from(
    new Set([...oldOrders, ...newOrders].map((o) => o.productId).filter((id): id is string => !!id))
  );
  for (const pid of productIds) {
    const oldQty = oldOrders.filter((o) => o.productId === pid).reduce((s, o) => s + o.qty, 0);
    const newQty = newOrders.filter((o) => o.productId === pid).reduce((s, o) => s + o.qty, 0);
    const qtyDelta = newQty - oldQty;
    if (qtyDelta !== 0) await applyInventorySaleDelta(supabase, pid, qtyDelta);
  }

  const ot = ordersTotal(newOrders);
  const total = (ses.final_table_cost ?? 0) + ot;
  let paidAmount = ses.paid_amount ?? total;
  if (!ses.payment_status || ses.payment_status === "paid") paidAmount = total;
  paidAmount = Math.min(paidAmount, total);
  const debtAmount = Math.max(0, total - paidAmount);

  const { data: updated, error } = await supabase
    .from("game_sessions")
    .update({ final_total: total, paid_amount: paidAmount, debt_amount: debtAmount })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Xatolik" }, { status: 500 });

  await supabase.from("session_edit_log").insert({
    session_id: params.id,
    staff_id: auth.id,
    staff_name: auth.name,
    role: auth.role,
    field: "Mahsulotlar",
    old_value: oldOrders.map((o) => `${o.name} ×${o.qty}`).join(", ") || "yo'q",
    new_value: newOrders.map((o) => `${o.name} ×${o.qty}`).join(", ") || "yo'q",
    reason,
  });
  await logAudit(supabase, auth, `Sessiya #${params.id} mahsulotlari tuzatildi: ${diffs.join(", ")}`);

  const { data: editHistoryRows } = await supabase
    .from("session_edit_log")
    .select("*")
    .eq("session_id", params.id)
    .order("at", { ascending: false });

  return NextResponse.json({
    session: mapSession(updated, newOrders, (editHistoryRows ?? []).map(mapEditLog)),
  });
}
